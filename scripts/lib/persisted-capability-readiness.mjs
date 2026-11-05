import {adapterContract} from './known-source-execution.mjs';
import {checked} from './hosted-store.mjs';
// The same validator as execution; only its boolean result is saved for safe reads.
export async function persistCapabilityReadiness(db,{limit=25}={}){
 const inputs=checked(await db.rpc('procurement_capability_read_inputs',{p_limit:limit}));
 for(const input of inputs){
  let valid=true;
  try{adapterContract({...input,verified_at:'2000-01-01T00:00:00Z',verified_until:'2999-01-01T00:00:00Z'},{code:input.source_code});}catch{valid=false;}
  checked(await db.rpc('procurement_publish_capability_readiness',{p_id:input.id,p_input:input.input_fingerprint,p_valid:valid}));
 }
 return inputs.length;
}
