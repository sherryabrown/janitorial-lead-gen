import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
const compile=async p=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {mapProcurementLead,mapProcurementSource}=await compile('src/lib/procurement.ts');
const {matchesContractFilters,getDefaultContractFilters}=await compile('src/features/contracts/contract-utils.ts');
test('API endpoints and unresolved fallback links are not project-name links',()=>{
 const lead={id:'link',source_id:'source',payload:{title:'Project',source_url:'https://api.usaspending.gov/search'},source_url:'https://api.usaspending.gov/search'};
 assert.equal(mapProcurementLead(lead).sourceUrl,undefined);
 lead.source_url='https://www.usaspending.gov/award/full-id';lead.payload.source_url=lead.source_url;
 assert.equal(mapProcurementLead(lead).sourceUrl,lead.source_url);
 lead.payload.source_link={status:'unresolved',next_action:'Verify official record'};
 assert.equal(mapProcurementLead(lead).sourceUrl,undefined);
 assert.equal(mapProcurementLead(lead).projectName,'Project');
});

test('calendar dates remain stable in Arkansas, New York and UTC across DST',()=>{
 const compiled=ts.transpileModule(readFileSync('src/features/contracts/contract-utils.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const moduleUrl='data:text/javascript;base64,'+Buffer.from(compiled).toString('base64');
 const program=`import assert from 'node:assert/strict'; const {parseContractDate,formatDateLabel}=await import(${JSON.stringify(moduleUrl)}); for(const day of ['2026-03-08','2026-11-01','2026-09-17']) {const value=parseContractDate(day);assert.equal(value.getDate(),Number(day.slice(-2)));} assert.equal(formatDateLabel('2026-09-17','due'),'Due Sep 17, 2026'); assert.equal(parseContractDate('2026-03-08T01:30:00-06:00').toISOString(),'2026-03-08T07:30:00.000Z');`;
 for(const TZ of ['America/Chicago','America/New_York','UTC']) execFileSync(process.execPath,['--input-type=module','-e',program],{env:{...process.env,TZ},stdio:'pipe',windowsHide:true});
});
const after=JSON.parse(readFileSync('tests/fixtures/research/mapping.json','utf8'));
const dhs=after.procurement_leads.find(l=>l.external_id==='710-25-028:ouachita'),ssc=after.procurement_leads.find(l=>l.external_id==='tasd-board-20260519-ssc-custodial');
test('persisted historical solicitation keeps evidence and is excluded from opportunity filter',()=>{
 const c=mapProcurementLead(dhs);assert.equal(c.bidType,'unknown');assert.match(c.projectName,/Historical/);assert.ok(c.researchNotes.some(x=>x.includes('Expired historical IFB')));assert.match(c.nextAction,/contract/);
 const f=getDefaultContractFilters();assert.equal(matchesContractFilters(c,{...f,bidType:'opportunity'}),false);assert.equal(matchesContractFilters(c,{...f,query:'Camden'}),true);
});
test('persisted board approval retains qualifications and does not invent executed end or annual value',()=>{
 const c=mapProcurementLead(ssc);assert.equal(c.bidType,'award');assert.match(c.projectName,/Board-approved/);assert.ok(c.researchNotes.some(x=>x.includes('Signed execution')));assert.equal(c.estimatedValue,undefined);assert.equal(c.keyDates.some(x=>x.key==='current-end'),false);
 assert.equal(matchesContractFilters(c,{...getDefaultContractFilters(),bidType:'award',query:'Texarkana'}),true);
 const annotated=mapProcurementLead({...ssc,notes:'Existing owner note',next_action:'Owner follow-up'});assert.ok(annotated.notes.includes('Existing owner note'));assert.equal(annotated.nextAction,'Owner follow-up');
});
test('database source coverage displays geography and partial status rather than assumed completeness',()=>{
 const source=after.procurement_sources.find(s=>s.code==='tasd-public-board'),view=mapProcurementSource(source);assert.match(view.location,/Texarkana, AR/);assert.equal(view.status,'needs-review');assert.equal(view.lastChecked,'2026-09-30');
});
