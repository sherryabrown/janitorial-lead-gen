export type AdminView = 'schedules' | 'stats' | 'history' | 'sources' | 'geography';
export type AdminContext = {
  view: AdminView;
  section?: 'manual' | 'overview' | 'logs';
  scheduleId?: string;
  runId?: string;
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
  if (['manual', 'overview', 'logs'].includes(v.section as string)) result.section = v.section as AdminContext['section'];
  for (const name of ['scheduleId', 'runId', 'sourceId', 'geographyId'] as const) {
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
    const prefixes = ['draft', 'editor', 'sam-editor', 'mutation', 'navigation'].map(part => `spin-admin-${part}:${owner}`);
    for (const name of Object.keys(sessionStorage)) {
      if (prefixes.some(prefix => name === prefix || name.startsWith(prefix + ':'))) sessionStorage.removeItem(name);
    }
  } catch { /* Auth boundary still removes the mounted UI. */ }
}
