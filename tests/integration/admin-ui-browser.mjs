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
      if (url.pathname.includes('procurement_queue_page'))
        body = {
          rows: [mapping.procurement_leads[1]],
          total: 1,
          counts: { new: 1 },
        };
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
        savedSchedule = true;
        Object.assign(schedule, input);
        body = schedule;
      } else if (p === '/v1/schedules')
        body = { items: savedSchedule ? [schedule] : [], next_offset: null };
      else if (p === '/v1/triggers' && req.method() === 'POST')
        body = { trigger_id: 'run' };
      else if (p === '/v1/triggers') body = { items: [run], next_offset: null };
      else if (p === '/v1/triggers/run') body = run;
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
          jobs: [],
          candidates: [],
          total_candidates: 0,
          next_offset: null,
        };
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
  await page.getByRole('region', { name: 'Saved results' }).waitFor();
  await page.screenshot({ path: out + '/results.png', fullPage: true });
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
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(bodies.filter((b) => b.path === '/v1/triggers').length, 1);
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
