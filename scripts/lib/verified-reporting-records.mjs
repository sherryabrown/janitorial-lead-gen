import {hash} from './reviewed-batch.mjs';

// Reporting only: derive from the exact tested manifest, after verified readback.
// Never reconstruct historical classification from the current mutable lead.
export function verifiedReportingRecords(manifest) {
 return {version:1,records:manifest.records.map(r=>({id:r.id,
  category:r.payload.bid_type,
  outcome:!r.expected_payload?'added':hash(r.payload)!==hash(r.expected_payload)?'updated':'unchanged',
  intake_ids:manifest.decisions.filter(d=>d.lead_id===r.id).map(d=>d.intake.id)}))};
}
