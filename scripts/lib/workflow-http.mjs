import { schedulerAuthorization } from './procurement-schedules.mjs';
import { createServer } from 'node:http';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
async function body(request) {
  if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']??''))throw new HttpError(415,'JSON body required');
  const chunks=[];let size=0;
  for await(const chunk of request) {
    size+=chunk.length;if(size>200000)throw new HttpError(413,'Request body too large');chunks.push(Buffer.from(chunk));
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid JSON');}
}
export function workflowServer({authenticate,workflow,imports,discovery,sam,samPacket,samStatus,samReconcile,samHistory,samProcess,browser,attention,triggers,schedules,schedulerKey,aiPolicy,audit,db,kick=()=>{},allowedOrigins=[]}) {
  return createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    let bufferResponse=false,pendingResponse;
    const send=(status,data)=>{if(bufferResponse){pendingResponse={status,data};return;}response.writeHead(status);response.end(JSON.stringify(data));};
    try {
      const origin=request.headers.origin;
      if(origin&&!allowedOrigins.includes(origin))throw new HttpError(403,'Origin not allowed');
      if(origin) {response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');}
      if(request.method==='OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key');
        send(204,null);return;
      }
      const url=new URL(request.url,'http://localhost');
      if(request.method==='GET'&&url.pathname==='/health'){send(200,{status:'ok',version:1});return;}
      if(url.pathname==='/internal/procurement-scheduler/tick'&&request.method==='POST') {
        if(origin)throw new HttpError(403,'Private scheduler route');
        if(!schedules||!schedulerAuthorization(schedulerKey,request.headers['x-procurement-scheduler-key']))throw new HttpError(401,'Private scheduler authorization required');
        const input=await body(request);
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new HttpError(400,'Empty scheduler body required');
        const result=await schedules.tick();kick();send(202,{accepted:true,...result});return;
      }
      const bearer=/^Bearer ([^\s]+)$/.exec(request.headers.authorization??'');
      if(!bearer)throw new HttpError(401,'Sign in required');
      const user=await authenticate(bearer[1]);
      if(!user?.id || !uuid.test(user.id))throw new HttpError(401,'Invalid or expired session');
      const actor=user.id;
      const segments=url.pathname.split('/').filter(Boolean);
      if(segments[0]!=='v1')throw new HttpError(404,'Endpoint not found');
      const input=request.method==='POST'?await body(request):null;
      bufferResponse=Boolean(audit&&request.method==='POST'&&['requests','imports'].includes(segments[1])&&uuid.test(segments[2]??''));
      const wakeRelated=async()=>{if(triggers&&segments[1]==='requests'&&uuid.test(segments[2]??''))await triggers.wake(segments[2]);};
      let result;
      const execute=async()=>{
      if(schedules&&url.pathname==='/v1/scheduler/status'&&request.method==='GET')result={...await schedules.status(),backend_key_configured:typeof schedulerKey==='string'&&schedulerKey.length>=32,...(aiPolicy?{ai_policy:{enabled:aiPolicy.enabled,monthly_usd:aiPolicy.monthlyUsd}}:{})};
      else if(schedules&&url.pathname==='/v1/admin/history'&&request.method==='GET') {
        const limit=Number(url.searchParams.get('limit')??50),offset=Number(url.searchParams.get('offset')??0);
        if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new HttpError(400,'Invalid pagination');
        result=await schedules.history({limit,offset,...Object.fromEntries(['schedule','run','target','geography','origin','outcome','from','through'].filter(k=>url.searchParams.has(k)).map(k=>[k,url.searchParams.get(k)]))});
      }
      else if(schedules&&segments[1]==='schedules') {
        const limit=Number(url.searchParams.get('limit')??50),offset=Number(url.searchParams.get('offset')??0);
        if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new HttpError(400,'Invalid pagination');
        if(segments.length===3&&segments[2]==='preview'&&request.method==='POST')result=await schedules.preview(input);
        else if(segments.length===2&&request.method==='GET')result=await schedules.list({offset,limit,...Object.fromEntries(['q','target','geography','lifecycle','blocker','sort','direction'].filter(k=>url.searchParams.has(k)).map(k=>[k,url.searchParams.get(k)]))});
        else if(segments.length===2&&request.method==='POST')result=await schedules.save(null,input,actor,request.headers['idempotency-key']);
        else if(uuid.test(segments[2]??'')) {
          const id=segments[2];
          if(segments.length===3&&request.method==='GET')result=await schedules.get(id);
          else if(segments.length===4&&['occurrences','events'].includes(segments[3])&&request.method==='GET')result=await schedules[segments[3]](id,{offset,limit});
          else if(segments.length===4&&segments[3]==='update'&&request.method==='POST')result=await schedules.save(id,input,actor,null);
          else if(segments.length===4&&['pause','resume','archive'].includes(segments[3])&&request.method==='POST')result=await schedules.control(id,segments[3],input,actor);
          else if(segments.length===4&&segments[3]==='run-now'&&request.method==='POST'){result=await schedules.runNow(id,input,actor,request.headers['idempotency-key']);kick();send(202,result);return;}
        }
      }
      else if(triggers&&segments[1]==='counties'&&segments.length===2&&request.method==='GET')result=await triggers.counties();
      else if(triggers&&segments[1]==='state-triggers'&&segments.length===2&&request.method==='GET')result=await triggers.stateSources();
      else if(triggers&&segments[1]==='triggers') {
        const limit=Number(url.searchParams.get('limit')??50),offset=Number(url.searchParams.get('offset')??0);
        if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new HttpError(400,'Invalid pagination');
        if(segments.length===3&&segments[2]==='preview'&&request.method==='POST')result=await triggers.preview(input);
        else if(segments.length===2&&request.method==='POST'){result=await triggers.submit(input,actor,request.headers['idempotency-key']);await wakeRelated();kick();send(202,result);return;}
        else if(segments.length===2&&request.method==='GET')result=await triggers.list({offset,limit});
        else if(uuid.test(segments[2]??'')) {
          if(segments.length===3&&request.method==='GET'){result=await triggers.status(segments[2]);kick();}
          else if(segments.length===4&&segments[3]==='steps'&&request.method==='GET')result=await triggers.steps(segments[2],{cursor:url.searchParams.get('cursor'),limit});
          else if(segments.length===4&&['cancel','resume'].includes(segments[3])&&request.method==='POST'){result=await triggers.control(segments[2],segments[3],actor);kick();}
        }
      }
      else if(request.method==='POST'&&url.pathname==='/v1/geographies/preview')result=await workflow.preview(input);
      else if(request.method==='POST'&&url.pathname==='/v1/requests') {
        result=await workflow.submit(input,actor,request.headers['idempotency-key']);await wakeRelated();kick();send(202,result);return;
      } else if(segments[1]==='requests'&&uuid.test(segments[2]??'')) {
        const id=segments[2];
        if(request.method==='GET'&&segments.length===3) {
          const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);
          if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid pagination');
          result=await workflow.status(id,{offset,limit});kick();
        } else if(request.method==='GET'&&segments.length===4&&segments[3]==='sources') {
          const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);
          if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid pagination');
          result=await workflow.sourceOptions(id,{offset,limit});
        } else if(request.method==='GET'&&segments.length===4&&segments[3]==='attention') {
          const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);
          if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid pagination');
          result=await attention(id,{offset,limit});
        } else if(request.method==='POST'&&segments.length===4&&['cancel','resume'].includes(segments[3])) {
          result=await workflow.control(id,segments[3],actor);kick();
        } else if(segments[3]==='tasks'&&uuid.test(segments[4]??'')) {
          if(request.method==='GET'&&segments.length===6&&segments[5]==='packet') {
            const packet=await workflow.packet(id,segments[4]);
            result={...packet,pages:packet.pages.map(({body,extension,raw_file,content_base64,...page})=>page)};
          } else if(request.method==='POST'&&segments.length===6&&segments[5]==='supporting-captures')
            result=await workflow.captureSupporting(id,segments[4],input,actor);
          else if(request.method==='POST'&&segments.length===6&&segments[5]==='supporting-evidence')
            result=await workflow.readSupporting(id,segments[4],input);
          else if(request.method==='POST'&&segments.length===6&&segments[5]==='interpret')
            result=await workflow.interpret(id,segments[4],input,actor);
        } else if(request.method==='POST'&&segments.length===5&&segments[3]==='imports'&&segments[4]==='prepare') {
          result=await imports.prepare(id,input,actor);await wakeRelated();kick();send(202,result);return;
        } else if(request.method==='POST'&&segments.length===5&&segments[3]==='imports'&&segments[4]==='continue') {
          if(!input||Object.keys(input).length)throw new HttpError(400,'Empty continuation body required');
          result=await imports.prepareCounty(id);if(!result)throw new HttpError(400,'Active confirmed county request required');
          await wakeRelated();kick();send(202,result);return;
        } else if(request.method==='POST'&&segments.length===4&&segments[3]==='discover') {
          result=await discovery(id,input,actor);await wakeRelated();kick();send(202,result);return;
        } else if(request.method==='POST'&&segments.length===5&&segments[3]==='discover'&&segments[4]==='review') {
          result=await discovery.review(id,input,actor);await wakeRelated();kick();send(202,result);return;
        } else if(request.method==='POST'&&segments.length===5&&segments[3]==='discover'&&segments[4]==='resume') {
          result=await discovery.resume(id,input,actor);await wakeRelated();kick();send(202,result);return;
        } else if(request.method==='GET'&&segments.length===7&&segments[3]==='discovery'&&segments[4]==='tasks'&&uuid.test(segments[5])&&segments[6]==='packet') {
          result=await discovery.packet(id,segments[5]);
        }
      } else if(segments[1]==='imports'&&uuid.test(segments[2]??'')) {
        if(request.method==='GET'&&segments.length===3) {result=await imports.status(segments[2]);kick();}
        else if(request.method==='POST'&&segments.length===4&&['approve','reconcile'].includes(segments[3])) {
          result=await imports[segments[3]](segments[2],input,actor);
          if(result.automatic?.policy==='county-automatic-v1')await triggers?.wake(result.request_id,{reconciled:true});
          kick();
        }
      } else if(segments[1]==='access'&&uuid.test(segments[2]??'')) {
        if(request.method==='GET'&&segments.length===3)result=await workflow.access(segments[2]);
        else if(request.method==='POST'&&segments.length===4&&segments[3]==='events')result=await workflow.accessEvent(segments[2],input,actor);
        else if(request.method==='POST'&&segments.length===4&&segments[3]==='continue') {
          if(!browser)throw new HttpError(503,'Browser continuation not configured');
          result=await browser.continueAccess(segments[2],actor);
        } else if(request.method==='POST'&&segments.length===4&&segments[3]==='session') {
          if(!browser)throw new HttpError(503,'Browser continuation not configured');
          result=await browser.adoptSession(segments[2],input,actor);
        } else if(request.method==='POST'&&segments.length===5&&segments[3]==='capture'&&uuid.test(segments[4])) {
          if(!browser)throw new HttpError(503,'Browser continuation not configured');
          result=await browser.capture(segments[4],actor,segments[2]);
        } else if(request.method==='POST'&&segments.length===6&&segments[3]==='capture'&&uuid.test(segments[4])&&segments[5]==='reconcile') {
          if(!browser)throw new HttpError(503,'Browser continuation not configured');
          result=await browser.reconcileCapture(segments[2],segments[4],actor);
        }
      } else if(request.method==='GET'&&url.pathname==='/v1/sam/requests') {
        const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);
        if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid SAM history pagination');
        if(!samHistory)throw new HttpError(503,'SAM history not configured');
        result=await samHistory({offset,limit});
      } else if(request.method==='GET'&&segments.length===5&&segments[1]==='sam'&&segments[2]==='requests'&&uuid.test(segments[3])&&segments[4]==='status') {
        if(!samStatus)throw new HttpError(503,'SAM status not configured');
        result=await samStatus(segments[3]);
      } else if(request.method==='GET'&&segments.length===5&&segments[1]==='sam'&&segments[2]==='requests'&&uuid.test(segments[3])&&segments[4]==='packet') {
        result=await samPacket(segments[3]);
      } else if(request.method==='POST'&&segments.length===5&&segments[1]==='sam'&&segments[2]==='requests'&&uuid.test(segments[3])&&segments[4]==='reconcile') {
        if(!samReconcile)throw new HttpError(503,'SAM reconciliation not configured');
        const action=()=>samReconcile(segments[3],actor);
        result=await (audit?audit.run(segments[3],'reconcile',action,{actor_id:actor,reason:'manual'}):action());
        if(triggers)await triggers.wake(segments[3],{reconciled:true});kick();
      } else if(request.method==='POST'&&segments.length===5&&segments[1]==='sam'&&segments[2]==='requests'&&uuid.test(segments[3])&&segments[4]==='process') {
        if(!samProcess)throw new HttpError(503,'Automatic SAM processing not configured');
        const action=()=>samProcess(segments[3]);
        result=await (audit?audit.run(segments[3],'prepare',action,{actor_id:actor,reason:'manual'}):action());
        if(triggers)await triggers.wake(segments[3]);kick();
      } else if(request.method==='POST'&&url.pathname==='/v1/sam/requests') {
        result=await sam(input,actor,request.headers['idempotency-key']);await wakeRelated();kick();send(202,result);return;
      }
      if(result===undefined)throw new HttpError(404,'Endpoint not found');
      if(request.method==='POST')await wakeRelated();
      send(200,result);
      };
      // Audit mutations for linked child requests; reads and legacy standalone requests keep their contract.
      if(audit&&request.method==='POST'&&segments[1]==='requests'&&uuid.test(segments[2]??''))
        await audit.run(segments[2],segments[3]==='tasks'?segments.at(-1):segments[3]??'request_action',execute,{reason:'manual',actor_id:actor});
      else if(audit&&db&&request.method==='POST'&&segments[1]==='imports'&&uuid.test(segments[2]??'')) {
        const {data:job}=await db.from('procurement_jobs').select('search_request_id').eq('id',segments[2]).maybeSingle();
        if(!job)throw new HttpError(404,'Import job not found');
        await audit.run(job.search_request_id,segments[3],execute,{reason:'manual'});
      } else await execute();
      bufferResponse=false;
      if(pendingResponse)send(pendingResponse.status,pendingResponse.data);
    } catch(error) {
      bufferResponse=false;
      // Only intentional HTTP errors cross the boundary. DB/provider errors may contain private details.
      send(error instanceof HttpError?error.status:422,{error:error instanceof HttpError?error.message:
        'Action could not complete. Check saved job status or server configuration; no success was confirmed.'});
    }
  });
}
