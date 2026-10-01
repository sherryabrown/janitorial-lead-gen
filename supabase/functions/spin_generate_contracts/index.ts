import { createClient } from 'npm:@supabase/supabase-js@2';

type GenerateRequest = {
  city?: string;
  zip?: string;
  county?: string;
};

type GeographyRow = {
  id?: string;
  city?: string | null;
  county?: string | null;
  zip_code?: string | null;
  state_code?: string | null;
  [key: string]: unknown;
};

type SourceRow = {
  id: string;
  geography_id?: string | null;
  entity_name: string;
  entity_type: string;
  county?: string | null;
  state_code: string;
  portal_type: string;
  bids_url?: string | null;
  awards_url?: string | null;
  forecast_url?: string | null;
  access: string;
  confidence: 'high' | 'medium' | 'low';
  needs_human_review: boolean;
  verification_status: string;
  verification_note?: string | null;
  found_by: string;
  raw_registry?: Record<string, unknown>;
};

type RegistryEntity = {
  entity_name?: string;
  entity_type?: string;
  county?: string | null;
  official_site?: string | null;
  portal_type?: string;
  bids_url?: string | null;
  awards_url?: string | null;
  forecast_url?: string | null;
  access?: string;
  confidence?: 'high' | 'medium' | 'low';
  needs_human_review?: boolean;
  notes?: string;
};

