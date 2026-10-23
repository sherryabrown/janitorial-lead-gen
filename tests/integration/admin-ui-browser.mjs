import {verifyExecutionMetrics} from './execution-metrics-browser.mjs';
import {verifyCanonicalRedirect} from './canonical-redirect-browser.mjs';
import {verifySubmittedHistoryBrowser} from './submitted-history-browser.mjs';
import {verifyDetailClarityBrowser} from './detail-clarity-browser.mjs';
import {verifyMetricBrowser} from './metric-drilldown-browser.mjs';
import {verifyCatalogBrowser} from './catalog-browser.mjs';
import {verifyScheduleActivityBrowser} from './schedule-activity-browser.mjs';
import {verifySettingsReadsBrowser} from './settings-reads-browser.mjs';
/* global localStorage, window, document, innerWidth */
// Local browser acceptance: real app/auth client, intercepted fixture HTTP, no production mutations.
import {verifyScheduleRevision} from './schedule-revision-browser.mjs';
import {verifyAnalyticsBrowser} from './analytics-browser.mjs';
import {analyticsFixture} from '../helpers/analytics-fixture.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executionMetrics=process.argv.includes('--execution-metrics');
const port=process.env.ADMIN_UI_TEST_PORT||'5181';
const origin = `http://127.0.0.1:${port}`,
  out = 'outputs/deployment/admin-ui';
const env = await readFile('.env', 'utf8').catch(() => '');
const publicUrl =
  process.env.VITE_SUPABASE_URL ||
  env.match(/^VITE_SUPABASE_URL=["']?([^\s"']+)/m)?.[1];
if (!publicUrl)
  throw Error(
    'Configure the usual public VITE_SUPABASE_URL before browser acceptance',
  );
const asset = JSON.parse(
  await readFile('src/features/admin/data/arkansas-counties.json', 'utf8'),
);
const mapping = JSON.parse(
  await readFile('tests/fixtures/research/mapping.json', 'utf8'),
);
const user = {
  id: '00000000-0000-4000-8000-000000000088',
  email: 'browser-fixture@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
};
const token = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: user.id, aud: 'authenticated', exp: 4102444800 },
  'fixture',
]
  .map((v) =>
    Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString(
      'base64url',
    ),
  )
  .join('.');
