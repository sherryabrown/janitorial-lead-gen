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
export function workflowServer({authenticate,workflow,imports,discovery,sam,samPacket,browser,attention,kick=()=>{},allowedOrigins=[]}) {
  return createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{response.writeHead(status);response.end(JSON.stringify(data));};
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
      const bearer=/^Bearer ([^\s]+)$/.exec(request.headers.authorization??'');
      if(!bearer)throw new HttpError(401,'Sign in required');
      const user=await authenticate(bearer[1]);
      if(!user?.id || !uuid.test(user.id))throw new HttpError(401,'Invalid or expired session');
      const actor=user.id;
      const segments=url.pathname.split('/').filter(Boolean);
      if(segments[0]!=='v1')throw new HttpError(404,'Endpoint not found');
      const input=request.method==='POST'?await body(request):null;
      let result;
      if(request.method==='POST'&&url.pathname==='/v1/geographies/preview')result=await workflow.preview(input);
      else if(request.method==='POST'&&url.pathname==='/v1/requests') {
        result=await workflow.submit(input,actor,request.headers['idempotency-key']);kick();send(202,result);return;
      } else if(segments[1]==='requests'&&uuid.test(segments[2]??'')) {
        const id=segments[2];
        if(request.method==='GET'&&segments.length===3) {
          const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);
          if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'Invalid pagination');
          result=await workflow.status(id,{offset,limit});kick();
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
          } else if(request.method==='POST'&&segments.length===6&&segments[5]==='interpret')
            result=await workflow.interpret(id,segments[4],input,actor);
        } else if(request.method==='POST'&&segments.length===5&&segments[3]==='imports'&&segments[4]==='prepare') {
          result=await imports.prepare(id,input,actor);kick();send(202,result);return;
        } else if(request.method==='POST'&&segments.length===4&&segments[3]==='discover') {
          result=await discovery(id,input,actor);kick();send(202,result);return;
        }
      } else if(segments[1]==='imports'&&uuid.test(segments[2]??'')) {
        if(request.method==='GET'&&segments.length===3) {result=await imports.status(segments[2]);kick();}
        else if(request.method==='POST'&&segments.length===4&&['approve','reconcile'].includes(segments[3])) {
          result=await imports[segments[3]](segments[2],input,actor);kick();
        }
      } else if(segments[1]==='access'&&uuid.test(segments[2]??'')) {
        if(request.method==='GET'&&segments.length===3)result=await workflow.access(segments[2]);
        else if(request.method==='POST'&&segments.length===4&&segments[3]==='events')result=await workflow.accessEvent(segments[2],input,actor);
        else if(request.method==='POST'&&segments.length===4&&segments[3]==='continue') {
          if(!browser)throw new HttpError(503,'Browser continuation not configured');
          result=await browser.continueAccess(segments[2],actor);
        }
      } else if(request.method==='GET'&&segments.length===5&&segments[1]==='sam'&&segments[2]==='requests'&&uuid.test(segments[3])&&segments[4]==='packet') {
        result=await samPacket(segments[3]);
      } else if(request.method==='POST'&&url.pathname==='/v1/sam/requests') {
        result=await sam(input,actor,request.headers['idempotency-key']);kick();send(202,result);return;
      }
      if(result===undefined)throw new HttpError(404,'Endpoint not found');
      send(200,result);
    } catch(error) {
      // Only intentional HTTP errors cross the boundary. DB/provider errors may contain private details.
      send(error instanceof HttpError?error.status:422,{error:error instanceof HttpError?error.message:
        'Action could not complete. Check saved job status or server configuration; no success was confirmed.'});
    }
  });
}
