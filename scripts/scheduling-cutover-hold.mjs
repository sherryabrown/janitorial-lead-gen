// Explicit Render Docker Command override for an approved cutover window only.
// Normal startup remains scripts/workflow-server.mjs. This process has no DB,
// auth, workflow or scheduler imports and never consumes a job.
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function schedulingCutoverHold(){
 const server=createServer((request,response)=>{
  const health=['GET','HEAD'].includes(request.method)&&request.url==='/health';
  response.writeHead(health?200:503,{'Content-Type':'application/json','Cache-Control':'no-store',...(health?{}:{'Retry-After':'60'})});
  response.end(JSON.stringify(health?{status:'ok',mode:'scheduling_cutover_hold'}:{error:'Scheduled maintenance. Please try again shortly.'}));
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=schedulingCutoverHold();server.listen(Number(process.env.PORT??8080),process.env.HOST??'0.0.0.0');
 process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
}
