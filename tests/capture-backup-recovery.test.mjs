import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('offline capture recovery preserves duplicate references and detects missing rows and tampering',async()=>{
 const folder=resolve('outputs/deployment/scheduling-backup-readiness','capture-bodies-'+Date.now()+String(Math.floor(Math.random()*100000)));
 await mkdir(folder,{recursive:true});const key=randomBytes(32),body=Buffer.from(Buffer.from('Exact saved evidence').toString('base64'));
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const row={source_id:'00000000-0000-4000-8000-000000000099',requested_url:'https://example.gov/a',final_url:'https://example.gov/a',content_type:'text/plain',retrieved_at:'2026-10-30T12:00:00Z',content_sha256:sha(Buffer.from(body.toString(),'base64')),base64_sha256:sha(body),content_base64_characters:body.length};
 const rows=[{...row,run_id:'00000000-0000-4000-8000-000000000001'},{...row,run_id:'00000000-0000-4000-8000-000000000002',requested_url:'https://example.gov/b'}];
 const save=async(name,bytes)=>{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);await writeFile(resolve(folder,name),Buffer.concat([nonce,cipher.getAuthTag(),encrypted]));};
 const manifest={rows,captures:2,unique_bodies:1};
 await save(row.base64_sha256+'.aes',body);await save('manifest.json.aes',Buffer.from(JSON.stringify(manifest)));
 const verify=()=>spawnSync(process.execPath,['--import','./tests/offline-only.mjs','scripts/export-procurement-capture-bodies.mjs','--verify'],{encoding:'utf8',windowsHide:true,input:JSON.stringify({folder,key:key.toString('base64')})});
 const passed=verify();assert.equal(passed.status,0,passed.stderr);const receipt=JSON.parse(await readFile(resolve(folder,'independent-restore-receipt.json'),'utf8'));assert.equal(receipt.captures,2);assert.equal(receipt.unique_bodies,1);assert.equal(receipt.all_encoded_and_decoded_hashes_match,true);
 await save('manifest.json.aes',Buffer.from(JSON.stringify({...manifest,captures:3})));assert.notEqual(verify().status,0,'Omitted row must fail recovery');
 await save('manifest.json.aes',Buffer.from(JSON.stringify(manifest)));const corrupt=await readFile(resolve(folder,row.base64_sha256+'.aes'));corrupt[corrupt.length-1]^=1;await writeFile(resolve(folder,row.base64_sha256+'.aes'),corrupt);assert.notEqual(verify().status,0,'Changed ciphertext must fail authentication');
 key.fill(0);
});
