/* global document */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
export async function verifyCanonicalRedirect({page,origin,out,errors,bodies}){
 out+='/05C1';await mkdir(out,{recursive:true});
 const fixture=JSON.parse(await readFile('tests/fixtures/research/mapping.json','utf8')),original={...fixture.procurement_leads[1],stage:'applied',payload:{...fixture.procurement_leads[1].payload,canonical_corrections:[{policy:'county-ionwave-solicitation-v1'}]}},alias={...original,id:'10000000-0000-4000-8000-000000000303',stage:'new',payload:{...original.payload,canonical_redirect:{policy:'county-ionwave-solicitation-v1',lead_id:original.id}}};
 const send=(r,data)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 await page.route('**/rest/v1/rpc/procurement_queue_page',r=>send(r,{rows:[alias],total:1,counts:{new:1}}));
 await page.route('**/rest/v1/procurement_leads*',r=>send(r,new URL(r.request().url()).searchParams.get('id')==='eq.'+alias.id?alias:original));
 await page.route('**/rest/v1/procurement_lead_notes*',r=>send(r,[{id:'10000000-0000-4000-8000-000000000305',lead_id:original.id,body:'Preserved original owner note',created_by:'fixture',created_at:'2026-10-04T12:00:00Z',updated_at:null,updated_by:null}]));
 await page.route('**/rest/v1/procurement_lead_note_edits*',r=>send(r,[]));await page.route('**/rest/v1/procurement_lead_stage_changes*',r=>send(r,[]));
 await page.goto(origin);await page.getByText('This addendum was reconciled to the original lead. Its sales stage and notes are preserved.',{exact:true}).waitFor();
 await page.getByText('Preserved original owner note',{exact:true}).first().waitFor();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.contract-row').count(),1);
  const context=page.getByRole('region',{name:'Research context'});await context.scrollIntoViewIfNeeded();
  const bounds=await context.evaluate(e=>({right:e.getBoundingClientRect().right,width:e.clientWidth,scroll:e.scrollWidth}));
  assert.ok(bounds.right<=width+1&&bounds.scroll<=bounds.width+1,'Reconciliation notice fits the existing detail region');
  await page.screenshot({path:`${out}/canonical-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.body.style.zoom='2';});
 const zoomContext=page.getByRole('region',{name:'Research context'});assert.equal(await zoomContext.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await page.screenshot({path:`${out}/canonical-zoom.png`});
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true);
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0,'Read-only redirect does not submit workflow actions');
 await writeFile(`${out}/browser-verification.json`,JSON.stringify({passed:true,widths:[1440,390,320],zoom:200,keyboard:true,sales_data_retained:true,mutations:0,existing_unrelated_limitation:'Leads summary-wide status strip exceeds the mobile viewport; existing CSS is unchanged. Reconciliation detail region fits desktop/mobile/zoom.'},null,2));
 console.log('Canonical redirect browser acceptance passed.');
}
