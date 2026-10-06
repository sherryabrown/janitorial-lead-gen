const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// A saved method declares the listing shape. A successful fetch alone never proves coverage.
export function inspectPublicJsonListing(body, spec) {
  if (spec?.response_format !== 'json-files-v1' ||
      !Number.isInteger(spec.max_records) || spec.max_records < 1 || spec.max_records > 100 ||
      !clean(spec.expected_category)) throw new Error('Unverified JSON listing contract');
  let data;
  try { data = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body); }
  catch { throw new Error('Source response is not JSON'); }
  if (!data || !Array.isArray(data.files) || !data.category ||
      clean(data.category.name) !== spec.expected_category ||
      data.files.length > spec.max_records)
    throw new Error('Source listing shape or category changed');
  const records = data.files.map((file, index) => {
    const id = clean(file.ID), title = clean(file.post_title), created = clean(file.created);
    let url;
    try { url = new URL(file.linkdownload); } catch { throw new Error(`Listing row ${index + 1} has no document URL`); }
    if (!/^\d+$/.test(id) || !title || !/^\d{2}-\d{2}-\d{4}$/.test(created) ||
        url.protocol !== 'https:' || url.username || url.password ||
        !spec.allowed_hosts.includes(url.hostname))
      throw new Error(`Listing row ${index + 1} lacks a safe stable identity`);
    return { id, title, created, url: url.href };
  });
  if (new Set(records.map(row => row.id)).size !== records.length)
    throw new Error('Duplicate listing document ID');
  return { category: spec.expected_category, records,
    terminal: data.pagination === false,
    reason: data.pagination === false ? null : 'Listing pagination is present or unconfirmed' };
}
