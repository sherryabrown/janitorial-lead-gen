import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionItems } from '../scripts/lib/hosted-attention.mjs';

test('attention derives safe actions without exposing private saved evidence',()=>{
  const jobs=[{id:'a',search_request_id:'r',state:'blocked',checkpoint:{stage:'import_awaiting_approval',
    next_action:'secret@example.com',session:'private-cookie'}},
  {id:'b',search_request_id:'r',state:'outcome_unknown',checkpoint:{next_action:'https://private/?token=secret'}},
  {id:'c',state:'succeeded',checkpoint:{stage:'import_verified'}}];
  const items=attentionItems(jobs,[{id:'t',request_id:'r',state:'partial',reason:'private-key'},
    {id:'complete',state:'complete'}]);
  assert.equal(items.length,3);
  assert.equal(items[0].actor,'user');
  assert.match(items[1].next_action,/Reconcile/);
  assert.doesNotMatch(JSON.stringify(items),/secret|private|cookie|token/);
  assert.equal(attentionItems([{...jobs[0],state:'succeeded'}],[]).length,0);
});

test('private access requirements are projected as actions without exposing tenant or account fields',()=>{
  const items=attentionItems([],[],[{id:'h',source_id:'s',access_state:'account_required',next_actor:'user',
    next_action:'Email secret@example.com',details:{signup_url:'https://private/?token=secret',account:'secret'}},
  {id:'public',access_state:'public'}]);
  assert.equal(items.length,1);assert.equal(items[0].actor,'user');
  assert.doesNotMatch(JSON.stringify(items),/secret|private|token|tenant/);
});
