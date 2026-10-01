import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
export const project = 'zreplhkoxswtzxlchtjf';
export function serverKey() {
  try {
    const output = execFileSync('cmd.exe', ['/d', '/s', '/c',
      `npx.cmd --yes supabase projects api-keys --project-ref ${project} --reveal --output json`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const key = JSON.parse(output).find(k => k.type === 'secret' && k.api_key?.startsWith('sb_secret_'))?.api_key;
    if (!key) throw new Error();
    return key;
  } catch { throw new Error('Cannot obtain server authorization through Supabase CLI; no credentials were logged.'); }
}
export function adminClient() {
  return createClient(`https://${project}.supabase.co`, serverKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
