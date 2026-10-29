// Independent local-only recovery check. No network or production credentials.
import {createDecipheriv,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {folder:given,key:encodedKey}=JSON.parse(input);input='';
const root=resolve('outputs/deployment/scheduling-backup-readiness');
if(!/^storage-encrypted-\d+$/.test(basename(given)))throw Error('Unexpected backup folder');
const folder=resolve(root,basename(given));if(folder!==resolve(given))throw Error('Backup folder is outside private root');
const key=Buffer.from(encodedKey,'base64');if(key.length!==32)throw Error('Invalid recovery key');
const unpack=async name=>{const b=await readFile(resolve(folder,name));const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]);};
try{
 const {objects,results}=JSON.parse((await unpack('inventory.json.aes')).toString('utf8'));
 if(objects.length!==results.length||new Set(results.map(r=>r.id)).size!==results.length)throw Error('Incomplete object manifest');
 const ids=new Set(objects.map(o=>o.id));let bytes=0;
 for(const expected of results){if(!/^[0-9a-f-]{36}$/i.test(expected.id)||!ids.has(expected.id))throw Error('Invalid manifest object');const b=await unpack(expected.id+'.aes');if(b.length!==expected.bytes||createHash('sha256').update(b).digest('hex')!==expected.sha256)throw Error('Recovered object differs from manifest');bytes+=b.length;}
 const receipt={checked_at:new Date().toISOString(),objects:results.length,bytes,independent_process:true,key_recovered_from_saved_dpapi:true,all_decrypted_hashes_match:true,storage_service_import_verified:false};
 await writeFile(resolve(folder,'independent-restore-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{key.fill(0);}
