import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Dispose of the WASM engine after each package; keep HTTP and lease heartbeats responsive.
export function validateHostedSql(input,{timeoutMs=120000}={}) {
  return new Promise((resolve,reject)=>{
    const child=fork(fileURLToPath(new URL('./hosted-sql-validation-worker.mjs',import.meta.url)),[],{
      windowsHide:true,execArgv:['--max-old-space-size=96','--wasm-num-compilation-tasks=1'],
      env:Object.fromEntries(['PATH','SystemRoot','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),
      stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',
    });
    let settled=false;
    const finish=(error,result)=>{
      if(settled)return;settled=true;clearTimeout(timer);child.kill();
      if(error)reject(error);else resolve(result);
    };
    const timer=setTimeout(()=>finish(new Error('SQL validation time limit reached; no import was sent')),timeoutMs);
    child.once('error',()=>finish(new Error('SQL validation process unavailable; no import was sent')));
    child.once('exit',()=>finish(new Error('SQL validation process interrupted; no import was sent')));
    child.once('message',message=>{
      if(message?.test?.status!=='offline_tests_passed') {
        const error=new Error('SQL validation failed; no import was sent');
        // Operator-only detail; never placed in the shared error message or HTTP response.
        error.privateDiagnostic=message?.test?.diagnostic;finish(error);
      }
      else finish(null,message.test);
    });
    child.send(input,error=>{if(error)finish(new Error('SQL validation input unavailable; no import was sent'));});
  });
}
