// Read-only operator backup. Deduplicate byte-identical encodings, never source rows.
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,access,rename} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {backupReadOnlyQuery} from './backup-read-only-query.mjs';
let text='';for await(const chunk of process.stdin)text+=chunk;
const input=JSON.parse(text);text='';const key=Buffer.from(input.key,'base64');
if(key.length!==32)throw Error('Invalid recovery key');
const diagnostic=process.argv.includes('--diagnostic');
const root=resolve('outputs/deployment/scheduling-backup-readiness'),verify=process.argv.includes('--verify')||diagnostic;
const folder=verify||input.folder?resolve(input.folder):resolve(root,'capture-bodies-'+Date.now());
if(!/^capture-bodies-\d+$/.test(basename(folder))||resolve(root,basename(folder))!==folder)throw Error('Unexpected private backup path');
const sha=b=>createHash('sha256').update(b).digest('hex');
const unpack=async name=>{const b=await readFile(resolve(folder,name)),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]);};
const save=async(name,b)=>{const nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',key,nonce),cipher=Buffer.concat([c.update(b),c.final()]),temporary=name+'.partial';await writeFile(resolve(folder,temporary),Buffer.concat([nonce,c.getAuthTag(),cipher]));if(!(await unpack(temporary)).equals(b))throw Error('Encrypted disk recovery differs');await rename(resolve(folder,temporary),resolve(folder,name));};
const query=backupReadOnlyQuery({token:input.token,onError:async(status,detail)=>save('api-error.json.aes',Buffer.from(JSON.stringify({status,detail}))),onRetry:(reason,attempt)=>console.log(reason+'; bounded retry',attempt)});
const uuid=value=>{if(!/^[0-9a-f-]{36}$/.test(value))throw Error('Invalid capture identity');return "'"+value+"'::uuid";};
async function inventory(){
 const rows=[];let cursor=null;
 for(;;){const page=await query(`select run_id,source_id,requested_url,final_url,content_type,content_sha256,retrieved_at,octet_length(content_base64) as content_base64_characters,encode(sha256(convert_to(content_base64,'UTF8')),'hex') as base64_sha256 from public.procurement_public_captures ${cursor?'where run_id>'+uuid(cursor):''} order by run_id limit 500`);if(!page.length)break;for(const row of page)uuid(row.run_id);rows.push(...page);cursor=page.at(-1).run_id;}
 return rows;
}
function groupsFor(rows){const groups=new Map();for(const row of rows){if(!/^[0-9a-f]{64}$/.test(row.base64_sha256)||!/^[0-9a-f]{64}$/.test(row.content_sha256))throw Error('Invalid evidence hash');const previous=groups.get(row.base64_sha256);if(previous&&(previous.content_sha256!==row.content_sha256||previous.content_base64_characters!==row.content_base64_characters))throw Error('Conflicting body metadata');groups.set(row.base64_sha256,previous??row);}return [...groups.values()];}
function checkBody(body,row){if(body.length!==row.content_base64_characters||sha(body)!==row.base64_sha256)throw Error('Encoded capture bytes differ');const decoded=Buffer.from(body.toString('utf8'),'base64');if(sha(decoded)!==row.content_sha256)throw Error('Capture evidence hash mismatch');return decoded.length;}
try{
 if(diagnostic){console.log((await unpack('api-error.json.aes')).toString());}
 else if(verify){
  const manifest=JSON.parse((await unpack('manifest.json.aes')).toString()),groups=groupsFor(manifest.rows);let decoded=0;
  if(manifest.rows.length!==manifest.captures||groups.length!==manifest.unique_bodies)throw Error('Incomplete recovery manifest');
  const ids=new Set(manifest.rows.map(r=>r.run_id));if(ids.size!==manifest.rows.length)throw Error('Duplicate capture identity');
  for(const row of groups)decoded+=checkBody(await unpack(row.base64_sha256+'.aes'),row);
  const receipt={checked_at:new Date().toISOString(),folder,captures:manifest.rows.length,unique_bodies:groups.length,unique_decoded_bytes:decoded,independent_process:true,saved_key_recovery:true,all_encoded_and_decoded_hashes_match:true,all_row_metadata_preserved:true,complete_database_backup:false};
  await writeFile(resolve(folder,'independent-restore-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }else{
  await mkdir(folder,{recursive:true});const rows=await inventory(),groups=groupsFor(rows);console.log(JSON.stringify({captures:rows.length,unique_bodies:groups.length,encoded_bytes:rows.reduce((n,r)=>n+r.content_base64_characters,0),unique_encoded_bytes:groups.reduce((n,r)=>n+r.content_base64_characters,0)}));
  const pending=[];let reused=0;
  for(const row of groups){const name=row.base64_sha256+'.aes';let exists=true;try{await access(resolve(folder,name));}catch{exists=false;}if(exists){try{checkBody(await unpack(name),row);reused++;continue;}catch{await rename(resolve(folder,name),resolve(folder,name+'.invalid-'+Date.now()));console.log('Preserved an incomplete cached object for review; downloading replacement');}}pending.push(row);}
  console.log('Previously saved unique bodies verified and reused:',reused);
  const batches=[];let batch=[],size=0;
  for(const row of pending){if(batch.length&&(size+row.content_base64_characters>1800000||batch.length>=16)){batches.push(batch);batch=[];size=0;}batch.push(row);size+=row.content_base64_characters;}if(batch.length)batches.push(batch);
  let cursor=0,finished=reused,completedBatches=0,stop=false;
  async function worker(){while(cursor<batches.length&&!stop){try{const batch=batches[cursor++],result=await query('select run_id,content_base64 from public.procurement_public_captures where run_id in ('+batch.map(r=>uuid(r.run_id)).join(',')+') order by run_id');const found=new Map(result.map(r=>[r.run_id,r]));if(found.size!==batch.length||result.length!==batch.length)throw Error('Capture disappeared during export');for(const row of batch){const value=found.get(row.run_id);if(!value)throw Error('Missing capture body');const body=Buffer.from(value.content_base64,'utf8');checkBody(body,row);await save(row.base64_sha256+'.aes',body);finished++;}completedBatches++;if(completedBatches%10===0)console.log('Unique capture bodies recovered:',finished,'/',groups.length);}catch(error){stop=true;throw error;}}}
  const workers=await Promise.allSettled([worker(),worker()]);const failure=workers.find(r=>r.status==='rejected');if(failure)throw Error('A capture download failed: '+failure.reason.message);
  const after=await inventory();if(JSON.stringify(rows)!==JSON.stringify(after))throw Error('Capture inventory changed during export');
  const manifest={checked_at:new Date().toISOString(),rows,captures:rows.length,unique_bodies:groups.length,keyFile:input.keyFile};await save('manifest.json.aes',Buffer.from(JSON.stringify(manifest)));
  const receipt={checked_at:new Date().toISOString(),folder,keyFile:input.keyFile,captures:rows.length,unique_bodies:groups.length,source_inventory_stable:true,all_encoded_and_decoded_hashes_match:true,all_row_metadata_preserved:true,complete_database_backup:false};
  await writeFile(resolve(folder,'export-receipt.json'),JSON.stringify(receipt,null,2));await writeFile(resolve(root,'latest-capture-export-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }
}catch(error){console.error('Capture export/recovery stopped:',error.message);process.exitCode=1;}finally{key.fill(0);}
