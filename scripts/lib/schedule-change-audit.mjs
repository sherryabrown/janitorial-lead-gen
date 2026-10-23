const fields=new Set(['name','frequency','timezone','local_times','weekdays','month_day','categories','window_policy','maintain_sources','check_updates','state_trigger_ids','enabled','archived_at','deleted_at','blocker']);
// Defense in depth: never publish arbitrary stored summary/config values.
function safe(value,depth=0){
 if(value==null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return value.slice(0,100);
 if(depth>=3)return null;
 if(Array.isArray(value))return value.slice(0,100).map(v=>safe(v,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>['forecast','opportunity','award','historical_opportunity','lookback_days','from_offset_days','to_offset_days','date_basis'].includes(k)).map(([k,v])=>[k,safe(v,depth+1)]));
 return null;
}
export function scheduleEvent(event){
 const audit=event.summary?.audit;
 return {id:event.id,actor_id:event.actor_id,action:event.action,version:event.version,at:event.at,
  changes:audit?.version===1&&Array.isArray(audit.changes)?audit.changes.filter(c=>fields.has(c.field)).map(c=>({field:c.field,before:safe(c.before),after:safe(c.after)})):null};
}
