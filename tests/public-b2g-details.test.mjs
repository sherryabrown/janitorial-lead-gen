import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {publicB2gDetailUrl,inspectB2gDetail} from '../scripts/lib/public-b2g-details.mjs';
import {inspectAutomaticListing,proposeAutomaticListing} from '../scripts/lib/automatic-public-method.mjs';
const body=readFileSync('tests/fixtures/county/airport-b2g-published.html'),spec={...proposeAutomaticListing(body,'https://clintonairport.gob2g.com/FrontEnd/proposalsearchpublic.asp').spec,public_details:{provider:'b2gnow'}};
test('public detail navigation retains native reference identity while rotating published PIDs',()=>{
 const dom=new JSDOM(body.toString(),{virtualConsole:new VirtualConsole()}),d=dom.window.document;
 try{
  const script=d.createElement('script');script.textContent=`var details='<iframe src="/FrontEnd/ProposalSearchPublicDetail.asp?XID=1147&TN=clintonairport&PID=' + RID + '"></iframe>';`;d.body.append(script);
  for(const a of d.querySelectorAll('a.RecordTile'))a.href=`javascript: ViewDetail('${'A'.repeat(32)}');`;
  const before=inspectAutomaticListing(Buffer.from(dom.serialize()),spec).records;
  for(const a of d.querySelectorAll('a.RecordTile'))a.href=`javascript: ViewDetail('${'B'.repeat(32)}');`;
  const after=inspectAutomaticListing(Buffer.from(dom.serialize()),spec).records;
  assert.deepEqual(before.map(r=>r.id),after.map(r=>r.id));assert.notEqual(before[0].detail_url,after[0].detail_url);
  assert.equal(before[0].source_url,spec.urls[0]);
  const row=d.querySelector('a.RecordTile');row.href='javascript: eval("bad")';assert.throws(()=>publicB2gDetailUrl(d,row,spec),/navigation/);
 }finally{dom.window.close();}
});
test('actual public summary distinguishes sign-in-only documents from validated work-site evidence',()=>{
 const html=readFileSync('tests/fixtures/county/airport-b2g-detail-published.html'),record={id:'26003RFQ',title:'On-Call Public Relations, Communications and Marketing Services'};
 const detail=inspectB2gDetail(html,record,spec);
 assert.equal(detail.documents_access,'sign_in_required');assert.equal(detail.amendment_summary,'2 (see below)');
 assert.match(detail.reason,/sign-in/);assert.match(detail.description,/marketing/);
 assert.equal(detail.work_city,undefined);assert.equal(detail.deadline,undefined,'Unparsed or conflicting dates never become validated deadlines');
 assert.throws(()=>inspectB2gDetail(html,{...record,id:'different'},spec),/identity/);
 assert.throws(()=>inspectB2gDetail(html,record,{...spec,expected_organization:'Another agency'}),/identity/);
});
