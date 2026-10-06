import { createHash } from 'node:crypto';
import { publicUrl, safeMetadata } from './research-persistence.mjs';
import { stable } from './sam-normalize.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
export const accessStages = {
  registration: ['not_required','not_started','submitted','awaiting_email','pending_agency_approval','pending_provider_approval','verified','approved','rejected','outcome_unknown'],
  email_sent: ['not_required','not_tested','provider_reported','observed'],
  email_received: ['not_required','not_tested','received'],
  email_verification: ['not_required','not_tested','awaiting_email','verified','expired','blocked'],
  approval: ['not_required','not_tested','pending','approved','rejected'],
  sign_in: ['not_required','not_tested','verified','blocked','expired'],
  credential_issuance: ['not_required','not_issued','issued','expired','revoked','unknown'],
  request_verification: ['not_tested','verified','failed'],
  forecast_access: ['not_tested','accessible','partial','blocked'],
  opportunity_access: ['not_tested','accessible','partial','blocked'],
  award_access: ['not_tested','accessible','partial','blocked'],
};
export const accessHash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export function cleanAccessMetadata(value) {
  need(JSON.stringify(value).length <= 30000, 'Access metadata exceeds bound');
  // Validate before persistence or logging; errors never echo rejected values.
  need(!/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(JSON.stringify(value)), 'Account addresses belong in secure account setup, not lifecycle evidence');
  safeMetadata(value);
  return value;
}
export function validateAccountReference(account, handoff) {
  need(account && Object.keys(account).every(k => ['provider','reference','kind'].includes(k)) &&
    ['user_session','supabase_secret','public','existing_account'].includes(account.kind) &&
    /^[a-z0-9.-]{3,160}$/.test(account.provider) &&
    /^[A-Za-z0-9_.:-]{3,160}$/.test(account.reference), 'Nonsecret account reference required');
  need(handoff.tenant === account.provider ||
    handoff.details?.provider_host === account.provider, 'Shared account provider must match reviewed tenant/provider');
  if (account.kind === 'supabase_secret')
    need(/^PROCUREMENT_[A-Z0-9_]+$/.test(account.reference), 'Dedicated procurement secret name required');
  if (account.kind === 'public') need(account.reference === 'not-required', 'Public reference must be not-required');
  return account;
}
export function emptyAccess() { return { version: 1, stages: {}, attempts: [], events: [] }; }

export function validateAccessEvent(event, handoff, now = new Date()) {
  const fields = ['id','type','stage','state','at','provenance','evidence','actor','next_action','blocker',
    'attempt_id','authorization','account','category','run_id','verified_until','occurred_at'];
  need(event && Object.keys(event).every(k => fields.includes(k)) &&
    /^[a-zA-Z0-9_.:-]{3,160}$/.test(event.id ?? '') &&
    ['stage','account','submission_intent','resend_intent','reconcile_attempt','blocker'].includes(event.type), 'Valid access event required');
  need(['observed','user_reported','historical'].includes(event.provenance) &&
    ['researcher','user','agency','provider'].includes(event.actor) &&
    typeof event.next_action === 'string' && event.next_action.trim(), 'Event provenance, actor and next action required');
  need(typeof event.at === 'string' && /(Z|\+00:00)$/.test(event.at) && Number.isFinite(Date.parse(event.at)) &&
    Date.parse(event.at) <= now.getTime(), 'Observed UTC timestamp required');
  if(event.occurred_at!==undefined && event.occurred_at!==null)
    need(/(Z|\+00:00)$/.test(event.occurred_at) && Number.isFinite(Date.parse(event.occurred_at)) &&
      Date.parse(event.occurred_at)<=Date.parse(event.at), 'Actual stage occurrence must be known UTC evidence, not a future estimate');
  need(Array.isArray(event.evidence) && event.evidence.length > 0 && event.evidence.length <= 5, 'Evidence required');
  for (const evidence of event.evidence) {
    need(evidence && Object.keys(evidence).every(k => ['url','reference','note'].includes(k)) &&
      typeof evidence.note === 'string' && evidence.note.trim(), 'Sanitized evidence note required');
    if (evidence.url) publicUrl(evidence.url);
    need(evidence.url || /^[a-zA-Z0-9_.:/-]{3,200}$/.test(evidence.reference ?? ''), 'Evidence reference required');
  }
  if (event.type === 'stage') {
    need(accessStages[event.stage]?.includes(event.state), 'Unsupported stage or state');
    if (handoff.channel === 'portal') need(!['credential_issuance','request_verification'].includes(event.stage), 'API stage cannot change portal lifecycle');
    if (handoff.channel === 'api') need(event.stage !== 'sign_in', 'Portal sign-in cannot change API lifecycle');
    if (['verified','accessible'].includes(event.state) && event.provenance === 'observed') {
      need(event.verified_until && Number.isFinite(Date.parse(event.verified_until)) &&
        Date.parse(event.verified_until) > Date.parse(event.at), 'Successful access needs an expiry');
      if (event.stage === 'request_verification' || event.stage.endsWith('_access'))
        need(/^[a-f0-9-]{36}$/i.test(event.run_id ?? ''), 'Retrieval proof must identify an audited run');
    }
  }
  if (event.type === 'account') validateAccountReference(event.account, handoff);
  if (['submission_intent','resend_intent','reconcile_attempt'].includes(event.type))
    need(/^[a-zA-Z0-9_.:-]{3,160}$/.test(event.attempt_id ?? ''), 'Stable attempt identity required');
  if (['submission_intent','resend_intent'].includes(event.type))
    need(typeof event.authorization === 'string' && event.authorization.trim() &&
      event.provenance === 'observed', 'Submission intent requires current scoped authority');
  const { account, ...metadata } = event;
  cleanAccessMetadata(metadata);
  if (account) validateAccountReference(account, handoff);
  return event;
}

