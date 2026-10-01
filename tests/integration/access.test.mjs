import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const required = ['ACCESS_TEST_URL','ACCESS_TEST_ANON_KEY','ACCESS_TEST_SERVICE_KEY','ACCESS_TEST_EXPIRED_JWT'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}; use an isolated Supabase environment, never production.`);
const url = new URL(process.env.ACCESS_TEST_URL);
const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const ref = process.env.ACCESS_TEST_PROJECT_REF;
if (url.hostname === 'zreplhkoxswtzxlchtjf.supabase.co' || (!local && (!ref || url.hostname !== `${ref}.supabase.co`)) || process.env.ACCESS_TEST_ALLOW_WRITES !== 'isolated') {
  throw new Error('Access tests require an explicitly confirmed disposable target. Production is forbidden.');
}
const expired = process.env.ACCESS_TEST_EXPIRED_JWT;
if (!(JSON.parse(Buffer.from(expired.split('.')[1], 'base64url').toString()).exp < Date.now()/1000)) throw new Error('Provide a genuinely expired signed JWT for the isolated target.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url.href, process.env.ACCESS_TEST_SERVICE_KEY, options);
const anon = createClient(url.href, process.env.ACCESS_TEST_ANON_KEY, options);
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/research/mapping.json', import.meta.url), 'utf8'));
const checked = async query => { const result = await query; if (result.error) throw new Error(`Isolated test request failed (${result.error.code ?? result.error.status ?? 'unknown'}).`); return result.data; };

test('real Auth/RLS: anonymous denial, non-member/member edits, audit and note ownership', async () => {
  // A server-only marker is installed explicitly by the disposable setup script.
  const marker = await checked(admin.from('procurement_test_environment').select('purpose').eq('purpose','disposable-access-tests'));
  assert.equal(marker.length, 1, 'Disposable environment marker missing');
  const users = [], leadId = randomUUID(), sourceId = randomUUID();
  try {
    for (let n=0; n<2; n++) {
      const email = `access-${randomUUID()}@example.invalid`, password = randomUUID()+'Aa9!';
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null, 'Could not create isolated test account');
      const client = createClient(url.href, process.env.ACCESS_TEST_ANON_KEY, options);
      users.push({ id: created.data.user.id, client });
      const signed = await client.auth.signInWithPassword({ email, password });
      assert.equal(signed.error, null, 'Isolated test login failed');
    }
    const source = fixtures.procurement_sources[0];
    await checked(admin.from('procurement_sources').insert({ id: sourceId, code: `access-test-${sourceId}`, name: source.name, url: source.url, business_category: source.business_category, contracting_entity_geo_level: source.contracting_entity_geo_level }));
    await checked(admin.from('procurement_leads').insert({ id: leadId, source_id: sourceId, external_id: `isolated-${leadId}`, payload: fixtures.procurement_leads[0].payload }));
    for (const table of ['procurement_leads','procurement_sources','procurement_versions','procurement_events','spin_contract_opportunities']) {
      const response = await anon.from(table).select('*').limit(1);
      assert.ok(response.error && ['42501','PGRST301','PGRST302'].includes(response.error.code), `Anonymous ${table} read must be denied`);
    }
    assert.ok((await anon.rpc('update_procurement_lead_stage', { p_lead_id: leadId, p_new_stage: 'interested', p_reason_code: null, p_reason_note: null })).error);
    assert.ok((await anon.rpc('procurement_queue_page', {})).error);
    for (const token of ['invalid-token', expired]) {
      const response = await fetch(new URL('/rest/v1/procurement_leads?select=id',url), { headers: { apikey: process.env.ACCESS_TEST_ANON_KEY, Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 401, 'Invalid/expired JWT must be rejected by the API');
    }
    for (const user of users) assert.equal((await checked(user.client.from('procurement_leads').select('id').eq('id',leadId)))[0].id, leadId);
    assert.equal((await checked(users[0].client.from('procurement_members').select('*'))).length, 0, 'First account is a non-member');
    await checked(users[0].client.rpc('update_procurement_lead_stage', { p_lead_id: leadId, p_new_stage: 'interested', p_reason_code: null, p_reason_note: null }));
    await checked(admin.from('procurement_members').insert({ user_id: users[1].id }));
    await checked(users[1].client.rpc('bulk_update_procurement_lead_stage', { p_lead_ids: [leadId], p_new_stage: 'applied', p_reason_code: null, p_reason_note: null }));
    const changes = await checked(users[0].client.from('procurement_lead_stage_changes').select('*').eq('lead_id',leadId));
    assert.equal(changes.length, 2);
    assert.deepEqual(new Set(changes.map(row=>row.changed_by)), new Set(users.map(user=>user.id)));
    await checked(users[0].client.rpc('create_lead_note', { p_lead_id: leadId, p_body: 'Offline integration test note' }));
    const notes = await checked(admin.from('procurement_lead_notes').select('id').eq('lead_id',leadId));
    assert.ok((await users[1].client.rpc('edit_lead_note', { p_note_id: notes[0].id, p_new_body: 'Not the author' })).error);
    await checked(users[0].client.rpc('edit_lead_note', { p_note_id: notes[0].id, p_new_body: 'Author edit' }));
    await users[0].client.auth.signOut();
    assert.ok((await users[0].client.from('procurement_leads').select('id')).error);
  } finally {
    // Only the generated fixture identities and users are removed.
    await checked(admin.from('procurement_events').delete().eq('lead_id',leadId));
    await checked(admin.from('procurement_versions').delete().eq('lead_id',leadId));
    await checked(admin.from('procurement_leads').delete().eq('id',leadId));
    await checked(admin.from('procurement_sources').delete().eq('id',sourceId));
    for (const user of users) {
      await checked(admin.from('procurement_members').delete().eq('user_id',user.id));
      const result = await admin.auth.admin.deleteUser(user.id);
      assert.equal(result.error,null,'Isolated user cleanup failed');
    }
  }
});
