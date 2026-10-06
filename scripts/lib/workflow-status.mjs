import { samStageScope } from './known-source-workflow.mjs';

export function workflowStatus(requestId,{tasks,sources,interpretations,intakes,links,requestLinks,leads}) {
  const samSources=new Set(sources.filter(s=>['sam','sam-awards'].includes(s.code)).map(s=>s.id));
  const legacySamTasks=tasks.filter(t=>samSources.has(t.source_id));
  const geographyTasks=tasks.filter(t=>!samSources.has(t.source_id));
  const geographyTaskIds=new Set(geographyTasks.map(t=>t.id));
  const current=interpretations.filter(i=>i.is_current!==false&&geographyTaskIds.has(i.task_id));
  const historical=new Set(interpretations.filter(i=>geographyTaskIds.has(i.task_id))
    .flatMap(i=>i.staging_receipt?.intake_ids??[]));
  const active=new Set(current.flatMap(i=>i.staging_receipt?.intake_ids??[]));
  const samActive=new Set(interpretations.filter(i=>i.is_current!==false&&
    legacySamTasks.some(t=>t.id===i.task_id)).flatMap(i=>i.staging_receipt?.intake_ids??[]));
  const runIds=new Set(samStageScope(requestId,legacySamTasks,sources)?.run_ids??[]);
  const legacySamIds=new Set();
  for(const item of intakes) {
    const runs=item.payload?.sam_notice_evidence?.capture_run_ids??item.payload?.sam_api_evidence?.capture_run_ids??[];
    if(samSources.has(item.source_id)&&runs.some(id=>runIds.has(id)))legacySamIds.add(item.id);
  }
  const imported=item=>item.status==='processed'&&links.some(link=>link.intake_id===item.id&&
    leads.some(lead=>lead.id===link.lead_id)&&requestLinks.some(r=>r.lead_id===link.lead_id&&r.search_request_id===requestId));
  const candidate=id=>{
    const item=intakes.find(i=>i.id===id);
    return {intake_id:id,title:item?.payload?.title??null,
      state:!item?'missing':imported(item)?'imported':item.status==='processed'?'link_review_required':
        item.status==='ignored'?'ignored':'pending_review',item};
  };
  const candidates=[...active].filter(id=>!samSources.has(intakes.find(i=>i.id===id)?.source_id)).map(candidate);
  const legacySamCandidates=[...new Set([...legacySamIds,...[...samActive].filter(id=>
    samSources.has(intakes.find(i=>i.id===id)?.source_id))])].map(candidate);
  const record=item=>`${item.source_id}/${item.payload?.manual_capture?.record_external_id??item.external_id}`;
  const corrections=intakes.filter(i=>historical.has(i.id)&&!active.has(i.id)).map(item=>({
    intake_id:item.id,title:item.payload?.title,
    state:imported(item)&&!candidates.some(c=>c.state==='imported'&&record(c.item)===record(item))
      ?'canonical_review_required':'superseded_intake',
  }));
  const pendingPackets=geographyTasks.filter(t=>t.state==='needs_interpretation'&&t.kind!=='source_entry');
  const unfinished=current.filter(i=>!i.staging_receipt);
  const pending=candidates.filter(c=>c.state==='pending_review');
  const gaps=geographyTasks.filter(t=>['source_missing','method_missing','blocked','partial'].includes(t.state));
  const broken=candidates.some(c=>['missing','link_review_required'].includes(c.state));
  const next=unfinished.length?'Resume interpret with the saved packet and result; staging is unfinished':
    corrections.some(c=>c.state==='canonical_review_required')?'Review superseded evidence against the imported lead; canonical changes require reviewed approval':
    broken?'Inspect missing intake or canonical/request links before continuing':
    pending.length?`node scripts/known-source-workflow.mjs review-template ${requestId}`:
    pendingPackets.length?`node scripts/known-source-workflow.mjs packet ${requestId} ${pendingPackets[0].id}`:
    gaps.length?'Review the reported source/coverage gaps':
    geographyTasks.some(t=>['pending','running','queued','outcome_unknown'].includes(t.state))?
      `node scripts/known-source-workflow.mjs run ${requestId}`:
      'No pending review for this request; inspect coverage before requesting another window';
  const legacySamNext=legacySamCandidates.some(c=>c.state==='pending_review')?
    `node scripts/known-source-workflow.mjs review-template ${requestId} --legacy-sam`:
    'Use scripts/sam-search.mjs for a separate manual Arkansas-wide check';
  return {candidates,legacySamCandidates,legacySamTasks,legacySamRunIds:[...runIds],
    legacySamNext,geographyTasks,corrections,current,unfinished,pendingPackets,gaps,next};
}