export function transitionAccess(handoff, input, now = new Date()) {
  const event = validateAccessEvent(input, handoff, now);
  const lifecycle = structuredClone(handoff.lifecycle ?? emptyAccess());
  need(lifecycle.version === 1, 'Unsupported lifecycle version');
  const existing = lifecycle.events.find(e => e.id === event.id);
  if (existing) {
    need(existing.input_hash === accessHash(event), 'Event identity reused with different evidence');
    return { unchanged: true, lifecycle };
  }
  need(lifecycle.events.length < 500, 'Access event bound reached; preserve history before continuing');
  if (['submission_intent','resend_intent'].includes(event.type)) {
    need(!lifecycle.attempts.some(a => !a.reconciled_at), 'Reconcile previous submission outcome before another attempt');
    const stage = lifecycle.stages.registration?.state;
    if (event.type === 'submission_intent') need(!stage || stage === 'not_started' || stage === 'not_required',
      'Existing application must be resumed, not submitted again');
    else {
      need(['awaiting_email','expired','blocked'].includes(lifecycle.stages.email_verification?.state), 'No pending email verification to resend');
      need(!lifecycle.attempts.some(a => a.type === 'resend_intent'), 'One bounded resend already attempted');
    }
    need(!lifecycle.attempts.some(a => a.id === event.attempt_id), 'Attempt identity already used');
    lifecycle.attempts.push({ id: event.attempt_id, type: event.type, at: event.at });
  }
  if (event.type === 'reconcile_attempt') {
    const attempt = lifecycle.attempts.find(a => a.id === event.attempt_id);
    need(attempt && !attempt.reconciled_at, 'Unresolved attempt required');
    attempt.reconciled_at = event.at;
  }
  if (event.type === 'stage') {
    const previous = lifecycle.stages[event.stage];
    need(!previous || Date.parse(event.at) >= Date.parse(previous.at), 'Older evidence cannot overwrite current state');
    need(!previous || !(previous.provenance === 'observed' && event.provenance !== 'observed'), 'Reported/historical state cannot replace observed state');
    if (event.provenance === 'historical' && previous && ['not_started','not_tested','unknown','not_issued'].includes(event.state))
      need(['not_started','not_tested','unknown','not_issued'].includes(previous.state), 'Legacy unknown state cannot replace saved progress');
    if (event.stage === 'registration' && event.state === 'not_started')
      need(!previous || previous.state === 'not_started', 'Registration progress cannot be reset');
    if (event.stage === 'registration' && ['submitted','outcome_unknown'].includes(event.state) && event.provenance === 'observed')
      need(lifecycle.attempts.some(a => a.id === event.attempt_id && !a.reconciled_at), 'Submission must have a saved intent');
    lifecycle.stages[event.stage] = { state: event.state, at: event.at, occurred_at:event.occurred_at ?? null, provenance: event.provenance,
      evidence: event.evidence, ...(event.run_id ? {run_id:event.run_id} : {}),
      ...(event.verified_until ? {verified_until:event.verified_until} : {}),
      ...(previous?.state === 'verified' || previous?.state === 'accessible'
        ? {previous_success:previous} : previous?.previous_success ? {previous_success:previous.previous_success} : {}) };
  }
  if (event.type === 'account') lifecycle.account = event.account;
  lifecycle.events.push({ ...event, input_hash: accessHash(event) });
  lifecycle.next_actor = event.actor;
  lifecycle.next_action = event.next_action;
  lifecycle.blocker = event.blocker ?? null;
  return { unchanged: false, lifecycle };
}

