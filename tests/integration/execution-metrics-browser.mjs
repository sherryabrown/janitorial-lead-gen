/* global document,innerWidth */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifyExecutionMetrics({page,origin,out,errors,bodies}){
 out+='/05C2';await mkdir(out,{recursive:true});let failPage=true;const pageRequests=[];
 const run={id:'00000000-0000-4000-8000-000000000123',schedule_id:'schedule',schedule_name:'Morning checks',state:'completed',origin:'scheduled',target_kind:'county_scope',created_at:'2026-10-22T22:42:00Z',finished_at:'2026-10-22T22:45:00Z',children:[],leads:{added:1,updated:0,unchanged:0,completeness:'known'},timing:{recorded_activity_ms:180000,completeness:'known'}};
 const occurrence={id:'dispatch',state:'queued',version:2,due_at:run.created_at,effective_at:run.created_at,origin:'scheduled',config:{county_ids:['05119'],counties:[{name:'Pulaski County'}],requested_categories:['opportunity']},baseline:[{source_id:'00000000-0000-4000-8000-000000000123',content_sha256:'a'.repeat(64)}]};
 const rows=[{id:'run:run',kind:'run',activity_at:run.created_at,run,occurrence},{id:'attempt:skip',kind:'attempt',activity_at:'2026-10-21T14:00:00Z',clock_basis:'Effective date',run:null,occurrence:{...occurrence,id:'skip',state:'skipped',reason:'previous_run_active',missed_from:'2026-10-20T14:00:00Z',missed_through:'2026-10-21T14:00:00Z'}}];
 const send=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/v1/schedules/schedule/activity*',route=>{
  const url=new URL(route.request().url());pageRequests.push(url.search);
  if(url.searchParams.has('offset')){if(failPage){failPage=false;return send(route,{},503);}return send(route,{items:[{...rows[1],id:'attempt:last'}],total:3,next_offset:null,as_of:run.created_at});}
  return send(route,{items:url.searchParams.get('kind')==='attempt'?[rows[1]]:rows,total:3,next_offset:50,as_of:run.created_at});
 });
 await page.route('**/v1/triggers/'+run.id,route=>send(route,run));await page.route('**/v1/triggers/'+run.id+'/steps*',route=>send(route,{items:[],next_cursor:null}));
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Settings',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Admin views'});await nav.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'Morning checks',exact:true}).click();
 const detail=page.getByRole('region',{name:'Schedule details: Morning checks'}),table=detail.getByRole('table',{name:'Saved execution history'});
 const capture=async(name)=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+' document overflow');await page.screenshot({path:`${out}/${name}.png`});};
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await table.waitFor();assert.equal(await detail.getByRole('table',{name:'Schedule occurrences'}).count(),0);
  const link=table.getByRole('button',{name:new RegExp('Run '+run.id+'$')});assert.doesNotMatch(await link.innerText(),/Run run/);await link.scrollIntoViewIfNeeded();await capture(`activity-${width}`);
  await table.getByText('Dispatch snapshot · version 2').first().focus();await page.keyboard.press('Enter');await table.getByText('Dispatch state',{exact:true}).first().waitFor();await table.getByText('Content hash',{exact:true}).first().scrollIntoViewIfNeeded();await capture(`snapshot-${width}`);await table.getByText('Dispatch snapshot · version 2').first().click();
  await link.focus();await page.keyboard.press('Enter');const runDetail=page.getByRole('region',{name:'Run details'});await runDetail.getByRole('heading',{name:new RegExp('Run '+run.id)}).waitFor();await runDetail.getByRole('navigation',{name:'Breadcrumb'}).getByText('Runs',{exact:true}).waitFor();assert.match(await runDetail.getByRole('navigation',{name:'Breadcrumb'}).innerText(),/Settings.*Schedules.*Runs.*Run.*Issues/s);
  await runDetail.getByRole('button',{name:'Back to previous view',exact:true}).click();await table.waitFor();assert.equal(await link.evaluate(e=>e===document.activeElement),true,'Date link focus returns');
 }
 await detail.getByRole('button',{name:'More runs',exact:true}).click();await detail.getByRole('button',{name:'Retry schedule',exact:true}).click();await table.getByText('No run created').nth(1).waitFor();
 const pages=pageRequests.filter(p=>p.includes('offset=50'));assert.equal(pages.length,2);assert.equal(pages[0],pages[1]);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.documentElement.style.zoom='2';});await table.scrollIntoViewIfNeeded();await capture('activity-zoom-200');await page.evaluate(()=>{document.documentElement.style.zoom='';});
 await nav.getByRole('button',{name:'Stats / analytics',exact:true}).click();const stats=page.getByRole('region',{name:'Stats and analytics'});await stats.getByText('Verified new leads',{exact:true}).waitFor();assert.doesNotMatch(await stats.innerText(),/Unknown \u00b7 \d+ known|Total unavailable/);
 const help=stats.getByRole('button',{name:'About New leads',exact:true});await help.focus();await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('tooltip').innerText(),/Only verified saved records/);await page.keyboard.press('Escape');await help.click();await page.getByRole('tooltip').waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await stats.scrollIntoViewIfNeeded();await capture(`metrics-${width}`);}
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0);
 await writeFile(`${out}/verification.json`,JSON.stringify({passed:true,widths:[1440,390,320],zoom:200,keyboard:true,dateFirst:true,singleActivityTable:true,dispatchSnapshot:true,returnFocus:true,failedPageRetry:true,metricHelp:true,workflowWrites:0,pageErrors:errors},null,2));
 console.log('05C2 browser acceptance passed.');
}
