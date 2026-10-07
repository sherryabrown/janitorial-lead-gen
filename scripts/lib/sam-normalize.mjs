import {unresolvedLink} from './api-record-links.mjs';
export function awardIdentity(row) {
  const c = row.contractId;
  if (!c?.piid || !c?.subtier?.code) throw new Error('Missing award identity');
  return `${c.piid}_${c.subtier.code}_${c.referencedIDVPiid || '-NONE-'}_${c.referencedIDVSubtier?.code || '-NONE-'}`;
}
export function actionIdentity(row) {
  return `${awardIdentity(row)}_${row.contractId.modificationNumber ?? '0'}_${row.contractId.transactionNumber ?? '0'}`;
}
export function awardDate(row) { return row.awardDetails?.dates?.dateSigned || ''; }
export function dateOnly(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : null; }
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
export function same(a,b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
export function awardPayload(row, queryUrl) {
  const core = row.coreData || {}, a = row.awardDetails || {}, loc = core.principalPlaceOfPerformance || {};
  const org = core.federalOrganization?.contractingInformation || {};
  const vendor = a.awardeeData || {};
  const dates = a.dates || {};
  return {
    title: a.productOrServiceInformation?.descriptionOfContractRequirement || `Contract ${row.contractId.piid}`,
    agency: org.contractingDepartment?.name || row.contractId.subtier.name,
    subagency: org.contractingSubtier?.name || row.contractId.subtier.name,
    ...unresolvedLink(awardIdentity(row),'SAM award requires a verified public detail link or exact crosswalk',queryUrl), award_id: row.contractId.piid,
    solicitation_id: core.solicitationId || null, bid_type: 'award', business_category: 'other_public',
    contracting_entity_geo_level: 'federal',
    work_performance_locations: [{ city_name: loc.city?.name || null, state_code: loc.state?.code || null,
      county_name: loc.county?.name || null, postal_code: loc.zipCode || null,
      evidence: 'SAM Contract Awards coreData.principalPlaceOfPerformance; not vendor or contracting-office location' }],
    incumbent: vendor.awardeeHeader?.legalBusinessName || vendor.awardeeHeader?.awardeeName || null,
    incumbent_uei: vendor.awardeeUEIInformation?.uniqueEntityId || null,
    naics: core.productOrServiceInformation?.principalNaics?.[0]?.code || null,
    psc: core.productOrServiceInformation?.productOrService || null,
    contract_start: dateOnly(dates.periodOfPerformanceStartDate), contract_end: dateOnly(dates.currentCompletionDate),
    ultimate_end: dateOnly(dates.ultimateCompletionDate), latest_action_signed_date: dateOnly(dates.dateSigned),
    source_modified: a.transactionData?.lastModifiedDate || null,
    parent_contract_id: row.contractId.referencedIDVPiid || null,
    set_aside: core.competitionInformation?.typeOfSetAside?.name || null,
    sam_reported_dollars: { action: a.dollars || {}, total: a.totalContractDollars || {} },
    annual_amount_basis: 'No annual amount inferred from obligations, totals, or options',
    verification: 'official_sam_contract_awards_api',
  };
}
export function responseSummary(kind, data, limit, offset) {
  const empty = kind === 'awards' && data.message === 'No Data found for requested search criteria' && Number(data.awardResponse?.totalRecords) === 0;
  const records = kind === 'opportunities' ? data.opportunitiesData : (empty ? [] : data.awardSummary);
  if (!Array.isArray(records)) return { count:0, complete:false, recognized:false };
  const total = Number(data.totalRecords ?? (empty ? 0 : NaN));
  return { count:records.length, complete:Number.isFinite(total) ? offset*limit+records.length >= total : records.length < limit, recognized:true };
}
