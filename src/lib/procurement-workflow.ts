import { supabase } from './supabase';
export class WorkflowError extends Error {
  constructor(
    message: string,
    public code = 'ACTION',
  ) {
    super(message);
  }
}
export const productionWorkflowOrigin =
  'https://janitorial-procurement-backend.onrender.com';
export function workflowOrigin(
  value = import.meta.env.VITE_PROCUREMENT_API_URL || productionWorkflowOrigin,
) {
  try {
    const u = new URL(value);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/' ||
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(u.hostname))
      )
    )
      throw Error();
    return u.origin;
  } catch {
    throw new WorkflowError(
      'Admin service address is not configured correctly.',
      'CONFIG',
    );
  }
}
export async function workflowRequest<T>(
  path: string,
  {
    body,
    key,
    signal,
  }: { body?: unknown; key?: string; signal?: AbortSignal } = {},
): Promise<T> {
  if (!supabase) throw new WorkflowError('Sign in to use Admin.', 'SESSION');
  const session = await supabase.auth.getSession();
  let token = session.data.session?.access_token;
  if (!token)
    throw new WorkflowError(
      'Your session expired. Sign in again; your draft is kept.',
      'SESSION',
    );
  const send = (access: string) =>
    fetch(workflowOrigin() + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  let response: Response;
  try {
    response = await send(token);
    if (response.status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed.data.session?.access_token;
      if (!token)
        throw new WorkflowError(
          'Your session expired. Sign in again; your draft is kept.',
          'SESSION',
        );
      response = await send(token);
    }
  } catch (e) {
    if (
      e instanceof WorkflowError ||
      (e instanceof DOMException && e.name === 'AbortError')
    )
      throw e;
    throw new WorkflowError(
      'Connection interrupted. Check saved activity or retry the same action; no success was confirmed.',
      'UNCERTAIN',
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new WorkflowError(
      'Your session expired or this action is unavailable. Your draft is kept.',
      'SESSION',
    );
  if (!response.ok && body === undefined && path.startsWith('/v1/admin/metric-members?'))
    throw new WorkflowError(
      response.status === 404
        ? 'Report links are unavailable on this backend. Restart the local backend or deploy the matching backend, then retry.'
        : 'Saved report records could not load. Return to the originating report, refresh it, and retry the link.',
      'READ',
    );
  if (!response.ok)
    throw new WorkflowError(
      'Action was not confirmed. Refresh saved progress; scope, review, or schedule version may have changed.',
    );
  try {
    return (await response.json()) as T;
  } catch {
    throw new WorkflowError(
      'Acknowledgment was interrupted. Retry the same action to check its saved result.',
      'UNCERTAIN',
    );
  }
}
const volatileKeys = new Map<string, { fingerprint: string; key: string }>();
export function mutationKey(owner: string, action: string, body: unknown) {
  const storageKey = `spin-admin-mutation:${owner}:${action}`,
    fingerprint = JSON.stringify(body);
  let previous;
  try {
    previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  } catch {
    /* Use the mounted-session fallback when storage is unavailable. */
  }
  previous ??= volatileKeys.get(storageKey);
  if (previous?.fingerprint === fingerprint) return previous.key as string;
  const key = crypto.randomUUID();
  volatileKeys.set(storageKey, { fingerprint, key });
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  } catch {
    /* In-memory key still protects retries. */
  }
  return key;
}
export function acknowledged(owner: string, action: string) {
  const key = `spin-admin-mutation:${owner}:${action}`;
  volatileKeys.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* In-memory acknowledgment is sufficient for this screen. */
  }
}
