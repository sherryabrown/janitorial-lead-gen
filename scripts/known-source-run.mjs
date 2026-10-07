import { adminClient, project, serverKey } from './lib/supabase-admin.mjs';
import { executeKnownSources } from './lib/known-source-collection.mjs';
const [command, requestId, ...options] = process.argv.slice(2);
const selectedSourceCode = options[0]?.startsWith('--source=') ? options[0].slice(9) : undefined;
if (!['plan','run'].includes(command) || !/^[a-f0-9-]{36}$/i.test(requestId??'') || options.length>1 ||
    options.length && (command!=='run' || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(selectedSourceCode??'')))
  throw new Error('Usage: node scripts/known-source-run.mjs plan REQUEST_UUID | run REQUEST_UUID [--source=SOURCE_CODE]');
if (['sam','sam-awards'].includes(selectedSourceCode)) throw new Error('SAM is separate from geography refreshes. Use scripts/sam-search.mjs for an Arkansas-wide manual check.');
console.log(JSON.stringify(await executeKnownSources({db:adminClient(),project,serverKey,command,requestId,selectedSourceCode}),null,2));
