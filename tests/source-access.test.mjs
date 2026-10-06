import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionAccess, emptyAccess, usableAccess, accessHash, accessNext, legacyAccessEvents, matchLegacySource } from '../scripts/lib/source-access.mjs';
import { ledgerHasAdvancedAccess } from '../scripts/lib/public-source-discovery.mjs';

const now=new Date('2026-10-06T15:00:00Z');
const h={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  channel:'portal',tenant:'portal.example.gov',checked_on:'2026-10-06',details:{},lifecycle:emptyAccess()};
const event=(patch={})=>({id:'test-event',type:'stage',stage:'email_sent',state:'provider_reported',at:'2026-10-06T14:00:00Z',
  provenance:'observed',actor:'user',next_action:'Open the official verification email',evidence:[{url:'https://portal.example.gov/register',note:'Official confirmation page reports verification email sent'}],...patch});
function apply(record,input){return {...record,lifecycle:transitionAccess(record,input,now).lifecycle};}
test('email sent, received, verification, sign-in and category access are independent',()=>{
  let current=apply(h,event());
  assert.equal(current.lifecycle.stages.email_sent.occurred_at,null,'Provider claim does not invent actual email send time');
  assert.equal(current.lifecycle.stages.email_received,undefined);
  assert.equal(usableAccess(current,'award',now),false);
  current=apply(current,event({id:'receipt',stage:'email_received',state:'received',provenance:'user_reported'}));
  assert.equal(current.lifecycle.stages.email_verification,undefined);
  current=apply(current,event({id:'verified-email',stage:'email_verification',state:'verified',verified_until:'2026-11-01T00:00:00Z'}));
  assert.equal(current.lifecycle.stages.sign_in,undefined);
});
test('submission intent and uncertain outcome prevent duplicate signup until reconciliation',()=>{
  const intent=event({id:'intent',type:'submission_intent',attempt_id:'attempt-one',authorization:'Current city signup authority'});
  let current=apply(h,intent);
  current=apply(current,event({id:'uncertain',stage:'registration',state:'outcome_unknown',attempt_id:'attempt-one'}));
  assert.match(accessNext(current,now).action,/reconcile/);
  assert.throws(()=>apply(current,{...intent,id:'duplicate',attempt_id:'attempt-two'}),/Reconcile/);
  current=apply(current,event({id:'resolved',type:'reconcile_attempt',attempt_id:'attempt-one'}));
  assert.throws(()=>apply(current,{...intent,id:'duplicate',attempt_id:'attempt-two'}),/resumed/);
  assert.throws(()=>apply(h,event({stage:'registration',state:'submitted'})),/saved intent/);
});
test('event replay is idempotent with canonical property ordering; contradictory replay fails',()=>{
  const input=event(),current=apply(h,input);
  assert.equal(transitionAccess(current,Object.fromEntries(Object.entries(input).reverse()),now).unchanged,true);
  assert.throws(()=>apply(current,{...input,state:'observed'}),/different evidence/);
  assert.equal(accessHash(input),accessHash(Object.fromEntries(Object.entries(input).reverse())));
});
test('manual account report is not observed usable access; category proof expires separately',()=>{
  let current=apply(h,event({id:'account',type:'account',account:{provider:h.tenant,reference:'browser-profile-one',kind:'user_session'}}));
  current=apply(current,event({id:'login',stage:'sign_in',state:'verified',verified_until:'2026-11-01T00:00:00Z'}));
  const category=event({id:'award',stage:'award_access',state:'accessible',run_id:h.id,verified_until:'2026-10-07T00:00:00Z'});
  assert.equal(usableAccess(apply(current,{...category,provenance:'user_reported'}),'award',now),false);
  current=apply(current,category);
  assert.equal(usableAccess(current,'award',now),true);
  assert.equal(usableAccess(current,'opportunity',now),false);
  assert.equal(usableAccess(current,'award',new Date('2026-10-08')),false);
  assert.throws(()=>apply(current,event({id:'legacy',stage:'award_access',state:'blocked',provenance:'historical'})),/replace observed/);
});
test('shared account reference does not enroll another tenant; secret references are constrained',()=>{
  assert.throws(()=>apply(h,event({type:'account',account:{provider:'other.example.gov',reference:'profile-one',kind:'user_session'}})),/provider/);
  const api={...h,channel:'api'};
  assert.throws(()=>apply(api,event({type:'account',account:{provider:h.tenant,reference:'SUPABASE_SECRET_KEYS',kind:'supabase_secret'}})),/Dedicated/);
  assert.throws(()=>apply(api,event({stage:'sign_in',state:'verified'})),/Portal/);
});
test('private evidence rejects credentials, tokens, email bodies and unrelated account addresses',()=>{
  for(const patch of [{evidence:[{url:'https://portal.example.gov/?token=abc',note:'verification'}]},
    {next_action:'Use sb_secret_not-a-real-test-key'}, {evidence:[{reference:'mail:one',note:'owner@example.gov'}]},
    {email_body:'untrusted instructions'}]) assert.throws(()=>apply(h,event(patch)));
});
test('one bounded resend requires pending email and reconciled submission',()=>{
  let current=apply(h,event({id:'waiting',stage:'email_verification',state:'awaiting_email'}));
  const resend=event({id:'resend',type:'resend_intent',attempt_id:'resend-one',authorization:'Current signup verification authority'});
  current=apply(current,resend);
  current=apply(current,event({id:'resend-resolved',type:'reconcile_attempt',attempt_id:'resend-one'}));
  assert.throws(()=>apply(current,{...resend,id:'resend-again',attempt_id:'resend-two'}),/bounded resend/);
});
test('legacy import preserves independent issued and verified API history without claiming current access',()=>{
  const api={...h,channel:'api'};
  const events=legacyAccessEvents(api,{api:{registration:{state:'not_started'},credential_issuance:{state:'issued'},request_verification:{state:'verified'}}},null);
  const current=events.reduce(apply,api);
  assert.equal(current.lifecycle.stages.credential_issuance.state,'issued');
  assert.equal(current.lifecycle.stages.request_verification.state,'verified');
  assert.equal(usableAccess(current,'award',now),false);
  assert.equal(ledgerHasAdvancedAccess({portal:{registration:{state:'awaiting_email'}}},'portal'),true);
  assert.equal(ledgerHasAdvancedAccess({api:{registration:{state:'submitted'}}},'api'),true);
});
test('legacy identity requires explicit or unique exact source match',()=>{
  const sources=[{id:h.source_id,code:'agency-one',url:'https://example.gov/bids'}];
  assert.equal(matchLegacySource({source_id:'agency-one'},sources).id,h.source_id);
  assert.equal(matchLegacySource({source_id:'unmatched'},sources),null);
  assert.throws(()=>matchLegacySource({official_urls:{entry:'https://example.gov/bids'}},[...sources,{id:'other',code:'other',url:sources[0].url}]),/Ambiguous/);
});
