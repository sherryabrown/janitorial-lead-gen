import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text=x=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
const normalize=x=>text(x).toLowerCase();
function ionwaveRecord(payload){try{const u=new URL(payload.source_url);return u.protocol==='https:'&&/(^|\.)ionwave\.net$/i.test(u.hostname)&&u.pathname==='/PublicDetail.aspx';}catch{return false;}}
export const identityPolicy='county-ionwave-solicitation-v1';
export function redirectId(lead){return lead?.payload?.canonical_redirect?.policy===identityPolicy?lead.payload.canonical_redirect.lead_id:null;}

// Source-specific published grammar, not a fuzzy title or arbitrary suffix match.
// Keep the captured display number and evidence intact.
export function publishedSolicitation(payload,external) {
 if(payload?.manual_capture?.confidence!=='primary')return null;
 const proofs=[];
 for(const e of payload.manual_capture.evidence??[]){
  let row,url,listing;
  try{row=JSON.parse(e.excerpt);url=new URL(row.source_url);listing=new URL(e.url);}catch{continue;}
  if(url.protocol!=='https:'||!/(^|\.)ionwave\.net$/i.test(url.hostname)||url.pathname!=='/PublicDetail.aspx'||
    url.searchParams.get('bidID')!==String(external)||listing.origin!==url.origin||listing.pathname!=='/SourcingEvents.aspx'||
    !/^[a-f0-9]{64}$/.test(e.content_sha256??'')||!Number.isFinite(Date.parse(e.retrieved_at))||
    row.source_url!==payload.source_url||String(row.id)!==String(external)||normalize(row.title)!==normalize(payload.title)||!text(row.organization))continue;
  const match=text(row.bid_number).match(/^([A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*)(?:\s+(Addendum|Amendment)\s+(\d+))?$/i);
  if(!match)continue;
  const issuer=normalize(row.organization),base=normalize(match[1]);
  if(!/^\d{1,2}\/\d{1,2}\/\d{4}(?:\s.*)?$/.test(text(row.issued)))continue;
  const issued=text(row.issued).split(' ')[0];
  proofs.push({issuer,base,issued,display_number:text(row.bid_number),revision:match[2]?`${match[2]} ${match[3]}`:null,
   record_id:String(external),url:row.source_url,evidence:e});
 }
 if(!proofs.length)return null;
 const keys=new Set(proofs.map(p=>`${p.issuer}\n${p.base}\n${p.issued}`));
 if(keys.size!==1)throw Error('Conflicting published solicitation identities');
 const p=proofs[0];return {version:1,policy:identityPolicy,key:digest([p.issuer,p.base,p.issued]),issuer:p.issuer,base:p.base,issued:p.issued,observations:proofs};
}
export function leadSolicitation(lead,snapshot){
 const candidates=[lead.payload,...(snapshot.procurement_intake_items??[]).filter(i=>
  (snapshot.procurement_intake_leads??[]).some(l=>l.intake_id===i.id&&l.lead_id===lead.id)).map(i=>i.payload)];
 for(const payload of candidates){
  const ids=[lead.external_id,payload.manual_capture?.record_external_id].filter(Boolean);
  for(const id of ids){const p=publishedSolicitation(payload,id);if(p)return p;}
 }
 return null;
}
export function resolveCountyIdentity(snapshot,intake,prior=[]) {
 const observed=intake.payload.manual_capture?.record_external_id??intake.external_id;
 const proof=publishedSolicitation(intake.payload,observed);
 const all=[...snapshot.procurement_leads,...prior.filter(p=>!snapshot.procurement_leads.some(l=>l.id===p.id))];
 const active=all.filter(l=>l.source_id===intake.source_id&&!redirectId(l));
 const exact=all.filter(l=>l.source_id===intake.source_id&&l.external_id===observed);
 if(exact.length>1)throw Error('Ambiguous exact county record identity');
 let target=exact[0];
 if(target&&redirectId(target)){target=active.find(l=>l.id===redirectId(target));if(!target)throw Error('Canonical redirect target unavailable');}
 if(proof){
  const matches=active.filter(l=>leadSolicitation(l,snapshot)?.key===proof.key||
   // Metadata is server-derived; original published proof remains attached.
   l.payload.county_solicitation_identity?.policy===identityPolicy&&l.payload.county_solicitation_identity.key===proof.key);
  if(matches.length>1||target&&matches.some(l=>l.id!==target.id))throw Error('Duplicate solicitation identity requires targeted reconciliation');
  if(!target)target=matches[0];
 }else if(!target&&ionwaveRecord(intake.payload)&&active.some(l=>normalize(l.payload.title)===normalize(intake.payload.title)&&
   normalize(l.payload.work_city)===normalize(intake.payload.work_city)&&l.payload.deadline===intake.payload.deadline)){
  throw Error('Possible repeated solicitation needs published issuer and solicitation identity');
 }
 if(target&&proof){const old=leadSolicitation(target,snapshot);if(old&&old.key!==proof.key)throw Error('Published identity conflicts with canonical record');}
 return {target,proof,observed};
}
export function mergeIdentity(previous,proof){
 if(!proof)return previous;
 if(previous&&previous.key!==proof.key)throw Error('Solicitation identity changed');
 const observations=[...(previous?.observations??[]),...proof.observations];
 const byId=new Map();
 for(const p of observations){const old=byId.get(p.record_id);if(!old||old.display_number!==p.display_number||old.url!==p.url)byId.set(p.record_id,p);}
 return {...proof,observations:[...byId.values()].sort((a,b)=>a.record_id.localeCompare(b.record_id))};
}
