import { writeFileSync } from 'node:fs';
import { runSupabase } from './lib/supabase-cli.mjs';
import { project } from './lib/supabase-admin.mjs';

const destination = process.argv[2];
if (!destination) throw new Error('Provide a new private inventory output path.');
const output = runSupabase(['db', 'query', '--linked', '--project-ref', project, '--file', 'scripts/inspect-access.sql']);
const inventory = JSON.parse(output).rows[0].inventory;
writeFileSync(destination, JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx' });
console.log(`Saved access inventory: ${inventory.tables.length} relations; ${inventory.functions.length} functions. No application rows selected.`);
