import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcile,reconciliationSql,runIds } from './lib/intake-reconcile.mjs';
if(!process.argv.includes('--historical-batch')) {
  console.error('Historical September 16 batch tool. Use procurement-workflow.mjs for new batches. Explicit --historical-batch is required to run this archived workflow.');
  process.exit(2);
}
const [baseline,output,renderDestination]=process.argv.slice(2).filter(a=>a!=='--historical-batch');
if(baseline==='--render') {
  const destination=renderDestination;
  if(!output||!destination||existsSync(destination)) throw new Error('Usage: --render MANIFEST.json NEW_SQL_PATH');
  writeFileSync(destination,reconciliationSql(JSON.parse(readFileSync(output,'utf8'))),{flag:'wx'});
  console.log('Rendered reviewed manifest using current guarded SQL generator.');
  process.exit(0);
}
if(!baseline||!output) throw new Error('Usage: node scripts/prepare-intake-processing.mjs SNAPSHOT.json NEW_OUTPUT_PREFIX');
for(const ext of ['.json','.sql']) if(existsSync(output+ext)) throw new Error('Use a new output prefix; preserve prior manifests.');
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const m=reconcile(load(baseline),runIds.map(id=>load(resolve('outputs/sam-search',`${id}.json`))));
writeFileSync(output+'.json',JSON.stringify(m,null,2)+'\n',{flag:'wx'});
writeFileSync(output+'.sql',reconciliationSql(m),{flag:'wx'});
console.log(JSON.stringify(m.summary,null,2));
