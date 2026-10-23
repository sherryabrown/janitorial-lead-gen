/* global document,innerWidth */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifyDetailClarityBrowser({page,origin,out,errors,bodies}){
 out+='/05B';await mkdir(out,{recursive:true});
 const send=(route,body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/v1/schedules/schedule/events*',route=>send(route,{items:[{id:'edit',action:'edited',at:'2026-10-22T14:00:00Z',version:2,actor_id:'saved-user',changes:[{field:'name',before:'Earlier name',after:'Morning checks'},{field:'enabled',before:false,after:true}]},{id:'attempt',action:'queued',at:'2026-10-22T13:00:00Z',version:1},{id:'system',action:'owner_inactive',at:'2026-10-21T14:00:00Z',version:1}],next_offset:null}));
 await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Admin views'}),detail=page.getByRole('region',{name:'Schedule details: Morning checks'});
 const capture=async(name)=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+' has no document overflow');await page.screenshot({path:`${out}/${name}.png`});};
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await nav.getByRole('button',{name:'Schedules',exact:true}).click();
  const row=page.getByRole('button',{name:'Morning checks',exact:true});await row.focus();await page.keyboard.press('Enter');await detail.getByRole('button',{name:'Refresh schedule',exact:true}).waitFor();
  const setup=detail.locator('details').filter({has:page.locator(':scope > summary', {hasText:'Schedule setup'})});
  assert.equal(await setup.getAttribute('open'),null);await detail.getByText('Schedule setup',{exact:true}).focus();await page.keyboard.press('Enter');assert.notEqual(await setup.getAttribute('open'),null);
  await detail.getByRole('button',{name:'Refresh schedule',exact:true}).click();await detail.getByRole('button',{name:'Refresh schedule',exact:true}).waitFor();assert.notEqual(await setup.getAttribute('open'),null,'Refresh keeps disclosure open');await detail.getByText('Schedule setup',{exact:true}).click();
  await capture(`schedule-overview-${width}`);
  const runs=detail.getByRole('table',{name:'Saved execution history'}),runLink=runs.getByRole('button',{name:/Run run$/});await runLink.focus();await page.keyboard.press('Enter');
  const run=page.getByRole('region',{name:'Run details'});await run.getByRole('heading',{name:/Run run/}).waitFor();await run.getByRole('table',{name:'Source issues and next actions'}).waitFor();
  assert.equal(await run.locator('.run-attributes').getAttribute('open'),null);assert.match(await run.getByRole('navigation',{name:'Breadcrumb'}).innerText(),/Settings.*Schedules.*schedule.*Runs.*Run run.*Issues/s);
  await capture(`issues-${width}`);await run.getByRole('button',{name:'Sources',exact:true}).focus();await page.keyboard.press('Enter');await run.getByRole('table',{name:'Saved source checks and next actions'}).waitFor();await capture(`sources-${width}`);
  await run.getByRole('button',{name:'View source evidence',exact:true}).scrollIntoViewIfNeeded();await capture(`source-actions-${width}`);
  await run.getByRole('button',{name:'Logs',exact:true}).click();await run.getByRole('table',{name:/Run step logs/}).waitFor();assert.equal(await run.locator('.run-step-table thead th').count(),6);await capture(`logs-${width}`);
  await run.getByRole('button',{name:'Back to previous view',exact:true}).click();await detail.waitFor();assert.equal(await runLink.evaluate(e=>e===document.activeElement),true,'Run return restores row focus');
  await detail.getByRole('tab',{name:'History',exact:true}).click();await detail.getByRole('table',{name:'Schedule changes'}).waitFor();assert.equal(await detail.getByRole('table',{name:'Schedule occurrences'}).count(),0);await detail.getByText('Earlier name → Morning checks',{exact:true}).waitFor();await capture(`changes-${width}`);
  await detail.getByRole('tab',{name:'Overview',exact:true}).click();await detail.getByText('No run created',{exact:true}).waitFor();await capture(`attempts-${width}`);
  await detail.getByRole('button',{name:'Back to schedules',exact:true}).click();await row.waitFor();assert.equal(await row.evaluate(e=>e===document.activeElement),true,'Schedule breadcrumb restores row focus');
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Morning checks',exact:true}).click();await detail.getByRole('button',{name:'Refresh schedule',exact:true}).waitFor();
 await page.evaluate(()=>{document.documentElement.style.zoom='2';});await capture('schedule-zoom-200');await page.evaluate(()=>{document.documentElement.style.zoom='';});
 const longId='00000000-0000-4000-8000-000000000123';
 await page.route(new RegExp('/v1/triggers/'+longId+'(?:/steps)?(?:\\?.*)?$'),route=>send(route,route.request().url().includes('/steps')?{items:[],next_cursor:null}:{id:longId,schedule_id:'schedule',schedule_name:longId,state:'completed',target_kind:'county_scope',origin:'manual',created_at:'2026-10-22T14:00:00Z',children:[]}));
 await page.goto(`${origin}/?adminView=schedules&adminSchedule=schedule&adminRun=${longId}&adminRunSection=overview`);
 await page.getByRole('heading',{name:new RegExp('Run '+longId)}).waitFor();await page.setViewportSize({width:320,height:1000});await page.getByRole('heading',{name:new RegExp('Run '+longId)}).scrollIntoViewIfNeeded();await capture('long-run-320');
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.documentElement.style.zoom='2';});await page.getByRole('heading',{name:new RegExp('Run '+longId)}).scrollIntoViewIfNeeded();await capture('run-zoom-200');await page.evaluate(()=>{document.documentElement.style.zoom='';});
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0,'Browsing must not mutate workflows');
 await writeFile(`${out}/verification.json`,JSON.stringify({widths:[1440,390,320],zoom:200,keyboard:true,identityFirstRunLinks:true,completeBreadcrumbs:true,configurationHistory:true,unifiedAttempts:true,sourceTable:true,logsUnchanged:true,disclosurePersistence:true,returnFocus:true,mutations:0,errors},null,2));
 console.log('05B detail clarity browser acceptance passed.');
}
