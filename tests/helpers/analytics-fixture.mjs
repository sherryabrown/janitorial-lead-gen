import {aggregateAnalytics,analyticsFilters} from '../../scripts/lib/admin-analytics.mjs';
export function analyticsFixture({offset=0,sam=false,all=false}={}){
 const f=analyticsFilters({},new Date('2026-10-20T19:00:00Z'));
 const runs=Array.from({length:26},(_,n)=>({id:n?`analytics-${n}`:'run',origin:n%2?'scheduled':'manual',target_kind:'county_scope',state:'completed',created_at:'2026-10-20T12:00:00Z',finished_at:'2026-10-20T12:01:00Z',config:{check_updates:true}}));
 const result=aggregateAnalytics({runs:sam?[]:runs,children:[{trigger_id:'run',request_id:'r'}],jobs:[{id:'j',search_request_id:'r',state:'succeeded',checkpoint:{stage:'import_verified',receipt:{verified:true},reporting_records:{version:1,records:[{id:'lead',outcome:'added',category:'opportunity'}]}}}]},f);
 const items=result.runs.slice(offset,offset+25);delete result.runs;
 return {...result,items,total:sam?0:26,next_offset:sam||offset?null:25,as_of:f.as_of,snapshot:'a'.repeat(64),filters:all?{from:'All-time available',through:'Today'}:f};
}
