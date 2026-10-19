import {hash} from './reviewed-batch.mjs';
import {inspectPublicBonfireProjects} from './public-bonfire-projects.mjs';
import {sha} from './hosted-store.mjs';

// One public resource per existing workflow lease. No additional worker or browser.
export async function continueBonfireDetails({context,packet,supporting,checkpoint,save,actor,priorHold=async()=>false}) {
  const spec=context.capability.method_spec;
  if(spec.response_format!=='bonfire-projects-v1')return true;
  const method_hash=hash({id:context.capability.id,version:context.capability.parser_version,spec});
  const records=[...new Map(packet.pages.flatMap(page=>{
    if(sha(page.body)!==page.content_sha256)throw Error('Bonfire listing hash changed');
    return inspectPublicBonfireProjects(page.body,spec).records.map(row=>[row.id,row]);
  })).values()];
  if(records.length>100)throw Error('Bonfire detail bound exceeded');
  checkpoint.bonfire_details??={};
  let progress=checkpoint.bonfire_details[packet.task_id];
  if(progress&&(progress.packet_hash!==packet.packet_hash||progress.method_hash!==method_hash))
    throw Error('Bonfire listing or method changed; reconcile saved detail progress');
  if(!progress) {
    progress=checkpoint.bonfire_details[packet.task_id]={packet_hash:packet.packet_hash,method_hash,
      source_id:packet.source_id,projects:records.map(row=>({...row,state:'pending',documents:[]})),complete:false};
  }
  if(progress.complete)return true;
  const hold={source_id:packet.source_id,method_hash};
  checkpoint.bonfire_access_holds??=[];
  if(await priorHold(hold)||checkpoint.bonfire_access_holds.some(h=>h.source_id===hold.source_id&&h.method_hash===method_hash)) {
    progress.reason='Official project access or an interrupted capture needs review; saved listing retained';
    progress.complete=true;
    await save('running');return true;
  }
  const project=progress.projects.find(p=>p.state==='pending'||p.state==='captured'&&!p.documents_complete);
  if(!project){progress.complete=true;await save('running');return true;}
  const document=project.state==='captured'?project.documents.find(d=>d.state==='pending'):null;
  if(project.state==='captured'&&!document){project.documents_complete=true;await save('pending');return false;}
  const target=document??project;
  // A persisted intent without its final receipt is an unknown outcome on restart.
  // The source hold also prevents a fresh request/scheduler tick from retrying it.
  target.state='attempt_pending';target.at=new Date().toISOString();
  checkpoint.bonfire_access_holds.push(hold);
  await save('running');
  if(await priorHold(hold)) {
    target.state='pending';checkpoint.bonfire_access_holds.pop();
    progress.reason='Another saved project capture requires review; this request did not send a fetch';
    progress.complete=true;await save('pending');return false;
  }
  let outcome;
  try {
    outcome=await supporting.capture(context,packet,{packet_hash:packet.packet_hash,url:target.url,
      ...(document?{parent_evidence:project.evidence}:{})},actor);
  }catch(error) {
    if(['schedule_paused','request_cancelled'].includes(error.code)) {
      target.state='pending';checkpoint.bonfire_access_holds.pop();await save('running');
    }
    throw error;
  }
  target.state=outcome.state;target.capture_receipt=outcome.capture_receipt;
  if(outcome.state==='captured') {
    target.evidence=outcome;
    if(!document) {
      const links=await supporting.documentLinks(context,packet,outcome);
      // Keep document evidence within the existing five-supporting-evidence review bound.
      project.documents=links.slice(0,4).map(url=>({url,state:'pending'}));
      project.document_overflow=links.length>4;
      project.documents_complete=project.documents.length===0;
    }
    checkpoint.bonfire_access_holds.pop();
  }else {
    target.reason=outcome.reason;
    progress.reason=outcome.state==='outcome_unknown'?'Reconcile the saved project capture before retrying':
      'Official project/document access is incomplete; review saved evidence and access before resuming';
    if(['blocked','outcome_unknown'].includes(outcome.state))progress.complete=true;
    else checkpoint.bonfire_access_holds.pop();
    // A challenge/unknown stops this tenant, not the other sources in the request.
  }
  await save('pending');return false;
}