type CapturedOpportunity = {
  project_name: string;
  agency_name: string;
  category: 'School' | 'Government' | 'Medical';
  location?: string | null;
  contact_name?: string | null;
  due_at?: string | null;
  expires_at?: string | null;
  estimated_value?: string | null;
  source_url?: string | null;
  external_id?: string | null;
  content_hash: string;
  summary?: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const procurementTerms = [
  'bid',
  'bids',
  'procurement',
  'purchasing',
  'solicitation',
  'rfp',
  'rfq',
  'awarded',
  'contract',
  'vendor',
  'ionwave',
  'ariba',
  'bidnet',
  'bonfire',
  'opengov',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: 'failed', stage: 'received', message: 'POST required' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = readSupabaseSecretKey();
  if (!supabaseUrl || !serviceKey) {
    return json(
      {
        status: 'failed',
        stage: 'configuration',
        message: 'SUPABASE_SECRET_KEYS is required for contract generation.',
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = (await req.json().catch(() => ({}))) as GenerateRequest;
  const input = normalizeInput(body);
  if (!input.city && !input.zip && !input.county) {
    return json({ status: 'failed', stage: 'validation', message: 'Enter a city, ZIP, or county.' }, 400);
  }

  let runId: string | undefined;

  try {
    const geography = await findGeography(supabase, input);
    if (!geography) {
      return json({
        status: 'failed',
        stage: 'geography_lookup',
        message: 'No Arkansas geography match found.',
      }, 404);
    }

    const normalizedLocation = formatLocation(geography, input);
    const { data: run, error: runError } = await supabase
      .from('spin_contract_generation_runs')
      .insert({
        geography_id: getGeographyId(geography),
        input_city: input.city || null,
        input_zip: input.zip || null,
        input_county: input.county || null,
        normalized_location: normalizedLocation,
        status: 'running',
        stage: 'checking_sources',
      })
      .select('id')
      .single();

    if (runError) throw runError;
    runId = run.id;

    const existingSources = await loadSources(supabase, geography, input);
    const checkedSources = await verifySources(existingSources);
    await persistSourceChecks(supabase, checkedSources);

    const needsDiscovery =
      checkedSources.length === 0 ||
      checkedSources.some((source) => source.needs_human_review || source.verification_status !== 'current');

    let sourceRows = checkedSources;
    if (needsDiscovery) {
      await updateRun(supabase, runId, { stage: 'finding_sources' });
      const discovered = await discoverSourcesWithAnthropic(geography, input, checkedSources);
      if (discovered.length > 0) {
        sourceRows = await upsertDiscoveredSources(supabase, geography, discovered);
      }
    }

    await updateRun(supabase, runId, { stage: 'capturing_contracts' });
    const opportunities = await captureOpportunities(supabase, geography, sourceRows);
    const finalStatus = sourceRows.some((source) => source.needs_human_review) ? 'needs-review' : 'completed';

    await updateRun(supabase, runId, {
      status: finalStatus,
      stage: 'completed',
      source_count: sourceRows.length,
      opportunity_count: opportunities.length,
      completed_at: new Date().toISOString(),
    });

    return json({
      runId,
      status: finalStatus,
      stage: 'completed',
      normalizedLocation,
      sources: sourceRows.map(toSourceResponse),
      opportunities: opportunities.map(toOpportunityResponse),
      message:
        opportunities.length > 0
          ? `${opportunities.length} new contract opportunity${opportunities.length === 1 ? '' : 'ies'} found.`
          : 'Sources checked. No new open contracts were captured.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Contract generation failed.';
    if (runId) {
      await updateRun(supabase, runId, {
        status: 'failed',
        stage: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      });
    }
    return json({ runId, status: 'failed', stage: 'failed', sources: [], opportunities: [], message }, 500);
  }
});

function readSupabaseSecretKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!secretKeys) return undefined;

  try {
    const parsed: unknown = JSON.parse(secretKeys);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const keys = parsed as Record<string, unknown>;
    const key = keys.default ?? Object.values(keys)[0];
    return typeof key === 'string' && key.trim() ? key : undefined;
  } catch {
    return undefined;
  }
}

function normalizeInput(body: GenerateRequest) {
  return {
    city: clean(body.city),
    zip: clean(body.zip),
    county: clean(body.county)?.replace(/\s+county$/i, ''),
  };
}

function clean(value?: string) {
  const next = value?.trim().replace(/\s+/g, ' ');
  return next || undefined;
}

async function findGeography(supabase: ReturnType<typeof createClient>, input: ReturnType<typeof normalizeInput>) {
  let query = supabase.from('spin_geography').select('*').limit(5);
  if (input.zip) query = query.eq('zip_code', input.zip);
  if (input.city) query = query.ilike('city', input.city);
  if (input.county) query = query.ilike('county', `%${input.county}%`);
  const { data, error } = await query;
  if (error) throw error;
  const arkansasRows = ((data ?? []) as GeographyRow[]).filter((row) => {
    const state = String(row.state_code ?? row.state ?? 'AR').toUpperCase();
    return state === 'AR' || state === 'ARKANSAS';
  });
  return arkansasRows[0] ?? null;
}

async function loadSources(
  supabase: ReturnType<typeof createClient>,
  geography: GeographyRow,
  input: ReturnType<typeof normalizeInput>,
) {
  const county = String(geography.county ?? input.county ?? '').replace(/\s+County$/i, '');
  const filters = [];
  const geographyId = getGeographyId(geography);
  if (geographyId) filters.push(`geography_id.eq.${geographyId}`);
  if (county) filters.push(`county.ilike.%${county}%`);
  if (filters.length === 0) return [];
  const { data, error } = await supabase
    .from('spin_procurement_sources')
    .select('*')
    .or(filters.join(','));
  if (error) throw error;
  return (data ?? []) as SourceRow[];
}

async function verifySources(sources: SourceRow[]) {
  const checked: SourceRow[] = [];
  for (const source of sources) {
    const urls = [source.bids_url, source.awards_url, source.forecast_url].filter(Boolean) as string[];
    const results = await Promise.all(urls.map((url) => verifyUrl(url)));
    const best = results.find((result) => result.status === 'current') ?? results[0];
    checked.push({
      ...source,
      confidence: best?.confidence ?? source.confidence ?? 'low',
      needs_human_review: best ? best.needsHumanReview : true,
      verification_status: best?.status ?? 'needs-review',
      verification_note: best?.note ?? 'No URL available to verify.',
    });
  }
  return checked;
}

async function verifyUrl(url: string) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return { status: 'invalid', confidence: 'low' as const, needsHumanReview: true, note: 'Unsupported URL.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch(normalized, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Spin Contract Monitor/0.1' },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const readable = response.ok && (/html|text|json|pdf/i.test(contentType) || contentType === '');
    let text = '';
    if (readable && !/pdf/i.test(contentType)) {
      text = (await response.text()).slice(0, 8000).toLowerCase();
    }
    const looksLikeProcurement = procurementTerms.some((term) => text.includes(term));
    const status = readable && (looksLikeProcurement || /pdf/i.test(contentType)) ? 'current' : 'needs-review';
    return {
      status,
      confidence: status === 'current' ? ('high' as const) : ('medium' as const),
      needsHumanReview: status !== 'current',
      note: `${response.status} ${contentType || 'unknown content type'}${looksLikeProcurement ? '; procurement terms found' : ''}`,
    };
  } catch (error) {
    return {
      status: 'needs-review',
      confidence: 'low' as const,
      needsHumanReview: true,
      note: error instanceof Error ? error.message : 'Fetch failed.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistSourceChecks(supabase: ReturnType<typeof createClient>, sources: SourceRow[]) {
  for (const source of sources) {
    await supabase
      .from('spin_procurement_sources')
      .update({
        confidence: source.confidence,
        needs_human_review: source.needs_human_review,
        verification_status: source.verification_status,
        verification_note: source.verification_note,
        last_checked_at: new Date().toISOString(),
        last_verified_at: source.verification_status === 'current' ? new Date().toISOString() : null,
      })
      .eq('id', source.id);
  }
}

async function discoverSourcesWithAnthropic(
  geography: GeographyRow,
  input: ReturnType<typeof normalizeInput>,
  existingSources: SourceRow[],
) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return [];

  const prompt = await Deno.readTextFile(
    new URL('./prompts/procurement-bid-site-finder.md', import.meta.url),
  );
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-20250514';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 5000,
      system: prompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Find and verify Arkansas public procurement bid, award, and forecast URLs.',
            geography,
            input,
            existing_registry: existingSources,
            output: 'Return only JSON matching arkansas-bid-registry.json from the prompt.',
          }),
        },
      ],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    }),
  });

  if (!response.ok) return [];
  const payload = await response.json();
  const text = extractAnthropicText(payload);
  const parsed = parseJsonFromText(text);
  return Array.isArray(parsed?.entities) ? (parsed.entities as RegistryEntity[]) : [];
}

