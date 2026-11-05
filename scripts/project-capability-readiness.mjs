// One-time source display preparation; reuses the execution contract validator.
import {adminClient} from './lib/supabase-admin.mjs';
import {checked} from './lib/hosted-store.mjs';
import {persistCapabilityReadiness} from './lib/persisted-capability-readiness.mjs';
const mode=process.argv[2];
if(!['--dry-run','--apply'].includes(mode)||process.argv.length!==3)throw Error('Choose --dry-run or --apply');
const db=adminClient();let inspected=0;
if(mode==='--dry-run'){
 const pending=checked(await db.rpc('procurement_capability_read_inputs',{p_limit:100}));
 console.log(JSON.stringify({applied:false,pending_in_bounded_sample:pending.length,more_possible:pending.length===100}));
}else{
 for(let page=0;page<100;page++){const n=await persistCapabilityReadiness(db,{limit:100});inspected+=n;if(n<100)break;if(page===99)throw Error('Readiness preparation exceeded bound; inspect before continuing');}
 console.log(JSON.stringify({applied:true,processed:inspected}));
}
