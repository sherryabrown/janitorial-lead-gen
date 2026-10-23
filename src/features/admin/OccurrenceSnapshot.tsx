import {formatLocal,title} from './model';
import type {Config,SamConfig} from './types';
export type ActivityOccurrence={id:string;version?:number;due_at?:string;effective_at?:string;created_at?:string;origin?:string;state:string;reason?:string;trigger_id?:string;missed_from?:string;missed_through?:string;config?:Config|SamConfig;baseline?:{source_id:string|null;capability_id:string|null;run_id:string|null;category:string|null;finished_at:string|null;content_sha256:string|null}[]};
export function OccurrenceSnapshot({occurrence:o}:{occurrence:ActivityOccurrence}){
 return <details><summary>Dispatch snapshot · version {o.version??'—'}</summary><dl className="admin-facts">
  <dt>Dispatch state</dt><dd>{title(o.state)}</dd><dt>Reason</dt><dd>{o.reason?title(o.reason):'None recorded'}</dd>
  <dt>Due</dt><dd>{o.due_at?formatLocal(o.due_at):'—'}</dd><dt>Effective</dt><dd>{o.effective_at?formatLocal(o.effective_at):'—'}</dd>
  {o.missed_from&&<><dt>Missed interval</dt><dd>{formatLocal(o.missed_from)} – {formatLocal(o.missed_through??o.effective_at??o.missed_from)}</dd></>}
  <dt>Origin</dt><dd>{title(o.origin)}</dd><dt>Scope</dt><dd>{o.config?.target_kind==='sam'?'Arkansas statewide · SAM':o.config?.counties?.map(c=>c.name).join(', ')||o.config?.county_ids?.join(', ')||'Historical scope unavailable'}</dd>
  <dt>Categories</dt><dd>{o.config?.requested_categories?.map(title).join(', ')||'—'}</dd>
  <dt>Saved source baselines</dt><dd>{o.baseline?.length?o.baseline.map((b,i)=><dl className="admin-facts" key={i}><dt>Source / capability</dt><dd>{b.source_id??'—'} / {b.capability_id??'—'}</dd><dt>Run / category</dt><dd>{b.run_id??'—'} / {b.category??'—'}</dd><dt>Finished</dt><dd>{b.finished_at?formatLocal(b.finished_at):'—'}</dd><dt>Content hash</dt><dd>{b.content_sha256??'—'}</dd></dl>):'None recorded'}</dd>
 </dl></details>;
}
