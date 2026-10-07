import { statewideSam } from './lib/hosted-sam.mjs';
import { attentionService } from './lib/hosted-attention.mjs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { restrictedImportPoolOptions } from './lib/restricted-import-connection.mjs';
import {nativeRehearsal} from './lib/native-sql-rehearsal.mjs';
import { artifactStore } from './lib/hosted-store.mjs';
import { hostedWorkflow } from './lib/hosted-workflow.mjs';
import { importJobs } from './lib/hosted-import-jobs.mjs';
import { postgresTransport } from './lib/hosted-import.mjs';
import { workflowServer } from './lib/workflow-http.mjs';
import { discoveryService } from './lib/hosted-discovery.mjs';
import { browserService } from './lib/hosted-browser.mjs';
import { startupBrowserBenchmark } from './lib/browser-feasibility.mjs';
import {executeKnownSources} from './lib/known-source-collection.mjs';
const project='zreplhkoxswtzxlchtjf';
const env=process.env;
if(env.SUPABASE_URL!==`https://${project}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Pinned Supabase URL and server-only service key required');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const artifacts=artifactStore(db);
const poolOptions=restrictedImportPoolOptions(env,project);
const pool=poolOptions?new pg.Pool(poolOptions):null;
const rehearsalOptions=restrictedImportPoolOptions(env,project,{rehearsal:true});
const rehearsalPool=rehearsalOptions?new pg.Pool(rehearsalOptions):null;
const transport=pool?postgresTransport(pool,project):null;
const provider=name=>({key:env[`${name}_API_KEY`],model:env[`${name}_MODEL`],rateVersion:env[`${name}_RATE_VERSION`],
  inputUsdPerMillion:Number(env[`${name}_INPUT_USD_PER_MILLION`]),outputUsdPerMillion:Number(env[`${name}_OUTPUT_USD_PER_MILLION`])});
const aiConfig={enabled:env.PROCUREMENT_AI_ENABLED==='true',monthlyUsd:Number(env.PROCUREMENT_MONTHLY_AI_USD??0),
  openai:provider('OPENAI'),anthropic:provider('ANTHROPIC')};
const sam=statewideSam({db,project,serverKey:()=>env.SUPABASE_SERVICE_ROLE_KEY,artifacts});
const imports=importJobs({db,project,transport,artifacts,samSavedRuns:sam.savedRuns,
  rehearse:rehearsalPool?nativeRehearsal(rehearsalPool):null});
const workflow=hostedWorkflow({db,project,serverKey:()=>env.SUPABASE_SERVICE_ROLE_KEY,artifacts,aiConfig,processJob:(job,c,save)=>
  c.stage.startsWith('discovery_')?discovery.step(job,c,save):c.stage.startsWith('sam_')?sam.step(job,c,save):imports.step(job,c,save)});
let running=false;
let benchmarking=Boolean(env.PROCUREMENT_BROWSER_BENCHMARK_ID);
function kick() {
  if(running||benchmarking)return;running=true;
  // Actual requests wake the worker; no keepalive/scheduler. Each claim persists one bounded stage.
  setImmediate(async()=>{
    const started=Date.now();
    try {while(Date.now()-started<120000 && await workflow.step()) { /* persisted boundary */ }}
    catch {console.error('Workflow stage interrupted; inspect saved status before retry.');}
    finally {running=false;}
  });
}
const discovery=discoveryService({db,project,artifacts,transport,rehearse:rehearsalPool?nativeRehearsal(rehearsalPool):null,
  collect:({requestId,sourceCode,planOnly})=>executeKnownSources({db,project,serverKey:()=>env.SUPABASE_SERVICE_ROLE_KEY,
    command:planOnly?'plan':'run',requestId,selectedSourceCode:sourceCode,maxJobs:4,retryPartial:false})});
const browser=browserService({db,artifacts,sessionKey:env.PROCUREMENT_SESSION_ENCRYPTION_KEY});
const server=workflowServer({workflow,imports,discovery,kick,
  attention:attentionService(db),
  browser,
  authenticate:async token=>{const {data,error}=await db.auth.getUser(token);return error?null:data.user;},
  allowedOrigins:(env.PROCUREMENT_ALLOWED_ORIGINS??'').split(',').filter(Boolean),
  sam:sam.submit,samPacket:sam.packet});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(env.PORT??8080),'0.0.0.0',()=>console.log('Procurement backend listening; frontend unchanged.'));
if(benchmarking)void startupBrowserBenchmark({db,artifacts,id:env.PROCUREMENT_BROWSER_BENCHMARK_ID})
  .then(result=>console.log(`Public browser benchmark: ${result.status}; private receipt saved.`))
  .catch(()=>console.error('Public browser benchmark blocked; inspect private evidence.'))
  .finally(()=>{benchmarking=false;});
process.on('SIGTERM',()=>{server.close();pool?.end();rehearsalPool?.end();});
