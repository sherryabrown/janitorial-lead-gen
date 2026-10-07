import { adapterContract,safePublicUrl } from './known-source-execution.mjs';
import { fetchPublicCheck } from './public-source-check.mjs';
import { sha } from './hosted-store.mjs';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { hash } from './reviewed-batch.mjs';

// Supporting evidence supplements a saved category capture; it never establishes coverage.
export function supportingCapture({artifacts,serverKey,loadReviewedIntake,fetcher=fetch}) {
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
  async function reviewedDocument(origin,sourceId,url) {
    if(!loadReviewedIntake || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(origin?.intake_id??'') || !/^[a-f0-9]{64}$/.test(origin?.content_sha256??''))
      throw new Error('Reviewed saved-document provenance required');
    const item=await loadReviewedIntake(origin.intake_id);
    const manual=item?.payload?.manual_capture;
    const evidence=manual?.evidence?.find(e=>e.url===url&&e.content_sha256===origin.content_sha256);
    if(item?.source_id!==sourceId || item.status!=='processed' || manual?.confidence!=='primary' ||
        item.reviewed_lead_ids?.length!==1 || !evidence?.retrieved_at || !Number.isFinite(Date.parse(evidence.retrieved_at)) ||
        origin.intake_hash&&hash(item.payload)!==origin.intake_hash)
      throw new Error('Saved document is not from matching processed primary evidence');
    return {item,evidence};
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
      if(input.reuse_intake_id || input.content_sha256) {
        const origin={intake_id:input.reuse_intake_id,content_sha256:input.content_sha256};
        const {item,evidence}=await reviewedDocument(origin,packet.source_id,input.url);
        const local_path=`artifacts/${origin.content_sha256}`;
        const body=await document({local_path,content_sha256:origin.content_sha256},spec);
        if(!body.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Saved supporting document must be a PDF');
        const receipt={kind:'supporting-capture-v1',...identity(packet),actor,intent_path,
          method_hash:hash(context.capability.method_spec),state:'captured',capture_mode:'reviewed_saved_document',
          upstream_status:null,requested_url:input.url,final_url:input.url,content_type:'application/pdf',local_path,
          content_sha256:origin.content_sha256,retrieved_at:evidence.retrieved_at,
          saved_document_origin:{...origin,intake_hash:hash(item.payload)},reused_at:new Date().toISOString()};
        const capture_receipt=await artifacts.put({...receipt,signature:signature(receipt)});
        return {state:'captured',lead_coverage:false,fresh_capture:false,capture_receipt,url:input.url,
          content_sha256:receipt.content_sha256,content_type:receipt.content_type,retrieved_at:receipt.retrieved_at,local_path};
      }
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
      const reused=receipt.capture_mode==='reviewed_saved_document';
      if(reused) {
        const {evidence:original}=await reviewedDocument(receipt.saved_document_origin,packet.source_id,receipt.final_url);
        if(receipt.content_sha256!==receipt.saved_document_origin.content_sha256 || receipt.retrieved_at!==original.retrieved_at ||
            receipt.local_path!==`artifacts/${receipt.content_sha256}`)
          throw new Error('Saved document provenance changed');
      }
      if(receipt.kind!=='supporting-capture-v1' || receipt.state!=='captured' || (!reused&&receipt.upstream_status!==200) ||
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
