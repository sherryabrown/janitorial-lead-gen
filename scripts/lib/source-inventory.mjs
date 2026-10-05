import { adapterContract, categories, covers, unsupportedCategory } from './known-source-execution.mjs';

// Reconcile current status from capability evidence on every read. Legacy config remains
// historical evidence, never an override of a newer verified capability.
export function sourceInventory(sources, capabilities, geographies, now = new Date()) {
  return [...sources].sort((a,b) => a.code.localeCompare(b.code)).map(source => {
    const caps = capabilities.filter(c => c.source_id === source.id);
    const routes = geographies.filter(g => g.source_active &&
      (covers(source,g) || caps.some(c => c.route_geography_id === g.id)));
    const historical = Object.values(source.config?.research_persistence?.coverage_by_scope ?? {});
    const warnings = [];
    if (!routes.length) warnings.push('No resolved active geography; verify agency/service-area applicability');
    if (historical.length) warnings.push('Historical request associations require agency-coverage review; they do not prove work sites');
    const categoryRows = routes.flatMap(route => categories.map(kind => {
      const attached = caps.filter(c => c.route_geography_id === route.id && c.kind === kind);
      const methods = attached.map(capability => {
        try { return { id: capability.id, status: 'verified', verified_at: capability.verified_at,
          verified_until: capability.verified_until, evidence: capability.verification_evidence,
          method: adapterContract(capability,source,now) }; }
        catch(error) { return { id: capability.id, status: 'blocked', reason: error.message,
          verified_at: capability.verified_at, verified_until: capability.verified_until }; }
      });
      const unsupported = unsupportedCategory(source,kind,route.id,now);
      const status = methods.some(m => m.status === 'verified') ? 'verified_method' :
        methods.length ? 'method_blocked' : unsupported ? 'unsupported' : 'category_unresolved';
      return { geography_id: route.id, geography: route.name, kind, status, methods,
        assessment: unsupported ?? null,
        next_action: status === 'verified_method' ? 'Run for a confirmed request; review saved results separately' :
          status === 'method_blocked' ? 'Resolve or renew the saved method; preserve prior captures' :
            status === 'unsupported' ? unsupported.reason : 'Verify category applicability and save a check method' };
    }));
    const verified = categoryRows.filter(c => c.status === 'verified_method');
    if (verified.length && (source.config?.api_status || source.config?.registration_status || historical.length))
      warnings.push('Current method status comes from dated capabilities; legacy access/research notes below are historical and may be stale');
    return { source_id: source.id, code: source.code, name: source.name, url: source.url,
      mapping_status: routes.length ? 'mapped' : 'mapping_missing',
      coverage_areas: source.source_coverage_areas ?? [], warnings,
      current_verified_methods: verified.length, categories: categoryRows,
      current_open_item: source.config?.phase2b_method_status ?? null,
      unresolved_categories_without_mapping: routes.length ? [] : categories,
      legacy_notes: { api_status: source.config?.api_status ?? null,
        registration_status: source.config?.registration_status ?? null,
        coverage_note: source.config?.coverage_note ?? null,
        next_actions: [...new Set(historical.map(h => h.next_action).filter(Boolean))] },
      next_action: source.config?.phase2b_method_status?.next_action ?? (routes.length ? 'Complete each source/category method or evidenced unsupported assessment' :
        'Verify geography mapping before routing; do not infer service area from agency name') };
  });
}

const cell = value => String(value ?? '').replace(/\s+/g,' ').replaceAll('|','\\|');
export function inventoryReport(inventory) {
  const summary = { sources: inventory.length,
    mapping_missing: inventory.filter(s => s.mapping_status === 'mapping_missing').length,
    verified_methods: inventory.reduce((n,s) => n+s.current_verified_methods,0) };
  const lines = ['# Registered source inventory', '',
    `${summary.sources} sources; ${summary.mapping_missing} missing geography mappings; ${summary.verified_methods} verified category methods.`, '',
    'Method readiness does not establish lead coverage. Legacy metadata is retained as historical evidence; current capability evidence takes precedence.', '',
    '| Source | ID | Registered URL | Mapping | Verified methods | Next action |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...inventory.map(s => `| ${[s.code,s.source_id,s.url,s.mapping_status,s.current_verified_methods,s.next_action].map(cell).join(' | ')} |`)];
  for (const source of inventory) {
    lines.push('',`## ${source.code}`, '', ...source.warnings.map(w => `- ${w}`),
      `- Registered areas: ${JSON.stringify(source.coverage_areas)}`,
      ...(source.current_open_item ? [`- Current open item: ${source.current_open_item.status}; checked ${source.current_open_item.attempted_at}; run ${source.current_open_item.evidence_run_id}; ${source.current_open_item.blocker}; next: ${source.current_open_item.next_action} (${source.current_open_item.actor})`] : []),
      `- Historical notes (not current access status): ${JSON.stringify(source.legacy_notes)}`, '',
      '| Geography | Category | Status | Evidence / next action |','| --- | --- | --- | --- |',
      ...source.categories.map(c => `| ${[c.geography,c.kind,c.status,
        c.methods.length ? c.methods.map(m => `${m.id}: ${m.status}; verified ${m.verified_at}; expires ${m.verified_until}; ${m.reason ?? c.next_action}`).join('; ') : c.next_action].map(cell).join(' | ')} |`));
    if (source.mapping_status === 'mapping_missing')lines.push('All three categories remain unresolved pending geography verification.');
  }
  return { summary, markdown: lines.join('\n')+'\n' };
}
