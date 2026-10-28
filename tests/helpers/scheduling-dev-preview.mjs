// Invoked only by the disposable native acceptance runner, never a hosted DB.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {buildSchedulingPreview} from '../../scripts/build-scheduling-preview.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {workflowServer} from '../../scripts/lib/workflow-http.mjs';
import {profileCapabilities} from '../../scripts/lib/procurement-capabilities.mjs';
import {procurementSchedules} from '../../scripts/lib/procurement-schedules.mjs';
import {countyTriggers} from '../../scripts/lib/county-triggers.mjs';
import {workflowAudit} from '../../scripts/lib/workflow-audit.mjs';
import {hostedWorkflow} from '../../scripts/lib/hosted-workflow.mjs';
import {discoveryService} from '../../scripts/lib/hosted-discovery.mjs';
import {guidedSourceResolution} from '../../scripts/lib/guided-source-resolution.mjs';
import {postgresTransport} from '../../scripts/lib/hosted-import.mjs';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';
import {adminCatalog} from '../../scripts/lib/admin-catalog.mjs';
import {executeKnownSources} from '../../scripts/lib/known-source-collection.mjs';

export async function schedulingDevPreview({pool,rehearsalPool,db,first,second,token,gatewayPort}){
 assert.equal(pool.options.host,'127.0.0.1','Preview requires the native disposable loopback cluster');
 assert.ok(process.argv.includes('--preview'),'Preview is explicitly requested');
 const project='zreplhkoxswtzxlchtjf',port=5174,apiPort=8091,origin=`http://127.0.0.1:${port}`;
 // Reset only the known disposable procurement namespace after its acceptance
 // gate passes. No production URL, credentials or environment file is read.
 const tables=(await pool.query("select quote_ident(tablename) as name from pg_tables where schemaname='public' and tablename like 'procurement\\_%' escape '\\' order by tablename")).rows;
 assert.ok(tables.length>=40);await pool.query('truncate '+tables.map(t=>'public.'+t.name).join(',')+' cascade');
 await pool.query("update profiles set role=case when user_id=$1 then 'admin'::app_role else 'user'::app_role end,first_name=case when user_id=$1 then 'Preview Admin' else 'Preview User' end where user_id in ($1,$2)",[second,first]);
 await pool.query("insert into procurement_geographies(id,kind,name,dataset_url,dataset_version,dataset_hash) values('05','state','Arkansas','https://example.invalid/dataset','preview','preview'),('05001','county','Arkansas County','https://example.invalid/dataset','preview','preview')");
 const source=randomUUID();
 await pool.query(`insert into procurement_sources(id,code,name,url,business_category,contracting_entity_geo_level,source_coverage_areas)
 values($1,'preview-county','Arkansas County bid website','https://repair.example/old','other_public','county','[{"area_type":"county","state_code":"AR","county_name":"Arkansas County"}]')`,[source]);
 const objects=new Map(),artifacts={async put(value){const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),key=createHash('sha256').update(b).digest('hex');objects.set(key,b);return key;},async get(key){if(!objects.has(key))throw Error('Preview evidence unavailable');return objects.get(key);}};
 const listing=await readFile('tests/fixtures/county/guided-repair-listing.html','utf8');
 const fixtureFetch=async url=>{
  if(!['https://repair.example/old','https://repair.example/bids','https://repair.example/bid/26-1','https://repair.example/bid/26-2'].includes(String(url)))throw Error('External network disabled in local preview');
  return new Response(String(url).includes('/bid/')?'<main><h1>Janitorial services</h1><p>Arkansas County, AR · 26-1</p></main>':listing,{headers:{'content-type':'text/html'}});
 };
 const options={db,project,artifacts,fetcher:fixtureFetch,resolveHost:async()=>[{address:'8.8.8.8',family:4}],transport:postgresTransport(pool,project),rehearse:nativeRehearsal(rehearsalPool)};
 const resolution=guidedSourceResolution(options);let workflow,triggers,running=false;
 const discovery=discoveryService({...options,guardGuidedRepair:resolution.guardMethod,prepareGuidedCapture:resolution.prepareMethodCapture,finalizeGuidedRepair:resolution.finalizeMethod,
  collect:async({requestId,sourceCode,planOnly})=>executeKnownSources({db,project,artifacts,command:planOnly?'plan':'run',requestId,selectedSourceCode:sourceCode,maxJobs:1,fetcher:fixtureFetch})});
 const audit=workflowAudit(db);
 workflow=hostedWorkflow({db,project,artifacts,audit,aiConfig:{enabled:false},collectionFetch:fixtureFetch,supportingFetch:fixtureFetch,
  processJob:(job,c,save)=>c.guided_entry?resolution.step(job,c,save):c.stage.startsWith('discovery_')?discovery.step(job,c,save):Promise.reject(Error('This technical operation is unavailable in the local preview')),
  reportError:()=>console.error('A local preview stage needs review; saved status remains available.')});
 triggers=countyTriggers({db,workflow,discovery,audit});const schedules=procurementSchedules({db,triggers});
 const draft={name:'Weekly Arkansas County leads',enabled:false,config:{target_kind:'county_scope',county_ids:['05001'],maintain_sources:false,check_updates:true,requested_categories:['opportunity']},recurrence:{timezone:'America/Chicago',frequency:'weekly',local_times:['09:00'],weekdays:[1]},window_policy:{opportunity:{from_offset_days:0,to_offset_days:365,date_basis:'deadline'}}};
 const preview=await schedules.preview(draft),saved=await schedules.save(null,{...draft,confirmed_scope:true,preview_hash:preview.preview_hash},first,'preview-schedule-key');
 const occurrence=await schedules.runNow(saved.id,{expected_version:saved.version},first,'preview-initial-run');
 const child=(await pool.query('select request_id from procurement_trigger_requests where trigger_id=$1 limit 1',[occurrence.trigger_id])).rows[0];
 await executeKnownSources({db,command:'plan',requestId:child.request_id});
 await pool.query("update procurement_coverage_tasks set source_id=$1,state='method_missing',reason='Listing method needs setup' where target_id in(select id from procurement_request_targets where search_request_id=$2) and kind='opportunity'",[source,child.request_id]);
 await pool.query("update procurement_jobs set state='blocked' where search_request_id=$1",[child.request_id]);
 await pool.query("update procurement_triggers set state='needs_review',finished_at=now() where id=$1",[occurrence.trigger_id]);
 const payload={bid_type:'opportunity',agency:'Arkansas County',business_category:'other_public',contracting_entity_geo_level:'county',currently_open:true,
  title:'Sample county janitorial services',deadline:'2027-01-01',source_url:'https://repair.example/bid/26-1',
  work_performance_locations:[{state_code:'AR',county_name:'Arkansas County'}]};
 await pool.query('insert into procurement_leads(source_id,external_id,payload) values($1,$2,$3)',[source,'preview-janitorial',payload]);
 const users=new Map([[first,{id:first,email:'user@preview.invalid',aud:'authenticated',role:'authenticated'}],[second,{id:second,email:'admin@preview.invalid',aud:'authenticated',role:'authenticated'}]]);
 const sessions=new Map([...users.keys()].map(id=>[token('authenticated',id),id]));
 const kick=()=>{if(running)return;running=true;setImmediate(async()=>{try{for(let n=0;n<40;n++){if(!await workflow.step()&&!await triggers.step())break;}}catch{console.error('Local preview stage paused. Review its saved status.');}finally{running=false;}});};
 const backend=workflowServer({db,triggers,schedules,workflow,discovery,sourceResolution:resolution,catalog:adminCatalog({db}),audit,kick,
  capabilities:actor=>profileCapabilities(db,actor),authenticate:async jwt=>users.get(sessions.get(jwt))??null,allowedOrigins:[origin],aiPolicy:{enabled:false,monthlyUsd:0}});
 const site=await buildSchedulingPreview();
 const frontend=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin);
   if(url.pathname==='/preview/session'&&req.method==='POST'){
    if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
    let bytes='';for await(const part of req){bytes+=part;if(bytes.length>256)throw Error('Invalid preview session');}
    const role=JSON.parse(bytes).role;if(!['user','admin'].includes(role)){res.writeHead(400);res.end();return;}
    const id=role==='admin'?second:first,access=[...sessions].find(([,user])=>user===id)[0];
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({access_token:access,refresh_token:'local-preview',expires_in:3600,token_type:'bearer',user:users.get(id)}));return;
   }
   if(url.pathname==='/auth/v1/user'){
    const user=users.get(sessions.get((req.headers.authorization??'').replace(/^Bearer /,'')));res.writeHead(user?200:401,{'Content-Type':'application/json'});res.end(JSON.stringify(user??{message:'Local preview session expired; reload the preview'}));return;
   }
   if(url.pathname==='/auth/v1/logout'){res.writeHead(204);res.end();return;}
   if(url.pathname.startsWith('/rest/v1/')){
    const headers={...req.headers};delete headers.host;
    const body=['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(await Array.fromAsync(req));
    const upstream=await fetch(`http://127.0.0.1:${gatewayPort}${url.pathname.replace('/rest/v1','')}${url.search}`,{method:req.method,headers,body});
    res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([k])=>!['transfer-encoding','content-encoding','content-length'].includes(k))));res.end(Buffer.from(await upstream.arrayBuffer()));return;
   }
   if(url.pathname.startsWith('/auth/')){res.writeHead(401);res.end('{}');return;}
   const path=resolve(site,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(site+'/')&&!path.startsWith(site+'\\')){res.writeHead(403);res.end();return;}
   const bytes=await readFile(path).catch(()=>null);if(!bytes){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]??'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(500);res.end('Local preview request could not complete.');}
 });
 try{
  await new Promise((accept,reject)=>{backend.once('error',reject);backend.listen(apiPort,'127.0.0.1',accept);});
  await new Promise((accept,reject)=>{frontend.once('error',reject);frontend.listen(port,'127.0.0.1',accept);});
  console.log(JSON.stringify({preview_ready:true,url:origin,api:`http://127.0.0.1:${apiPort}`,data:'Disposable local sample database',roles:['User','Admin'],production_contacted:false}));
  await writeFile('outputs/deployment/scheduling-preview/ready.json',JSON.stringify({url:origin,schedule_id:saved.id,run_id:occurrence.trigger_id,request_id:child.request_id}));
  await new Promise(accept=>{process.once('SIGINT',accept);process.once('SIGTERM',accept);});
 }finally{await Promise.all([new Promise(r=>frontend.close(r)),new Promise(r=>backend.close(r))]);}
}
