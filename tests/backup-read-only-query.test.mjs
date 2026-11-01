import test from 'node:test';
import assert from 'node:assert/strict';
import {backupReadOnlyQuery} from '../scripts/backup-read-only-query.mjs';
function clock(){let value=0;const waits=[];return{now:()=>value,sleep:async ms=>{waits.push(ms);value+=ms;},waits};}
test('read-only transport retries interrupted responses and HTTP-400 throttles without changing its query',async()=>{
 const time=clock(),requests=[];let calls=0;
 const query=backupReadOnlyQuery({token:'fixture',...time,fetchImpl:async(url,options)=>{requests.push({url,options});calls++;if(calls===1)return{ok:true,json:async()=>{throw new TypeError('terminated');}};if(calls===2)return new Response('ThrottlerException: Too Many Requests',{status:400,headers:{'Retry-After':'2'}});return new Response('[{"ok":true}]');}});
 assert.deepEqual(await query('select 1'),[{ok:true}]);assert.equal(calls,3);assert.ok(time.waits.some(ms=>ms>=2000));
 for(const {options} of requests){const body=JSON.parse(options.body);assert.equal(body.read_only,true);assert.equal(body.query,'begin isolation level repeatable read read only;select 1;commit;');}
});
test('permanent permission errors are not retried and network retries stop at five attempts',async()=>{
 let calls=0,recorded=0;
 const denied=backupReadOnlyQuery({token:'fixture',...clock(),fetchImpl:async()=>{calls++;return new Response('permission denied',{status:403});},onError:async()=>{recorded++;}});
 await assert.rejects(denied('select 1'),/HTTP 403/);assert.equal(calls,1);assert.equal(recorded,1);
 calls=0;const interrupted=backupReadOnlyQuery({token:'fixture',...clock(),fetchImpl:async()=>{calls++;throw new TypeError('terminated');}});
 await assert.rejects(interrupted('select 1'),/interrupted after five attempts/);assert.equal(calls,5);
});
