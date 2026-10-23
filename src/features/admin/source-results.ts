import type {Task} from './types';
import {title} from './model';
const unresolved=new Set(['source_missing','method_missing','blocked','partial','failed','outcome_unknown']);
export function taskIssue(task:Task){return !!task.attention||unresolved.has(task.state);}
export function sourceResult(task:Task){
 const result=task.category==='source_entry'&&task.state==='needs_interpretation'?'Website captured · opportunity checks are separate':({reviewed_no_results:'Checked · no matching results',reviewed_with_results:'Matching results found',unchecked:'Waiting to check',needs_interpretation:'Collected · interpretation pending'} as Record<string,string>)[task.state]??title(task.state);
 const blocker=task.attention?.blocker??(taskIssue(task)?task.discovery_action||task.reason||'Saved check is incomplete.':'—');
 const next=task.attention?.next_action??(taskIssue(task)?task.discovery_action||'Inspect saved source evidence and diagnostics before retrying.':task.state==='unchecked'?'Wait for the queued check; refresh saved progress.':task.state==='needs_interpretation'?'Review captured evidence.':'No action recorded; coverage is limited to saved evidence.');
 return {result,blocker,next};
}
// Preserve separate categories/locations, but never repeat the same saved task issue.
export function resultTasks(tasks:Task[],issuesOnly=false){
 const seen=new Set<string>();
 return tasks.filter(t=>{const key=JSON.stringify([t.source_id??t.source_name??t.location_name??t.id,t.location_name,t.category,t.state,t.attention?.blocker??t.reason,t.attention?.next_action??t.discovery_action]);if(seen.has(key)||issuesOnly&&!taskIssue(t))return false;seen.add(key);return true;});
}
