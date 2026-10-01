import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../../node_modules/supabase/dist/supabase.js', import.meta.url));

// Invoke the pinned package directly: no shell interpolation or runtime downloads.
// Output can contain credentials; callers must never log it indiscriminately.
export function runSupabase(args, options = {}) {
  if (!existsSync(entry)) throw new Error('Local Supabase CLI missing. Run npm ci first.');
  return execFileSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}
