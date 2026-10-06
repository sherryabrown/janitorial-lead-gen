const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export function inspectPublicBonfireProjects(body, spec) {
  if (spec?.response_format !== 'bonfire-projects-v1' ||
      !Number.isInteger(spec.max_records) || spec.max_records < 1 || spec.max_records > 100 ||
      !Array.isArray(spec.allowed_hosts) || spec.allowed_hosts.length !== 1)
    throw new Error('Unverified Bonfire project contract');
  let data;
  try { data = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body); }
  catch { throw new Error('Bonfire projects response is not JSON'); }
  const projects = data?.payload?.projects;
  if (data?.success !== 1 || !projects || Array.isArray(projects) ||
      typeof projects !== 'object' || Object.keys(projects).length > spec.max_records)
    throw new Error('Bonfire public project listing changed or exceeds bound');
  const records = Object.entries(projects).map(([key, project]) => {
    const id = clean(project?.ProjectID), title = clean(project?.ProjectName);
    if (!/^\d+$/.test(id) || key !== id || !title ||
        !/^\d{4}-\d{2}-\d{2} /.test(clean(project.DateClose)))
      throw new Error('Bonfire public project row changed');
    return { id, title, closes: clean(project.DateClose),
      url: `https://${spec.allowed_hosts[0]}/opportunities/${id}` };
  });
  return { records, terminal: true, reason: null };
}

export function inspectPublicBonfireContracts(body, spec) {
  if (spec?.response_format !== 'bonfire-contracts-v1' ||
      !Number.isInteger(spec.max_records) || spec.max_records < 1 || spec.max_records > 100 ||
      !Array.isArray(spec.allowed_hosts) || spec.allowed_hosts.length !== 1)
    throw new Error('Unverified Bonfire contract listing');
  let data;
  try { data = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body); }
  catch { throw new Error('Bonfire contracts response is not JSON'); }
  const contracts = data?.payload?.publicContracts;
  if (data?.success !== 1 || !contracts || Array.isArray(contracts) ||
      typeof contracts !== 'object' || Object.keys(contracts).length > spec.max_records)
    throw new Error('Bonfire public contracts changed or exceed bound');
  const records = Object.values(contracts).map(contract => {
    const id = clean(contract?.ContractID), title = clean(contract?.Name);
    if (!/^\d+$/.test(id) || !title || !/^\d{4}-\d{2}-\d{2} /.test(clean(contract.StartDate)) ||
        !/^\d{4}-\d{2}-\d{2} /.test(clean(contract.EndDate)))
      throw new Error('Bonfire public contract row changed');
    return { id, title, starts: clean(contract.StartDate), ends: clean(contract.EndDate),
      url: `https://${spec.allowed_hosts[0]}/publicContracts/${id}` };
  });
  if (new Set(records.map(row => row.id)).size !== records.length)
    throw new Error('Duplicate Bonfire contract identity');
  return { records, terminal: true, reason: null };
}
