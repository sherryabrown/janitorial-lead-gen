import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {loadEnv} from 'vite';

export async function verifySourceResolutionBrowser({page,origin,out,errors}){
 const fixture='dist/source-resolution-fixture.html';
 const env=loadEnv('development',process.cwd(),'VITE_');
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';
 import{SourceResolution}from'./src/features/admin/SourceResolution.tsx';import'./src/styles.css';import'./src/features/admin/admin.css';
 createRoot(document.getElementById('root')).render(React.createElement(SourceResolution,{requestId:'fixture-request',taskId:'fixture-task',owner:'fixture-owner',
 canManage:new URLSearchParams(location.search).get('role')!=='user',onBack:()=>{},onNext:()=>{},onDone:()=>{}}));`,resolveDir:process.cwd(),loader:'jsx'},
 bundle:true,jsx:'automatic',format:'esm',outfile:'dist/source-resolution-fixture.js',define:{'import.meta.env':JSON.stringify({...env,VITE_PROCUREMENT_API_URL:'https://janitorial-procurement-backend.onrender.com'})}});
 await writeFile(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
 <div style="padding:12px 24px;background:#fff1e6">Local reference preview · sample data · no live changes</div><main id="root" style="padding:24px"></main>
 <link rel="stylesheet" href="/source-resolution-fixture.css"><script type="module" src="/source-resolution-fixture.js"></script></body></html>`);
 let detail={item:{task_id:'fixture-task',id:'fixture-review',version:1,revision:'revision',scope:{geography_id:'05001',category:'opportunity',source_id:null,capability_id:null},
  name:'Arkansas County bid website',location:'Arkansas County',category:'opportunity',title:'No verified website',impact:'This run did not check opportunity listings for this location. Other sources continued.',
  check:{state:'source_missing',observed_at:'2026-10-26T15:00:00Z',last_success_at:null},decision:'unreviewed',previous_decision:null,checks_excluded:false,reviewed_at:null,responsibility:'Admin',
  allowed_actions:['provide_website','no_website','no_issue','wont_address','needs_developer']},reason:'',website:'',verification:null,can_reenable:false,
  impact:{scope:'Arkansas County · opportunity',schedules:[{id:'schedule',name:'Weekday county opportunities',version:1}],explanation:'Only this source check is affected. Other sources keep running; existing work may finish.'},
  preview_token:'preview',history:[],more_history:false};
 const requests=[];
 await page.route('**/v1/requests/fixture-request/**',async route=>{
  const request=route.request();requests.push({url:request.url(),method:request.method()});
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});return;}
  if(request.method()==='POST'){
   const body=request.postDataJSON();assert.equal(body.decision,'no_website');assert.equal(body.confirmed_scope,true);
   detail={...detail,reason:body.reason,item:{...detail.item,decision:'no_website',checks_excluded:true,version:2,reviewed_at:'2026-10-26T16:00:00Z'}};
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify({saved:true})});return;
  }
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(detail)});
 });
 const url=`${origin}/source-resolution-fixture.html`;
 await page.setViewportSize({width:1280,height:1000});await page.goto(url,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Arkansas County bid website'}).waitFor().catch(error=>{console.error(JSON.stringify({fixture_script_errors:errors}));throw error;});
 await page.getByLabel('No website',{exact:true}).check();await page.getByLabel('Short reason').fill('No usable public bid website was found in the official directory.');
 await page.screenshot({path:`${out}/source-resolution-desktop.png`,fullPage:true});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:900});
  const dimensions=await page.locator('body').evaluate(body=>({scroll:body.ownerDocument.documentElement.scrollWidth,width:body.ownerDocument.defaultView.innerWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,`Source resolution overflows ${width}px`);
  await page.screenshot({path:`${out}/source-resolution-${width}.png`,fullPage:true});
 }
 await page.getByLabel('Skip this check until an admin re-enables it.').check();await page.getByRole('button',{name:'Save decision',exact:true}).click();
 await page.getByText('Decision saved.',{exact:false}).waitFor();
 await page.getByText('Checks disabled by admin decision.',{exact:false}).waitFor();
 const mutations=requests.filter(r=>r.method==='POST').length;assert.equal(mutations,1);
 const priorReads=requests.length;await page.goto(url+'?role=user',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Admin review required'}).waitFor();
 assert.equal(requests.length,priorReads,'Regular User direct link must not read Admin evidence');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({source_resolution_browser:'passed',widths:[1280,390,320],decision_saved:true,user_direct_read_denied:true,production_contacted:false}));
}