function extractAnthropicText(payload: { content?: Array<{ type: string; text?: string }> }) {
  return payload.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n') ?? '';
}

function parseJsonFromText(text: string) {
  const cleanText = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
  try {
    return JSON.parse(cleanText);
  } catch {
    const match = cleanText.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

async function upsertDiscoveredSources(
  supabase: ReturnType<typeof createClient>,
  geography: GeographyRow,
  entities: RegistryEntity[],
) {
  const validRows = [];
  for (const entity of entities) {
    if (!entity.entity_name) continue;
    const bidsUrl = normalizeUrl(entity.bids_url ?? undefined);
    const awardsUrl = normalizeUrl(entity.awards_url ?? undefined);
    const forecastUrl = normalizeUrl(entity.forecast_url ?? undefined);
    if (!bidsUrl && !awardsUrl && !forecastUrl) continue;
    const verification = await verifyUrl(bidsUrl ?? awardsUrl ?? forecastUrl ?? '');
    validRows.push({
      geography_id: getGeographyId(geography),
      entity_name: entity.entity_name,
      entity_type: entity.entity_type ?? 'other',
      county: entity.county ?? geography.county ?? null,
      state_code: 'AR',
      portal_type: entity.portal_type ?? 'unknown',
      bids_url: bidsUrl,
      awards_url: awardsUrl,
      forecast_url: forecastUrl,
      access: entity.access ?? 'public',
      confidence: verification.confidence,
      needs_human_review: verification.needsHumanReview || entity.needs_human_review === true,
      verification_status: verification.status,
      verification_note: entity.notes ?? verification.note,
      found_by: 'anthropic',
      last_checked_at: new Date().toISOString(),
      last_verified_at: verification.status === 'current' ? new Date().toISOString() : null,
      raw_registry: entity,
    });
  }

  if (validRows.length === 0) return [];
  const { data, error } = await supabase
    .from('spin_procurement_sources')
    .upsert(validRows, { onConflict: 'entity_name,county' })
    .select('*');
  if (error) throw error;
  return (data ?? []) as SourceRow[];
}

async function captureOpportunities(
  supabase: ReturnType<typeof createClient>,
  geography: GeographyRow,
  sources: SourceRow[],
) {
  const captured: CapturedOpportunity[] = [];
  for (const source of sources) {
    if (source.verification_status !== 'current' || !source.bids_url) continue;
    const html = await fetchText(source.bids_url);
    const opportunities = extractOpportunitiesFromHtml(html, source);
    for (const opportunity of opportunities) {
      const row = {
        ...opportunity,
        source_id: source.id,
        geography_id: getGeographyId(geography),
        status: 'new',
        next_action: 'Review bid packet',
        raw_payload: opportunity,
      };
      const { data, error } = await supabase
        .from('spin_contract_opportunities')
        .upsert(row, { onConflict: 'source_id,content_hash', ignoreDuplicates: true })
        .select('*');
      if (!error && data?.[0]) captured.push(data[0] as CapturedOpportunity);
    }
  }
  return captured;
}

async function fetchText(url: string) {
  const normalized = normalizeUrl(url);
  if (!normalized) return '';
  const response = await fetch(normalized, { headers: { 'user-agent': 'Spin Contract Monitor/0.1' } });
  if (!response.ok) return '';
  return (await response.text()).slice(0, 60000);
}

function extractOpportunitiesFromHtml(html: string, source: SourceRow): CapturedOpportunity[] {
  const text = stripHtml(html);
  const matches = [...text.matchAll(/([A-Z][A-Za-z0-9 ,/&().'-]{12,120}?(?:janitorial|cleaning|custodial|floor care|porter)[A-Za-z0-9 ,/&().'-]{0,80})/gi)];
  return matches.slice(0, 8).map((match, index) => {
    const projectName = normalizeWhitespace(match[1]);
    return {
      project_name: projectName,
      agency_name: source.entity_name,
      category: categorize(source, projectName),
      location: source.county ? `${source.county.replace(/\s+County$/i, '')} County, AR` : 'Arkansas',
      contact_name: null,
      due_at: findDateNearText(text, match.index ?? 0),
      expires_at: null,
      estimated_value: null,
      source_url: source.bids_url ?? null,
      external_id: `${source.id}-${index}`,
      content_hash: simpleHash(`${source.id}:${projectName}`),
      summary: projectName,
    };
  });
}

function stripHtml(html: string) {
  return normalizeWhitespace(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function findDateNearText(text: string, index: number) {
  const slice = text.slice(Math.max(0, index - 250), index + 350);
  const match = slice.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i);
  if (!match) return null;
  const parsed = new Date(match[0]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function categorize(source: SourceRow, projectName: string): 'School' | 'Government' | 'Medical' {
  const haystack = `${source.entity_name} ${source.entity_type} ${projectName}`.toLowerCase();
  if (/school|district|education/.test(haystack)) return 'School';
  if (/medical|hospital|clinic|health|uams/.test(haystack)) return 'Medical';
  return 'Government';
}

function normalizeUrl(url?: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function formatLocation(geography: GeographyRow, input: ReturnType<typeof normalizeInput>) {
  const city = geography.city ?? input.city;
  const county = geography.county ?? input.county;
  if (city && county) return `${city}, ${county} County, AR`;
  if (county) return `${String(county).replace(/\s+County$/i, '')} County, AR`;
  if (city) return `${city}, AR`;
  return input.zip ? `${input.zip}, AR` : 'Arkansas';
}

function getGeographyId(geography: GeographyRow) {
  return geography.id == null ? null : String(geography.id);
}

function toSourceResponse(source: SourceRow) {
  return {
    id: source.id,
    entityName: source.entity_name,
    portalType: source.portal_type,
    bidsUrl: source.bids_url ?? null,
    awardsUrl: source.awards_url ?? null,
    confidence: source.confidence,
    needsHumanReview: source.needs_human_review,
  };
}

function toOpportunityResponse(opportunity: CapturedOpportunity & { id?: string; source_id?: string }) {
  return {
    id: opportunity.id,
    sourceId: opportunity.source_id,
    projectName: opportunity.project_name,
    agencyName: opportunity.agency_name,
    category: opportunity.category,
    location: opportunity.location ?? null,
    contactName: opportunity.contact_name ?? null,
    dueAt: opportunity.due_at ?? null,
    expiresAt: opportunity.expires_at ?? null,
    estimatedValue: opportunity.estimated_value ?? null,
    status: 'new',
    sourceUrl: opportunity.source_url ?? null,
    summary: opportunity.summary ?? null,
  };
}

async function updateRun(supabase: ReturnType<typeof createClient>, runId: string, patch: Record<string, unknown>) {
  await supabase.from('spin_contract_generation_runs').update(patch).eq('id', runId);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
