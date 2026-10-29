// Explicit download-only helper. Operator-approved credentials arrive via stdin, never argv.
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {token,serviceKey,encryptionKey,keyFile}=JSON.parse(input);input='';
const key=Buffer.from(encryptionKey,'base64');if(key.length!==32)throw Error('Invalid archive key');
const base='https://api.supabase.com/v1/projects/zreplhkoxswtzxlchtjf';
const inventory=async()=>{
 const query="begin isolation level repeatable read read only;select jsonb_agg(jsonb_build_object('id',id,'bucket_id',bucket_id,'name',name,'version',version,'updated_at',updated_at,'metadata',metadata) order by id) as objects from storage.objects where bucket_id='procurement-private';commit;";
 const r=await fetch(base+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Read-only object inventory HTTP '+r.status);const rows=await r.json();return rows[0].objects??[];
};
const objects=await inventory();
const folder=resolve('outputs/deployment/scheduling-backup-readiness/storage-encrypted-'+Date.now());await mkdir(folder);
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=async(name,bytes)=>{
 const nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',key,nonce),cipher=Buffer.concat([c.update(bytes),c.final()]);
 const path=resolve(folder,name);await writeFile(path,Buffer.concat([nonce,c.getAuthTag(),cipher]));
 const stored=await readFile(path),d=createDecipheriv('aes-256-gcm',key,stored.subarray(0,12));d.setAuthTag(stored.subarray(12,28));
 const recovered=Buffer.concat([d.update(stored.subarray(28)),d.final()]);if(!bytes.equals(recovered))throw Error('Object disk encryption round trip mismatch');
};
const results=[];let cursor=0;
async function worker(){while(cursor<objects.length){const object=objects[cursor++];if(!/^[0-9a-f-]{36}$/i.test(object.id)||object.bucket_id!=='procurement-private')throw Error('Unexpected object identity');
 const url='https://zreplhkoxswtzxlchtjf.supabase.co/storage/v1/object/authenticated/procurement-private/'+object.name.split('/').map(encodeURIComponent).join('/');
 const r=await fetch(url,{headers:{Authorization:'Bearer '+serviceKey,apikey:serviceKey},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Storage download HTTP '+r.status);
 const bytes=Buffer.from(await r.arrayBuffer());if(Number.isFinite(Number(object.metadata?.size))&&bytes.length!==Number(object.metadata.size))throw Error('Object size changed during backup');
 await save(object.id+'.aes',bytes);results.push({id:object.id,bytes:bytes.length,sha256:sha(bytes)});
 if(results.length%100===0)console.log('Encrypted and disk round-trip verified objects:',results.length);
}}
try{
 const workers=await Promise.allSettled([worker(),worker()]);
 if(workers.some(r=>r.status==='rejected'))throw Error('A download worker failed');
 const after=await inventory();const stable=JSON.stringify(objects)===JSON.stringify(after);
 await save('inventory.json.aes',Buffer.from(JSON.stringify({objects,results})));
 const receipt={checked_at:new Date().toISOString(),folder,keyFile,objects:results.length,bytes:results.reduce((n,r)=>n+r.bytes,0),source_inventory_stable:stable,encrypted_object_disk_round_trips:true,full_storage_service_restore:false,limitation:'Object bytes recovered from local encrypted files; isolated Storage service import and independent key escrow are not verified.'};
 await writeFile(resolve(folder,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));if(!stable)process.exitCode=1;
}catch{console.error('Storage backup incomplete; preserve partial encrypted files and review before retry.');process.exitCode=1;}finally{key.fill(0);}
