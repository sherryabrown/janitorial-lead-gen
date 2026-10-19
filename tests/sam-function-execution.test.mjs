import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {id} from './helpers/known-workflow.mjs';

const source=readFileSync('supabase/functions/sam-search/index.ts','utf8').replace("import { createClient } from 'npm:@supabase/supabase-js@2';",'const createClient=globalThis.createClient;');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function fixture(change={}) {
 const filters={postedFrom:'10/01/2026',postedTo:'10/19/2026',state:'AR',ncode:'561720',limit:100,offset:0};
 const job={id:id(1),state:'running',lease_token:id(2),lease_until:'2099-01-01',attempts:1,dedupe_key:'api-sam:'+id(3),checkpoint:{stage:'sam_reconcile',kind:'opportunity',request_attempt_id:id(4),filters},...change};
 let handler,upstream=0,inserted,updated,duplicate=false;
 const db={from(table){const q={select(){return this;},eq(){return this;},insert(v){inserted=v;return this;},update(v){updated=v;return this;},single(){return Promise.resolve({data:table==='procurement_sources'?{id:id(5)}:table==='procurement_jobs'?job:{id:id(6)}});},maybeSingle(){return Promise.resolve({data:duplicate?{id:id(6)}:null});},then(resolve){resolve({error:null});}};return q;}};
 vm.runInNewContext(code,{Deno:{env:{get:k=>({SUPABASE_SECRET_KEYS:'{"default":"sb_secret_fixture"}',SAM_GOV_API_KEY:'private-fixture',SUPABASE_URL:'https://test.supabase.co'})[k]},serve:h=>{handler=h;}},createClient:()=>db,URL,Response,AbortSignal,
   fetch:async()=>{upstream++;return new Response(JSON.stringify({opportunitiesData:[],totalRecords:0}),{status:200});}});
 const body={kind:'opportunities',filters,workflow_execution:{job_id:job.id,lease_token:id(2),page_index:0,attempt_id:id(4)}};
 return {job,body,get inserted(){return inserted;},get updated(){return updated;},get upstream(){return upstream;},duplicate:()=>{duplicate=true;},call:()=>handler(new Request('https://test.invalid',{method:'POST',headers:{apikey:'sb_secret_fixture','Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('SAM Edge Function binds actual leased workflow attempt and refuses duplicate/foreign/stale calls before upstream',async()=>{
 const f=fixture();const response=await f.call();assert.equal(response.status,200);assert.equal(f.upstream,1);
 assert.equal(f.inserted.job_id,id(1));assert.equal(f.inserted.detail.workflow_attempt_id,id(4));assert.equal(f.updated.detail.workflow_attempt_id,id(4));
 assert.equal(JSON.stringify(await response.json()).includes('private-fixture'),false);
 for(const change of [{state:'pending'},{lease_until:'2020-01-01'},{lease_until:null},{lease_token:id(9)},
   {checkpoint:{...f.job.checkpoint,request_attempt_id:id(8)}},{checkpoint:{...f.job.checkpoint,filters:{...f.body.filters,state:'TX'}}}]){
   const denied=fixture(change);assert.equal((await denied.call()).status,409);assert.equal(denied.upstream,0);assert.equal(denied.inserted,undefined);
 }
 const duplicate=fixture();duplicate.duplicate();assert.equal((await duplicate.call()).status,409);assert.equal(duplicate.upstream,0);
 const direct=fixture();delete direct.body.workflow_execution;assert.equal((await direct.call()).status,200);assert.equal(direct.inserted.job_id,undefined);
});
