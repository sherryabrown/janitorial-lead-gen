import { writeFileSync, existsSync } from 'node:fs';
import { adminClient,project } from './lib/supabase-admin.mjs';

const destination=process.argv[2];
if (!destination || existsSync(destination)) throw new Error('Supply a new snapshot filename; existing snapshots are never overwritten.');
const db=adminClient(), snapshot={project_ref:project,captured_at:new Date().toISOString()};
for (const table of ['procurement_sources','procurement_leads','procurement_intake_items','procurement_intake_leads','procurement_request_leads','procurement_search_requests','procurement_versions','procurement_events']) {
  const rows=[];
  for(let offset=0;;offset+=1000) {
    const {data,error}=await db.from(table).select('*').order('id').range(offset,offset+999);
    if(error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data); if(data.length<1000) break;
  }
  snapshot[table]=rows;
}
writeFileSync(destination,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,Array.isArray(v)?v.length:v])),null,2));
