import { statewideSam } from './lib/hosted-sam.mjs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { artifactStore } from './lib/hosted-store.mjs';
import { hostedWorkflow } from './lib/hosted-workflow.mjs';
import { importJobs } from './lib/hosted-import-jobs.mjs';
import { postgresTransport } from './lib/hosted-import.mjs';
import { workflowServer } from './lib/workflow-http.mjs';
import { discoveryService } from './lib/hosted-discovery.mjs';
import { browserService } from './lib/hosted-browser.mjs';
const project='zreplhkoxswtzxlchtjf';
const env=process.env;
if(env.SUPABASE_URL!==`https://${project}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Pinned Supabase URL and server-only service key required');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const artifacts=artifactStore(db);
const pool=env.PROCUREMENT_DATABASE_URL?new pg.Pool({connectionString:env.PROCUREMENT_DATABASE_URL,
  max:1,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,statement_timeout:90000}):null;
const transport=pool?postgresTransport(pool,project):null;
const imports=importJobs({db,project,transport,artifacts});
const provider=name=>({key:env[`${name}_API_KEY`],model:env[`${name}_MODEL`],rateVersion:env[`${name}_RATE_VERSION`],
  inputUsdPerMillion:Number(env[`${name}_INPUT_USD_PER_MILLION`]),outputUsdPerMillion:Number(env[`${name}_OUTPUT_USD_PER_MILLION`])});
const aiConfig={enabled:env.PROCUREMENT_AI_ENABLED==='true',monthlyUsd:Number(env.PROCUREMENT_MONTHLY_AI_USD??0),
  openai:provider('OPENAI'),anthropic:provider('ANTHROPIC')};
const sam=statewideSam({db,project,serverKey:()=>env.SUPABASE_SERVICE_ROLE_KEY,artifacts});
const workflow=hostedWorkflow({db,project,serverKey:()=>env.SUPABASE_SERVICE_ROLE_KEY,artifacts,aiConfig,processJob:(job,c,save)=>c.stage.startsWith('sam_')?sam.step(job,c,save):imports.step(job,c,save)});
let running=false;
function kick() {
  if(running)return;running=true;
  // Actual requests wake the worker; no keepalive/scheduler. Each claim persists one bounded stage.
  setImmediate(async()=>{
    const started=Date.now();
    try {while(Date.now()-started<120000 && await workflow.step()) { /* persisted boundary */ }}
    catch {console.error('Workflow stage interrupted; inspect saved status before retry.');}
    finally {running=false;}
  });
}
const discovery=discoveryService({db,project,artifacts});
const browser=browserService({db,artifacts,sessionKey:env.PROCUREMENT_SESSION_ENCRYPTION_KEY});
const server=workflowServer({workflow,imports,discovery,kick,
  browser,
  authenticate:async token=>{const {data,error}=await db.auth.getUser(token);return error?null:data.user;},
  allowedOrigins:(env.PROCUREMENT_ALLOWED_ORIGINS??'').split(',').filter(Boolean),
  sam:sam.submit});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(env.PORT??8080),'0.0.0.0',()=>console.log('Procurement backend listening; frontend unchanged.'));
process.on('SIGTERM',()=>{server.close();pool?.end();});
