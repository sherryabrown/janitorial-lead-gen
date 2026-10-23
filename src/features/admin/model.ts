import type { Draft, Config, Category, Usage, Run, AnySchedule } from './types';
export function recurrenceLabel(s: AnySchedule) {
  const r=s.recurrence, times=r.local_times.join(', ');
  return `${r.frequency==='weekly'?(r.weekdays??[]).map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', '):r.frequency==='monthly'?`Monthly · day ${r.month_day}`:'Daily'} · ${times} CT`;
}
export const categoryLabels: Record<Category, string> = {
  forecast: 'Forecasts',
  opportunity: 'Opportunities',
  award: 'Awards',
};
export const initialDraft = (): Draft => ({
  name: '',
  enabled: false,
  config: {
    target_kind: 'county_scope',
    county_ids: [],
    maintain_sources: true,
    check_updates: true,
    requested_categories: ['opportunity'],
  },
  window_policy: {
    forecast: {
      from_offset_days: 0,
      to_offset_days: 365,
      date_basis: 'expected_solicitation',
    },
    opportunity: {
      from_offset_days: 0,
      to_offset_days: 365,
      date_basis: 'deadline',
    },
    award: {
      from_offset_days: 0,
      to_offset_days: 365,
      date_basis: 'end_renewal',
    },
  },
  recurrence: {
    timezone: 'America/Chicago',
    frequency: 'daily',
    local_times: ['09:00'],
  },
});
// Schedule-only defaults: manual runs retain initialDraft's established behavior.
export function initialScheduleDraft(): Draft {
 const draft=initialDraft();
 return {...draft,enabled:true,config:{...draft.config,maintain_sources:false},window_policy:Object.fromEntries(Object.entries(draft.window_policy).map(([k,v])=>[k,{...v,to_offset_days:119}]))};
}
export function resolvedConfig(draft: Draft, at = new Date()): Config {
  const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at),
    base = Date.parse(day + 'T00:00:00Z');
  return {
    ...draft.config,
    search_windows: Object.fromEntries(
      draft.config.requested_categories.map((k) => [
        k,
        {
          from: new Date(
            base + draft.window_policy[k].from_offset_days * 86400000,
          )
            .toISOString()
            .slice(0, 10),
          to: new Date(base + draft.window_policy[k].to_offset_days * 86400000)
            .toISOString()
            .slice(0, 10),
          date_basis: draft.window_policy[k].date_basis,
        },
      ]),
    ),
  };
}
export function formatLocal(value: string | null | undefined) {
  if(value&&!Number.isFinite(Date.parse(value)))return 'Unknown';
  return value
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value)) + ' CT'
    : 'Not scheduled';
}
export function usageText(u?: Usage) {
  if (!u) return 'Usage in details';
  const tokens =
    u.input_tokens === null || u.output_tokens === null
      ? 'tokens unknown'
      : `${u.input_tokens.toLocaleString()} in / ${u.output_tokens.toLocaleString()} out`;
  return `AI ${u.ai === 'used' ? 'Yes' : u.ai === 'unknown' ? 'Unknown' : 'No'} · ${tokens} · ${u.actual_usd === null ? 'cost unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(u.actual_usd)}${u.held_usd ? ` · $${u.held_usd} reserved` : ''}${u.credits != null ? ` · ${u.credits} ${u.credit_unit}` : ''}`;
}
export const title = (s: string | null | undefined) =>
  (s || 'Not recorded')
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
export const activeRun = (state: string) =>
  ['pending', 'running'].includes(state);
export const hasSourceAttention = (run: Run) => run.target_kind === 'county_scope' &&
  ['needs_review', 'partial', 'completed'].includes(run.state) && run.presentation?.outcome === 'source_attention';
export const runLabel = (run: Run) => hasSourceAttention(run) ? 'Finished — some sources need attention' : title(run.state);
export function invalidDraft(d: Draft, schedule = false) {
  if (!d.config.county_ids.length) return 'Select at least one county.';
  if (
    new Set(d.config.county_ids).size !== d.config.county_ids.length ||
    d.config.county_ids.some(
      (id) =>
        !/^05\d{3}$/.test(id) ||
        Number(id.slice(2)) % 2 !== 1 ||
        Number(id.slice(2)) > 149,
    )
  )
    return 'Select unique, available Arkansas counties.';
  if (!d.config.requested_categories.length)
    return 'Choose at least one category.';
  if (!d.config.maintain_sources && !d.config.check_updates)
    return 'Choose work to perform.';
  for (const k of d.config.requested_categories) {
    const w = d.window_policy[k];
    if (
      !w ||
      !Number.isInteger(w.from_offset_days) ||
      !Number.isInteger(w.to_offset_days) ||
      w.from_offset_days < -366 ||
      w.to_offset_days > 1096 ||
      w.from_offset_days > w.to_offset_days
    )
      return 'Choose valid bounded date offsets.';
  }
  return schedule?invalidScheduleTiming(d):'';
}
export function invalidScheduleTiming(d:Pick<Draft,'name'|'recurrence'>){
    if (!d.name.trim()) return 'Name this schedule.';
    const r = d.recurrence;
    if (
      !r.local_times.length || r.local_times.length>24 ||
      new Set(r.local_times).size !== r.local_times.length ||
      r.local_times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    )
      return 'Choose unique valid times.';
    if (r.frequency === 'weekly' && !r.weekdays?.length)
      return 'Choose at least one weekday.';
    if (
      r.frequency === 'monthly' &&
      (!r.month_day ||
        !Number.isInteger(r.month_day) ||
        r.month_day < 1 ||
        r.month_day > 31)
    )
      return 'Choose a monthly date from 1 to 31.';
  return '';
}

export const duration=(value:number|null|undefined)=>value==null?'Unknown':value<1000?`${value} ms`:`${(value/1000).toFixed(1)} s`;

// Read failures must not imply that a mutation or import was attempted.
export function readFailure(error:unknown,resource:string){
 if(error instanceof Error&&'code' in error&&error.code==='SESSION')return error.message;
 return `${resource} could not load. Use Retry above.`;
}

export function attemptNextAction(reason?:string){
 return ({previous_run_active:'Wait for the previous run to finish, then use Run now if needed.',scope_changed:'Edit the schedule to review its changed scope before running again.',scope_unavailable:'Review the saved geography and source availability, then edit the schedule.',owner_inactive:'An active account must recreate this schedule.',trigger_enqueue_failed:'Refresh saved activity before retrying Run now.'} as Record<string,string>)[reason??'']??'Review the saved dispatch reason before running again.';
}
