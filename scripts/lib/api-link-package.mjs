import {planLinkRepair,linkRepairSql,verifyLinkRepair,repairApproval} from './api-link-repair.mjs';
import {hash} from './reviewed-batch.mjs';
import {schemaHash} from './hosted-import.mjs';
import {rehearsalBlueprint,rehearsalPolicy} from './native-sql-rehearsal.mjs';
import {awardRecordLink,noticeRecordLink,linkPolicy} from './api-record-links.mjs';

function verifyProposals(proposals) {
  for(const {resolution:r} of proposals)if(r.source_link.status==='verified') {
    const evidence=r.evidence;
    if(evidence?.origin==='saved_sam_notice') {
      const expected=noticeRecordLink(evidence.record,r.source_link.identity,r.api_capture_url);
      if(expected.source_url!==r.source_url||expected.source_link.record_sha256!==r.source_link.record_sha256)throw new Error('Notice link identity changed');
      continue;
    }
    if(!evidence?.record||!evidence.body_base64)throw new Error('Live official detail proof required for a link correction');
    const bytes=Buffer.from(evidence.body_base64,'base64');
    if(hash(bytes.toString())!==evidence.content_sha256||JSON.stringify(JSON.parse(bytes.toString()))!==JSON.stringify(evidence.record))throw new Error('Repair evidence hash changed');
    const expected=awardRecordLink(evidence.record,r.source_link.identity,evidence.url,r.source_link.verified_at);
    if(expected.source_url!==r.source_url||expected.source_link.record_sha256!==r.source_link.record_sha256||
      evidence.url!==`https://api.usaspending.gov/api/v2/awards/${r.source_link.identity}/`)
      throw new Error('Repair URL lacks full official record identity');
  }
}
export async function prepareLinkPackage({before,schema,proposals,rehearse}) {
  verifyProposals(proposals);
  const manifest=planLinkRepair(before,proposals),sql=linkRepairSql(manifest);
  const test=await rehearse({before,schema,manifest,sql});
  const p={kind:'api-link-repair-package',policy:linkPolicy,project_ref:before.project_ref,before,schema,manifest,sql,test,evidence:proposals};
  p.approval_sha256=repairApproval(p);return p;
}
export async function applyLinkPackage({packageData:p,approval,transport,artifacts,snapshot}) {
  if(p.kind!=='api-link-repair-package'||repairApproval(p)!==approval||p.approval_sha256!==approval||
    p.test.status!=='native_tests_passed'||p.test.policy!==rehearsalPolicy||
    !['rollback','readback','replay','cleanup'].every(k=>p.test[k])||
    p.test.rehearsal_sql_sha256!==hash(rehearsalBlueprint(p.before,p.schema,p.manifest).sql))throw new Error('Exact tested link-repair approval required');
  verifyProposals(p.evidence);
  if(hash(planLinkRepair(p.before,p.evidence))!==hash(p.manifest)||linkRepairSql(p.manifest)!==p.sql)throw new Error('Link repair package drift');
  if(schemaHash(await transport.schema())!==schemaHash(p.schema))throw new Error('Live schema drift; reprepare link repair');
  const current=await snapshot();
  // Completed replay is checked before SQL, not confused with a different baseline.
  const replay=verifyLinkRepair(p.before,current,p.manifest);
  if(replay.verified)return {...replay,replayed:true};
  if(hash(current)!==hash(p.before))throw new Error('Live baseline changed; reconcile and reapprove');
  await artifacts.put({kind:'link-repair-intent',approval,at:new Date().toISOString()});
  await transport.apply(p.sql);
  const after=await snapshot(),receipt=verifyLinkRepair(p.before,after,p.manifest);
  await artifacts.put({...receipt,approval,at:new Date().toISOString()});
  if(!receipt.verified)throw new Error('Link repair outcome needs reconciliation; do not resend');
  return receipt;
}
