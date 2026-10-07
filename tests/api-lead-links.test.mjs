import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {awardRecordLink,verifyAwardLink,noticeRecordLink,unresolvedLink,packetLink,verifyPacketLink} from '../scripts/lib/api-record-links.mjs';
import {planLinkRepair,linkRepairSql,repairApproval} from '../scripts/lib/api-link-repair.mjs';
import {applyLinkPackage} from '../scripts/lib/api-link-package.mjs';
import {offlineNativeRehearsal,offlineNativeSession} from './helpers/native-rehearsal.mjs';
import {auditLeadLinks} from '../scripts/lib/api-link-audit.mjs';
import {PGlite} from '@electric-sql/pglite';
import {resolveSamAwardLinks} from '../scripts/lib/api-record-links.mjs';
import {samIntakeRows} from '../scripts/lib/sam-intake.mjs';
import {linkReadySchema} from './helpers/api-link-schema.mjs';
const identity='CONT_AWD_A_9700_PARENT_9700',record={generated_unique_award_id:identity,piid:'A',description:'Janitorial'};
test('award links require full official identity; page shells, wrong parents and unsafe redirects fail closed',async()=>{
  assert.equal(awardRecordLink(record,identity).source_url,`https://www.usaspending.gov/award/${identity}`);
  assert.equal(awardRecordLink(record,'CONT_AWD_A_9700_OTHER_9700').source_url,null);
  for(const response of [new Response('<html>SPA shell</html>',{headers:{'content-type':'text/html'}}),
    new Response(JSON.stringify({...record,generated_unique_award_id:'CONT_AWD_A_9700_OTHER_9700'}),{headers:{'content-type':'application/json'}}),
    new Response(null,{status:302,headers:{location:'https://evil.example/detail'}})]) {
    const result=await verifyAwardLink(identity,{fetcher:async()=>response});assert.equal(result.source_url,null);
  }
  let calls=0;await verifyAwardLink('../bad',{fetcher:async()=>{calls++;}});assert.equal(calls,0);
});
test('SAM notice public route is bound to the notice record, not an API self link or a different notice',()=>{
  const id='a'.repeat(32),n={noticeId:id,uiLink:`https://sam.gov/workspace/contract/opp/${id}/view`};
  assert.equal(noticeRecordLink(n,id).source_url,`https://sam.gov/opp/${id}/view`);
  assert.equal(noticeRecordLink({...n,uiLink:'https://api.sam.gov/search?api_key=secret'},id).source_url,null);
  assert.equal(noticeRecordLink(n,'b'.repeat(32)).source_url,null);
});
test('API interpretation verifies a public link against immutable captured record bytes',()=>{
  const p={source_code:'usaspending',pages:[{url:'https://api.usaspending.gov/search',content_type:'application/json',body:Buffer.from(JSON.stringify({results:[record]}))}]};
  const f={record_id:identity,payload:packetLink(p,{record_id:identity})};assert.equal(verifyPacketLink(p,f),true);
  f.payload.source_link.record_sha256='0'.repeat(64);assert.equal(verifyPacketLink(p,f),false);
});
test('audit batches reconcile counts and preserve user overrides without automatic writes',async()=>{
  const b={procurement_sources:[{id:'s',code:'usaspending'}],procurement_leads:[{id:'1',source_id:'s',external_id:identity,source_url:'https://api.usaspending.gov/search',payload:{verification:'official_api',source_url:'https://api.usaspending.gov/search'}},
    {id:'2',source_id:'s',external_id:identity,source_url:'https://user.example/record',payload:{source_url:'https://api.usaspending.gov/search'}}]};
  const r=await auditLeadLinks(b,{}, {fetcher:async()=>new Response(JSON.stringify(record),{headers:{'content-type':'application/json'}})});
  assert.equal(r.by_source.usaspending.needs_correct_link,1);assert.equal(r.by_source.usaspending.preserved_user_override,1);assert.equal(r.corrected,0);
  const cached=await auditLeadLinks(b,r.entries,{userEditedIds:['1'],limit:0});
  assert.equal(cached.entries['1'].outcome,'preserved_user_override');
});
test('transaction guard rejects a canonical edit made after package preparation',async()=>{
  const before=JSON.parse(readFileSync('tests/fixtures/sam/intake-before.json')),schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json'));
  for(const table of new Set(schema.columns.map(c=>c.table)))before[table]??=[];
  const columns=new Set(schema.columns.filter(c=>c.table==='procurement_leads').map(c=>c.name));
  for(const l of before.procurement_leads)for(const key of Object.keys(l))if(!columns.has(key))delete l[key];
  const lead=before.procurement_leads[0],manifest=planLinkRepair(before,[{lead_id:lead.id,resolution:awardRecordLink({generated_unique_award_id:lead.external_id},lead.external_id)}]);
  const session=await offlineNativeSession(),query=session.client.query;let injected=false;
  session.client.query=async(sql,params)=>{
    if(!injected&&sql.includes('create temporary table link_repair_manifest')&&!sql.includes('native injected failure')){
      injected=true;await query('update procurement_test.procurement_leads set notes=$1 where id=$2',['Concurrent user edit',lead.id]);
    }
    return query(sql,params);
  };
  try{await assert.rejects(session.run({before,schema,manifest,sql:linkRepairSql(manifest)}),/baseline changed/);assert.equal(injected,true);}
  finally{await session.close();}
});
test('link repair uses actual cloned triggers and constraints; preserves edits/history/links and replays without writes',async()=>{
  const before=JSON.parse(readFileSync('tests/fixtures/sam/intake-before.json'));
  const schema=JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json'));
  for(const table of new Set(schema.columns.map(c=>c.table)))before[table]??=[];
  const columns=new Set(schema.columns.filter(c=>c.table==='procurement_leads').map(c=>c.name));
  for(const l of before.procurement_leads)for(const key of Object.keys(l))if(!columns.has(key))delete l[key];
  const lead=before.procurement_leads[0];lead.source_url='https://api.usaspending.gov/search';lead.payload.source_url=lead.source_url;
  lead.title='User-edited display title';lead.notes='Preserve my note';lead.stage='researching';
  const resolution=awardRecordLink({generated_unique_award_id:lead.external_id},lead.external_id,lead.source_url);
  const m=planLinkRepair(before,[{lead_id:lead.id,resolution}]);
  const result=await offlineNativeRehearsal({before,schema,manifest:m,sql:linkRepairSql(m)});
  assert.equal(result.status,'native_tests_passed');assert.equal(result.replay,true);assert.equal(m.summary.public_links_corrected,1);
  const after=structuredClone(before);Object.assign(after.procurement_leads[0],{source_url:m.records[0].source_url,payload:m.records[0].payload});
  assert.equal(planLinkRepair(after,[{lead_id:lead.id,resolution}]).records.length,0);
  m.records[0].payload.title='Overwrite';assert.throws(()=>linkRepairSql(m),/unrelated facts/);
});
test('approval cannot accept changed package or send SQL before successful native rehearsal',async()=>{
  const p={kind:'api-link-repair-package',policy:'api-record-links-v1',project_ref:'project',before:{},schema:{},manifest:{},sql:'bad',test:{status:'failed'},evidence:[]};
  p.approval_sha256=repairApproval(p);let calls=0;
  await assert.rejects(applyLinkPackage({packageData:p,approval:p.approval_sha256,transport:{apply(){calls++;}}}),/Exact tested/);assert.equal(calls,0);
  assert.equal(unresolvedLink(identity,'Blocked').source_url,null);
});
test('record proof survives JSONB key ordering without changing identity',()=>{
  assert.equal(awardRecordLink(record,identity).source_link.record_sha256,
    awardRecordLink({description:record.description,piid:record.piid,generated_unique_award_id:identity},identity).source_link.record_sha256);
});
test('SAM staging retains separate capture evidence and bounded award verification',async()=>{
  let calls=0;
  const links=await resolveSamAwardLinks({awards:new Map([['A_9700_PARENT_9700',{}],['B_9700_PARENT_9700',{}]])},{maxRecords:1,fetcher:async()=>{calls++;return new Response(JSON.stringify(record),{headers:{'content-type':'application/json'}});}});
  assert.equal(calls,1);assert.equal(links.A_9700_PARENT_9700.source_url,`https://www.usaspending.gov/award/${identity}`);
  assert.equal(links.B_9700_PARENT_9700.source_url,null);
  const id='a'.repeat(32),collection={awards:new Map(),notices:new Map([[id,{row:{noticeId:id,title:'Office janitorial'},run_ids:new Set(['r']),queries:new Set(['q'])}]])};
  const [intake]=samIntakeRows(collection,()=> 'source');
  assert.equal(intake.payload.source_url,`https://sam.gov/opp/${id}/view`);
  assert.equal(intake.payload.api_capture_url,'https://api.sam.gov/opportunities/v2/search');
});
test('forward constraint is repeatable and rejects unmarked or incomplete unresolved links',async()=>{
  const db=new PGlite();
  try {
    await db.exec("create table public.procurement_leads(payload jsonb check (coalesce(payload->>'title','')<>'' and coalesce(payload->>'source_url','') like 'https://%'));");
    const sql=readFileSync('supabase/migrations/20261007000500_api_record_link_state.sql','utf8');
    await db.exec(sql);await db.exec(sql);
    for(const payload of [{title:'Janitorial',source_url:null},{title:'Janitorial',source_url:null,source_link:{status:'unresolved'}},{title:'',...unresolvedLink(identity,'No verified page')}])
      await assert.rejects(db.query('insert into public.procurement_leads values ($1)',[payload]));
    await db.query('insert into public.procurement_leads values ($1)',[{title:'Janitorial',...unresolvedLink(identity,'No verified page')}]);
    await db.query('insert into public.procurement_leads values ($1)',[{title:'Janitorial',source_url:'https://sam.gov/opp/example/view'}]);
    assert.equal((await db.query('select count(*)::int as n from public.procurement_leads')).rows[0].n,2);
    const definition=(await db.query("select pg_get_constraintdef(oid) as d from pg_constraint where conname='procurement_leads_public_record_link_check'")).rows[0].d;
    const before=JSON.parse(readFileSync('tests/fixtures/sam/intake-before.json'));
    const schema=linkReadySchema(JSON.parse(readFileSync('tests/fixtures/sam/intake-schema.json')));
    for(const c of schema.constraints)if(c.table==='procurement_leads'&&c.definition.includes('source_link'))c.definition=definition;
    for(const table of new Set(schema.columns.map(c=>c.table)))before[table]??=[];
    const columns=new Set(schema.columns.filter(c=>c.table==='procurement_leads').map(c=>c.name));
    for(const l of before.procurement_leads)for(const key of Object.keys(l))if(!columns.has(key))delete l[key];
    const lead=before.procurement_leads[0],resolution=unresolvedLink(lead.external_id,'Official public record unavailable',lead.source_url);
    const manifest=planLinkRepair(before,[{lead_id:lead.id,resolution}]);
    assert.equal((await offlineNativeRehearsal({before,schema,manifest,sql:linkRepairSql(manifest)})).status,'native_tests_passed');
  }finally{await db.close();}
});
