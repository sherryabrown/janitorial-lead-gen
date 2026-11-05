// Real disposable PostgreSQL/PostgREST preview. All execution HTTP is blocked.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const ready=JSON.parse(await readFile('outputs/deployment/scheduling-preview/ready.json','utf8'));
assert.equal(new URL(ready.url).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const blocked=[],errors=[],reads=[];
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(!['127.0.0.1','localhost'].includes(url.hostname)||url.port==='8091'){
  blocked.push(url.pathname);return route.abort();
 }
 if(url.pathname.includes('/rest/v1/rpc/'))reads.push(url.pathname);
 return route.continue();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(ready.url);
 for(const role of ['user','admin']){
  if(role==='admin')await page.getByLabel('Preview role').selectOption('admin');
  const scope={metric:'added',label:'New leads',filters:{run:ready.run_id,period:'all'},expected:1};
  await page.goto(ready.url+'/?leadReport='+encodeURIComponent(JSON.stringify(scope)));
  await page.getByText('Sample county janitorial services',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Schedules',exact:true}).click();
  await page.getByRole('button',{name:'Weekly Arkansas County leads',exact:true}).click();
  await page.getByRole('tab',{name:'Results',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Sources',exact:true}).click();
  await page.getByRole('heading',{name:'Current source setup',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Schedule changes',exact:true}).click();
  await page.getByRole('tab',{name:'Results',exact:true}).click();
  await page.getByRole('button',{name:'Results analytics',exact:true}).click();
  await page.getByRole('heading',{name:/^Validated results/}).waitFor();
  await page.getByRole('button',{name:'Run history',exact:true}).click();
  await page.getByRole('heading',{name:'Run history',exact:true}).waitFor();
  await page.getByRole('button',{name:'Submit history',exact:true}).click();
  await page.getByRole('button',{name:`Weekly Arkansas County leads — Run ${ready.run_id}`,exact:true}).click();
  await page.getByRole('button',{name:'View source status',exact:true}).click();
  await page.getByRole('heading',{name:'What was checked in this run',exact:true}).waitFor();
  await page.screenshot({path:`outputs/deployment/scheduling-read-decoupling-build/${role}-saved-reads.png`,fullPage:true});
 }
 assert.deepEqual(blocked,[],'Browsing saved data must not even attempt execution requests');
 assert.deepEqual(errors,[]);assert.ok(reads.some(p=>p.endsWith('/procurement_scheduling_read')));
 console.log(JSON.stringify({saved_reads_browser:'passed',roles:['User','Admin'],execution_requests:0,production_contacted:false,rpc_requests:reads.length}));
}catch(error){console.error((await page.locator('body').innerText()).slice(0,5000));throw error;}
finally{await browser.close();}
