import type {SchedulingRead} from '../../src/lib/scheduling-reads';
// Keep established component fixtures describing their existing DTOs. Transport
// itself is exercised separately against real RPC calls and PostgreSQL.
export function mockSchedulingReads(request:(path:string,options?:{signal?:AbortSignal})=>unknown){
 return (read:SchedulingRead,{id,filters={},signal}:{id?:string;filters?:Record<string,string|number|boolean>;signal?:AbortSignal}={})=>{
  const paths:Record<SchedulingRead,string>={capabilities:'/v1/capabilities',schedules:'/v1/schedules',schedule:`/v1/schedules/${id}`,history:'/v1/admin/history',run:`/v1/triggers/${id}`,steps:`/v1/triggers/${id}/steps`,events:`/v1/schedules/${id}/events`,occurrences:`/v1/schedules/${id}/occurrences`,activity:`/v1/schedules/${id}/activity`,counties:'/v1/counties',state_sources:'/v1/state-triggers',scheduler_status:'/v1/scheduler/status',analytics:'/v1/admin/analytics',metric_members:'/v1/admin/metric-members',source_status:`/v1/requests/${id}/source-status`,source_setup:`/v1/schedules/${id}/sources`};
  const query=new URLSearchParams(Object.entries(filters).filter(([key,value])=>!(read==='events'&&key==='offset'&&value===0)).map(([key,value])=>[key,String(value)]));
  return request(paths[read]+(query.size||read==='activity'?'?'+query:''),{signal});
 };
}
