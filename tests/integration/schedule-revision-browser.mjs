/* global document,innerWidth */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifyScheduleRevision({page,origin,out,errors,bodies}){
 await mkdir(out,{recursive:true});await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const table=page.locator('table.schedule-table').first();await table.getByRole('button',{name:'Morning checks',exact:true}).waitFor();
 for(const width of [1440,390,320]){
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
  await page.screenshot({path:`${out}/revision-list-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});await table.getByRole('button',{name:'Morning checks',exact:true}).click();
 const detail=page.getByRole('region',{name:'Schedule details: Morning checks'}),tabs=detail.getByRole('tablist');
 await detail.getByRole('heading',{name:'Schedule settings'}).waitFor();assert.equal(await table.isVisible(),false);
 assert.equal(await detail.getByText('Latest run · validated outcomes').count(),0);
 const runRows=detail.locator('table tbody tr');await runRows.first().waitFor();assert.equal(await runRows.count(),1);
 for(const label of ['Overview','History','Logs','Related geography','Sources']){
  await tabs.getByRole('tab',{name:label,exact:true}).focus();await page.keyboard.press('Enter');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await tabs.scrollIntoViewIfNeeded();
   const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).filter(el=>el.closest('.schedule-detail')).slice(0,30).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,40)})));
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log(JSON.stringify({label,width,overflow}));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`${out}/revision-${label.replaceAll(' ','-')}-${width}.png`});
  }
 }
 await page.setViewportSize({width:1440,height:1000});await tabs.getByRole('tab',{name:'Overview',exact:true}).click();
 await detail.getByRole('button',{name:'Edit',exact:true}).click();
 const editor=page.getByRole('region',{name:'Schedule editor'});await editor.waitFor();
 assert.equal(await editor.getByRole('checkbox',{name:'Pulaski County',exact:true}).count(),0);
 await editor.getByLabel('Schedule name').fill('Updated morning checks');
 await editor.getByRole('button',{name:'Save changes',exact:true}).click();await editor.waitFor({state:'hidden'});
 assert.ok(bodies.some(b=>b.path.endsWith('/update')&&b.input.expected_version===1));
 await page.getByRole('button',{name:'Back to schedules',exact:true}).click();
 await page.getByRole('button',{name:'Add schedule',exact:true}).click();await editor.waitFor();
 for(const target of ['State source','SAM.gov','Counties']){
  page.once('dialog',d=>d.accept());await editor.getByRole('radio',{name:target,exact:true}).check();
  if(target==='State source')await editor.getByRole('combobox',{name:'Saved state source'}).selectOption('state');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await editor.scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`${out}/revision-editor-${target.replaceAll(/[^a-z]/gi,'')}-${width}.png`});
  }
 }
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(errors,[]);assert.ok(!bodies.some(b=>b.path.endsWith('/run-now')||b.path==='/v1/triggers'),'No provider/collection work during view/edit verification');
 await writeFile(`${out}/revision-verification.json`,JSON.stringify({widths:[1440,390,320],keyboard:true,menus:true,county_readonly:true,targets:['county','state','sam'],single_save:true,page_errors:errors,production_mutations:0},null,2));
 console.log('Schedule revision browser acceptance passed: desktop/mobile/keyboard, target editors, guarded controls, one-action save; fixture-only mutations.');
}
