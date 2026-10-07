import { interpretationDigest, validateInterpretation } from './known-source-workflow.mjs';

// Production and integration tests share this orchestration; stage must be idempotent.
export async function persistInterpretation(db, packet, result, stage, options={}) {
  const summary=validateInterpretation(packet,result,options);
  const check=response=>{ if(response.error)throw new Error(response.error.message);return response.data; };
  const saved=check(await db.rpc('reserve_procurement_interpretation',{
    p_request:packet.request_id,p_task:packet.task_id,p_packet:packet.packet_hash,
    p_hash:interpretationDigest(result),p_result:result,p_outcome:summary.status,
    p_expected:result.supersedes_id??null,
  }));
  const replayed=!!saved.staging_receipt;
  const receipt=saved.staging_receipt??await stage(packet,result);
  const finalized=check(await db.rpc('finalize_procurement_interpretation',{p_id:saved.id,p_receipt:receipt}));
  return {interpretation_id:saved.id,revision:saved.revision,...summary,
    ...finalized.staging_receipt,replayed};
}
