type Entry={controller:AbortController;promise:Promise<unknown>;readers:number};
const reads=new Map<string,Entry>();
// Only in-flight reads are shared. No response cache or changed freshness policy.
export function sharedRead<T>(key:string,signal:AbortSignal|undefined,load:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
 let entry=reads.get(key);
 if(!entry){
  const controller=new AbortController();
  entry={controller,readers:0,promise:Promise.resolve().then(()=>load(controller.signal))};
  const current=entry;reads.set(key,current);
  const remove=()=>{if(reads.get(key)===current)reads.delete(key);};
  current.promise.then(remove,remove);
 }
 const current=entry;current.readers++;
 return new Promise<T>((resolve,reject)=>{
  let done=false;
  const finish=()=>{
   if(done)return false;done=true;signal?.removeEventListener('abort',aborted);
   if(--current.readers===0){current.controller.abort();if(reads.get(key)===current)reads.delete(key);}
   return true;
  };
  const aborted=()=>{if(finish())reject(new DOMException('Aborted','AbortError'));};
  signal?.addEventListener('abort',aborted,{once:true});
  current.promise.then(value=>{if(finish())resolve(structuredClone(value) as T);},error=>{if(finish())reject(error);});
 });
}
