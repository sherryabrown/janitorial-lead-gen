/* global document, innerWidth */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

// Run with admin-ui-browser.mjs --built --county-loading against fixture HTTP.
export async function verifyCountyLoading({page, origin, out, errors}) {
  out += '/county-loading';
  await mkdir(out, {recursive:true});
  const selectorAsset = /\/assets\/CountySelector-[^/]+\.js(?:\?.*)?$/;
  const requests = [];
  page.on('request', request => {if(selectorAsset.test(request.url())) requests.push(request.url());});
  await page.goto(origin+'/?adminView=schedules');
  const list = page.getByRole('region', {name:'Saved schedules'});
  await list.getByRole('button', {name:'Add schedule',exact:true}).waitFor();
  assert.equal(requests.length, 0, 'Schedules must not request county geometry');
  let failedOnce = false;
  await page.route(selectorAsset, route => {
    if(!failedOnce) {failedOnce = true; return route.abort('failed');}
    return route.continue();
  });
  await list.getByRole('button', {name:'Add schedule',exact:true}).click();
  const editor = page.getByRole('region', {name:'Schedule editor'});
  await editor.getByRole('alert').filter({hasText:'County selection could not load.'}).waitFor();
  await editor.getByLabel('Schedule name',{exact:true}).fill('Keep this draft');
  await editor.getByRole('button',{name:'Retry county selection',exact:true}).click();
  const editorCounty = editor.getByRole('checkbox', {name:'Pulaski County',exact:true});
  await editorCounty.waitFor();
  assert.equal(await editor.getByLabel('Schedule name',{exact:true}).inputValue(),'Keep this draft');
  assert.equal(requests.length, 2, 'Retry requests the failed chunk without discarding the form');
  await editorCounty.focus();
  await page.keyboard.press('Space');
  assert.equal(await editorCounty.isChecked(), true);
  await editor.getByRole('button', {name:'Cancel',exact:true}).click();

  const nav = page.getByRole('navigation', {name:'Scheduling views'});
  const manual = page.locator('.admin-navigation-section[aria-label="Manual runs"]');
  const openManual = async () => {
    const tools = nav.locator('details');
    if(!await tools.evaluate(element => element.open)) await tools.locator('summary').click();
    await nav.getByRole('button', {name:'Manual runs',exact:true}).click();
    await manual.getByLabel('Find a county').waitFor();
  };
  await openManual();
  await manual.getByLabel('Find a county').fill('Ashley');
  const mapCounty = manual.getByRole('button', {name:'Ashley County',exact:true});
  await mapCounty.focus();
  await page.keyboard.press('Enter');
  assert.equal(await manual.getByRole('checkbox', {name:'Ashley County',exact:true}).isChecked(), true);
  await nav.getByRole('button', {name:'Schedules',exact:true}).click();
  await openManual();
  assert.equal(await manual.getByLabel('Find a county').inputValue(), 'Ashley');
  assert.equal(await manual.getByRole('checkbox', {name:'Ashley County',exact:true}).isChecked(), true);
  assert.equal(requests.length, 2, 'Visited workspaces reuse the loaded geometry');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1050});
    await manual.getByLabel('Find a county').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path:`${out}/manual-${width}.png`,fullPage:false});
  }
  await page.reload();
  assert.equal(await manual.getByRole('checkbox', {name:'Ashley County',exact:true}).isChecked(), true, 'Direct manual entry restores the saved draft');
  assert.deepEqual(errors, []);
  console.log('PASS deferred county chunk/retry, editor/manual keyboard selection, retained search/draft, direct entry, desktop/mobile');
}
