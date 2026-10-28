// Actual isolated API + PostgreSQL + built application, without HTTP fixtures.
/* global innerWidth, localStorage */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const ready=JSON.parse(await readFile('outputs/deployment/scheduling-preview/ready.json','utf8'));
const origin=ready.url,out='outputs/deployment/scheduling-preview';await mkdir(out,{recursive:true});
const layoutOnly=process.argv.includes('--layout-only');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],external=[],requests=[];
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.origin);return route.abort();}
 requests.push({url:route.request().url(),method:route.request().method()});return route.continue();
});
page.on('pageerror',error=>errors.push(error.message));
const settings=async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Weekly Arkansas County leads',exact:true}).click();await page.getByRole('tab',{name:'Results',exact:true}).waitFor();};
const screenshot=async name=>page.screenshot({path:`${out}/${name}.png`,fullPage:true});
const withinWidth=async width=>{await page.setViewportSize({width,height:1000});const box=await page.locator('html').evaluate(el=>({scroll:el.scrollWidth,width:innerWidth}));assert.ok(box.scroll<=box.width+1,`Page overflows at ${width}px`);};
try{
 await page.goto(origin);await page.getByRole('button',{name:'Settings',exact:true}).waitFor();
 await page.getByText('Bid website',{exact:true}).waitFor();
 const website=page.getByText('Bid website',{exact:true}).locator('..');
 assert.match(await website.innerText(),/Arkansas County bid website/);assert.match(await website.innerText(),/https:\/\/repair\.example\//);
 await settings();assert.deepEqual(await page.getByRole('tab').allTextContents(),['Results','Sources','Schedule changes']);
 assert.equal(await page.getByText('Technical details for the selected run',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Results analytics',exact:true}).click();
 await page.getByRole('heading',{name:/^Validated results/}).waitFor();
 assert.equal(await page.getByRole('heading',{name:/AI usage/}).count(),0,'User statistics must not render Admin-only usage');
 await page.getByRole('combobox',{name:/^Type/}).selectOption('sam');
 await page.getByRole('button',{name:'Refresh stats',exact:true}).waitFor();
 await page.getByRole('heading',{name:/^Validated results/}).waitFor();
 await screenshot('user-statistics');
 await page.getByRole('button',{name:'Schedules',exact:true}).click();
 await page.getByRole('button',{name:'Weekly Arkansas County leads',exact:true}).click();
 const jwt=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));return JSON.parse(localStorage.getItem(key)).access_token;});
 for(const path of ['/v1/source-reviews',`/v1/triggers/${ready.run_id}/steps`]){
  const r=await fetch('http://127.0.0.1:8091'+path,{headers:{Authorization:`Bearer ${jwt}`}});assert.equal(r.status,403);
 }
 await page.getByRole('tab',{name:'Sources',exact:true}).click();await page.getByRole('heading',{name:'Current source setup'}).waitFor();
 await page.getByRole('heading',{name:'What was checked in this run'}).waitFor();
 const waiting=page.getByText('Waiting to check',{exact:true});if(await waiting.count())assert.ok(!/Needs review|Responsibility/.test(await waiting.first().locator('xpath=ancestor::article').innerText()),'Pending checks must not fabricate an Admin issue');
 assert.equal(await page.getByRole('button',{name:/Review source/}).count(),0);
 for(const width of [1440,390,320]){await withinWidth(width);await screenshot(`user-sources-${width}`);}
 await page.setViewportSize({width:720,height:600});await page.locator('html').evaluate(el=>el.style.zoom='2');await withinWidth(720);await screenshot('user-sources-200-percent');await page.locator('html').evaluate(el=>el.style.zoom='');
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('tab',{name:'Results',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Sources',exact:true}).getAttribute('aria-selected'),'true');
 await page.goto(origin+'/?adminView=sources');await page.getByRole('heading',{name:'Admin review required'}).waitFor();
 const countBefore=requests.filter(r=>r.url.includes('/v1/admin/sources')).length;assert.equal(countBefore,0,'User direct link cannot start a private catalog read');
 await page.getByLabel('Preview role').selectOption('admin');await page.getByRole('button',{name:'Needs attention',exact:true}).waitFor();
 await page.getByRole('button',{name:'Needs attention',exact:true}).click();
 if(layoutOnly)await page.getByRole('combobox',{name:/^Show/}).selectOption('reviewed');
 await page.getByRole('button',{name:/Review source/}).first().click();
 if(!layoutOnly){
 await page.getByLabel('Official website').fill('https://repair.example/bids');await page.getByRole('button',{name:'Verify website',exact:true}).click();
 await page.getByRole('heading',{name:'Official website entry verified',exact:true}).waitFor({timeout:60000});
 await page.getByLabel('I reviewed the affected scope and schedules.').check();await page.getByRole('button',{name:'Use this website',exact:true}).click();
 await page.getByRole('heading',{name:'Bid listing method verified',exact:true}).waitFor({timeout:60000});
 await page.getByLabel('I reviewed the affected scope and schedules.').check();await page.getByRole('button',{name:'Apply verified method',exact:true}).click();
 await page.getByRole('heading',{name:'Source setup verified',exact:true}).waitFor({timeout:60000});await screenshot('admin-verified-repair');
 // Verify a reviewed decision and explicit exclusion after the verified repair.
 await page.getByLabel('Won’t address',{exact:true}).check();await page.getByLabel('Short reason').fill('Sample acceptance: hold this source check until explicitly re-enabled.');
 await page.getByLabel('Skip this check until an admin re-enables it.').check();await page.getByRole('button',{name:'Save decision',exact:true}).click();
 await page.getByText('Checks disabled by admin decision. Other source checks continue.',{exact:false}).first().waitFor();await screenshot('admin-reviewed-gap');
 }
 const radio=page.getByLabel('No website',{exact:true});await radio.check();
 const spacing=await radio.evaluate(el=>{const text=[...el.closest('label').childNodes].find(n=>n.nodeType===3&&n.textContent.trim()),range=el.ownerDocument.createRange();range.selectNodeContents(text);return range.getBoundingClientRect().left-el.getBoundingClientRect().right;});
 assert.ok(spacing>=0&&spacing<24,'A radio choice must keep its text beside the control');await screenshot('admin-decision-layout');
 // Role change clears privileged panels. User sees truthful current decision.
 await page.getByLabel('Preview role').selectOption('user');await page.getByRole('button',{name:'Schedules',exact:true}).waitFor();
 await page.getByRole('button',{name:'Schedules',exact:true}).click();await page.getByRole('button',{name:'Weekly Arkansas County leads',exact:true}).click();await page.getByRole('tab',{name:'Sources',exact:true}).click();
 await page.getByText('Accepted gap',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/Review source/}).count(),0);await screenshot('user-reviewed-gap');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({scheduling_preview_browser:'passed',real_local_api:true,user_website_summary:true,server_role_denial:true,legacy_direct_link:true,guided_verify_apply_readback:layoutOnly?'previous full acceptance retained':true,reviewed_exclusion:true,decision_control_spacing:true,pending_check_not_an_issue:true,widths:[1440,390,320],zoom:'200%',keyboard:true,role_change:true,production_contacted:false}));
}catch(error){await screenshot('acceptance-failure');console.error((await page.locator('body').innerText()).slice(0,4500));throw error;}
finally{await browser.close();}
