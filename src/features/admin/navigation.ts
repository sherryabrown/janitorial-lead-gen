export type AdminView = 'schedules' | 'stats' | 'history' | 'sources' | 'geography';
export type AdminContext = {
  view: AdminView;
  section?: 'manual' | 'overview' | 'history' | 'logs' | 'sources' | 'geography';
  runSection?:'overview'|'logs'|'sources';
  scheduleId?: string;
  scheduleRunId?:string;
  runId?: string;
  issueRequestId?:string;
  sourceId?: string;
  geographyId?: string;
  returnTo: 'contracts';
};
const views: AdminView[] = ['schedules', 'stats', 'history', 'sources', 'geography'];
const key = (owner: string) => `spin-admin-navigation:${owner}`;
export function parseAdminContext(value: unknown): AdminContext {
  const fallback: AdminContext = { view: 'schedules', returnTo: 'contracts' };
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Record<string, unknown>;
  if (!views.includes(v.view as AdminView)) return fallback;
  const result: AdminContext = { view: v.view as AdminView, returnTo: 'contracts' };
  if (['manual', 'overview', 'history', 'logs','sources','geography'].includes(v.section as string)) result.section = v.section as AdminContext['section'];
  if(['overview','logs','sources'].includes(v.runSection as string))result.runSection=v.runSection as AdminContext['runSection'];
  for (const name of ['scheduleId', 'scheduleRunId', 'runId', 'issueRequestId', 'sourceId', 'geographyId'] as const) {
    if (typeof v[name] === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v[name])) result[name] = v[name];
  }
  return result;
}
export function readAdminContext(owner: string): AdminContext {
  try { return parseAdminContext(JSON.parse(sessionStorage.getItem(key(owner)) ?? 'null')); }
  catch { return parseAdminContext(null); }
}
export function saveAdminContext(owner: string, value: AdminContext) {
  try { sessionStorage.setItem(key(owner), JSON.stringify(parseAdminContext(value))); }
  catch { /* Mounted navigation still works without storage. */ }
}
export function clearAdminSession(owner: string) {
  try {
    const prefixes = ['draft', 'editor', 'sam-editor', 'mutation', 'navigation', 'schedule-filter','history-filter','stats-filter','catalog-filter','schedule-page','history-page','log-page','schedule-run','schedule-runs-page'].map(part => `spin-admin-${part}:${owner}`);prefixes.push(`spin-schedule-form:${owner}`);
    for (const name of Object.keys(sessionStorage)) {
      if (prefixes.some(prefix => name === prefix || name.startsWith(prefix + ':'))) sessionStorage.removeItem(name);
    }
    const url=new URL(window.location.href);url.searchParams.delete('leadReport');for(const param of Object.values(parameters))url.searchParams.delete(param);window.history.replaceState({},'',url);
  } catch { /* Auth boundary still removes the mounted UI. */ }
}

const parameters={view:'adminView',section:'adminSection',scheduleId:'adminSchedule',runId:'adminRun',issueRequestId:'adminIssueRequest',runSection:'adminRunSection',scheduleRunId:'adminScheduleRun',sourceId:'adminSource',geographyId:'adminGeography'} as const;
export function hasAdminLocation(){return views.includes(new URLSearchParams(window.location.search).get('adminView') as AdminView);}
export function leaveAdminLocation(){const url=new URL(window.location.href);for(const param of Object.values(parameters))url.searchParams.delete(param);window.history.pushState({},'',url);}
export function readAdminLocation(owner:string):AdminContext{
 const query=new URLSearchParams(window.location.search),value:Record<string,string>={};
 for(const [key,param] of Object.entries(parameters)){const item=query.get(param);if(item)value[key]=item;}
 return value.view?parseAdminContext(value):readAdminContext(owner);
}
export function pushAdminLocation(owner:string,value:AdminContext){
 const context=parseAdminContext(value),url=new URL(window.location.href);
 for(const [key,param] of Object.entries(parameters)){const item=context[key as keyof typeof parameters];if(item)url.searchParams.set(param,item);else url.searchParams.delete(param);}
 window.history.pushState({...window.history.state,adminOwner:owner,adminContext:context,adminReturn:readAdminLocation(owner)},'',url);
 saveAdminContext(owner,context);
}

// Run tabs refine the same destination; Back must still return to its originating list.
export function replaceAdminLocation(owner:string,value:AdminContext){
 const context=parseAdminContext(value),url=new URL(window.location.href);
 for(const [key,param] of Object.entries(parameters)){const item=context[key as keyof typeof parameters];if(item)url.searchParams.set(param,item);else url.searchParams.delete(param);}
 window.history.replaceState({...window.history.state,adminOwner:owner,adminContext:context},'',url);
 saveAdminContext(owner,context);
}
