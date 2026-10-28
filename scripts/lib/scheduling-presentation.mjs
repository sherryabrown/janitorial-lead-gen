import {rows} from './hosted-store.mjs';

export async function scheduleSourceSetup(db,catalog,id,{offset=0,limit=25}={}){
 const page=await catalog.sources({schedule:id,offset,limit});
 const requested=page.scope?.requested_categories;
 if(requested){page.items=page.items.map(s=>({...s,routes:s.routes.filter(r=>requested.includes(r.kind))}));page.gaps={...page.gaps,items:page.gaps.items.filter(g=>requested.includes(g.kind))};}
 const reviews=await rows(db,'procurement_action_requests',q=>q.eq('checks_excluded',true).not('review_scope','is',null),'review_scope,review_decision,reviewed_at');
 const methods=page.items.flatMap(s=>s.routes.flatMap(r=>r.methods.map(m=>m.id)));
 const capabilities=methods.length?await rows(db,'procurement_source_capabilities',q=>q.in('id',methods),'id,verification_evidence'):[];
 const excluded=(source,route)=>reviews.some(a=>{
  const s=a.review_scope;if(s.geography_id!==route.geography_id||s.category!==route.kind||s.source_id&&s.source_id!==source.id)return false;
  return !s.capability_id||route.methods.some(m=>m.id===s.capability_id||capabilities.find(c=>c.id===m.id)?.verification_evidence?.source_review_roots?.[route.geography_id]===s.capability_id);
 });
 return {basis:'Current source setup; earlier run outcomes remain unchanged',as_of:page.as_of,next_offset:page.next_offset,total:page.total,
  items:page.items.map(s=>({id:s.id,name:s.name,url:s.url,kind:s.kind,last_check:s.last_check?{finished_at:s.last_check.finished_at,status:s.last_check.status}:null,
   locations:[...new Set(s.routes.map(r=>r.geography))],routes:s.routes.map(r=>({location:r.geography,category:r.kind,status:r.status,checks_excluded:excluded(s,r)}))})),
  gaps:page.gaps.items.map(g=>({location:g.geography,category:g.kind,checks_excluded:reviews.some(a=>!a.review_scope.source_id&&a.review_scope.geography_id===g.geography_id&&a.review_scope.category===g.kind)})),
  more_gaps:page.gaps.next_offset!==null};
}
