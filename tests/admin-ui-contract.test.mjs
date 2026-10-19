import {reviewedDiscoverySource} from '../scripts/lib/hosted-discovery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { hostedWorkflow } from '../scripts/lib/hosted-workflow.mjs';
import { workflowServer } from '../scripts/lib/workflow-http.mjs';
import { context, id } from './helpers/known-workflow.mjs';
import { makeInterpretationPacket } from '../scripts/lib/known-source-workflow.mjs';
function service() {
  const ctx = context(),
    packet = makeInterpretationPacket(ctx),
    old = {
      reason: 'Prior reviewed exclusion',
      evidence: [
        {
          run_id: id(5),
          locator: 'table 1',
          excerpt: '24-17 Janitorial services',
        },
      ],
    };
  let reserved;
  const current = {
    id: id(90),
    packet_hash: packet.packet_hash,
    is_current: true,
    result: {
      findings: [],
      exclusions: [old],
      unresolved: [],
      supporting_secret: 'private-artifact',
    },
  };
  const values = {
    procurement_search_requests: [ctx.request],
    procurement_coverage_tasks: [ctx.task],
    procurement_request_targets: [
      { id: ctx.task.target_id, search_request_id: ctx.request.id },
    ],
    procurement_jobs: [ctx.job],
    procurement_sources: [
      {
        ...ctx.source,
        url: 'https://example.gov/bids',
        config: { private: 'secret' },
      },
    ],
    procurement_source_capabilities: [ctx.capability],
    procurement_runs: ctx.runs,
    procurement_public_captures: ctx.captures,
    procurement_interpretations: [current],
    procurement_request_sources: [{ source_id: ctx.source.id }],
  };
  const db = {
    from(table) {
      let single = false;
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        range: () => q,
        maybeSingle() {
          single = true;
          return q;
        },
        then(resolve) {
          resolve({
            data: single ? values[table]?.[0] : (values[table] ?? []),
          });
        },
      };
      return q;
    },
    async rpc(name, args) {
      if (name === 'reserve_procurement_interpretation') {
        reserved = args.p_result;
        return {
          data: { id: id(91), revision: 2, staging_receipt: { inserted: 0 } },
        };
      }
      if (name === 'finalize_procurement_interpretation')
        return { data: { staging_receipt: { inserted: 0 } } };
      throw Error('Unexpected RPC');
    },
  };
  return {
    workflow: hostedWorkflow({ db }),
    packet,
    current,
    get reserved() {
      return reserved;
    },
  };
}
test('packet readback exposes safe review revision/counts; append preserves prior evidence and rejects stale revisions', async () => {
  const fixture = service(),
    w = fixture.workflow,
    p = await w.packet(id(1), id(3));
  assert.deepEqual(p.current_interpretation, {
    id: id(90),
    packet_hash: p.packet_hash,
    counts: { findings: 0, exclusions: 1, unresolved: 0 },
  });
  assert.equal(JSON.stringify(p).includes('private-artifact'), false);
  const review = {
    version: 1,
    packet_hash: p.packet_hash,
    append_to_current: true,
    supersedes_id: id(90),
    reviewed_scope: 'Additional evidence',
    coverage: 'partial',
    findings: [],
    exclusions: [],
    unresolved: [
      {
        reason: 'Needs date evidence',
        evidence: [
          {
            run_id: id(5),
            locator: 'table 1 row 1',
            excerpt: '24-17 Janitorial services',
          },
        ],
      },
    ],
  };
  await w.interpret(id(1), id(3), review, id(88));
  assert.equal(fixture.reserved.exclusions.length, 1);
  assert.equal(fixture.reserved.unresolved.length, 1);
  assert.equal(fixture.reserved.reviewed_by, id(88));
  await assert.rejects(
    w.interpret(id(1), id(3), { ...review, supersedes_id: id(99) }, id(88)),
    /Review changed/,
  );
});
async function call(server, path, headers = {}) {
  const req = Readable.from([]);
  Object.assign(req, { url: path, method: 'GET', headers });
  return new Promise((resolve) =>
    server.emit('request', req, {
      setHeader() {},
      writeHead(status) {
        this.status = status;
      },
      end(text) {
        resolve({ status: this.status, data: JSON.parse(text) });
      },
    }),
  );
}
test('Admin policy and official seed options are authenticated, bounded and do not expose configuration secrets', async () => {
  const recorded = [],
    server = workflowServer({
      authenticate: async () => ({ id: id(88) }),
      workflow: {
        sourceOptions: async (...a) => {
          recorded.push(a);
          return {
            items: [
              {
                id: id(2),
                name: 'Official agency',
                url: 'https://example.gov',
              },
            ],
            next_offset: null,
          };
        },
      },
      schedules: { status: async () => ({ enabled: true }) },
      schedulerKey: 'private-key-that-is-longer-than-thirty-two',
      aiPolicy: { enabled: true, monthlyUsd: 10, apiKey: 'never-return' },
    });
  const auth = { authorization: 'Bearer fixture' };
  assert.equal(
    (await call(server, `/v1/requests/${id(1)}/sources`)).status,
    401,
  );
  const options = await call(
    server,
    `/v1/requests/${id(1)}/sources?offset=2&limit=3`,
    auth,
  );
  assert.equal(options.status, 200);
  assert.deepEqual(recorded, [[id(1), { offset: 2, limit: 3 }]]);
  assert.equal(
    (await call(server, `/v1/requests/${id(1)}/sources?limit=101`, auth))
      .status,
    400,
  );
  const status = await call(server, '/v1/scheduler/status', auth);
  assert.deepEqual(status.data.ai_policy, { enabled: true, monthly_usd: 10 });
  assert.equal(JSON.stringify(status).includes('private-key'), false);
  assert.equal(JSON.stringify(status).includes('never-return'), false);
  server.close();
});

