import { createHash } from 'node:crypto';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const html=Buffer.from('<html><title>Procurement</title><main><table><tr><td>24-17 Janitorial services</td></tr></table></main></html>');
export function context(body=html,type='text/html') {
  const request={id:id(1),service_scope:{service:'janitorial'},search_windows:{opportunity:{from:'2026-10-01',to:'2026-10-04'}},requested_search_areas:[{area_type:'state',state_code:'AR'}]};
  const source={id:id(2),code:'sample',name:'Official bids',config:{}};
  const task={id:id(3),target_id:id(9),source_id:source.id,capability_id:id(4),kind:'opportunity',query_window:request.search_windows.opportunity,pages_reviewed:1,evidence:{terminal_confirmed:true,run_ids:[id(5)]}};
  const job={id:id(6),task_id:task.id,state:'succeeded'};
  const capability={id:id(4),source_id:source.id,parser_version:'public-v1',method_spec:{version:1}};
  const digest=createHash('sha256').update(body).digest('hex');
  const capture={run_id:id(5),source_id:source.id,requested_url:'https://example.gov/bids',final_url:'https://example.gov/bids',retrieved_at:'2026-10-04T12:00:00Z',content_type:type,content_sha256:digest,content_base64:body.toString('base64')};
  const run={id:id(5),source_id:source.id,job_id:job.id,coverage_task_id:task.id,page_index:0,detail:{state:'content_saved',content_sha256:digest}};
  return {request,source,task,job,capability,runs:[run],captures:[capture]};
}
export function result(packet) {
  return {version:1,packet_hash:packet.packet_hash,reviewed_by:'Offline reviewer',reviewed_scope:'Complete saved listing',coverage:'complete',findings:[{
    record_id:'24-17',title:'Janitorial services',classification:packet.category,reason:'Official janitorial procurement',work_location_basis:'Arkansas site stated in evidence',
    payload:{title:'Janitorial services',source_url:packet.pages[0].url,bid_type:packet.category,business_category:'other_public',deadline:'2026-10-30T17:00:00Z',work_performance_locations:[{state_code:'AR',city_name:'Texarkana',evidence:'Procurement work site'}]},
    evidence:[{run_id:packet.pages[0].run_id,locator:'table 1 row 1',excerpt:'24-17 Janitorial services'}],
  }],exclusions:[],unresolved:[]};
}
export function intakeBefore() {
  return {project_ref:'zreplhkoxswtzxlchtjf',captured_at:'2026-10-04T12:00:00Z',
    procurement_sources:[{id:id(2),code:'sample',config:{}}],procurement_search_requests:[{id:id(1)}],
    procurement_request_sources:[],procurement_request_targets:[{id:id(9),search_request_id:id(1)}],
    procurement_coverage_tasks:[{id:id(3),target_id:id(9),source_id:id(2),kind:'opportunity'}],
    procurement_intake_items:[],procurement_leads:[],procurement_intake_leads:[],procurement_request_leads:[],procurement_versions:[],procurement_events:[]};
}
