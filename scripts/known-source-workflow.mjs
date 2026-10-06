import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { adminClient, project } from './lib/supabase-admin.mjs';
import { makeInterpretationPacket, validateInterpretation } from './lib/known-source-workflow.mjs';
import { persistInterpretation } from './lib/interpretation-store.mjs';
import { workflowStatus } from './lib/workflow-status.mjs';
import { planInterpretationIntake } from './lib/interpretation-intake.mjs';
import { hash } from './lib/reviewed-batch.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const usage = `Known-source workflow (confirmed Arkansas request):
  node scripts/known-source-workflow.mjs run REQUEST_UUID [--source=SOURCE_CODE]
  node scripts/known-source-workflow.mjs report REQUEST_UUID
  node scripts/known-source-workflow.mjs packet REQUEST_UUID TASK_UUID
  node scripts/known-source-workflow.mjs interpret PACKET.json RESULT.json
  node scripts/known-source-workflow.mjs review-template REQUEST_UUID [--legacy-sam]
Create geography with geography-request.mjs first; a county requires chat confirmation.
Interpretation stages immutable intake only. SAM is checked separately with sam-search.mjs.
Complete and approve canonical review with procurement-workflow.mjs.`;
const [command, ...args] = process.argv.slice(2);
if (!['run','report','packet','interpret','review-template'].includes(command)) throw new Error(usage);
if (command==='run' && ['--source=sam','--source=sam-awards'].includes(args[1]))
  throw new Error('SAM is separate from geography refreshes. Use scripts/sam-search.mjs for an Arkansas-wide manual check.');
const db = adminClient();
async function rows(table, columns = '*', filter = null) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from(table).select(columns);
    if (filter) query = filter(query);
    const { data, error } = await query.order(table==='procurement_public_captures'?'run_id':'id').range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
const one = async (table, id) => (await rows(table, '*', q => q.eq('id', id)))[0];
const checked = result => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
function writeOnce(file, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (existsSync(file)) {
    if (!readFileSync(file).equals(bytes)) throw new Error(`Saved file changed: ${file}`);
    return;
  }
  writeFileSync(file, bytes, { flag: 'wx' });
}
async function context(requestId, taskId) {
  const request = await one('procurement_search_requests', requestId);
  const task = await one('procurement_coverage_tasks', taskId);
  const target = task && await one('procurement_request_targets', task.target_id);
  if (!request || !task || target?.search_request_id !== requestId)
    throw new Error('Task does not belong to this confirmed request');
  const job = (await rows('procurement_jobs', '*', q => q.eq('task_id', taskId)))[0];
  const [source, capability] = await Promise.all([
    one('procurement_sources', task.source_id), one('procurement_source_capabilities', task.capability_id),
  ]);
  if (!job || !source || !capability) throw new Error('No verified runnable source for task');
  const runIds = task.evidence?.run_ids ?? [];
  if (!runIds.length) throw new Error('Task has no confirmed captures');
  const [runs, captures] = await Promise.all([
    rows('procurement_runs', '*', q => q.in('id', runIds)),
    rows('procurement_public_captures', '*', q => q.in('run_id', runIds)),
  ]);
  const runById = new Map(runs.map(r => [r.id, r]));
  const captureById = new Map(captures.map(c => [c.run_id, c]));
  return { request, task, job, source, capability,
    runs: runIds.map(id => runById.get(id)), captures: runIds.map(id => captureById.get(id)) };
}
async function createPacket(requestId, taskId) {
  const packet = makeInterpretationPacket(await context(requestId, taskId));
  const directory = resolve('outputs','known-source',requestId,`packet-${packet.packet_hash}`);
  mkdirSync(directory,{recursive:true});
  const pages = packet.pages.map(({ body, review, extension, ...page }) => {
    const raw_file = join(directory,`${page.run_id}${extension}`);
    const review_file = join(directory,`${page.run_id}.review.md`);
    writeOnce(raw_file,body);
    writeOnce(review_file,review);
    return { ...page, raw_file, review_file };
  });
  const saved = { ...packet, pages };
  const file = join(directory,'packet.json');
  writeOnce(file,JSON.stringify(saved,null,2)+'\n');
  return { packet:saved,file };
}
async function stage(packet, result) {
  if (!result.findings.length) return {inserted:0,existing_preserved:0,intake_ids:[]};
  const [sources, requests, associations, targets, tasks, intakes] = await Promise.all([
    rows('procurement_sources','*',q=>q.eq('id',packet.source_id)),
    rows('procurement_search_requests','*',q=>q.eq('id',packet.request_id)),
    rows('procurement_request_sources','*',q=>q.eq('search_request_id',packet.request_id)),
    rows('procurement_request_targets','*',q=>q.eq('search_request_id',packet.request_id)),
    rows('procurement_coverage_tasks','*',q=>q.eq('id',packet.task_id)),
    rows('procurement_intake_items','*',q=>q.eq('source_id',packet.source_id)),
  ]);
  const before = { project_ref:project,procurement_sources:sources,
    procurement_search_requests:requests,procurement_request_sources:associations,
    procurement_request_targets:targets,procurement_coverage_tasks:tasks,
    procurement_intake_items:intakes };
  const evidencePaths = Object.fromEntries(packet.pages.map(page=>[page.run_id,page.raw_file]));
  for (const page of packet.pages) {
    const bytes = readFileSync(page.raw_file);
    if (createHash('sha256').update(bytes).digest('hex') !== page.content_sha256)
      throw new Error('Saved evidence file hash changed; no intake write sent');
  }
  for (const finding of result.findings) for (const evidence of finding.supporting_evidence ?? []) {
    const bytes = readFileSync(evidence.local_path);
    if (createHash('sha256').update(bytes).digest('hex') !== evidence.content_sha256 ||
        !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('Supporting PDF evidence changed; no intake write sent');
  }
  const {manifest,receipt}=planInterpretationIntake(packet,result,before,evidencePaths);
  const items = manifest.rows.map(delta=>delta.row);
  if (!items.length) return receipt;
  const response = await db.from('procurement_intake_items').upsert(items,
    { onConflict:'source_id,external_id',ignoreDuplicates:true,count:'exact' }).select('id');
  checked(response);
  if (!Number.isInteger(response.count)) throw new Error('Intake write outcome uncertain; inspect before retry');
  const saved = await rows('procurement_intake_items','*',q=>q.in('id',items.map(i=>i.id)));
  for (const item of items) {
    const actual = saved.find(i=>i.id===item.id);
    if (!actual || hash(actual.payload)!==hash(item.payload))
      throw new Error('Intake readback mismatch; inspect before retry');
  }
  receipt.inserted=response.count;
  receipt.existing_preserved+=items.length-response.count;
  receipt.intake_ids.push(...items.map(i=>i.id));
  return receipt;
}
async function interpret(packetFile, resultFile) {
  const packet = JSON.parse(readFileSync(packetFile,'utf8'));
  const result = JSON.parse(readFileSync(resultFile,'utf8'));
  if (!uuid.test(packet.request_id) || !uuid.test(packet.task_id)) throw new Error('Invalid packet scope');
  const fresh = makeInterpretationPacket(await context(packet.request_id,packet.task_id));
  const fields=['version','packet_hash','request_id','task_id','source_id','source_code','category',
    'request_scope','query_window','method_id','method_version','complete'];
  const selected=value=>Object.fromEntries(fields.map(field=>[field,value[field]]));
  if (hash(selected(fresh))!==hash(selected(packet)) ||
      fresh.pages.length!==packet.pages.length ||
      fresh.pages.some((page,index)=>page.run_id!==packet.pages[index].run_id ||
        page.content_sha256!==packet.pages[index].content_sha256 ||
        page.url!==packet.pages[index].url ||
        page.retrieved_at!==packet.pages[index].retrieved_at))
    throw new Error('Packet no longer matches saved request/method/captures');
  const verifiedPacket={...fresh,pages:fresh.pages.map((page,index)=>
    ({...page,raw_file:packet.pages[index].raw_file}))};
  validateInterpretation(verifiedPacket,result);
  const receipt=await persistInterpretation(db,verifiedPacket,result,stage);
  console.log(JSON.stringify({packet_hash:packet.packet_hash,...receipt,
    next:receipt.intake_ids.length
      ? `node scripts/known-source-workflow.mjs review-template ${packet.request_id}`
      : 'Review remaining packets or source gaps; no canonical lead was written'},null,2));
}
async function statusContext(requestId) {
  const targets = await rows('procurement_request_targets','*',q=>q.eq('search_request_id',requestId));
  if (!targets.length) throw new Error('No confirmed targets for request');
  const [tasks, interpretations, sources, intakes, links, requestLinks, leads, jobs] = await Promise.all([
    rows('procurement_coverage_tasks','*',q=>q.in('target_id',targets.map(t=>t.id))),
    rows('procurement_interpretations','*',q=>q.eq('request_id',requestId)),
    rows('procurement_sources','id,code'),
    rows('procurement_intake_items'), rows('procurement_intake_leads'),
    rows('procurement_request_leads','*',q=>q.eq('search_request_id',requestId)),
    rows('procurement_leads','id'),
    rows('procurement_jobs','id,task_id,state',q=>q.eq('search_request_id',requestId).eq('kind','collect')),
  ]);
  return {tasks,interpretations,sources,intakes,links,requestLinks,leads,jobs};
}
async function report(requestId) {
  const data=await statusContext(requestId);
  const status=workflowStatus(requestId,data);
  const {sources,jobs}=data,tasks=status.geographyTasks;
  const code = new Map(sources.map(s=>[s.id,s.code]));
  const counts = Object.fromEntries([...new Set(tasks.map(t=>t.state))].map(state=>
    [state,tasks.filter(t=>t.state===state).length]));
  const gaps = status.gaps
    .map(t=>{
      const reviewed=status.current.find(i=>i.task_id===t.id&&
        i.packet_hash===t.evidence?.interpretation_packet_hash);
      return {source:code.get(t.source_id)??null,category:t.kind,
        state:t.state,next_action:reviewed?.result.unresolved?.map(item=>item.reason).join('; ') ||
          t.reason || t.evidence?.reason || 'Verify method or resume capture'};
    });
  const directory=resolve('outputs','known-source',requestId);
  mkdirSync(directory,{recursive:true});
  const gapFile=join(directory,`source-gaps-${hash(gaps).slice(0,12)}.json`);
  writeOnce(gapFile,JSON.stringify(gaps,null,2)+'\n');
  console.log(JSON.stringify({request_id:requestId,task_counts:counts,
    interpretations:status.current.map(i=>({interpretation_id:i.id,revision:i.revision,task_id:i.task_id,outcome:i.outcome,
      findings:i.result.findings.length,intake_ids:i.staging_receipt?.intake_ids??[],
      persisted:!!i.staging_receipt})),
    candidates:status.candidates.map(({item,...summary})=>summary),corrections:status.corrections,
    pending_packets:status.pendingPackets.map(t=>({task_id:t.id,source:code.get(t.source_id),category:t.kind})),
    gap_count:gaps.length,gap_file:gapFile,gap_examples:gaps.slice(0,3),
    statewide_sam:{mode:'manual',included_in_geography_coverage:false,
      historical_request_tasks:status.legacySamTasks.map(t=>({task_id:t.id,source:code.get(t.source_id),
        category:t.kind,task_state:t.state,job_state:jobs.find(j=>j.task_id===t.id)?.state??null,
        run_ids:t.evidence?.run_ids??[]})),
      historical_candidates:status.legacySamCandidates.map(({item,...summary})=>summary),
      next:status.legacySamNext},
    next:status.next},null,2));
}
async function reviewTemplate(requestId,legacySam=false) {
  const data=await statusContext(requestId);
  const status=workflowStatus(requestId,data);
  const selected=legacySam?status.legacySamCandidates:status.candidates;
  const samRunIds=legacySam?status.legacySamRunIds:[];
  if(selected.some(c=>c.state==='missing'))throw new Error('Staged intake is missing');
  const items=selected.filter(c=>c.state==='pending_review').map(c=>c.item);
  if(!items.length)throw new Error(`No pending intake review. ${legacySam?status.legacySamNext:status.next}`);
  const request = await one('procurement_search_requests',requestId);
  const template = {version:1,batch:`known-${requestId.slice(0,8)}${legacySam?'-legacy-sam':''}`,project_ref:project,
    request_id:requestId,work_state:'AR',
    scope:JSON.stringify({service_scope:request.service_scope,search_windows:request.search_windows}),
    limitations:legacySam?'Historical SAM capture; review actual work location and request match before import.':
      'Review interpretation packets, route scope, missing methods and uncertain work locations.',
    reviewed_by:'REVIEWER_NAME',run_ids:samRunIds,allow_partial:false,
    decisions:items.map(i=>({intake_id:i.id,intake_hash:hash(i.payload),
      action:'REVIEW_PROCESS_OR_DEFER',reason:'REVIEW_REASON',
      ...(i.payload.manual_capture?.amends_intake_id&&
        data.intakes.some(parent=>parent.id===i.payload.manual_capture.amends_intake_id&&parent.status==='pending')
        ?{pending_parent_to_review:i.payload.manual_capture.amends_intake_id}: {})}))};
  const directory=resolve('outputs','known-source',requestId);
  mkdirSync(directory,{recursive:true});
  const file=join(directory,`review-template-${hash(template).slice(0,12)}.json`);
  writeOnce(file,JSON.stringify(template,null,2)+'\n');
  console.log(JSON.stringify({file,intake_count:items.length,
    capture_dir:resolve('outputs','known-source',requestId),sam_run_ids:samRunIds,
    items:items.map(i=>({intake_id:i.id,title:i.payload.title,
      confidence:i.payload.manual_capture?.confidence??'api_capture',status:i.status})),
    next:'Fill explicit decisions and reviewer. For a pending amended parent, set supersedes_pending_intake_id after reviewing both. Run procurement-workflow snapshot, schema, prepare, test; canonical apply requires the reviewed approval hash.'},null,2));
}
if (command==='run') {
  if (!uuid.test(args[0]) || args.length>2 || args[1]&&!/^--source=[a-z0-9-]+$/.test(args[1]))
    throw new Error(usage);
  if (['--source=sam','--source=sam-awards'].includes(args[1]))
    throw new Error('SAM is separate from geography refreshes. Use scripts/sam-search.mjs for an Arkansas-wide manual check.');
  for (const subcommand of ['plan','run']) {
    const output=execFileSync(process.execPath,
      ['scripts/known-source-run.mjs',subcommand,args[0],...(subcommand==='run'&&args[1]?[args[1]]:[])],
      {cwd:resolve('.'),encoding:'utf8',maxBuffer:8_000_000,windowsHide:true});
    const result=JSON.parse(output);
    console.log(JSON.stringify(subcommand==='plan'
      ? {step:'plan',known:result.known,entry_checks:result.entry_checks,
        source_gaps:result.source_gaps,blocked:result.blocked,
        jobs_created:result.jobs_created,tasks_created:result.tasks_created}
      : {step:'run',jobs:result.routes.length,
        outcomes:result.routes.map(item=>({kind:item.kind,
          state:item.state,pages:item.pages,results:item.results,run_ids:item.run_ids}))},null,2));
  }
  await report(args[0]);
} else if (command==='report') {
  if (args.length!==1 || !uuid.test(args[0])) throw new Error(usage);
  await report(args[0]);
} else if (command==='packet') {
  if (args.length!==2 || !uuid.test(args[0]) || !uuid.test(args[1])) throw new Error(usage);
  const {packet,file}=await createPacket(args[0],args[1]);
  console.log(JSON.stringify({packet_hash:packet.packet_hash,source:packet.source_code,
    category:packet.category,complete:packet.complete,pages:packet.pages.length,file,
    next:`Review the saved packet and raw documents; write a result JSON, then run node scripts/known-source-workflow.mjs interpret "${file}" RESULT.json`},null,2));
} else if (command==='interpret') {
  if (args.length!==2) throw new Error(usage);
  await interpret(args[0],args[1]);
} else {
  if (args.length<1 || args.length>2 || !uuid.test(args[0]) ||
      args[1]&&args[1]!=='--legacy-sam') throw new Error(usage);
  await reviewTemplate(args[0],args[1]==='--legacy-sam');
}
