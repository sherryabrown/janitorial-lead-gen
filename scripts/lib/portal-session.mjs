import {safePublicUrl} from './known-source-execution.mjs';
import {accessHash} from './source-access.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};
// Only operator-reviewed private recipes can choose destinations, selectors or secret names.
export function portalRecipe(handoff) {
  const r=handoff.details?.hosted_access_recipe;
  need(!handoff.details?.aggregator&&!/aggregator/i.test(handoff.details?.provider_type??''),'Aggregator signup prohibited');
  need(handoff.channel==='portal'&&r?.version===1&&r.official_portal===true&&r.verified_at&&r.evidence_reference&&
    Number.isFinite(Date.parse(r.verified_until))&&Date.parse(r.verified_until)>Date.now(),'Current reviewed portal recipe required');
  need(Array.isArray(r.allowed_hosts)&&r.allowed_hosts.length<=8&&r.allowed_hosts.includes(handoff.tenant)&&
    r.allowed_hosts.every(h=>/^[a-z0-9.-]+$/.test(h)&&!h.startsWith('.'))&&
    safePublicUrl(r.entry_url,r.allowed_hosts)&&safePublicUrl(r.verify_url,[handoff.tenant]),'Reviewed tenant destinations required');
  need(typeof r.authenticated_selector==='string'&&r.authenticated_selector.length<300&&r.authenticated_selector.trim(),
    'Observed authenticated-page predicate required');
  need(!r.login_steps||Array.isArray(r.login_steps)&&r.login_steps.length<=6&&r.login_steps.every(s=>
    ['fill','click'].includes(s.action)&&typeof s.selector==='string'&&s.selector.length<300&&s.selector.trim()&&
    (s.action!=='fill'||/^PROCUREMENT_[A-Z0-9_]+_(EMAIL|PASSWORD)$/.test(s.secret))), 'Bounded sign-in steps required');
  if(r.signup)need(r.signup.free===true&&safePublicUrl(r.signup.url,r.allowed_hosts)&&Array.isArray(r.signup.fields)&&
    r.signup.fields.length<=12&&r.signup.fields.every(f=>typeof f.selector==='string'&&f.selector.length<300&&
      ['business_name','email','address','phone','contact_name'].includes(f.profile_field))&&
    typeof r.signup.submit_selector==='string'&&r.signup.submit_selector.length<300&&
    typeof r.signup.success_selector==='string'&&r.signup.success_selector.length<300,'Reviewed routine free signup contract required');
  return r;
}
export const sessionIdentity=h=>`${h.id}:${h.source_id}:${h.tenant}`;
export function validateSessionState(state,hosts) {
  need(state&&Object.keys(state).every(k=>['cookies','origins'].includes(k))&&Array.isArray(state.cookies)&&Array.isArray(state.origins)&&
    Buffer.byteLength(JSON.stringify(state))<=180000&&state.cookies.length<=100&&state.origins.length<=8,'Bounded browser session required');
  for(const cookie of state.cookies) {
    const host=String(cookie.domain??'').replace(/^\./,'');
    need(hosts.includes(host)&&cookie.secure===true&&typeof cookie.name==='string'&&typeof cookie.value==='string'&&
      typeof cookie.path==='string'&&Number.isFinite(cookie.expires),'Session cookie is outside reviewed hosts');
  }
  for(const origin of state.origins)need(safePublicUrl(origin.origin,hosts)&&new URL(origin.origin).origin===origin.origin&&
    Array.isArray(origin.localStorage),'Session storage is outside reviewed hosts');
  return state;
}
export function matchingSession(handoff,recipe) {
  const s=handoff.details?.hosted_session;
  return s?.identity===sessionIdentity(handoff)&&s.recipe_hash===accessHash(recipe)&&
    Date.parse(s.verified_until)>Date.now()?s:null;
}
export async function guardPortalContext(context,hosts,{signIn=false}={}) {
  await context.route('**/*',route=>{
    const req=route.request();let permitted=false;
    try {const u=new URL(req.url());permitted=u.protocol==='https:'&&hosts.includes(u.hostname)&&!u.username&&!u.password&&
      (['GET','HEAD'].includes(req.method())||signIn&&req.method()==='POST');}catch { /* deny */ }
    if(['image','font','media'].includes(req.resourceType?.()))permitted=false;
    return permitted?route.continue():route.abort();
  });
}
export async function verifyPortalPage(page,recipe) {
  const response=await page.goto(recipe.verify_url,{waitUntil:'domcontentloaded',timeout:30000});
  need(response?.status()===200&&new URL(page.url()).hostname===new URL(recipe.verify_url).hostname,
    'Portal session did not reach its reviewed tenant');
  await page.locator(recipe.authenticated_selector).waitFor({state:'visible',timeout:15000});
  need(!await page.locator('input[type="password"]').first().isVisible()&&!await page.locator('iframe[src*="captcha"]').count(),
    'Human authentication challenge remains');
}
