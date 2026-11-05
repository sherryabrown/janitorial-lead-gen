// Bounded operator migration support. No network call unless explicitly executed.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {adminClient} from './lib/supabase-admin.mjs';
import {one,rows} from './lib/hosted-store.mjs';
import {persistRunResult,runResultProjection} from './lib/persisted-run-results.mjs';
import {canonicalReportingJobs} from './lib/canonical-reporting.mjs';
import {hash} from './lib/reviewed-batch.mjs';
export async function projectRunResults(db,ids,{apply=false,onProgress=async()=>{}}={}){
 if(!ids.length||ids.length>100||ids.some(id=>!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(id)))throw Error('Provide 1–100 explicit run UUIDs');
 const result=[];
 for(const id of [...new Set(ids)]){
  try{
  const run=await one(db,'procurement_triggers',id);if(!run)throw Error('Run unavailable');
  const children=await rows(db,'procurement_trigger_requests',q=>q.eq('trigger_id',id),'request_id');
  const jobs=[];for(const child of children)jobs.push(...await rows(db,'procurement_jobs',q=>q.eq('search_request_id',child.request_id),'id,kind,state,checkpoint'));
  const usage=await rows(db,'procurement_usage_ledger',q=>q.eq('trigger_id',id),'id,state');
  const projection=runResultProjection(run,await canonicalReportingJobs(db,jobs),usage);
  result.push({id,state:run.state,source_version:run.reporting_source_version,revision:hash({source_version:run.reporting_source_version,result:projection.result,records:projection.records}),
   evidence:{verified_jobs:jobs.filter(j=>j.checkpoint?.receipt?.verified).length,versioned_jobs:jobs.filter(j=>j.checkpoint?.reporting_records?.version===1).length,legacy_jobs:jobs.filter(j=>Array.isArray(j.checkpoint?.county_records)).length},
   completeness:projection.result.completeness,category_complete:projection.result.category_complete,known_subtotal:projection.result.known_subtotal,leads:projection.result.leads,categories:projection.result.categories,
   ...(apply?{published:await persistRunResult(db,id)}:{})});
  }catch{result.push({id,unavailable:true,reason:'Saved evidence could not be safely projected; inspect privately before retrying.'});}
  await onProgress(result);
 }
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),apply=args.includes('--apply'),ids=args.filter(x=>!x.startsWith('--'));
 if(!args.includes('--dry-run')&&!apply||apply&&args.includes('--dry-run'))throw Error('Choose --dry-run or --apply and explicit run UUIDs');
 await mkdir(resolve('outputs/deployment'),{recursive:true});
 const output=resolve('outputs/deployment/run-result-projection-'+Date.now()+'.json');
 const save=runs=>writeFile(output,JSON.stringify({applied:apply,runs},null,2));
 await save([]);
 const result=await projectRunResults(adminClient(),ids,{apply,onProgress:save});
 console.log(JSON.stringify({applied:apply,runs:result.length,output}));
}
