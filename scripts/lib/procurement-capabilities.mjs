import {HttpError} from './workflow-http.mjs';

export async function profileCapabilities(db,userId) {
  const {data,error}=await db.from('profiles').select('role,updated_at').eq('user_id',userId).maybeSingle();
  if(error)throw new HttpError(503,'Account permissions could not be checked. Try again.');
  const role=['user','admin'].includes(data?.role)?data.role:null;
  return {role,scope:'shared_team',revision:data?.updated_at??null,
    manage_schedules:!!role,manage_sources:role==='admin',technical_details:role==='admin'};
}

// Explicit business routes. Everything else, including future routes, requires
// Admin authority. A URL containing /admin alone does not decide access.
export function scheduleBusinessRoute(method,path) {
  if(method==='GET'&&['/v1/capabilities','/v1/counties','/v1/state-triggers',
    '/v1/admin/analytics','/v1/admin/metric-members','/v1/admin/history'].includes(path))return true;
  if(/^\/v1\/schedules(?:\/[a-f0-9-]{36}(?:\/(?:activity|occurrences|events|sources|update|pause|resume|archive|delete|run-now))?|\/preview)?$/.test(path))return ['GET','POST'].includes(method);
  if(method==='GET'&&/^\/v1\/triggers(?:\/[a-f0-9-]{36})?$/.test(path))return true;
  if(method==='GET'&&/^\/v1\/requests\/[a-f0-9-]{36}\/source-status$/.test(path))return true;
  return false;
}

export function requireCapability(capabilities,method,path) {
  if(!capabilities.manage_schedules)throw new HttpError(403,'Your account does not have scheduling access.');
  if(!scheduleBusinessRoute(method,path)&&!capabilities.manage_sources)
    throw new HttpError(403,'An Admin is required for source repairs and technical details.');
}

export function businessResponse(value){
  if(Array.isArray(value))return value.map(businessResponse);
  if(!value||typeof value!=='object')return value;
  const privateKeys=new Set(['checkpoint','evidence','usage','ai_policy','backend_key_configured',
    'diagnostic_id','artifact','artifacts','packet','next_action','error_code']);
  return Object.fromEntries(Object.entries(value).filter(([key])=>!privateKeys.has(key)).map(([key,item])=>[key,businessResponse(item)]));
}
