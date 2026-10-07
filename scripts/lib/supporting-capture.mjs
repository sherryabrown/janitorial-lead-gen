import { adapterContract,safePublicUrl } from './known-source-execution.mjs';
import { fetchPublicCheck } from './public-source-check.mjs';
import { sha } from './hosted-store.mjs';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { hash } from './reviewed-batch.mjs';

// Supporting evidence supplements a saved category capture; it never establishes coverage.
export function supportingCapture({artifacts,serverKey,fetcher=fetch}) {
  const signature=receipt=>{
    const key=typeof serverKey==='function'?serverKey():serverKey;
    if(!key)throw new Error('Private supporting evidence signing key required');
    return createHmac('sha256',key).update(hash(receipt)).digest('hex');
  };
  function contract(context) {
    const spec=adapterContract(context.capability,context.source);
    if(!['public-fetch','api-bounded'].includes(spec.runner_id) ||
        spec.runner_id==='api-bounded' && spec.auth?.mode!=='none')
      throw new Error('Supporting capture requires a verified public method');
    return {...spec,runner_id:'public-fetch',response_format:'supporting-document-v1',
      max_bytes:Math.min(spec.max_bytes,2000000)};
  }
  const identity=p=>({request_id:p.request_id,task_id:p.task_id,source_id:p.source_id,packet_hash:p.packet_hash});
  const basis=(context,p)=>({source_id:p.source_id,method_id:p.method_id,method_version:p.method_version,
    method_hash:hash(context.capability.method_spec),pages:p.pages.map(page=>({url:page.url,hash:page.content_sha256}))});
  async function signed(path) {
    const {signature:savedSignature,...receipt}=JSON.parse((await artifacts.get(path)).toString('utf8'));
    if(!/^[a-f0-9]{64}$/.test(savedSignature??'') ||
        !timingSafeEqual(Buffer.from(savedSignature,'hex'),Buffer.from(signature(receipt),'hex')))
      throw new Error('Supporting receipt signature changed');
    return receipt;
  }
  async function document(receipt,spec) {
    const bytes=await artifacts.get(receipt.local_path);
    if(bytes.length>spec.max_bytes || sha(bytes)!==receipt.content_sha256)
      throw new Error('Supporting document hash or bound changed');
    return bytes;
  }
  return {
    async portable(context,packet,evidence) {
      // Only the server can promote an already verified, packet-bound capture.
      await this.load(context,packet,evidence);
      const original=await signed(evidence.capture_receipt);
      const receipt={kind:'supporting-fact-v1',basis:basis(context,packet),original_capture_receipt:evidence.capture_receipt,
        original, url:evidence.url,content_sha256:evidence.content_sha256,content_type:evidence.content_type,
        retrieved_at:evidence.retrieved_at,local_path:evidence.local_path};
      const reusable_receipt=await artifacts.put({...receipt,signature:signature(receipt)});
      const {capture_receipt,...saved}=evidence;
      return {...saved,reusable_receipt};
    },
    async rebind(context,packet,evidence) {
      const spec=contract(context),portable=await signed(evidence.reusable_receipt);
      if(portable.kind!=='supporting-fact-v1' || hash(portable.basis)!==hash(basis(context,packet)) ||
          !safePublicUrl(portable.original.requested_url,spec.allowed_hosts) || !safePublicUrl(portable.url,spec.allowed_hosts) ||
          ['url','content_sha256','content_type','retrieved_at','local_path'].some(key=>evidence[key]!==portable[key]))
        throw new Error('Reusable supporting evidence does not match current listing and method');
      await document(portable,spec);
      // Historical retrieval time is preserved; this records reuse, never a fresh fetch.
      const receipt={...portable.original,...identity(packet),actor:'verified-cache',
        reused_from:{portable_receipt:evidence.reusable_receipt,original_capture_receipt:portable.original_capture_receipt}};
      const capture_receipt=await artifacts.put({...receipt,signature:signature(receipt)});
      const {reusable_receipt,...saved}=evidence;
      return {...saved,capture_receipt};
    },
    async capture(context,packet,input,actor) {
      const spec=contract(context);
      if(input?.packet_hash!==packet.packet_hash || !safePublicUrl(input?.url,spec.allowed_hosts))
        throw new Error('Supporting URL must belong to the verified method and exact packet');
      const intent={kind:'supporting-capture-intent-v1',...identity(packet),actor,url:input.url,
        created_at:new Date().toISOString(),method_hash:hash(context.capability.method_spec)};
      const intent_path=await artifacts.put({...intent,signature:signature(intent)});
      const outcome=await fetchPublicCheck(spec,input.url,fetcher);
      const {body,...audit}=outcome;
      const receipt={kind:'supporting-capture-v1',...identity(packet),actor,retrieved_at:new Date().toISOString(),
        intent_path,method_hash:hash(context.capability.method_spec),...audit,...(body?{local_path:await artifacts.put(body)}:{})};
      const capture_receipt=await artifacts.put({...receipt,signature:signature(receipt)});
      if(outcome.state!=='captured')return {state:outcome.state,reason:outcome.reason,capture_receipt,lead_coverage:false};
      return {state:'captured',lead_coverage:false,capture_receipt,url:receipt.final_url,
        content_sha256:receipt.content_sha256,content_type:receipt.content_type,
        retrieved_at:receipt.retrieved_at,local_path:receipt.local_path};
    },
    async load(context,packet,evidence) {
      const spec=contract(context);
      const receipt=await signed(evidence.capture_receipt);
      if(receipt.kind!=='supporting-capture-v1' || receipt.state!=='captured' || receipt.upstream_status!==200 ||
          Object.entries(identity(packet)).some(([key,value])=>receipt[key]!==value) ||
          receipt.method_hash!==hash(context.capability.method_spec) ||
          !safePublicUrl(receipt.requested_url,spec.allowed_hosts) || !safePublicUrl(receipt.final_url,spec.allowed_hosts) ||
          ['url','content_sha256','content_type','retrieved_at','local_path'].some(key=>
            evidence[key]!==receipt[key==='url'?'final_url':key]))
        throw new Error('Supporting capture provenance does not match this packet');
      return document(receipt,spec);
    },
  };
}
