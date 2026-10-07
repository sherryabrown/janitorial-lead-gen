import { readFileSync } from 'node:fs';
import { adminClient } from './lib/supabase-admin.mjs';
import { geographyRequest } from './lib/geography-service.mjs';

const usage = `Chat-initiated Arkansas geography request:
  node scripts/geography-request.mjs preview city|county NAME [--county COUNTY]
  node scripts/geography-request.mjs create INPUT.json

Preview reads the database and creates nothing. A county preview lists cities and a selection_token.
Ask the user in chat which city IDs to include, or to select county-only. Create requires
that answer as selected_city_ids (an empty array means county-only), the preview token,
and confirmed_city_selection:true. Never set confirmation before the user answers.
City create input needs kind, name and optional county. Both kinds need a name,
service_scope and search_windows objects. Create is an atomic live database write.
No search, signup, import, or schedule starts from this command.`;

const [command, ...args] = process.argv.slice(2);
if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(usage);
} else if (command === 'preview' || command === 'create') {
  let input;
  if (command === 'preview') {
    if (!['city', 'county'].includes(args[0]) || !args[1] || (args.length > 2 && (args[2] !== '--county' || !args[3])))
      throw new Error(usage);
    input = { kind: args[0], name: args[1], county: args[3] };
  } else {
    if (args.length !== 1) throw new Error(usage);
    input = JSON.parse(readFileSync(args[0], 'utf8'));
  }
  console.log(JSON.stringify(await geographyRequest(adminClient(),command,input),null,2));
} else throw new Error(usage);