function currentProof(stage, state, now) {
  return stage?.state === state && stage.provenance === 'observed' &&
    Number.isFinite(Date.parse(stage.verified_until)) && Date.parse(stage.verified_until) > now.getTime();
}
export function usableAccess(handoff, category, now = new Date()) {
  const access = handoff?.lifecycle;
  if (!access || access.version !== 1 || !['forecast','opportunity','award'].includes(category)) return false;
  if (!currentProof(access.stages[`${category}_access`], 'accessible', now)) return false;
  if (handoff.channel === 'portal') return access.account?.kind === 'user_session' && currentProof(access.stages.sign_in, 'verified', now);
  const key = access.account?.kind === 'supabase_secret';
  return (key ? access.stages.credential_issuance?.state === 'issued' : access.account?.kind === 'public') &&
    currentProof(access.stages.request_verification, 'verified', now);
}
export function accessNext(handoff, now = new Date()) {
  const access = handoff.lifecycle ?? emptyAccess();
  const unresolved = access.attempts.find(a => !a.reconciled_at);
  if (unresolved) return { actor:'researcher', action:'Inspect and reconcile the saved submission attempt before any resend or new application', attempt_id:unresolved.id };
  const categories = ['forecast','opportunity','award'].filter(c => usableAccess(handoff,c,now));
  if(Object.values(access.stages).some(stage=>stage.verified_until && Date.parse(stage.verified_until)<=now.getTime()))
    return {actor:handoff.channel==='portal'?'user':'researcher',action:'Reverify expired access using the saved account and method; do not submit another signup',
      operational_categories:categories,blocker:'Saved access proof expired'};
  return { actor:access.next_actor ?? handoff.next_actor,
    action:access.next_action ?? handoff.next_action, url:handoff.details?.signup_url ?? handoff.details?.developer_url ?? handoff.details?.evidence_urls?.[0],
    operational_categories:categories, blocker:access.blocker ?? handoff.details?.blocker ?? null };
}

export function legacyAccessEvents(handoff, legacy, registration) {
  const events = [];
  const add = (stage, state, origin) => {
    if (!accessStages[stage]?.includes(state)) return;
    events.push({ id:`reconcile:${origin}:${stage}:${state}`, type:'stage', stage, state,
      at:`${handoff.checked_on}T00:00:00.000Z`, provenance:'historical', actor:'researcher',
      next_action:'Verify current access before any new application or method activation',
      evidence:[{reference:`legacy:${origin}`,note:'Imported prior state; not proof of a current successful access test'}] });
  };
  const channel = legacy?.[handoff.channel];
  const map = {registration:'registration',email_verification:'email_verification',agency_approval:'approval',
    sign_in:'sign_in',credential_issuance:'credential_issuance',request_verification:'request_verification'};
  for (const [field, stage] of Object.entries(map)) add(stage, channel?.[field]?.state, 'ledger');
  if (registration) {
    if (handoff.channel === 'portal') {
      add('email_verification',registration.email_verification_state === 'pending' ? 'awaiting_email' : registration.email_verification_state,'registration');
      add('sign_in',registration.login_state === 'unknown' ? 'not_tested' : registration.login_state,'registration');
    } else add('request_verification',registration.api_state === 'verified' ? 'verified' : undefined,'registration');
  }
  return events;
}

export function matchLegacySource(legacy, sources) {
  const exact = sources.filter(s => legacy.database_persistence?.source_id === s.id || legacy.source_id === s.code);
  if (exact.length === 1) return exact[0];
  const urls = Object.values(legacy.official_urls ?? {}).filter(v => typeof v === 'string' && v.startsWith('https://'));
  const matches = sources.filter(s => urls.includes(s.url));
  need(matches.length <= 1, 'Ambiguous legacy source; explicit database identity required');
  return matches[0] ?? null;
}
