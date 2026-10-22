/* global document,innerWidth */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {catalogProjection} from '../../scripts/lib/admin-catalog.mjs';
export async function verifyCatalogBrowser({page,origin,out,errors,bodies}){
 out+='/05';await mkdir(out,{recursive:true});let failed=false;
 const county=(id,name)=>({id,name,kind:'county',source_active:true}),city='ARM'+'a'.repeat(32);
 const data={geographies:[county('05125','Saline County'),county('05053','Grant County'),county('05119','Pulaski County'),{id:'05',name:'Arkansas',kind:'state',source_active:true},{id:city,name:'Tull',kind:'municipality',source_active:true,dataset_hash:'current'}],links:[{place_id:city,county_id:'05125'},{place_id:city,county_id:'05053'}],sources:[{id:'source',code:'saline',name:'Saline County official bids and public procurement notices',url:'https://example.gov/',source_coverage_areas:[{area_type:'county',state_code:'AR',county_name:'Saline'}],contracting_entity_geo_level:'county'},...Array.from({length:30},(_,i)=>({id:'unmapped-'+i,code:'u'+i,name:'Unmapped official source '+String(i).padStart(2,'0'),url:'https://example.gov/',source_coverage_areas:[]}))],capabilities:[],associations:[]};
 await page.route('**/v1/admin/{sources,geographies}*',async route=>{
  const u=new URL(route.request().url());if(failed)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  const f=Object.fromEntries(u.searchParams),d={...data,schedule:f.schedule?{version:1,config:{target_kind:'county_scope',county_ids:['05119'],counties:[{id:'05119',name:'Pulaski County',cities:[],selection_token:'saved'}]}}:null};
  const projected=catalogProjection(d,f,new Date('2026-10-22T12:00:00Z')),result=u.pathname.endsWith('sources')?{...projected.sources,gaps:projected.gaps}:projected.geographies;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...result,scope:projected.scope,basis:projected.basis,as_of:projected.as_of})});
 });
 await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).click();const nav=page.getByRole('navigation',{name:'Admin views'});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await nav.getByRole('button',{name:'Sources by geography',exact:true}).click();
  const sources=page.getByRole('region',{name:'Registered sources'});await sources.getByRole('button',{name:'Refresh sources',exact:true}).waitFor();
  await sources.getByLabel('Search sources',{exact:true}).fill('');await sources.getByRole('button',{name:'Refresh sources',exact:true}).waitFor();
  await sources.getByRole('button',{name:'Next page',exact:true}).click();await sources.getByRole('button',{name:'Refresh sources',exact:true}).waitFor();await sources.getByText('Page 2',{exact:true}).waitFor();
  await sources.getByLabel('Search sources',{exact:true}).fill('Saline');const row=sources.getByRole('button',{name:data.sources[0].name,exact:true});await row.waitFor();
  await row.focus();await page.keyboard.press('Enter');await sources.getByRole('table',{name:'Source category methods'}).waitFor();await sources.getByRole('button',{name:'Refresh sources',exact:true}).waitFor();
  assert.equal(await sources.locator('.admin-read-toolbar button:visible').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await sources.locator('h2').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/source-${width}.png`});
  await page.goBack();await row.waitFor();assert.equal(await sources.getByLabel('Search sources').inputValue(),'Saline');await page.waitForFunction(()=>document.activeElement?.classList.contains('schedule-name'));
  failed=true;await sources.getByRole('button',{name:'Refresh sources',exact:true}).click();await sources.getByRole('button',{name:'Retry sources',exact:true}).waitFor();assert.equal(await row.count(),1);failed=false;await sources.getByRole('button',{name:'Retry sources',exact:true}).click();await sources.getByRole('button',{name:'Refresh sources',exact:true}).waitFor();
  await nav.getByRole('button',{name:'Related geography',exact:true}).click();const geography=page.getByRole('region',{name:'Geography catalog'});await geography.getByRole('button',{name:'Saline County',exact:true}).click();await geography.getByRole('table',{name:'Current municipality memberships'}).waitFor();await geography.getByRole('table',{name:'Current municipality memberships'}).getByText('Saline County, Grant County',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await geography.locator('h2').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/geography-${width}.png`});
  await page.reload();await page.getByRole('table',{name:'Current municipality memberships'}).waitFor();assert.ok(page.url().includes('adminGeography=05125'));
  await nav.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'Morning checks',exact:true}).click();
  const detail=page.getByRole('region',{name:'Schedule details: Morning checks'}),tabs=page.getByRole('tablist',{name:'Schedule sections'});
  await tabs.getByRole('tab',{name:'Sources',exact:true}).click();await detail.getByRole('region',{name:'Saved results',exact:true}).waitFor();await detail.getByText('Registered sources · current registry',{exact:true}).click();await detail.getByRole('button',{name:'Refresh schedule',exact:true}).waitFor();assert.equal(await detail.locator('.admin-read-toolbar button:visible').count(),1);await detail.getByText('0 registered sources',{exact:true}).waitFor();
  await tabs.getByRole('tab',{name:'Related geography',exact:true}).focus();await page.keyboard.press('Enter');await detail.getByRole('button',{name:'Pulaski County',exact:true}).click();await detail.getByRole('heading',{name:'Saved versus current scope',exact:true}).waitFor();await detail.getByRole('button',{name:'Refresh schedule',exact:true}).waitFor();assert.equal(await detail.locator('.admin-read-toolbar button:visible').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await detail.locator('.catalog > h3').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/saved-scope-${width}.png`});
  await page.reload();await page.getByRole('heading',{name:'Saved versus current scope',exact:true}).waitFor();assert.ok(page.url().includes('adminGeography=05119'));
 }
 assert.deepEqual(errors,[]);assert.equal(bodies.length,0);await writeFile(`${out}/verification.json`,JSON.stringify({widths:[1440,390,320],keyboard:true,paging:true,sourceDetailBackFocus:true,filterRetention:true,refreshRecovery:true,multiCounty:true,reload:true,scheduleScopeComparison:true,savedRunEvidencePreserved:true,oneScheduleReadOwner:true,applicationMutations:0,errors},null,2));console.log('Phase 5 catalog desktop/mobile/keyboard acceptance passed.');
}