const usage = {
  ai: 'not_used',
  input_tokens: 0,
  output_tokens: 0,
  actual_usd: 0,
  held_usd: 0,
};
const schedule = {
  id: 'schedule',
  version: 1,
  name: 'Morning checks',
  enabled: false,
  config: {
    target_kind: 'county_scope',
    county_ids: ['05119'],
    maintain_sources: true,
    check_updates: true,
    requested_categories: ['opportunity'],
  },
  window_policy: {
    opportunity: {
      from_offset_days: 0,
      to_offset_days: 365,
      date_basis: 'deadline',
    },
  },
  recurrence: {
    timezone: 'America/Chicago',
    frequency: 'daily',
    local_times: ['09:00', '14:00'],
  },
  next_due_at: null,
};
const run = {
  target_kind: 'county_scope',
  presentation: {outcome:'source_attention',attention_count:1},
  id: 'run',
  created_at: '2026-10-19T01:00:00Z',
  state: 'needs_review',
  county_count: 1,
  candidate_count: 0,
  evidence_count: 1,
  origin: 'manual',
  usage,
  next_action: 'Review saved source evidence and candidates',
  config: {
    ...schedule.config,
    counties: [
      {
        id: '05119',
        name: 'Pulaski County',
        cities: [{ name: 'Little Rock' }, { name: 'Maumelle' }],
      },
    ],
  },
  children: [{ request_id: 'request', county_id: '05119', role: 'county' }],
};
// Verified reporting DTO fixture; no canonical database mutation is performed.
schedule.reporting={as_of:'2026-10-20T14:00:00Z',last_run:{...run,leads:{added:2,updated:1,unchanged:3,completeness:'known'}},latest_occurrence:null};
const bodies = [];
const submittedHistory=process.argv.includes('--submitted-history');
const detailClarity=process.argv.includes('--detail-clarity');
let savedSchedule = executionMetrics||submittedHistory||detailClarity||process.argv.includes('--catalog')||process.argv.includes('--schedule-revision')||process.argv.includes('--analytics')||process.argv.includes('--settings-reads')||process.argv.includes('--schedule-activity');
let failRunRead = !executionMetrics&&!submittedHistory&&!detailClarity&&!process.argv.includes('--catalog')&&!process.argv.includes('--schedule-revision')&&!process.argv.includes('--analytics')&&!process.argv.includes('--settings-reads')&&!process.argv.includes('--schedule-activity');
let queueReads = 0;
let samSchedule = null;
const samRun={...run,id:'sam-run',state:'completed',next_action:'View automatically saved leads',target_kind:'sam',county_count:0,config:{target_kind:'sam',requested_categories:['opportunity'],publication_window:{from:'2026-09-20',to:'2026-10-19'}},children:[{request_id:'sam-request',county_id:null,role:'sam'}]};
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    ...(process.argv.includes('--built')?['preview']:[]),
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '--strictPort',
  ],
  { stdio: 'ignore', windowsHide: true, env:{...process.env,VITE_PROCUREMENT_API_URL:'https://janitorial-procurement-backend.onrender.com'} },
);
let browser,countySaved=false;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Server still starting. */
    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw Error(`Local Vite start timed out (exit ${server.exitCode??'running'})`);
  }
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    hasTouch: true,
  });
  await context.routeWebSocket('**/*', (ws) => ws.close());
  await context.addInitScript(
    ({ user, token, key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      ),
    {
      user,
      token,
      key: `sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`,
    },
  );
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    let body = [];
    if (url.hostname.endsWith('.supabase.co')) {
      if (url.pathname.includes('procurement_queue_page')) {
        queueReads++; body = {
          rows: [mapping.procurement_leads[1]],
          total: 1,
          counts: { new: 1 },
        }; }
      else if (url.pathname.includes('/auth/v1/user')) body = user;
      else if (url.pathname.includes('/procurement_leads'))
        body = mapping.procurement_leads[1];
    } else if (url.hostname === 'janitorial-procurement-backend.onrender.com') {
      const p = url.pathname,
        input = req.postDataJSON();
      if (req.method() === 'POST')
        bodies.push({ path: p, input, key: req.headers()['idempotency-key'] });
      if (p === '/v1/counties')
        body = {
          counties: asset.counties.map((c) => ({
            id: c.id,
            name: c.name + ' County',
            ...(url.searchParams.get('include')==='scope'?{cities:[{id:'city1',name:'Little Rock'},{id:'city2',name:'Maumelle'}],selection_token:'revision'}:{}),
          })),
        };
      else if (p === '/v1/state-triggers')
        body = {
          items: [
            {
              id: 'state',
              name: 'Arkansas DHS janitorial historical solicitation',
              source_id: 'state-source',
              category: 'opportunity',
              county_ids: ['05119'],
              schedule_id: null,
              schedule_enabled: false,
              next_due_at: null,
              last_finished_at: null,
            },
            ...((process.argv.includes('--schedule-revision')||process.argv.includes('--settings-reads'))?[{id:'state-two',source_id:'state-source-two',name:'Arkansas statewide public procurement with a long descriptive source name for wrapping verification',category:'opportunity',county_ids:['05119'],schedule_id:null}]:[]),
          ],
        };
      else if (p === '/v1/scheduler/status')
        body = {
          enabled: true,
          extensions_ready: true,
          backend_key_configured: true,
          ai_policy: { enabled: true, monthly_usd: 10 },
        };
      else if (p.endsWith('/preview')) {
        const config = input.config ?? input;
        if(config.target_kind==='sam')body={...input,config,preview_hash:'b'.repeat(64),next_due_at:input.enabled?'2026-10-20T14:00:00Z':null};
        else
        body = {
          ...input,
          config: {
            ...config,
            counties: config.county_ids.map((id) => ({
              id,
              name: asset.counties.find((c) => c.id === id).name + ' County',
              city_ids: ['city1', 'city2'],
              cities: [
                { id: 'city1', name: 'Little Rock' },
                { id: 'city2', name: 'Maumelle' },
              ],
              selection_token: 'revision',
            })),
          },
          preview_hash: 'a'.repeat(64),
          next_due_at: input.enabled ? '2026-10-20T14:00:00Z' : null,
        };
      } else if (p === '/v1/schedules' && req.method() === 'POST') {
        if(input.config.target_kind==='sam'){samSchedule={...input,id:'sam-schedule',version:1,next_due_at:null};body=samSchedule;}
        else {savedSchedule = true;Object.assign(schedule, input);body = schedule;}
      } else if (p.endsWith('/update')) {Object.assign(schedule,input);body=schedule;} else if (p.endsWith('/occurrences') && url.searchParams.has('offset')) body={items:[{id:'linked',due_at:'2026-10-19T12:00:00Z',state:'queued',trigger_id:'run'}],next_offset:null};
      else if (p.endsWith('/occurrences')) body={items:[{id:'blocked',due_at:'2026-10-19T12:00:00Z',effective_at:'2026-10-19T13:00:00Z',origin:'scheduled',version:1,config:{target_kind:'county_scope',county_ids:['05119'],counties:[{id:'05119',name:'Original Pulaski snapshot',cities:[]}]},state:'blocked',reason:'scope_changed',missed_from:'2026-10-18T12:00:00Z',missed_through:'2026-10-19T12:00:00Z'}],next_offset:1};
      else if(p.endsWith('/activity')){const historyRun={...run,schedule_id:'schedule',created_at:'2026-10-22T14:00:00Z',origin:'scheduled',leads:{added:2,updated:1,unchanged:3,completeness:'known'}};body={items:[{id:'run:run',kind:'run',activity_at:historyRun.created_at,run:historyRun,occurrence:{id:'linked',state:'queued',version:1,due_at:historyRun.created_at,effective_at:historyRun.created_at}},{id:'attempt:blocked',kind:'attempt',activity_at:'2026-10-19T13:00:00Z',run:null,occurrence:{id:'blocked',state:'blocked',version:1,reason:'scope_changed'}}],next_offset:null,total:2,as_of:'2026-10-23T12:00:00Z'};}
      else if (p.endsWith('/events')) body={items:[{id:'event',action:'archive',version:2,at:'2026-10-19T12:00:00Z'}],next_offset:null};
      else if (p === '/v1/schedules/schedule') body=schedule;
      else if(p==='/v1/schedules/archived')body={...schedule,id:'archived',name:'Archived checks',archived_at:'2026-10-19T12:00:00Z'};
      else if(p==='/v1/schedules/sam-schedule')body=samSchedule;
      else if(['/v1/admin/sources','/v1/admin/geographies'].includes(p))body={items:[],total:0,next_offset:null,as_of:'2026-10-22T12:00:00Z',scope:null,basis:'Current registry'};
      else if(p==='/v1/admin/analytics')body=analyticsFixture({offset:Number(url.searchParams.get('offset')??0),sam:url.searchParams.get('target')==='sam',all:url.searchParams.get('period')==='all'});
      else if(p==='/v1/admin/history'){
        const historyRun={...run,schedule_id:url.searchParams.get('schedule')||null,schedule_name:url.searchParams.get('schedule')?'Morning checks':null,leads:{added:2,updated:1,unchanged:3,completeness:'known'},timing:{recorded_activity_ms:1800,completeness:'known'}};
        body={items:[historyRun],next_offset:null,total:1};
      }
      else if (p === '/v1/schedules') {
        const items=[...(savedSchedule ? [schedule] : []),...((process.argv.includes('--schedule-revision')||process.argv.includes('--settings-reads'))?[{...schedule,id:'long-name',name:'Automatic county acceptance — disposable 2026-10-20T13:25:00Z longunbrokenidentifier123456789012345678901234567890'}]:[]),...(samSchedule?[samSchedule]:[]),{...schedule,id:'archived',name:'Archived checks',archived_at:'2026-10-19T12:00:00Z'}].filter(s=>url.searchParams.get('lifecycle')!=='current'||!s.archived_at);
        body = {items,next_offset:null,total:items.length};
      }
      else if (p === '/v1/triggers' && req.method() === 'POST')
        body = { trigger_id: input.target_kind==='sam'?'sam-run':'run' };
      else if (p === '/v1/triggers') body = { items: [run], next_offset: null };
      else if (p === '/v1/triggers/run') {
        if(failRunRead){failRunRead=false;await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:'{}'});return;}
        body=(submittedHistory||detailClarity||process.argv.includes('--schedule-activity')||process.argv.includes('--catalog'))?{...run,schedule_id:'schedule',created_at:'2026-10-22T14:00:00Z',origin:'scheduled'}:run;
      }
      else if(p==='/v1/triggers/sam-run')body=samRun;
      else if(p==='/v1/triggers/sam-run/steps')body={items:[],next_cursor:null};
      else if(p==='/v1/requests/sam-request')body={tasks:[],jobs:[{id:'sam-job',state:'succeeded',stage:'sam_review',next_action:'View automatically saved SAM results'}],candidates:[],total_candidates:0,next_offset:null};
      else if(p==='/v1/sam/requests/sam-request/packet')body={request_id:'sam-request',category:'opportunity',publication_window:samRun.config.publication_window,records:17,run_ids:['sam-page'],terminal_confirmed:true,partial:false,canonical_writes:1,automatic:{state:'succeeded',stage:'import_verified',verified:true,added:1,updated:0,unchanged:0,exclusions:[]},candidates:[],captures:[{run_id:'sam-page',kind:'opportunities',query_url:'https://api.sam.gov/opportunities/v2/search',filters:{state:'AR',ncode:'561720'}}],next_action:'Review actual work site and dates'};
      else if (p === '/v1/triggers/run/steps')
        body = {
          items: [
            {
              id: 'step',
              sequence: 1,
              phase: 'compare',
              state: 'completed',
              county_id: '05119',
              started_at: '2026-10-19T01:00:00Z',
              finished_at: '2026-10-19T01:00:01Z',
              reason: 'unchanged_saved_hash',
              source_name:'County bids',diagnostic_id:'00000000-0000-4000-8000-000000000099',
              summary: {
                outcome:
                  'Evidence reused; missing category verification remains a gap',
              },
              usage,
            },
          ],
          next_cursor: null,
        };
      else if (p === '/v1/requests/request')
        body = {
          automatic_county: true, check_updates: false,
          tasks: [
            {
              id: 'task',
              category: 'opportunity',
              state: 'method_missing',
              location_name: 'Saline County', source_name: 'County bids', discovery_state: 'blocked',
              discovery_action: 'Source could not be verified automatically. Other sources can continue.',
              ...(countySaved?{attention:{kind:'automation',blocker:'This content format is not supported by the collector.',next_action:'View saved evidence; a developer needs to add collection support.',action_kind:'evidence'}}:{attention:{kind:'unavailable',blocker:'The website request failed or timed out.',next_action:'Retry the source check or view saved evidence.',action_kind:'retry'}}),
              reason: 'Review saved method evidence',
              pages: 1,
            },
          ],
          jobs: [{id:'saved-browser-job',state:'blocked',next_action:'Official project verification required',access_handoff_id:'saved-access',capture_state:'not_saved'}],
          candidates: [],
          total_candidates: 0,
          next_offset: null,
          ...(countySaved?{check_updates:true,automatic_import:{policy:'county-automatic-v1',state:'verified',verified:true,added:1,updated:0,unchanged:0,exclusions:[],job_ids:['county-import']},candidates:[{intake_id:'saved-county',title:'Verified county janitorial opportunity',state:'imported'}],total_candidates:1}:{}),
        };
      else if (p === '/v1/access/saved-access')
        body = {tenant:'littlerock.bonfirehub.com',next:{action:'Revalidate the expired reviewed portal recipe before hosted sign-in'},hosted:{recipe_current:false,session_current:false}};
      else if(p==='/v1/requests/request/discovery/tasks/task/packet')body={source:{name:'County bids'},pages:[{run_id:'county-page',url:'https://county.example/bids',review:'Official county listing evidence retained for verification.'}]};
      else if(p === '/v1/requests/request/tasks/task/supporting-evidence')
        body = {review:'PDF page 1: Official janitorial work scope in Little Rock. Long source text remains readable on mobile.'};
      else if (p === '/v1/requests/request/tasks/task/packet')
        body = {version:2,packet_hash:'a'.repeat(64),category:'opportunity',task_id:'task',request_id:'request',complete:true,
          portal_url:'https://littlerock.bonfirehub.com/portal/?tab=openOpportunities',
          detail_collection:{complete:true,reason:'One document still needs official access; saved evidence retained',projects:[{id:'249097',state:'captured',evidence:[{url:'https://littlerock.bonfirehub.com/docs/scope.pdf',capture_receipt:'artifacts/'+'c'.repeat(64),content_sha256:'d'.repeat(64),content_type:'application/pdf',retrieved_at:'2026-10-19T14:00:00Z',local_path:'artifacts/'+'d'.repeat(64)}]}]},
          pages:[{run_id:'listing',url:'https://littlerock.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData',review:'Saved public listing: Natural Steps Park Management; project details need verification'}],
          project_links:[{id:'249097',title:'Natural Steps Park Management',closes:'2026-11-13 16:30:00',url:'https://littlerock.bonfirehub.com/opportunities/249097',run_id:'listing',content_sha256:'b'.repeat(64)}]};
      else throw Error('Unexpected fixture route ' + p);
    } else throw Error('Unexpected external request ' + url.origin);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': '*',
      },
      body: JSON.stringify(body),
    });
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if(executionMetrics){await verifyExecutionMetrics({page,origin,out,errors,bodies});}else if(process.argv.includes('--canonical-redirect')){await verifyCanonicalRedirect({page,origin,out,errors,bodies});}else if(submittedHistory){await verifySubmittedHistoryBrowser({page,origin,out,errors,bodies});}else if(detailClarity){await verifyDetailClarityBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--metric-drilldowns')){await verifyMetricBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--catalog')){await verifyCatalogBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--schedule-activity')){await verifyScheduleActivityBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--settings-reads')){await verifySettingsReadsBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--analytics')){await verifyAnalyticsBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--schedule-revision')){await verifyScheduleRevision({page,origin,out,errors,bodies});}else{
  await page.goto(origin);
  await page.getByRole('button',{name:'Settings',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Admin',exact:true}).count(),0);
  await mkdir(out,{recursive:true});
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    const settings=page.getByRole('button',{name:'Settings',exact:true}), profile=page.getByRole('button',{name:'Profile',exact:true});
    await settings.focus(); await page.keyboard.press('Tab');
    assert.equal(await profile.evaluate(el=>el===document.activeElement),true);
    await page.getByRole('tooltip').waitFor({state:'visible'});
    assert.equal(await page.getByRole('tooltip').innerText(),user.email);
    await page.keyboard.press('Enter'); await page.getByRole('dialog',{name:'Account'}).waitFor();
    const panel=await page.getByRole('dialog',{name:'Account'}).boundingBox();
    assert.ok(panel.x>=0&&panel.x+panel.width<=width,'Account popover fits viewport');
    await page.screenshot({path:`${out}/navigation-profile-${width}.png`,fullPage:false});
    await page.keyboard.press('Escape');
    assert.equal(await profile.evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.getByRole('dialog',{name:'Account'}).count(),0);
    const header=await page.locator('.topbar').boundingBox();
    assert.ok(header.x>=0&&header.x+header.width<=width,'Header fits viewport');
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await page.screenshot({path:`${out}/navigation-200-percent.png`,fullPage:false});
  const zoomed=await page.getByRole('dialog',{name:'Account'}).boundingBox();
  assert.ok(zoomed.x>=0&&zoomed.x+zoomed.width<=1440,'Account popover fits at 200% CSS zoom');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{document.documentElement.style.zoom='';});
  let releaseAdmin;
  const adminModuleReady=new Promise(resolve=>{releaseAdmin=resolve;});
  const delayAdmin=async route=>{await adminModuleReady;await route.continue();};
  await page.route('**/src/features/admin/AdminScreen.tsx*',delayAdmin);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Loading Admin…',{exact:true}).waitFor();
  releaseAdmin();
  await page.getByRole('heading',{name:'Admin',exact:true}).waitFor();
  await page.unroute('**/src/features/admin/AdminScreen.tsx*',delayAdmin);
  assert.equal(await page.getByRole('heading',{name:'Admin',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'History / logs',exact:true}).click();
  await page.goto(origin+'/?adminView=schedules&adminSection=manual');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    await page.getByRole('heading',{name:'Admin',exact:true}).focus();
    await page.screenshot({path:`${out}/navigation-admin-${width}.png`,fullPage:false});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByText('Arkansas DHS janitorial historical solicitation', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('region', { name: 'Research context' }).count(),
    0,
  );
  const map = page.getByRole('button', {
    name: 'Arkansas County',
    exact: true,
  });
  await map.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  assert.equal(
    await page
      .getByRole('checkbox', { name: 'Ashley County', exact: true })
      .isChecked(),
    true,
  );
  assert.equal(bodies.length, 0);
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: out + '/keyboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear counties' }).click();
  await page.getByLabel('Find a county').fill('Pulaski');
  await page
    .getByRole('checkbox', { name: 'Pulaski County', exact: true })
    .check();
  await page.getByRole('button', { name: 'Run now', exact: true }).click();
  await page.getByText('Pulaski County · 2 cities').click();
  await page.getByText('Little Rock, Maumelle', { exact: true }).waitFor();
  assert.equal(bodies.filter((b) => b.path === '/v1/triggers').length, 0);
  await page.screenshot({ path: out + '/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm and run now' }).click();
  await page.getByRole('region', { name: 'Run details' }).waitFor();
  await page.getByRole('region', { name: 'Run details' }).getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Retry progress' }).click();
  await page.getByRole('region', { name: 'Saved results' }).waitFor();
  await page.getByRole('region',{name:'Saved results'}).getByText(/Source-only run/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Load official source options'}).count(),0);
  await page.getByRole('button',{name:'View source evidence'}).click();
  await page.getByRole('heading',{name:'Saved source evidence'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Review source and method'}).count(),0);
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole('button',{name:'Retry source'}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:'View source evidence'}).evaluate(el=>el===document.activeElement),true);
    await page.getByRole('region',{name:'Saved results'}).screenshot({path:`${out}/automatic-county-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Close evidence'}).click();
  countySaved=true;
  await page.getByRole('button',{name:'Refresh results',exact:true}).click();
  await page.getByRole('heading',{name:'County results save automatically'}).waitFor();
  await page.getByRole('heading',{name:'Finished — some sources need attention',exact:true}).waitFor();
  await page.getByText('Automation support needed',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Retry source',exact:true}).count(),0);
  const countyResults=page.getByRole('region',{name:'Saved results'});
  assert.equal(await countyResults.getByRole('checkbox').count(),0);
  assert.equal(await countyResults.getByText(/Prepare tested import/).count(),0);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});await countyResults.scrollIntoViewIfNeeded();
    await countyResults.getByRole('button',{name:'View leads',exact:true}).focus();
    assert.equal(await countyResults.getByRole('button',{name:'View leads',exact:true}).evaluate(el=>el===document.activeElement),true);
    await countyResults.screenshot({path:`${out}/county-automatic-saving-${width}.png`});
    await page.getByRole('heading',{name:'Finished — some sources need attention',exact:true}).screenshot({path:`${out}/source-attention-heading-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  countySaved=false;await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Refresh results',exact:true}).click();
  await page.getByText(/Source-only run/).waitFor();
  await page.getByText('Workflow details',{exact:true}).click();
  await page.getByRole('button',{name:'Check saved portal access'}).click();
  assert.equal(await page.getByRole('button',{name:'Resume saved sign-in'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Capture saved method'}).isDisabled(),true);
  await page.screenshot({ path: out + '/results.png', fullPage: true });
  await page.getByRole('button',{name:'Review captured evidence'}).click();
  await page.getByText('Current projects from this saved listing').click();
  assert.equal(await page.getByRole('link',{name:'Natural Steps Park Management'}).getAttribute('href'),'https://littlerock.bonfirehub.com/opportunities/249097');
  await page.getByLabel('Saved project or document evidence').selectOption('0');
  await page.getByText(/PDF page 1: Official janitorial work scope/).waitFor();
  await page.getByLabel('Exact project/document quotation').fill('Official janitorial work scope in Little Rock.');
  run.state='partial';
  await page.getByRole('button',{name:'Refresh progress',exact:true}).click();
  await page.getByRole('heading',{name:'Finished — some sources need attention',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Exact project/document quotation').inputValue(),'Official janitorial work scope in Little Rock.');

  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole('link',{name:'Open agency Portal'}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('link',{name:'Natural Steps Park Management'}).evaluate(el=>el===document.activeElement),true);
    await page.screenshot({path:`${out}/bonfire-review-${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button', { name: 'Close details' }).click();
  await page
    .getByRole('button', { name: 'Save schedule', exact: true })
    .click();
  await page.getByLabel('Schedule name').fill('Morning checks');
  await page.getByRole('button', { name: 'Add time' }).click();
  await page.getByLabel('Local time 2').fill('14:00');
  await page.getByRole('button', { name: 'Review schedule' }).click();
  await page.getByRole('button', { name: 'Confirm and save schedule' }).click();
  await page.getByText('Saved Morning checks — paused.').waitFor();
  assert.equal(savedSchedule, true);
  assert.equal(schedule.enabled, false);
  await page.getByRole('button',{name:'Actions for Morning checks'}).click();
  await page.getByRole('menuitem', { name: 'History for Morning checks'}).click();
  await page.getByText(/No run was created/).waitFor();
  await page.getByRole('button',{name:'More occurrences'}).click();
  await page.getByRole('button',{name:'View run',exact:true}).waitFor();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    await page.getByRole('region',{name:'Schedule history'}).scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Morning checks',exact:true}).focus();
    await page.getByRole('button',{name:'Morning checks',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.screenshot({path:`${out}/schedule-table-${width}.png`,fullPage:false});
    await page.locator('table.schedule-table').first().screenshot({path:`${out}/schedule-table-full-${width}.png`});
    const table=await page.locator('table.schedule-table').first().boundingBox();
    assert.ok(table.x>=0&&table.x+table.width<=width,'Schedule table fits viewport');
    await page.screenshot({path:`${out}/schedule-history-${width}.png`,fullPage:true});
    await page.getByRole('region',{name:'Schedule history'}).screenshot({path:`${out}/schedule-history-detail-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.getByRole('combobox',{name:/Schedule status/}).selectOption('all');
  await page.getByRole('button',{name:'Actions for Archived checks'}).click();
  await page.getByRole('menuitem', { name: 'History for Archived checks'}).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region',{name:'Schedule history'}).waitFor();
  await page.getByRole('button',{name:'Actions for Archived checks'}).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Edit Archived checks'}).isDisabled(),true);
  await page.getByRole('menuitem', { name: 'History for Archived checks'}).click();
  await page.getByRole('button',{name:'Actions for Morning checks'}).click();
  await page.getByRole('menuitem', { name: 'Go to Stats',exact:true}).click();
  await page.getByRole('region',{name:'Schedule details: Morning checks'}).getByText('Verified new leads',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Close schedule details'}).click();
  await page.setViewportSize({width:1440,height:900});
  const sam=page.getByRole('region',{name:'SAM statewide checks'});
  await sam.getByRole('button',{name:'Run SAM now'}).focus();await page.keyboard.press('Tab');
  assert.equal(await sam.getByRole('button',{name:'Save SAM schedule'}).evaluate(el=>el===document.activeElement),true);
  await sam.getByRole('button',{name:'Run SAM now'}).click();await sam.getByRole('button',{name:'Confirm SAM run'}).click();
  await page.getByText('SAM results',{exact:true}).waitFor();await page.getByText('Saved SAM evidence',{exact:false}).waitFor();
  const savedSam=page.getByRole('region',{name:'Saved results'});await savedSam.getByText('Database results verified.').waitFor();
  assert.equal(await savedSam.getByRole('button',{name:/Prepare tested import|Approve this tested import/}).count(),0);
  assert.equal(await savedSam.getByRole('checkbox').count(),0);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await savedSam.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/automatic-sam-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await page.getByRole('checkbox',{name:'Pulaski County',exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'Close details'}).click();
  await sam.getByRole('button',{name:'Save SAM schedule'}).click();
  await sam.getByLabel('Schedule name').fill('SAM weekly updates');
  await sam.getByLabel('Frequency').selectOption('weekly');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    await sam.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/sam-${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await sam.getByLabel('Frequency').selectOption('monthly');await sam.getByLabel('Day of month').fill('31');
  await sam.getByRole('button',{name:'Review SAM schedule'}).click();await sam.getByRole('button',{name:'Confirm SAM schedule'}).click();
  await sam.getByText('Saved SAM weekly updates — paused.').waitFor();assert.equal(samSchedule.enabled,false);
  // Floating row menus: three saved rows, including archived; real layout and keyboard checks.
  const statusFilter=page.getByRole('combobox',{name:/Schedule status/});
  if(await statusFilter.inputValue()!=='all')await statusFilter.selectOption('all');
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    for (const name of ['Morning checks','SAM weekly updates','Archived checks']) {
      const button=page.getByRole('button',{name:`Actions for ${name}`,exact:true});
      for (const edge of ['start','end']) {
        await button.evaluate((el,block)=>el.scrollIntoView({block}),edge);
        await button.focus();
        const bounds=()=>page.locator('table.schedule-table').first().evaluate(el=>Array.from(el.querySelectorAll('tr,td')).map(node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
        const before=await bounds();
        await button.hover();assert.equal(await page.getByRole('menu').count(),0,'Hover does not open actions');
        await page.keyboard.press(edge==='start'?'Enter':'Space');
        const menu=page.getByRole('menu',{name:`Actions for ${name}`,exact:true});await menu.waitFor();
        assert.deepEqual(await bounds(),before,'Menu does not move/resize any row or column');
        const box=await menu.boundingBox();
        assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=900,'Menu fits viewport at both edges');
        assert.equal(await menu.evaluate(el=>el.scrollWidth<=el.clientWidth&&Array.from(el.querySelectorAll('[role="menuitem"]')).every(item=>item.scrollWidth<=item.clientWidth)),true,'Menu labels wrap without clipping');
        assert.equal(await menu.getByRole('menuitem').first().evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('End');assert.equal(await menu.getByRole('menuitem').last().evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');
        await page.screenshot({path:`${out}/floating-menu-${width}-${name.split(' ')[0]}-${edge}.png`});
        await page.keyboard.press('Escape');assert.equal(await button.evaluate(el=>el===document.activeElement),true);
        await button.click();await page.keyboard.press('Tab');assert.equal(await page.getByRole('menu').count(),0);
        assert.equal(await page.getByRole('button',{name:`Run ${name} now`,exact:true}).evaluate(el=>el===document.activeElement),false,'Tab leaves the menu forward');
      }
    }
    const button=page.getByRole('button',{name:'Actions for Morning checks'});
    if(width<760){
      await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();
      await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await page.getByRole('menu').waitFor();
      await page.keyboard.press('Escape');
    }
    await button.click();await page.evaluate(()=>window.scrollBy(0,30));await page.getByRole('menu').waitFor({state:'hidden'});
    await button.click();await page.setViewportSize({width:width+1,height:900});await page.getByRole('menu').waitFor({state:'hidden'});
    await page.setViewportSize({width,height:900});
    await button.click();await page.getByRole('heading',{name:'Schedules',exact:true}).click();await page.getByRole('menu').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${out}/mobile-${width}.png`,
      fullPage: true,
    });
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    assert.equal(sizes.scroll <= sizes.width, true, JSON.stringify(sizes));
  }
  const readsBeforeReturn=queueReads;
  // Phase 3: contextual sections, saved snapshots, logs/evidence, and browser navigation.
  await page.setViewportSize({width:1440,height:900});
  const savedDetails=page.getByRole('region',{name:'Schedule details: SAM weekly updates'});
  if(await savedDetails.count())await savedDetails.getByRole('button',{name:'Close schedule details'}).click();
  await page.getByRole('button',{name:'Morning checks',exact:true}).click();
  const detail=page.getByRole('region',{name:'Schedule details: Morning checks'}),sections=detail.getByRole('navigation',{name:'Schedule sections'});
  await detail.getByRole('heading',{name:'Morning checks',exact:true}).waitFor();
  for(const label of ['Related geography','Sources','Logs','Overview / Stats','History']){
    await sections.getByRole('button',{name:label,exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).searchParams.get('adminSchedule'),'schedule');
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:900});await sections.scrollIntoViewIfNeeded();
      await page.screenshot({path:`${out}/detail-${label.replaceAll(/[^a-z]/gi,'-')}-${width}.png`,fullPage:false});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
  }
  await detail.getByText('Occurrence snapshot · version 1').click();await detail.getByText('Original Pulaski snapshot').waitFor();
  await sections.getByRole('button',{name:'Sources',exact:true}).click();
  await detail.getByRole('button',{name:'View saved source evidence',exact:true}).click();
  const runDetail=page.getByRole('region',{name:'Run details'});
  await runDetail.getByRole('heading',{name:'Finished — some sources need attention',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('adminRunSection'),'sources');
  await runDetail.getByRole('button',{name:'View source evidence',exact:true}).click();await runDetail.getByRole('heading',{name:'Saved source evidence'}).waitFor();
  await runDetail.getByRole('navigation',{name:'Run sections'}).getByRole('button',{name:'Logs',exact:true}).click();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});await runDetail.getByText('Steps · 1',{exact:true}).scrollIntoViewIfNeeded();
    await runDetail.getByText(/Diagnostic reference:/).waitFor();
    await page.screenshot({path:`${out}/detail-run-logs-${width}.png`,fullPage:false});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.goBack();await runDetail.getByRole('heading',{name:'Saved source evidence'}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('adminRunSection'),'sources');
  await page.goForward();await runDetail.getByText('Steps · 1',{exact:true}).waitFor();
  await runDetail.getByRole('button',{name:'Close details'}).click();await runDetail.waitFor({state:'hidden'});
  await detail.getByRole('button',{name:'Close schedule details'}).click();
  assert.equal(await page.getByLabel('Find a county').inputValue(),'Pulaski');
  await page.getByRole('button',{name:'History / logs',exact:true}).click();
  const globalHistory=page.getByRole('region',{name:'Run history'});await globalHistory.getByRole('button',{name:'View run',exact:true}).waitFor();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await globalHistory.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/global-history-${width}.png`,fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await globalHistory.getByRole('combobox',{name:/^Origin/}).selectOption('manual');
  await globalHistory.getByRole('button',{name:'Refresh history'}).click();
  await globalHistory.getByRole('combobox',{name:/^Schedule/}).selectOption('schedule');
  await globalHistory.getByRole('button',{name:'View schedule occurrences and changes'}).click();
  await page.getByRole('region',{name:'Schedule history'}).waitFor();
  await page.goBack();await globalHistory.waitFor();assert.equal(await globalHistory.getByRole('combobox',{name:/^Origin/}).inputValue(),'manual');
  assert.ok(bodies.every(b=>b.path!=='/v1/admin/history'),'History refresh is read-only');
  await page.reload();await page.getByRole('heading',{name:'Admin',exact:true}).waitFor();await page.getByRole('region',{name:'Run history'}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Back to contracts'}).click();
  await page.getByRole('region',{name:'Research context'}).waitFor();
  assert.ok(queueReads>readsBeforeReturn,'Returning to leads revalidates even without realtime');
  const existingQueueWidths={};
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    existingQueueWidths[width]=await page.evaluate(()=>document.documentElement.scrollWidth);
  }
  Object.assign(mapping.procurement_leads[1],{title:'Quarter-only forecast fixture',bid_type:'forecast',publication_date:null,
    contract_start_date:null,contract_current_end_date:null,contract_potential_end_date:null,response_deadline:null,planned_advertisement_period:'Q4 2026',
    payload:{title:'Quarter-only forecast fixture',bid_type:'forecast',planned_advertisement_period:'Q4 2026',source_url:'https://agency.example/forecast.pdf',business_category:'other_public',work_performance_locations:[{city_name:'Little Rock',state_code:'AR'}]}});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Back to contracts'}).click();
  await page.getByText('Quarter-only forecast fixture',{exact:false}).first().waitFor();
  await page.getByText('Q4 2026',{exact:true}).first().waitFor();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    await page.getByRole('link',{name:'Open source for Quarter-only forecast fixture'}).focus();
    await page.getByText('Q4 2026',{exact:true}).first().scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/forecast-quarter-${width}.png`,fullPage:false});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=existingQueueWidths[width],'Forecast quarter adds no document overflow to existing Leads navigation');
    const quarter=await page.getByText('Q4 2026',{exact:true}).first().boundingBox();
    assert.ok(quarter.x>=0&&quarter.x+quarter.width<=width,'Published quarter fits at mobile widths');
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(bodies.filter((b) => b.path === '/v1/triggers').length, 2);
  assert.equal(bodies.filter(b=>b.path==='/v1/triggers'&&b.input.target_kind==='sam').length,1);
  assert.equal(bodies.find(b=>b.path==='/v1/triggers'&&b.input.target_kind==='sam').input.county_ids,undefined);
  assert.equal(
    bodies.filter((b) => b.path === '/v1/triggers')[0].input.target_kind,
    'county_scope',
  );
  await writeFile(
    out + '/browser-summary.json',
    JSON.stringify(
      {
        passed: true,
        widths: [1440, 390, 320],
        keyboard: true,
        floatingActionMenus: true,
        scheduleDetailSections:true,historyContextBackForwardReload:true,runDiagnosticLogs:true,savedScopeSnapshots:true,
        scheduleHistory: true,
        archivedHistory: true,
        reviewDraftRetained: true,
        initialReadRetry: true,
        queueRefreshWithoutRealtime: true,
        forecastQuarterDisplay: true,
        existingLeadsNavigationOverflow: existingQueueWidths[390]>390,
        scopeConfirmation: true,
        manualTriggerCount: 1,
        multipleDailyTimes: true,
        scheduleDefaultPaused: true,
        productionMutations: 0,
        pageErrors: errors,
        screenshots: [
          'desktop.png',
          'keyboard.png',
          'results.png',
          'mobile-390.png',
          'mobile-320.png',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'Browser acceptance passed: desktop, 390px, 320px, keyboard, confirmed manual run, paused multiple-time schedule; zero production mutations.',
  );
  }
} catch(error) {
  if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:`${out}/acceptance-failure.png`,fullPage:false});console.error((await page.locator('body').innerText()).slice(0,6000));}}
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
