import { useState } from 'react';
import type { Packet, Task } from './types';
export function SourceReview({
  packet,
  task,
  onSave,
  busy,
}: {
  packet: Packet;
  task: Task;
  onSave: (body: unknown) => void;
  busy: boolean;
}) {
  const [newSource, setNewSource] = useState(false);
  const [page, setPage] = useState(0),
    [name, setName] = useState(packet.source?.name ?? ''),
    [code, setCode] = useState(packet.source?.code ?? ''),
    [quote, setQuote] = useState(''),
    [instructions, setInstructions] = useState(''),
    [terminal, setTerminal] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [assess, setAssess] = useState<Record<string, string>>({
      portal: 'unknown',
      api: 'unknown',
    });
  const p = packet.pages?.[page];
  if (packet.registration_verified)
    return (
      <div>
        <h3>Source method saved and verified</h3>
        <p>
          {packet.source?.name} - {packet.source?.url}
        </p>
        <p>
          Registry readback confirmed. Review the captured category evidence
          next.
        </p>
      </div>
    );
  if (!p)
    return (
      <p>
        {packet.next_action ||
          'Saved official evidence is required before a method can be verified.'}
      </p>
    );
  const save = () => {
    const url = p.url,
      requirements = {
        public: 'unknown',
        account: 'unknown',
        approval: 'unknown',
        api_key: 'unknown',
        payment: 'unknown',
      };
    onSave({
      task_id: task.id,
      packet_hash: packet.packet_hash,
      sourceSpec: {
        local_key: 'source',
        existing_id: !newSource ? packet.source?.id : undefined,
        code,
        name,
        agency: name,
        provider: new URL(url).hostname,
        url: !newSource ? (packet.source?.url ?? url) : url,
        geo_level: !newSource
          ? (packet.source?.contracting_entity_geo_level ?? 'county')
          : packet.route_geography_id === '05'
            ? 'state'
            : 'county',
        business_category: packet.source?.business_category ?? 'other_public',
        identity_evidence: quote,
      },
      capability: {
        kind: task.category,
        route_geography_id: packet.route_geography_id,
        method: 'browser',
        parser_version: 'reviewed-public-page-v1',
        official_entry_url: !newSource ? (packet.source?.url ?? url) : url,
        endpoint_url: url,
        method_spec: {
          version: 1,
          runner_id: 'public-fetch',
          check_when: 'each_request',
          urls: [url],
          allowed_hosts: [new URL(url).hostname],
          max_bytes: 2000000,
        },
      },
      category_evidence: [{ run_id: p.run_id, excerpt: quote }],
      check_instructions: instructions,
      terminal_instruction: terminal,
      handoffs: ['portal', 'api'].map((channel) => ({
        source_id: packet.seed_source_id,
        channel,
        tenant: new URL(url).hostname,
        checked_on: new Date().toISOString().slice(0, 10),
        access_state: assess[channel],
        next_actor: 'researcher',
        next_action:
          assess[channel] === 'public'
            ? 'Reuse reviewed public evidence'
            : 'Review saved access requirements before proceeding',
        evidence_urls: [url],
        requirements:
          assess[channel] === 'public'
            ? {
                ...requirements,
                public: 'yes',
                account: 'no',
                approval: 'no',
                api_key: 'no',
                payment: 'no',
              }
            : requirements,
        categories: {
          forecast: 'unknown',
          opportunity: 'unknown',
          award: 'unknown',
          [task.category]: 'yes',
        },
      })),
    });
  };
  return (
    <div className="admin-review-form">
      <h3>Review source and method</h3>
      {packet.source && !task.source_id && (
        <label>
          <input
            type="checkbox"
            checked={newSource}
            onChange={(e) => {
              setNewSource(e.target.checked);
              setCode(e.target.checked ? '' : packet.source!.code);
              setName(e.target.checked ? '' : packet.source!.name);
              setConfirmed(false);
            }}
          />{' '}
          This captured page identifies a different source.
        </label>
      )}
      <p>
        {packet.source && !newSource
          ? 'Existing registration — verify its method without creating a duplicate.'
          : 'New source — confirm its official identity.'}
      </p>
      <label>
        Official captured page
        <select
          value={page}
          onChange={(e) => {
            setPage(Number(e.target.value));
            setQuote('');
            setConfirmed(false);
          }}
        >
          {packet.pages.map((p, i) => (
            <option key={p.run_id} value={i}>
              {p.url}
            </option>
          ))}
        </select>
      </label>
      <pre className="admin-evidence">{p.review}</pre>
      <label>
        Source name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Source code
        <input
          value={code}
          readOnly={!!packet.source && !newSource}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <label>
        Exact category/identity quotation
        <textarea value={quote} onChange={(e) => setQuote(e.target.value)} />
      </label>
      <label>
        How to check this source
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label>
        How to confirm the listing is complete
        <textarea
          value={terminal}
          onChange={(e) => setTerminal(e.target.value)}
        />
      </label>
      {['portal', 'api'].map((k) => (
        <label key={k}>
          {k === 'portal' ? 'Portal' : 'API'} assessment
          <select
            value={assess[k]}
            onChange={(e) => setAssess({ ...assess, [k]: e.target.value })}
          >
            <option value="unknown">Unknown — keep an access gap</option>
            <option value="public">
              Verified public; no account/key/payment needed
            </option>
          </select>
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        I reviewed the official identity, category quotation, instructions and
        both access assessments.
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={
          busy ||
          !confirmed ||
          !name ||
          !code ||
          !quote.trim() ||
          !p.review.includes(quote) ||
          !instructions.trim() ||
          !terminal.trim()
        }
        onClick={save}
      >
        Save reviewed source method
      </button>
      <p className="admin-hint">
        Saved only after native rehearsal and registry readback. A discovered
        URL alone is not verified coverage.
      </p>
    </div>
  );
}
