// Offline, manifest-only preparation. No database connection or apply mode.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {planCountyDuplicateRepair,countyDuplicateRepairSql} from './lib/county-duplicate-repair.mjs';
import {hash} from './lib/reviewed-batch.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--before','--out','--original','--duplicate'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Use --before FILE --out NEW_DIRECTORY --original UUID --duplicate UUID');options[args[i]]=args[i+1];}
if(Object.keys(options).length!==4)throw Error('Use --before FILE --out NEW_DIRECTORY --original UUID --duplicate UUID');
const before=JSON.parse(readFileSync(resolve(options['--before']),'utf8'));
const manifest=planCountyDuplicateRepair(before,{originalId:options['--original'],duplicateId:options['--duplicate']}),sql=countyDuplicateRepairSql(manifest),out=resolve(options['--out']);
mkdirSync(out); // Never overwrite a previously reviewed repair package.
writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2));writeFileSync(out+'/repair.sql',sql);
writeFileSync(out+'/baseline.json',JSON.stringify(before,null,2));
writeFileSync(out+'/receipt.json',JSON.stringify({manifest_sha256:hash(manifest),sql_sha256:hash(sql),sent:false,native_rehearsal_required:true},null,2));
writeFileSync(out+'/ROLLBACK.md',`# Targeted repair rollback\n\nNo rows or historical receipts are deleted. Before applying, retain this baseline and the successful native rehearsal receipt privately.\n\n1. Pause only affected imports while reconciling; retain other scheduling settings.\n2. Read back both exact leads and all protected FK/history rows. Compare against this manifest and its baseline.\n3. If either record has newer source/user changes, do not restore the snapshot wholesale. Prepare a separately reviewed correction retaining those changes.\n4. Otherwise remove only this repair's redirect/identity correction by restoring the two baseline payloads in a guarded transaction; preserve every sales/dedicated field. Rehearse rollback, verify source-change audit events, FK rows and queue/cohort results. Do not delete the audit trail.\n5. Verify rollback before resuming affected work. Do not undo the compatible queue migration or rewrite immutable run receipts merely to restore visibility.\n`);
console.log(JSON.stringify({out,...manifest.summary,manifest_sha256:hash(manifest),production_sent:false}));
