import { manualSpecFromInterpretation } from './known-source-workflow.mjs';
import { planManual } from './research-persistence.mjs';

export function planInterpretationIntake(packet,result,before,evidencePaths) {
  const spec=manualSpecFromInterpretation(packet,result,before.project_ref,evidencePaths);
  const receipt={inserted:0,existing_preserved:0,intake_ids:[]};
  const findings=[];
  for(const f of spec.findings) {
    const versions=before.procurement_intake_items.filter(i=>i.source_id===packet.source_id&&
      (i.external_id===f.external_id||i.payload?.manual_capture?.record_external_id===f.external_id));
    const same=versions.find(i=>i.payload?.known_source_interpretation?.finding_hash===f.payload.known_source_interpretation.finding_hash);
    if(same) {receipt.existing_preserved++;receipt.intake_ids.push(same.id);continue;}
    const prior=versions.sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??'')||b.id.localeCompare(a.id))[0];
    if(prior) {
      if(!prior.payload?.manual_capture)throw new Error(`Record ${f.external_id} has nonmanual prior intake; review identity before staging`);
      f.amends_intake_id=prior.id;
    }
    findings.push(f);
  }
  const manifest=findings.length?planManual({...spec,findings},before):{rows:[]};
  return {manifest,receipt};
}
