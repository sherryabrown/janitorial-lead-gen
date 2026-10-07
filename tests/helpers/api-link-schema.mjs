// Expected forward migration, without rewriting the historical captured schema.
export const linkConstraint="CHECK (coalesce((coalesce(payload->>'title','')<>'' AND (coalesce(payload->>'source_url','') LIKE 'https://%' OR (payload->'source_url'='null'::jsonb AND payload#>>'{source_link,policy}'='api-record-links-v1' AND payload#>>'{source_link,status}'='unresolved' AND coalesce(payload#>>'{source_link,reason}','')<>'' AND coalesce(payload#>>'{source_link,next_action}','')<>''))),false))";
export function linkReadySchema(schema) {
  return {...schema,constraints:schema.constraints.map(c=>c.table==='procurement_leads'&&c.definition.includes('source_url')&&c.definition.includes('https://%')?{...c,definition:linkConstraint}:c)};
}
