import { buildKnownSourcePlan } from './known-source-execution.mjs';
import { publicUrl, safeMetadata } from './research-persistence.mjs';

const fail = message => { throw new Error(message); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const channels = new Set(['portal', 'api']);
const states = new Set(['unknown', 'public', 'account_required', 'approval_required', 'key_required', 'paid', 'blocked', 'pending', 'verified']);
const actors = new Set(['researcher', 'user', 'agency', 'provider']);

export function discoveryView(request, targets, geographies, capabilities, sources, now = new Date()) {
  const plan = buildKnownSourcePlan(request, targets, geographies, capabilities, sources, now);
  const geography = new Map(geographies.map(row => [row.id, row]));
  const source = new Map(sources.map(row => [row.id, row]));
  const rows = [];
  for (const target of [...targets].sort((a,b) =>
    Number(a.checkpoint?.route_order ?? 0)-Number(b.checkpoint?.route_order ?? 0))) {
    const route = geography.get(target.geography_id);
    for (const category of ['forecast','opportunity','award']) {
      const tasks = plan.tasks.filter(task => task.target_id === target.id && task.kind === category);
      const verified_methods = tasks.filter(task => task.state === 'unchecked').map(task => ({
        source_code: source.get(task.source_id)?.code, capability_id: task.capability_id }));
      const registered_gaps = tasks.filter(task => task.evidence?.scope === 'source_category').map(task => ({
        source_code: source.get(task.source_id)?.code, reason: task.reason }));
      const aggregate = tasks.find(task => task.task_key === `${category}:missing`);
      const blocked = tasks.filter(task => task.state === 'blocked').map(task => ({
        source_code: source.get(task.source_id)?.code, reason: task.reason }));
      rows.push({ route: route?.name, route_geography_id: target.geography_id, category,
        status: verified_methods.length ? 'verified_method' :
          aggregate?.state === 'source_missing' ? 'source_missing' :
          aggregate?.state === 'method_missing' || registered_gaps.length
            ? 'registered_method_missing_or_expired' : 'blocked',
        verified_methods, registered_gaps, blocked });
    }
  }
  return { request_id: request.id, routes: rows,
    next_action: rows.some(row => row.status === 'source_missing')
      ? 'Research official sources only for source_missing routes; register a verified method before collection.'
      : rows.some(row => row.status === 'registered_method_missing_or_expired')
        ? 'Verify methods for the named registered sources; do not create duplicate sources.'
        : 'Run verified methods with known-source-run.mjs.' };
}

export function validateHandoff(input, sources, registrations, existing = []) {
  const allowed = new Set(['source_id','channel','tenant','checked_on','access_state','next_actor','next_action',
    'evidence_urls','signup_url','documentation_url','developer_url','requirements','categories',
    'method_notes','blocker']);
  if (!input || Object.keys(input).some(key => !allowed.has(key))) fail('Unsupported or private handoff field');
  if (!input || !uuid.test(input.source_id) || !sources.some(s => s.id === input.source_id)) fail('Registered source ID required');
  if (!channels.has(input.channel) || !/^[a-z0-9][a-z0-9.-]{1,159}$/.test(input.tenant ?? '')) fail('Portal/API channel and tenant required');
  if (!states.has(input.access_state) || !actors.has(input.next_actor) ||
      typeof input.next_action !== 'string' || !input.next_action.trim()) fail('Access state, actor and exact next action required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.checked_on ?? '') ||
      !Number.isFinite(Date.parse(`${input.checked_on}T00:00:00Z`))) fail('Evidence date required');
  if (!Array.isArray(input.evidence_urls) || !input.evidence_urls.length) fail('Official evidence URL required');
  for (const url of input.evidence_urls) publicUrl(url);
  for (const field of ['signup_url', 'documentation_url', 'developer_url']) if (input[field]) publicUrl(input[field]);
  const access = input.requirements;
  if (!access || typeof access !== 'object' || Array.isArray(access) ||
      Object.keys(access).some(key => !['public', 'account', 'approval', 'api_key', 'payment'].includes(key)) ||
      !['public', 'account', 'approval', 'api_key', 'payment'].every(key =>
        ['yes', 'no', 'unknown'].includes(access[key]))) fail('Five explicit yes/no/unknown requirements required');
  const offered = input.categories;
  if (!offered || Object.keys(offered).some(key => !['forecast', 'opportunity', 'award'].includes(key)) ||
      !['forecast', 'opportunity', 'award'].every(key =>
    ['yes', 'no', 'unknown'].includes(offered[key]))) fail('Three explicit category assessments required');
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(JSON.stringify(input))) fail('Account email is not handoff research');
  const { requirements, ...nonRequirementFields } = input;
  safeMetadata(nonRequirementFields);
  const registration = registrations.find(r => r.source_id === input.source_id);
  if (registrations.filter(r => r.source_id === input.source_id).length > 1) fail('Ambiguous existing registration');
  const previous = existing.find(r => r.source_id === input.source_id && r.channel === input.channel && r.tenant === input.tenant);
  if (previous && input.checked_on < previous.checked_on) fail('Older evidence cannot replace handoff');
  if (registration && ['pending', 'verified','submitted','awaiting_email','pending_agency_approval','pending_provider_approval','approved'].includes(registration.status) &&
      !['pending', 'verified'].includes(input.access_state)) {
    // Research may update URLs and requirements, but it cannot silently reset access progress.
    input = { ...input, access_state: registration.status === 'verified' ? 'verified' : 'pending',
      next_actor: 'researcher', next_action: 'Check existing registration stage before any new application' };
  }
  return { ...input, registration_id: registration?.id ?? null };
}

export function ledgerHasAdvancedAccess(legacy, selectedChannel) {
  const channel = legacy?.[selectedChannel];
  const stages = selectedChannel === 'portal'
    ? [channel?.registration?.state, channel?.email_verification?.state,
      channel?.agency_approval?.state, channel?.sign_in?.state]
    : [channel?.registration?.state, channel?.credential_issuance?.state,
      channel?.request_verification?.state];
  return stages.some(state => /^(pending|verified|issued|approved|complete|submitted|awaiting_email|pending_agency_approval|pending_provider_approval|outcome_unknown)$/i.test(state ?? ''));
}
