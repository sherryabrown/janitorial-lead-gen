/* global document */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifyAnalyticsBrowser({page,origin,out,errors,bodies}){
 await mkdir(out,{recursive:true});await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Admin views'});await nav.getByRole('button',{name:'Stats / analytics',exact:true}).focus();await page.keyboard.press('Enter');
 const stats=page.getByRole('region',{name:'Stats and analytics'});await stats.getByRole('heading',{name:'Validated results'}).waitFor();
 assert.equal(await stats.getByLabel('Reporting period').inputValue(),'7');assert.match(await stats.innerText(),/Unknown · 1 known/);
 await stats.getByRole('button',{name:'Next runs',exact:true}).click();await stats.getByText('Page 2 · 26 runs').waitFor();
 await stats.getByRole('button',{name:'Previous runs',exact:true}).click();await stats.getByText('Page 1 · 26 runs').waitFor();
 await stats.getByRole('combobox',{name:/^Type/}).selectOption('sam');await stats.getByText('No matching runs.').waitFor();
 await stats.getByRole('combobox',{name:/^Type/}).focus();await page.keyboard.press('Home');await page.keyboard.press('Enter');await stats.getByText('Page 1 · 26 runs').waitFor();
 await stats.getByLabel('Sort runs').selectOption('updated');await stats.getByLabel('Run order').selectOption('asc');await stats.getByRole('button',{name:'View run',exact:true}).first().waitFor();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await stats.getByRole('heading',{name:'Stats / analytics',exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await stats.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`Stats has no internal overflow at ${width}px`);
  for(const selector of ['input','select','button'])for(const el of await stats.locator(selector).all())if(await el.isVisible()){const b=await el.boundingBox();assert.ok(b.width>0&&b.x>=0&&b.x+b.width<=width+1,`Visible ${selector} fits ${width}px`);}
  await page.screenshot({path:`${out}/analytics-${width}.png`});
  await stats.getByRole('heading',{name:/^AI usage/}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/analytics-usage-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});
 const open=stats.getByRole('button',{name:'View run',exact:true}).first();await open.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Finished — some sources need attention',exact:true}).waitFor();
 await page.goBack();await stats.getByRole('heading',{name:'Validated results'}).waitFor();assert.equal(await stats.getByLabel('Sort runs').inputValue(),'updated');
 // Owner-scoped filters also survive remount/reload; browser Back retains focus.
 assert.equal(await open.evaluate(el=>document.activeElement===el),true);
 await page.reload();await stats.getByRole('heading',{name:'Validated results'}).waitFor();assert.equal(await stats.getByLabel('Run order').inputValue(),'asc');
 await nav.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'Morning checks',exact:true}).click();await page.getByRole('heading',{name:'All-time available results'}).waitFor();assert.equal(await page.getByRole('tablist',{name:'Schedule sections'}).getByRole('tab').count(),5);
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0,'Analytics never mutates workflow or imports');
 await writeFile(`${out}/analytics-summary.json`,JSON.stringify({passed:true,widths:[1440,390,320],keyboard:true,filtersSortPaging:true,drillBackReload:true,allTimeOverview:true,productionMutations:0,pageErrors:errors},null,2));
 console.log('Analytics browser acceptance passed: desktop/390/320, keyboard filters, sorting, paging, drill/back/reload, unchanged detail tabs; zero mutations.');
}
