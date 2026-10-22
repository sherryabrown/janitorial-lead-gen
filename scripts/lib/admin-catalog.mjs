import {rows,checked} from './hosted-store.mjs';
import {sourceInventory} from './source-inventory.mjs';
import {resolveGeography} from './geography-routing.mjs';
import {categories,separateSamSource,safePublicUrl} from './known-source-execution.mjs';

// Registry-only reads: never claim registered coverage was collected, and never wake a worker.
const text=v=>typeof v==='string'?v.slice(0,500):null;
const publicUrl=v=>{try{const u=new URL(v);return safePublicUrl(v,[u.hostname.toLowerCase()])&&!u.search&&!/^(localhost|\[)|\.(internal|local|localhost)$/i.test(u.hostname)?u.href:null;}catch{return null;}};
const geo=g=>({id:g.id,name:g.name,kind:g.kind,active:g.source_active===true,dataset_url:publicUrl(g.dataset_url),dataset_version:text(g.dataset_version),dataset_hash:text(g.dataset_hash)});
const page=(items,{limit=25,offset=0})=>({items:items.slice(offset,offset+limit),total:items.length,next_offset:offset+limit<items.length?offset+limit:null});
const actions={verified_method:'Use an explicit manual or scheduled run; review saved evidence separately',method_blocked:'Renew or repair the verified method; preserve prior captures',unsupported:'Category has a dated unsupported assessment',category_unresolved:'Verify category applicability and save a check method'};
const references=evidence=>[...new Set([evidence?.run_id,evidence?.request_id,...(Array.isArray(evidence?.run_ids)?evidence.run_ids:[])].filter(id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)))].slice(0,10);
export function catalogInput(input={}){
 const out={limit:Number(input.limit??25),offset:Number(input.offset??0),gap_offset:Number(input.gap_offset??0),q:input.q??'',sort:input.sort??'name',direction:input.direction??'asc',kind:input.kind??'',category:input.category??'',readiness:input.readiness??''};
 if(!Number.isInteger(out.limit)||out.limit<1||out.limit>100||!Number.isInteger(out.offset)||out.offset<0||out.offset>10000||!Number.isInteger(out.gap_offset)||out.gap_offset<0||out.gap_offset>10000||typeof out.q!=='string'||out.q.length>120||!['name','kind','readiness'].includes(out.sort)||!['asc','desc'].includes(out.direction)||!['','county','municipality','state'].includes(out.kind)||!['',...categories].includes(out.category)||!['','mapping_missing','verified_method','method_blocked','unsupported','category_unresolved'].includes(out.readiness))throw Error('Invalid catalog filters');
 for(const key of ['schedule','source','geography'])if(input[key]!==undefined){if(typeof input[key]!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(input[key]))throw Error('Invalid catalog identity');out[key]=input[key];}
 return out;
}
export function catalogProjection(data,input={},now=new Date(),mode='both'){
 const f=catalogInput(input),byId=new Map(data.geographies.map(g=>[g.id,g])),config=data.schedule?.config;
 const countyIds=config?.county_ids??[],selectedAssociations=config?.target_kind==='state_source'?data.associations.filter(a=>(config.state_trigger_ids??[config.state_trigger_id]).includes(a.id)):null;
 const stateSourceIds=new Set(selectedAssociations?.map(a=>a.source_id));
 const currentCountyIds=selectedAssociations?[...new Set(selectedAssociations.flatMap(a=>a.county_ids))]:countyIds;
 const scopeIds=new Set([...new Set([...countyIds,...currentCountyIds])].flatMap(id=>[id,...data.links.filter(l=>l.county_id===id).map(l=>l.place_id)]));
 const scope=config?{target_kind:config.target_kind,version:data.schedule.version,county_ids:countyIds,current_county_ids:currentCountyIds,counties:(config.counties??[]).map(c=>({id:c.id,name:c.name,cities:(c.cities??[]).map(g=>({id:g.id,name:g.name})),selection_token:c.selection_token})),state_sources:(config.state_sources??[]).map(s=>({id:s.id,name:s.name,source_id:s.source_id})),missing_state_associations:config.target_kind==='state_source'?(config.state_trigger_ids??[config.state_trigger_id]).filter(id=>!selectedAssociations.some(a=>a.id===id)):[],basis:'Saved schedule scope; current registry relationships are shown separately'}:null;
 let geographies=data.geographies.filter(g=>['state','county','municipality'].includes(g.kind)&&(!config||config.target_kind==='sam'?(!config||g.id==='05'):scopeIds.has(g.id)));
 if(f.geography){const g=byId.get(f.geography);if(!g||config&&(config.target_kind==='sam'?g.id!=='05':!scopeIds.has(g.id)))throw Error('Geography not in scope');geographies=[g];}
 const parents=id=>data.links.filter(l=>l.place_id===id).map(l=>byId.get(l.county_id)).filter(Boolean).map(geo);
 let related=geographies.map(g=>{
  const children=data.links.filter(l=>l.county_id===g.id).map(l=>byId.get(l.place_id)).filter(g=>g?.kind==='municipality').sort((a,b)=>a.name.localeCompare(b.name)).map(c=>({...geo(c),counties:parents(c.id)}));
  const saved=config?.counties?.find(c=>c.id===g.id);
  const current=g.kind==='county'&&g.source_active?resolveGeography(data.geographies,data.links,{kind:'county',name:g.name}):null;
  const savedIds=new Set(saved?.city_ids??saved?.cities?.map(c=>c.id)??[]),currentIds=new Set(current?.cities.map(c=>c.id)??[]);
  return {...geo(g),association_status:config?.target_kind==='state_source'&&g.kind==='county'?countyIds.includes(g.id)?currentCountyIds.includes(g.id)?'Saved and current association':'Saved association only':'Current association only':null,counties:parents(g.id),cities:children,associations:data.associations.filter(a=>a.county_ids.includes(g.id)).map(a=>({id:a.id,source_id:a.source_id,name:data.sources.find(s=>s.id===a.source_id)?.name??'Registered state source',category:a.category})),basis:config?.target_kind==='sam'?'Statewide SAM target; record work sites are verified separately':config?.target_kind==='state_source'?'Associated counties; cities derived from GIS membership, not agency service coverage':'Registered GIS place/county membership',saved:saved?{cities:scope.counties.find(c=>c.id===g.id).cities,changed:!!saved.selection_token&&saved.selection_token!==current?.selection_token,added:[...currentIds].filter(id=>!savedIds.has(id)).map(id=>geo(byId.get(id))),removed:(saved.cities??[]).filter(c=>!currentIds.has(c.id)).map(c=>({id:c.id,name:c.name})),comparison_available:!!saved.selection_token}:null};
 });
 const routeGeos=f.geography?data.geographies.filter(g=>g.id===f.geography||data.links.some(l=>l.county_id===f.geography&&l.place_id===g.id)):data.geographies.filter(g=>!config||config.target_kind==='sam'?(!config||g.id==='05'):scopeIds.has(g.id)||g.id==='05');
 const allInventory=mode==='geography'?[]:sourceInventory(data.sources,data.capabilities,data.geographies,now);
 const inventory=allInventory.filter(s=>!config||config.target_kind==='sam'?(!config||separateSamSource(data.sources.find(x=>x.id===s.source_id))):config.target_kind==='state_source'?stateSourceIds.has(s.source_id):true);
 let sources=inventory.map(s=>{
  const raw=data.sources.find(x=>x.id===s.source_id),open=s.current_open_item,attention=open?{checked_at:text(open.attempted_at),blocker:open.status==='current_open_view_only'?'Only the current listing is verified; archive or document access remains unresolved':'A saved source-level limitation remains unresolved',next_action:open.status==='current_open_view_only'?'Verify archive and document access; preserve the working listing':'Review saved source evidence before changing access or collection'}:null,associations=data.associations.filter(a=>a.source_id===s.source_id);
  const routes=s.categories.filter(c=>(routeGeos.some(g=>g.id===c.geography_id)||c.geography_id==='05'&&f.geography&&associations.some(a=>a.county_ids.includes(f.geography)))&&(!config||config.target_kind!=='county_scope'||c.geography_id!=='05'||associations.some(a=>a.county_ids.some(id=>countyIds.includes(id)))));
  const relevant=config?.target_kind==='sam'||routes.length||(!config&&!f.geography&&s.mapping_status==='mapping_missing')||config?.target_kind==='state_source'||config?.target_kind==='county_scope'&&associations.some(a=>a.county_ids.some(id=>countyIds.includes(id)||id===f.geography));
  if(!relevant)return null;
  const projected=routes.map(c=>({geography_id:c.geography_id,geography:c.geography,kind:c.kind,status:c.status,next_action:actions[c.status],methods:c.methods.map(m=>({id:m.id,status:m.status,verified_at:m.verified_at,verified_until:m.verified_until,method:text(data.capabilities.find(x=>x.id===m.id)?.method),runner:m.method?.runner_id??null,references:references(m.evidence),evidence_url:publicUrl(m.evidence?.url??m.evidence?.source_url),blocker:m.status!=='blocked'?null:Date.parse(m.verified_until)<=now.getTime()?'Verification expired; renew the source check method':data.capabilities.find(x=>x.id===m.id)?.availability!=='active'?'Saved method is inactive':'Method verification or collector contract is incomplete'})),assessment:c.assessment?{checked_at:c.assessment.checked_at,valid_until:c.assessment.valid_until,evidence_url:publicUrl(c.assessment.evidence?.url)}:null}));
  const displayRoutes=f.category?projected.filter(r=>r.kind===f.category):projected;
  return {id:s.source_id,name:s.name,code:s.code,url:publicUrl(s.url),kind:separateSamSource(raw)?'sam':raw.contracting_entity_geo_level??'unknown',mapping_status:s.mapping_status,routes:displayRoutes,attention,readiness:s.mapping_status==='mapping_missing'?'mapping_missing':!displayRoutes.length?'category_unresolved':attention?'needs_attention':displayRoutes.every(r=>r.status==='unsupported')?'unsupported':displayRoutes.some(r=>r.status!=='verified_method'&&r.status!=='unsupported')?'needs_attention':'verified_method',warnings:s.warnings,legacy_notes_present:Object.values(s.legacy_notes).some(v=>Array.isArray(v)?v.length:!!v),next_action:s.mapping_status==='mapping_missing'?'Verify geography mapping; do not infer coverage from agency name':attention?.next_action??displayRoutes.find(r=>!['verified_method','unsupported'].includes(r.status))?.next_action??'Review category methods and saved run evidence',associations:associations.map(a=>({id:a.id,category:a.category,counties:a.county_ids.map(id=>byId.get(id)).filter(Boolean).map(geo)}))};
 }).filter(Boolean);
 const search=v=>JSON.stringify(v).toLowerCase().includes(f.q.toLowerCase());
 sources=sources.filter(s=>(!f.source||s.id===f.source)&&(!f.q||search([s.name,s.code,s.routes.map(r=>r.geography)]))&&(!f.kind||s.routes.some(r=>byId.get(r.geography_id)?.kind===f.kind))&&(!f.category||s.mapping_status==='mapping_missing'||s.routes.some(r=>r.kind===f.category))&&(!f.readiness||(f.readiness==='mapping_missing'?s.mapping_status==='mapping_missing':s.routes.some(r=>(!f.category||r.kind===f.category)&&r.status===f.readiness))));
 related=related.filter(g=>(!f.q||search([g.name,g.counties.map(c=>c.name)]))&&(!f.kind||g.kind===f.kind));
 const order=(a,b)=>String(a[f.sort]??a.name).localeCompare(String(b[f.sort]??b.name))*(f.direction==='asc'?1:-1)||a.id.localeCompare(b.id);
 sources.sort(order);related.sort(order);
 const gaps=mode==='geography'?[]:routeGeos.filter(g=>g.source_active&&['county','municipality'].includes(g.kind)&&(!config||config.target_kind==='county_scope')&&(!f.kind||g.kind===f.kind)&&(!f.q||search(g.name))).flatMap(g=>categories.filter(k=>!inventory.some(s=>s.categories.some(c=>c.geography_id===g.id&&c.kind===k))).map(kind=>({geography_id:g.id,geography:g.name,kind,status:'source_missing',next_action:'Discover and verify an official source through an explicit county research run'}))).filter(g=>!f.category||g.kind===f.category);
 return {as_of:now.toISOString(),scope,sources:page(sources,f),geographies:page(related,f),gaps:page(gaps,{limit:f.limit,offset:f.gap_offset}),basis:'Current registry; not proof of collection or work-site coverage'};
}
export function adminCatalog({db}){
 async function load(input,mode){
  const f=catalogInput(input);
  const [geographies,links,sources,capabilities,associations,schedule]=await Promise.all([
   rows(db,'procurement_geographies'),rows(db,'procurement_place_counties',q=>q.order('county_id'),'place_id,county_id',{order:'place_id'}),rows(db,'procurement_sources',q=>q,mode==='geography'?'id,name':'*'),mode==='geography'?[]:rows(db,'procurement_source_capabilities'),rows(db,'procurement_state_trigger_associations',q=>q,'id,source_id,category,county_ids'),f.schedule?db.from('procurement_schedules').select('id,version,config,deleted_at').eq('id',f.schedule).maybeSingle().then(checked):null]);
  if(f.schedule&&(!schedule||schedule.deleted_at))throw Error('Schedule not found');
  return catalogProjection({geographies,links,sources,capabilities,associations,schedule},f,new Date(),mode);
 }
 return {async sources(input){
  const result=await load(input,'sources'),ids=result.sources.items.map(s=>s.id);let checks=[],checkUnavailable=false;
  if(ids.length)try{checks=checked(await db.from('procurement_runs').select('id,source_id,started_at,finished_at,status,record_count').in('source_id',ids).order('started_at',{ascending:false}).order('id').range(0,499));}catch{checkUnavailable=true;}
  const items=result.sources.items.map(s=>{const c=checks.find(c=>c.source_id===s.id);return {...s,last_check:c?{id:c.id,started_at:c.started_at,finished_at:c.finished_at,status:['review_required','success','partial','error','blocked','completed','failed','running'].includes(c.status)?c.status:'recorded',record_count:c.record_count}:null,check_basis:checkUnavailable?'Collection history unavailable; registry remains readable':c?'Latest recorded source capture; not proof of complete category or work-site coverage':'No capture found in bounded history; previous checks may exist'};});
  return {...result.sources,items,as_of:result.as_of,scope:result.scope,basis:result.basis,gaps:result.gaps};
 },async geographies(input){const result=await load(input,'geography');return {...result.geographies,as_of:result.as_of,scope:result.scope,basis:result.basis};}};
}
