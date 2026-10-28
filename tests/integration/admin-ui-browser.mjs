import {verifyIntegratedAdmin} from './integrated-admin-browser.mjs';
import {verifyExecutionMetrics} from './execution-metrics-browser.mjs';
import {verifyCanonicalRedirect} from './canonical-redirect-browser.mjs';
import {verifySubmittedHistoryBrowser} from './submitted-history-browser.mjs';
import {verifyDetailClarityBrowser} from './detail-clarity-browser.mjs';
import {verifyMetricBrowser} from './metric-drilldown-browser.mjs';
import {verifyCatalogBrowser} from './catalog-browser.mjs';
import {verifyScheduleActivityBrowser} from './schedule-activity-browser.mjs';
import {verifySettingsReadsBrowser} from './settings-reads-browser.mjs';
import {verifySourceResolutionBrowser} from './source-resolution-browser.mjs';
/* global localStorage */
// Local browser acceptance: real app/auth client, intercepted fixture HTTP, no production mutations.
import {verifyScheduleRevision} from './schedule-revision-browser.mjs';
import {verifyAnalyticsBrowser} from './analytics-browser.mjs';
import {analyticsFixture} from '../helpers/analytics-fixture.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
if(process.argv.includes('--scheduling-release')){
  await import('./scheduling-preview-browser.mjs');
  process.exit(0);
}
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
let samSchedule = null;
const samRun={...run,id:'sam-run',state:'completed',next_action:'View automatically saved leads',target_kind:'sam',county_count:0,config:{target_kind:'sam',requested_categories:['opportunity'],publication_window:{from:'2026-09-20',to:'2026-10-19'}},children:[{request_id:'sam-request',county_id:null,role:'sam'}]};
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    ...(process.argv.includes('--built')||process.argv.includes('--source-resolution')?['preview']:[]),
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
        body = {
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
      if (p === '/v1/capabilities')body={role:'admin',manage_schedules:true,manage_sources:true,technical_details:true};
      else if (p === '/v1/counties')
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
  if(process.argv.includes('--source-resolution'))await verifySourceResolutionBrowser({page,origin,out,errors});else
  if(executionMetrics){await verifyExecutionMetrics({page,origin,out,errors,bodies});}else if(process.argv.includes('--canonical-redirect')){await verifyCanonicalRedirect({page,origin,out,errors,bodies});}else if(submittedHistory){await verifySubmittedHistoryBrowser({page,origin,out,errors,bodies});}else if(detailClarity){await verifyDetailClarityBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--metric-drilldowns')){await verifyMetricBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--catalog')){await verifyCatalogBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--schedule-activity')){await verifyScheduleActivityBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--settings-reads')){await verifySettingsReadsBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--analytics')){await verifyAnalyticsBrowser({page,origin,out,errors,bodies});}else if(process.argv.includes('--schedule-revision')){await verifyScheduleRevision({page,origin,out,errors,bodies});}else{await verifyIntegratedAdmin({page,origin,out,errors,bodies});}

} catch(error) {
  if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:`${out}/acceptance-failure.png`,fullPage:false});console.error((await page.locator('body').innerText()).slice(0,6000));}}
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
