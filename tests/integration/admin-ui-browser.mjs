/* global localStorage, window, document, innerWidth */
// Local browser acceptance: real app/auth client, intercepted fixture HTTP, no production mutations.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5181',
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
const bodies = [];
let savedSchedule = false;
let failRunRead = true;
let queueReads = 0;
let samSchedule = null;
const samRun={...run,id:'sam-run',state:'completed',next_action:'View automatically saved leads',target_kind:'sam',county_count:0,config:{target_kind:'sam',requested_categories:['opportunity'],publication_window:{from:'2026-09-20',to:'2026-10-19'}},children:[{request_id:'sam-request',county_id:null,role:'sam'}]};
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5181',
    '--strictPort',
  ],
  { stdio: 'ignore', windowsHide: true, env:{...process.env,VITE_PROCUREMENT_API_URL:'https://janitorial-procurement-backend.onrender.com'} },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Server still starting. */
    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw Error('Local Vite start timed out');
  }
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
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
          })),
        };
      else if (p === '/v1/state-triggers')
        body = {
          items: [
            {
              id: 'state',
              name: 'State procurement',
              source_id: 'state-source',
              category: 'opportunity',
              county_ids: ['05119'],
              schedule_id: null,
              schedule_enabled: false,
              next_due_at: null,
              last_finished_at: null,
            },
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
      } else if (p.endsWith('/occurrences') && url.searchParams.has('offset')) body={items:[{id:'linked',due_at:'2026-10-19T12:00:00Z',state:'queued',trigger_id:'run'}],next_offset:null};
      else if (p.endsWith('/occurrences')) body={items:[{id:'blocked',due_at:'2026-10-19T12:00:00Z',state:'blocked',reason:'scope_changed',missed_from:'2026-10-18T12:00:00Z',missed_through:'2026-10-19T12:00:00Z'}],next_offset:1};
      else if (p.endsWith('/events')) body={items:[{id:'event',action:'archive',version:2,at:'2026-10-19T12:00:00Z'}],next_offset:null};
      else if (p === '/v1/schedules')
        body = { items: [...(savedSchedule ? [schedule] : []),...(samSchedule?[samSchedule]:[]),{...schedule,id:'archived',name:'Archived checks',archived_at:'2026-10-19T12:00:00Z'}], next_offset: null };
      else if (p === '/v1/triggers' && req.method() === 'POST')
        body = { trigger_id: input.target_kind==='sam'?'sam-run':'run' };
      else if (p === '/v1/triggers') body = { items: [run], next_offset: null };
      else if (p === '/v1/triggers/run') {
        if(failRunRead){failRunRead=false;await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:'{}'});return;}
        body=run;
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
          tasks: [
            {
              id: 'task',
              category: 'opportunity',
              state: 'method_missing',
              reason: 'Review saved method evidence',
              pages: 1,
            },
          ],
          jobs: [{id:'saved-browser-job',state:'blocked',next_action:'Official project verification required',access_handoff_id:'saved-access',capture_state:'not_saved'}],
          candidates: [],
          total_candidates: 0,
          next_offset: null,
        };
      else if (p === '/v1/access/saved-access')
        body = {tenant:'littlerock.bonfirehub.com',next:{action:'Revalidate the expired reviewed portal recipe before hosted sign-in'},hosted:{recipe_current:false,session_current:false}};
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
  await page.goto(origin);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByText('State procurement', { exact: true }).waitFor();
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
  await page.getByRole('heading',{name:'Partial',exact:true}).waitFor();
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
  await page.getByRole('button',{name:'History for Morning checks'}).click();
  await page.getByText(/No run was created/).waitFor();
  await page.getByRole('button',{name:'More occurrences'}).click();
  await page.getByRole('button',{name:'View run',exact:true}).waitFor();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    await page.getByRole('region',{name:'Schedule history'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/schedule-history-${width}.png`,fullPage:true});
    await page.getByRole('region',{name:'Schedule history'}).screenshot({path:`${out}/schedule-history-detail-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.getByRole('checkbox',{name:'Show archived schedules'}).check();
  await page.getByRole('button',{name:'History for Archived checks'}).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region',{name:'Schedule history'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit Archived checks'}).isDisabled(),true);
  await page.getByRole('button',{name:'History for Archived checks'}).click();
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
  await page.getByRole('button',{name:'Back to contracts'}).click();
  await page.getByRole('region',{name:'Research context'}).waitFor();
  assert.ok(queueReads>readsBeforeReturn,'Returning to leads revalidates even without realtime');
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
        scheduleHistory: true,
        archivedHistory: true,
        reviewDraftRetained: true,
        initialReadRetry: true,
        queueRefreshWithoutRealtime: true,
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
} finally {
  await browser?.close();
  server.kill();
}
