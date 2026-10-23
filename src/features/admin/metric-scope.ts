export const metricLabels:Record<string,string>={unique_leads:'Distinct leads',added:'New leads',updated:'Updated leads',unchanged:'Unchanged matches',forecast:'Forecasts',opportunity:'Opportunities',award:'Awards',historical_opportunities:'Historical opportunities',unclassified_known_leads:'Unclassified known leads',candidates_attention:'Validation issues',validation_failures:'Validation failures',sources_attention:'Source collection issues',route_gaps:'Unmapped route gaps'};
export type MetricScope={metric:string;label:string;filters:Record<string,string>;expected?:number};
const metrics=['unique_leads','added','updated','unchanged','forecast','opportunity','award','historical_opportunities','unclassified_known_leads','candidates_attention','validation_failures','sources_attention','route_gaps'];
const keys=['schedule','run','target','geography','origin','outcome','from','through','category','period','as_of','snapshot','identity_snapshot'];
export function parseMetricScope(value:unknown):MetricScope|null{
 if(!value||typeof value!=='object')return null;const s=value as MetricScope;
 if(!metrics.includes(s.metric)||typeof s.label!=='string'||s.label.length>160||!s.filters||typeof s.filters!=='object'||s.expected!=null&&(!Number.isInteger(s.expected)||s.expected<0))return null;
 const filters:Record<string,string>={};
 for(const k of keys){const v=s.filters[k];if(v!=null){if(typeof v!=='string'||v.length>100)return null;filters[k]=v;}}
 return {metric:s.metric,label:s.label,filters,...(s.expected!=null?{expected:s.expected}:{})};
}
export function metricPath(scope:MetricScope,offset=0){return '/v1/admin/metric-members?'+new URLSearchParams({...scope.filters,member_metric:scope.metric,limit:'50',offset:String(offset),...(scope.expected!=null?{expected:String(scope.expected)}:{})});}
export function leadScopeLocation(scope:MetricScope){const url=new URL(window.location.href);for(const k of [...url.searchParams.keys()])if(k.startsWith('admin'))url.searchParams.delete(k);url.searchParams.set('leadReport',JSON.stringify(scope));return url;}
export function readLeadScope(){try{return parseMetricScope(JSON.parse(new URLSearchParams(window.location.search).get('leadReport')??'null'));}catch{return null;}}
export type MetricMembers={kind:'leads'|'issues';items:{id:string;kind?:string;run_id?:string;request_id?:string;task_id?:string;blocker?:string;next_action?:string}[];total:number;next_offset:number|null;as_of:string;snapshot:string;unavailable?:string};
