/* global document,innerWidth */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifyScheduleRevision({page,origin,out,errors,bodies}){
 await mkdir(out,{recursive:true});await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const table=page.locator('table.schedule-table').first();await table.getByRole('button',{name:'Morning checks',exact:true}).waitFor();
 for(const width of [1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});
  const trigger=page.getByRole('button',{name:'Actions for Morning checks'});await trigger.scrollIntoViewIfNeeded();
  const row=trigger.locator('xpath=ancestor::tr'),before=await row.boundingBox();
  await trigger.focus();await page.keyboard.press('Enter');
  const menu=page.getByRole('menu',{name:'Actions for Morning checks',exact:true});await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['Details','Edit','Disable']);
  await page.keyboard.press('End');await page.keyboard.press('ArrowRight');
  const sub=page.getByRole('menu',{name:'Disable options'});await sub.waitFor();
  const box=await sub.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=1000);
  assert.equal(await sub.getByRole('menuitem',{name:'Delete',exact:true}).getAttribute('aria-disabled'),'true');
  assert.deepEqual(await row.boundingBox(),before,'Floating actions do not expand rows');
  await page.screenshot({path:`${out}/revision-disable-${width}.png`});
  await page.keyboard.press('Escape');await menu.waitFor();await page.keyboard.press('Escape');
  assert.equal(await trigger.evaluate(el=>document.activeElement===el),true);
  await page.getByRole('heading',{name:'Schedules',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/revision-list-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.getByLabel('New schedule target').count(),0);
 const tools=page.getByText('More filters',{exact:true});await tools.focus();await page.keyboard.press('Enter');await page.getByLabel('Sort schedules').waitFor();await tools.press('Enter');
 await table.getByRole('button',{name:'Morning checks',exact:true}).click();
 const detail=page.getByRole('region',{name:'Schedule details: Morning checks'}),tabs=detail.getByRole('tablist');
 await detail.getByText('Schedule setup',{exact:true}).waitFor();assert.equal(await table.isVisible(),false);
 assert.equal(await detail.getByText('Latest run · validated outcomes').count(),0);
 const runRows=detail.locator('table tbody tr');await runRows.first().waitFor();assert.equal(await runRows.count(),1);
 const runFilters=detail.getByText('More filters',{exact:true});await runFilters.focus();await page.keyboard.press('Enter');await detail.getByLabel('Run ID',{exact:true}).waitFor();await runFilters.press('Enter');
 assert.equal(await detail.getByLabel('Run ID',{exact:true}).isVisible(),false);

 for(const label of ['Overview','History','Logs','Related geography','Sources']){
  await tabs.getByRole('tab',{name:label,exact:true}).focus();await page.keyboard.press('Enter');
  for(const width of [1440,1024,390,320]){
   await page.setViewportSize({width,height:1000});await detail.getByRole('heading',{name:'Morning checks',exact:true}).scrollIntoViewIfNeeded();
   const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).filter(el=>el.closest('.schedule-detail')).slice(0,30).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,40)})));
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log(JSON.stringify({label,width,overflow}));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`${out}/revision-${label.replaceAll(' ','-')}-${width}.png`});
   if(label==='Overview')await detail.screenshot({path:`${out}/wireframe-detail-${width}.png`});
  }
 }
 await page.setViewportSize({width:1440,height:1000});await tabs.getByRole('tab',{name:'Overview',exact:true}).click();
 await detail.getByRole('button',{name:'Run run',exact:true}).click();
 const runDetail=page.getByRole('region',{name:'Run details'});await runDetail.waitFor();
 await runDetail.getByRole('navigation',{name:'Run sections'}).getByRole('button',{name:'Logs',exact:true}).click();
 await runDetail.getByRole('region',{name:'Run step logs'}).waitFor();
 await runDetail.getByRole('button',{name:'Back to previous view',exact:true}).click();await detail.waitFor();

 await detail.getByRole('button',{name:'Edit',exact:true}).click();
 const editor=page.getByRole('region',{name:'Schedule editor'});await editor.waitFor();
 assert.equal(await editor.getByRole('checkbox',{name:'Pulaski County',exact:true}).count(),0);
 await editor.getByLabel('Schedule name').fill('Updated morning checks');
 await editor.getByRole('button',{name:'Save changes',exact:true}).click();await editor.waitFor({state:'hidden'});
 assert.ok(bodies.some(b=>b.path.endsWith('/update')&&b.input.expected_version===1));
 await page.getByRole('button',{name:'Back to schedules',exact:true}).click();
 assert.equal(await page.locator('.schedule-returned-row').count(),1,'Returning from details identifies the originating row');
 await page.getByRole('button',{name:'Add schedule',exact:true}).click();await editor.waitFor();
 assert.equal(await editor.getByRole('checkbox',{name:'Enabled',exact:true}).isChecked(),true);
 assert.equal(await editor.getByLabel('Schedule name').inputValue(),'');
 await editor.getByRole('checkbox',{name:'Pulaski County',exact:true}).check();
 await editor.getByText('Pulaski County (2 cities)',{exact:true}).waitFor();
 await editor.getByLabel('Schedule name').fill('Preserved type draft');
 await editor.getByRole('button',{name:'+ Another time',exact:true}).click();
 assert.equal(await editor.getByLabel('Run at 2',{exact:true}).evaluate(el=>el===document.activeElement),true);
 assert.equal(await editor.getByRole('button',{name:'Save schedule',exact:true}).isDisabled(),true);
 await editor.getByLabel('Run at 2',{exact:true}).fill('14:00');
 page.on('dialog',()=>{throw Error('Type switching must not ask for confirmation');});
 for(const target of ['State','SAM.gov','Counties']){
  await editor.getByRole('radio',{name:target,exact:true}).check();
  if(target==='State'){
   await editor.getByRole('checkbox',{name:/Arkansas DHS/}).check();
   await editor.getByRole('checkbox',{name:/Arkansas statewide public/}).check();
   await editor.getByText('State sources · 2 selected',{exact:true}).waitFor();
   assert.equal(await editor.getByText('Pulaski County (2 cities)',{exact:true}).count(),1);
  }
  if(target==='SAM.gov')assert.equal(await editor.getByLabel('Posted within the last (days)').inputValue(),'120');
  if(target==='Counties')assert.equal(await editor.getByRole('checkbox',{name:'Pulaski County',exact:true}).isChecked(),true);
  assert.equal(await editor.getByLabel('Schedule name').inputValue(),'Preserved type draft');
  await editor.getByRole('button',{name:'Save schedule',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.schedule-editor .primary-button')?.disabled);
  for(const width of [1440,1024,390,320]){
   await page.setViewportSize({width,height:1000});await editor.scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await editor.screenshot({path:`${out}/revision-editor-${target.replaceAll(/[^a-z]/gi,'')}-${width}.png`});
  }
 }
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(errors,[]);assert.ok(!bodies.some(b=>b.path.endsWith('/run-now')||b.path==='/v1/triggers'),'No provider/collection work during view/edit verification');
 await writeFile(`${out}/revision-verification.json`,JSON.stringify({widths:[1440,1024,390,320],keyboard:true,menus:true,county_readonly:true,targets:['county','state','sam'],single_save:true,page_errors:errors,production_mutations:0},null,2));
 console.log('Schedule revision browser acceptance passed: desktop/mobile/keyboard, target editors, guarded controls, one-action save; fixture-only mutations.');
}
