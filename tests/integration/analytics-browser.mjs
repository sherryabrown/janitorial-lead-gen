import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function verifyAnalyticsBrowser({page,origin,out,errors,bodies}){
 await mkdir(out,{recursive:true});await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Admin views'});await nav.getByRole('button',{name:'Stats / analytics',exact:true}).focus();await page.keyboard.press('Enter');
 const stats=page.getByRole('region',{name:'Stats and analytics'});await stats.getByRole('heading',{name:'Validated results'}).waitFor();
 assert.equal(await stats.getByLabel('Reporting period').inputValue(),'7');assert.doesNotMatch(await stats.innerText(),/Unknown · \d+ known/);assert.match(await stats.innerText(),/Verified new leads/);
 assert.equal(await stats.getByRole('table').count(),0);assert.equal(await stats.getByLabel('Sort runs').count(),0);assert.equal(await stats.getByRole('button',{name:'Next runs',exact:true}).count(),0);
 await stats.getByRole('combobox',{name:/^Type/}).selectOption('sam');await stats.getByText(/Run creation dates · 0 runs/).waitFor();
 await stats.getByRole('combobox',{name:/^Type/}).selectOption('');await stats.getByText(/Run creation dates · 26 runs/).waitFor();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await stats.getByRole('heading',{name:'Stats / analytics',exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await stats.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`Stats has no internal overflow at ${width}px`);
  for(const selector of ['input','select','button'])for(const el of await stats.locator(selector).all())if(await el.isVisible()){const b=await el.boundingBox();assert.ok(b.width>0&&b.x>=0&&b.x+b.width<=width+1,`Visible ${selector} fits ${width}px`);}
  await page.screenshot({path:`${out}/analytics-${width}.png`});
  await stats.getByRole('heading',{name:/^AI usage/}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/analytics-usage-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});
 await stats.getByRole('combobox',{name:/^Type/}).selectOption('sam');await stats.getByText(/Run creation dates · 0 runs/).waitFor();
 await page.reload();await stats.getByRole('heading',{name:'Validated results'}).waitFor();assert.equal(await stats.getByRole('combobox',{name:/^Type/}).inputValue(),'sam');
 await nav.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'Morning checks',exact:true}).click();await page.getByRole('heading',{name:'All-time available results'}).waitFor();assert.equal(await page.getByRole('tablist',{name:'Schedule sections'}).getByRole('tab').count(),5);
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0,'Analytics never mutates workflow or imports');
 await writeFile(`${out}/analytics-summary.json`,JSON.stringify({passed:true,widths:[1440,390,320],keyboard:true,filtersWithoutRunPaging:true,ownerScopedReload:true,allTimeOverview:true,productionMutations:0,pageErrors:errors},null,2));
 console.log('Analytics browser acceptance passed: desktop/390/320, keyboard filters, owner-scoped reload, compact metrics without run paging, unchanged detail tabs; zero mutations.');
}