test('missing-source review reuses only an associated official seed and preserves registered task identity',()=>{
 const source={id:id(2),code:'official'},other={id:id(3),code:'other'},sources=[source,other],associations=[{source_id:source.id}];
 assert.equal(reviewedDiscoverySource({source_id:null},{existing_id:source.id,code:'official'},sources,associations),source);
 assert.equal(reviewedDiscoverySource({source_id:source.id},{code:'official'},sources,[]),source);
 assert.equal(reviewedDiscoverySource({source_id:null},{code:'new'},sources,associations),undefined);
 assert.throws(()=>reviewedDiscoverySource({source_id:source.id},{existing_id:other.id,code:'other'},sources,associations),/Do not replace/);
 assert.throws(()=>reviewedDiscoverySource({source_id:null},{existing_id:other.id,code:'other'},sources,associations),/belong to this request/);
 assert.throws(()=>reviewedDiscoverySource({source_id:null},{existing_id:source.id,code:'wrong'},sources,associations),/belong to this request/);
});
import {countyTriggers} from '../scripts/lib/county-triggers.mjs';
test('activity aggregates distinct counts/usage by run and bounds large relationship filters',async()=>{
 const requestIds=Array.from({length:101},(_,i)=>id(200+i)),filters=[];
 const records={procurement_triggers:[{id:id(1),target_kind:'county_scope',state:'needs_review',created_at:'2026-10-18T12:00:00Z',origin:'scheduled',schedule_id:id(2),config:{county_ids:['05119'],private:'not projected'}}],procurement_schedules:[{id:id(2),name:'Morning'}],procurement_trigger_requests:requestIds.map(request_id=>({trigger_id:id(1),request_id})),procurement_request_targets:requestIds.map((search_request_id,i)=>({id:id(400+i),search_request_id})),procurement_coverage_tasks:requestIds.map((_,i)=>({target_id:id(400+i),evidence:{run_ids:[id(999)]}})),procurement_interpretations:[{request_id:requestIds[0],is_current:true,staging_receipt:{intake_ids:['one','two']}},{request_id:requestIds[1],is_current:true,staging_receipt:{intake_ids:['one']}},{request_id:requestIds[2],is_current:false,staging_receipt:{intake_ids:['old']}}],procurement_usage_ledger:[{trigger_id:id(1),state:'completed',actual_usd:.01,usage:{input_tokens:10,output_tokens:5}}]};
 const db={from(table){let data=records[table]??[];const q={select:()=>q,order:()=>q,in(k,ids){filters.push(ids.length);data=data.filter(r=>ids.includes(r[k]));return q;},eq(k,v){data=data.filter(r=>r[k]===v);return q;},range(a,b){data=data.slice(a,b+1);return q;},then(resolve){resolve({data});}};return q;}};
 const page=await countyTriggers({db}).list();assert.equal(page.items[0].candidate_count,2);assert.equal(page.items[0].evidence_count,1);assert.equal(page.items[0].schedule_name,'Morning');assert.equal(page.items[0].usage.input_tokens,10);assert.equal(page.items[0].usage.actual_usd,.01);assert.equal(JSON.stringify(page).includes('not projected'),false);assert.ok(Math.max(...filters)<=100);assert.ok(filters.filter(n=>n===100).length>=3);
});
