/* global document,innerWidth */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {analyticsFixture} from '../helpers/analytics-fixture.mjs';
export async function verifyMetricBrowser({page,origin,out,errors,bodies}){
 out+='/05A';await mkdir(out,{recursive:true});
 const mapping=JSON.parse(await readFile('tests/fixtures/research/mapping.json','utf8')),lead={...mapping.procurement_leads[1],stage:'won',title:'Verified closed report lead'},missing='00000000-0000-4000-8000-000000000099';
 let fail=false;
 const reply=(route,body)=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(body)});
 await page.route('**/v1/admin/analytics*',route=>{const r=analyticsFixture();r.summary.sources_attention=1;r.summary.outcomes.added={value:2,known_subtotal:2,completeness:'known'};return reply(route,r);});
 await page.route('**/v1/admin/metric-members*',route=>{const metric=new URL(route.request().url()).searchParams.get('member_metric');return reply(route,fail?{unavailable:'Results changed. Reload the originating report.'}:metric==='added'?{kind:'leads',items:[{id:lead.id},{id:missing}],total:2,next_offset:null,as_of:'2026-10-22T14:00:00Z',snapshot:'a'.repeat(64)}:{kind:'issues',items:[{id:'task',kind:'source',run_id:'run',request_id:'request',blocker:'Official listing could not be verified.',next_action:'Inspect the saved source evidence.'}],total:1,next_offset:null,as_of:'2026-10-22T14:00:00Z',snapshot:'a'.repeat(64)});});
 await page.route('**/rest/v1/procurement_leads?*',route=>{const u=new URL(route.request().url());return reply(route,u.searchParams.get('id')?.startsWith('in.')?[lead]:lead);});
 const pending=new Set();page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));
 try{await page.goto(origin);}catch(error){console.error('Pending fixture requests:',[...pending]);throw error;}await page.getByRole('button',{name:'Settings',exact:true}).click();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:'Stats / analytics',exact:true}).click();
  const link=page.getByRole('link',{name:/Report · New leads .*: 2$/});await link.waitFor();await link.focus();await page.keyboard.press('Enter');
  await page.getByLabel('Filtered report leads').waitFor();await page.getByText('Verified closed report lead',{exact:true}).first().waitFor();await page.getByText('1 records on this page are unavailable or inaccessible.',{exact:true}).waitFor();
  assert.ok(page.url().includes('leadReport='));assert.equal(await page.getByRole('combobox',{name:'Bid type',exact:true}).count(),0,'Ordinary queue filters cannot silently narrow exact report membership');
  await page.getByLabel('Filtered report leads').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/leads-${width}.png`});
  const banner=await page.getByLabel('Filtered report leads').boundingBox();assert.ok(banner.x>=0&&banner.x+banner.width<=width);
  await page.getByRole('button',{name:'Back to report',exact:true}).click();await link.waitFor();assert.ok(page.url().includes('adminView=stats'));
  const issues=page.getByRole('link',{name:/Report · Source collection issues /});await issues.focus();await page.keyboard.press('Enter');await page.getByRole('table',{name:'1 matching issues'}).waitFor();await page.screenshot({path:`${out}/issues-${width}.png`});const action=await page.getByRole('button',{name:'Open saved run results',exact:true}).boundingBox();assert.ok(action.x>=0&&action.x+action.width<=width,'Issue action fits the viewport');assert.ok(await page.evaluate(()=>document.querySelector('[aria-label="Collection and validation issue details"]').scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Back to results',exact:true}).click();assert.equal(await issues.evaluate(el=>el===document.activeElement),true);
 }
 await page.getByRole('link',{name:/Report · New leads .*: 2$/}).click();await page.getByText('Verified closed report lead',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Clear results filter',exact:true}).click();assert.equal(new URL(page.url()).searchParams.has('leadReport'),false);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Stats / analytics',exact:true}).click();fail=true;await page.getByRole('link',{name:/Report · New leads .*: 2$/}).click();await page.getByText(/Could not load production contracts: Results changed/).waitFor();assert.equal(await page.getByRole('article').count(),0,'A stale report never falls back to unrelated queue leads');
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0);await writeFile(`${out}/verification.json`,JSON.stringify({passed:true,widths:[1440,390,320],keyboard:true,closedLeadIncluded:true,unavailableRecordReported:true,returnContext:true,clearScope:true,issueDetails:true,staleReportFailClosed:true,mutations:0,errors},null,2));console.log('05A metric drilldown desktop/mobile/keyboard acceptance passed.');
}
