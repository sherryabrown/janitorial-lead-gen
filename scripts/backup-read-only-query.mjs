// Shared operator transport: bounded retries, one rate budget, no credential logging.
export function backupReadOnlyQuery({token,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,onError=async()=>{},onRetry=()=>{}}){
 let nextRequestAt=0;
 return async sql=>{
  for(let attempt=0;attempt<5;attempt++){
   const slot=Math.max(now(),nextRequestAt);nextRequestAt=slot+1100;await sleep(Math.max(0,slot-now()));
   try{
    const response=await fetchImpl('https://api.supabase.com/v1/projects/zreplhkoxswtzxlchtjf/database/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:'begin isolation level repeatable read read only;'+sql+';commit;',read_only:true}),signal:AbortSignal.timeout(60000)});
    if(!response.ok){
     const detail=await response.text();
     if([429,502,503,504].includes(response.status)||/ThrottlerException|Too Many Requests/i.test(detail)){
      const header=response.headers?.get('retry-after'),seconds=Number(header),retryMs=header?(Number.isFinite(seconds)?seconds*1000:Date.parse(header)-now()):30000;
      nextRequestAt=Math.max(nextRequestAt,now()+Math.min(60000,Math.max(1000,Number.isFinite(retryMs)?retryMs:30000)));onRetry('API throttling or temporary service failure',attempt+1);continue;
     }
     await onError(response.status,detail);throw Error('Read-only API HTTP '+response.status);
    }
    const rows=await response.json();if(!Array.isArray(rows))throw Error('Unexpected API result');return rows;
   }catch(error){
    const transient=error instanceof TypeError||error instanceof SyntaxError||['TimeoutError','AbortError'].includes(error.name)||['ECONNRESET','ETIMEDOUT','UND_ERR_SOCKET'].includes(error.code??error.cause?.code);
    if(!transient)throw error;
    if(attempt===4)throw Error('API response interrupted after five attempts');
    nextRequestAt=Math.max(nextRequestAt,now()+Math.min(30000,2000*2**attempt));onRetry('Interrupted API read',attempt+1);
   }
  }
  throw Error('API retry limit reached; partial encrypted backup is resumable');
 };
}
