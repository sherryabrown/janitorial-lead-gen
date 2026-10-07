import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import pg from 'pg';
import {adminClient,project} from './lib/supabase-admin.mjs';
import {rows,artifactStore} from './lib/hosted-store.mjs';
import {rehearsalTables,nativeRehearsal} from './lib/native-sql-rehearsal.mjs';
import {restrictedImportPoolOptions} from './lib/restricted-import-connection.mjs';
import {postgresTransport} from './lib/hosted-import.mjs';
import {auditLeadLinks} from './lib/api-link-audit.mjs';
import {prepareLinkPackage,applyLinkPackage} from './lib/api-link-package.mjs';
import {hash} from './lib/reviewed-batch.mjs';

const [command,path,approval]=process.argv.slice(2);
if(!['audit','prepare','apply'].includes(command)||!path)throw new Error('Usage: node --env-file=.env scripts/api-lead-links.mjs audit|prepare|apply PRIVATE_DIRECTORY [EXACT_APPROVAL_SHA256]');
const directory=resolve(path);mkdirSync(directory,{recursive:true});
const file=name=>resolve(directory,name),load=name=>JSON.parse(readFileSync(file(name))),save=(name,data)=>writeFileSync(file(name),JSON.stringify(data,null,2));
const db=adminClient(),snapshot=async()=>{
  const data={project_ref:project};for(const table of rehearsalTables)data[table]=await rows(db,table);return data;
};
if(command==='audit') {
  const baseline=await snapshot();
  save('baseline.json',baseline);
  // This project records note/stage edits, not general URL edits. The audit
  // preserves dedicated/payload URL disagreements and never infers an actor.
  const report=await auditLeadLinks(baseline,existsSync(file('audit.json'))?load('audit.json').entries:{});
  save('audit.json',report);console.log(JSON.stringify({checked:report.checked,pending:report.pending,by_source:report.by_source}));
}else {
  const options=restrictedImportPoolOptions(process.env,project);if(!options)throw new Error('Private restricted PostgreSQL configuration required');
  const pool=new pg.Pool(options),transport=postgresTransport(pool,project);
  try {
    if(command==='prepare') {
      const report=load('audit.json');if(report.pending)throw new Error('Finish the bounded audit before preparing');
      if(hash(await snapshot())!==hash(load('baseline.json')))throw new Error('Live baseline changed; rerun the bounded audit before preparing');
      const proposals=Object.values(report.entries).filter(e=>['needs_correct_link','unresolved'].includes(e.outcome)).map(e=>({lead_id:e.lead_id,resolution:e.resolution}));
      const rehearsalOptions=restrictedImportPoolOptions(process.env,project,{rehearsal:true});if(!rehearsalOptions)throw new Error('Private validator configuration required');
      const validator=new pg.Pool(rehearsalOptions);
      try {
        const p=await prepareLinkPackage({before:load('baseline.json'),schema:await transport.schema(),proposals,rehearse:nativeRehearsal(validator)});
        save('package.json',p);const privatePath=await artifactStore(db).put(p);
        save('prepared.json',{approval_sha256:p.approval_sha256,artifact:privatePath,summary:p.manifest.summary});
        console.log(JSON.stringify({approval_sha256:p.approval_sha256,summary:p.manifest.summary,test:p.test,production_updated:0}));
      }finally{await validator.end();}
    }else {
      if(!/^[a-f0-9]{64}$/.test(approval??''))throw new Error('Explicit exact approval hash required');
      const receipt=await applyLinkPackage({packageData:load('package.json'),approval,transport,artifacts:artifactStore(db),snapshot});
      save('applied.json',receipt);console.log(JSON.stringify(receipt));
    }
  }finally{await pool.end();}
}
