import { createHash } from 'node:crypto';
import { safePublicUrl } from './known-source-execution.mjs';
import { fetchPublicCheck } from './public-source-check.mjs';

export const linkPolicy='api-record-links-v1';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const awardId=/^CONT_AWD_[A-Za-z0-9-]+_[A-Za-z0-9-]+_[A-Za-z0-9-]+_[A-Za-z0-9-]+$/;
const noticeId=/^[a-f0-9]{32}$/i;
export const routeEvidence={
  usaspending:'https://github.com/fedspendingtransparency/usaspending-website/blob/master/src/js/containers/router/RouterRoutes.jsx',
  sam:'https://open.gsa.gov/api/get-opportunities-public-api/',
};
export function unresolvedLink(identity,reason,captureUrl) {
  return {source_url:null,source_link:{policy:linkPolicy,status:'unresolved',identity,reason,
    next_action:'Operator: verify the official public detail page for this exact record; retain API evidence and do not use a portal or API URL.'},
    ...(captureUrl?{api_capture_url:captureUrl}:{})};
}
export function awardRecordLink(record,identity,captureUrl,observedAt=null) {
  const actual=record?.generated_unique_award_id??record?.generated_internal_id;
  if(!awardId.test(identity??'') || actual!==identity)
    return unresolvedLink(identity,'Official record does not confirm the full generated award identity',captureUrl);
  const url=`https://www.usaspending.gov/award/${identity}`;
  return {source_url:url,source_link:{policy:linkPolicy,status:'verified',identity,url,
    verification:'official_route_and_record_identity',route_evidence:routeEvidence.usaspending,
    record_sha256:digest(record),verified_at:observedAt},...(captureUrl?{api_capture_url:captureUrl}:{})};
}
export function noticeRecordLink(record,identity,captureUrl) {
  if(!noticeId.test(identity??'') || record?.noticeId!==identity)
    return unresolvedLink(identity,'Official notice identity missing or mismatched',captureUrl);
  const supplied=record.uiLink;
  if(supplied && (!safePublicUrl(supplied,['sam.gov']) ||
      !new RegExp(`^/(?:workspace/contract/)?opp/${identity}/view$`).test(new URL(supplied).pathname)))
    return unresolvedLink(identity,'Official notice UI link does not match this record',captureUrl);
  // Public route, as documented by GSA; workspace links may require additional roles.
  const url=`https://sam.gov/opp/${identity}/view`;
  return {source_url:url,source_link:{policy:linkPolicy,status:'verified',identity,url,
    verification:'official_route_and_record_identity',route_evidence:routeEvidence.sam,
    record_sha256:digest(record)},...(captureUrl?{api_capture_url:captureUrl}:{})};
}
export async function verifyAwardLink(identity,{fetcher=fetch,observedAt=new Date().toISOString()}={}) {
  if(!awardId.test(identity??''))return unresolvedLink(identity,'Full award identity is invalid');
  const url=`https://api.usaspending.gov/api/v2/awards/${identity}/`;
  const capture=await fetchPublicCheck({runner_id:'public-fetch',allowed_hosts:['api.usaspending.gov'],
    response_format:'supporting-document-v1',max_bytes:2000000},url,fetcher);
  if(capture.state!=='captured')return unresolvedLink(identity,`Official detail unavailable: ${capture.reason}`,url);
  let record;try{record=JSON.parse(capture.body.toString());}catch{return unresolvedLink(identity,'Official response is not record JSON (a page shell is not evidence)',url);}
  const result=awardRecordLink(record,identity,url,observedAt);
  return {...result,evidence:{url,content_sha256:capture.content_sha256,content_type:capture.content_type,
    retrieved_at:observedAt,record,body_base64:capture.body.toString('base64')}};
}
export function apiProvenance(lead,source) {
  const p=lead.payload??{};
  if(p.sam_api_evidence || p.sam_notice_evidence || p.api_capture_url ||
      /official.*api/i.test(p.verification??'') ||
      [lead.source_url,p.source_url,...(p.manual_capture?.evidence??[]).map(e=>e.url)].some(url=>/^https:\/\/api\./i.test(url??'')))return 'api';
  if(/official_(browser|forecast|web|board|public_html|pdf|page|document)/i.test(p.verification??''))return 'non_api';
  if(p.manual_capture?.evidence?.length && p.manual_capture.evidence.every(e=>
    /html|pdf|text/i.test(e.capture_kind??'') || /\.pdf(?:\?|$)/i.test(e.url??'')))return 'non_api';
  if(['usaspending','sam','sam-awards'].includes(source?.code))return 'ambiguous';
  return 'ambiguous';
}
export function linkInput(record,sourceCode,identity,captureUrl) {
  if(sourceCode==='usaspending')return awardRecordLink(record,identity,captureUrl);
  if(sourceCode==='sam')return noticeRecordLink(record,identity,captureUrl);
  return unresolvedLink(identity,'This API source needs a verified public record-link method',captureUrl);
}
export function validLinkState(payload) {
  const link=payload?.source_link;
  if(link?.policy!==linkPolicy)return false;
  if(link.status==='unresolved')return payload.source_url===null && typeof link.reason==='string' && link.reason.trim().length>0 && typeof link.next_action==='string' && link.next_action.trim().length>0;
  if(link.status!=='verified'||payload.source_url!==link.url||!link.record_sha256?.match(/^[a-f0-9]{64}$/))return false;
  return awardId.test(link.identity??'') && link.url===`https://www.usaspending.gov/award/${link.identity}` ||
    noticeId.test(link.identity??'') && link.url===`https://sam.gov/opp/${link.identity}/view`;
}
function matchingRecord(value,identity,depth=0) {
  if(depth>32 || !value || typeof value!=='object')return null;
  if(!Array.isArray(value) && [value.generated_internal_id,value.generated_unique_award_id,value.noticeId,value.id,value.record_id]
    .some(id=>id!=null&&String(id)===identity))return value;
  for(const child of Object.values(value)) {const found=matchingRecord(child,identity,depth+1);if(found)return found;}
  return null;
}
export function packetLink(packet,finding) {
  for(const page of packet.pages)if(/^application\/json/i.test(page.content_type)) {
    let data;try{data=JSON.parse(page.body.toString());}catch{continue;}
    const record=matchingRecord(data,finding.record_id);
    if(record)return linkInput(record,packet.source_code,finding.record_id,page.url);
  }
  return null;
}
export function verifyPacketLink(packet,finding) {
  const expected=packetLink(packet,finding),actual=finding.payload.source_link;
  return expected && validLinkState(finding.payload) && expected.source_url===finding.payload.source_url &&
    expected.source_link.status===actual.status && expected.source_link.identity===actual.identity &&
    (actual.status==='unresolved'||expected.source_link.record_sha256===actual.record_sha256);
}
export async function resolveSamAwardLinks(collection,{fetcher=fetch,maxRecords=50}={}) {
  const links={};let count=0;
  for(const identity of collection.awards.keys()) {
    if(count++>=maxRecords){links[identity]=unresolvedLink(identity,'Public-link verification batch bound reached');continue;}
    const verified=await verifyAwardLink(`CONT_AWD_${identity}`,{fetcher});
    const {evidence,...link}=verified;
    links[identity]={...link,...(evidence?.record?{api_link_detail:evidence.record,api_link_detail_evidence:{
      url:evidence.url,content_sha256:evidence.content_sha256,retrieved_at:evidence.retrieved_at}}:{})};
  }
  return links;
}
