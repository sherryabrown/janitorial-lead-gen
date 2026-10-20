import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createProcurementSourceCache, loadProcurementContracts, loadProcurementLeadHistory, mapProcurementLead, type ProcurementLead } from './procurement';

it('uses a literal forecast quarter only when no existing exact primary date is present', () => {
  const lead = { id:'quarter', bid_type:'forecast', payload:{title:'Forecast',planned_advertisement_period:'Q4 2026'} } as unknown as ProcurementLead;
  const result=mapProcurementLead(lead);
  expect(result.date).toBe('Q4 2026');
  expect(result.keyDates).toContainEqual({key:'planned-advertisement',label:'Expected advertisement',value:'Q4 2026',kind:'text'});
  expect(mapProcurementLead({...lead,publication_date:'2026-09-01'}).date).toBe('2026-09-01');
  expect(mapProcurementLead({...lead,payload:{planned_advertisement_period:'Q5 2026'}}).date).toBe('');
});

type Row = Record<string, unknown>;
function database(tables: Record<string, Row[]>) {
  const reads: {table:string; start:number; end:number; ids?:unknown[]}[] = [];
  const client = {
    rpc: async () => ({data:{rows:[],total:0,counts:{}},error:null}),
    from(table:string) {
      let values = tables[table] ?? [], start=0, end=499, ids:unknown[]|undefined;
      const query = {
        select() {return query;},
        eq(key:string,value:unknown) {values=values.filter(row=>row[key]===value);return query;},
        in(key:string,selected:unknown[]) {ids=selected;values=values.filter(row=>selected.includes(row[key]));return query;},
        order() {values=[...values].sort((a,b)=>String(a.id).localeCompare(String(b.id)));return query;},
        range(from:number,to:number) {start=from;end=to;return query;},
        maybeSingle: async () => ({data:values[0]??null,error:null}),
        then(resolve:(value:{data:Row[];error:null})=>unknown) {
          reads.push({table,start,end,ids});
          return Promise.resolve({data:values.slice(start,end+1),error:null}).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return {client,reads};
}

it('shares concurrent source loads across queue pages and invalidates explicitly without sharing workspaces', async () => {
  const {client,reads}=database({procurement_sources:[{id:'source',name:'Original'}]});
  const cache=createProcurementSourceCache();
  await Promise.all([loadProcurementContracts(client,{},0,cache),loadProcurementContracts(client,{},1,cache)]);
  expect(reads.filter(r=>r.table==='procurement_sources')).toHaveLength(1);
  await loadProcurementContracts(client,{query:'new search'},2,cache);
  expect(reads).toHaveLength(1);
  cache.invalidate();
  await loadProcurementContracts(client,{},0,cache);
  expect(reads).toHaveLength(2);
  await loadProcurementContracts(client,{},0,createProcurementSourceCache());
  expect(reads).toHaveLength(3);
});

it('loads over 1000 notes, edits and stage events completely with bounded ID chunks and stable ties', async () => {
  const notes=Array.from({length:1005},(_,n)=>({id:`note-${String(n).padStart(4,'0')}`,lead_id:'lead',body:'note',created_at:'2026-10-01T00:00:00Z'}));
  const edits=notes.map((note,n)=>({id:`edit-${n}`,note_id:note.id,old_body:'old',new_body:'new',edited_at:'2026-10-01T00:00:00Z'}));
  const stages=notes.map((_,n)=>({id:`stage-${n}`,lead_id:'lead',to_status:'interested',created_at:'2026-10-01T00:00:00Z'}));
  const {client,reads}=database({procurement_lead_notes:notes,procurement_lead_note_edits:edits,procurement_lead_stage_changes:stages,procurement_leads:[{id:'lead',created_at:'2026-09-01T00:00:00Z'}]});
  const history=await loadProcurementLeadHistory(client,'lead');
  expect(history).toHaveLength(3016);
  expect(new Set(history.map(row=>row.id)).size).toBe(3016);
  expect(history.filter(row=>row.metadata.edit)).toHaveLength(1005);
  expect(reads.filter(r=>r.table==='procurement_lead_note_edits').every(r=>(r.ids?.length??0)<=100)).toBe(true);
  expect(history.slice(0,-1).map(row=>row.id)).toEqual(history.slice(0,-1).map(row=>row.id).sort((a,b)=>a.localeCompare(b)));
});


it('an invalidated in-flight registry read cannot populate a newer workspace cache', async () => {
  let release: (value:unknown)=>void = () => undefined;
  const waiting = new Promise(resolve=>{release=resolve;});
  let calls=0;
  const client={from(){const query={select(){return query;},order(){return query;},range(){calls+=1;return calls===1?waiting:Promise.resolve({data:[{id:'new-source'}],error:null});}};return query;}} as unknown as SupabaseClient;
  const cache=createProcurementSourceCache();
  const old=cache.load(client);
  cache.invalidate();
  expect((await cache.load(client))[0].id).toBe('new-source');
  release({data:[{id:'old-source'}],error:null});
  await old;
  expect((await cache.load(client))[0].id).toBe('new-source');
  expect(calls).toBe(2);
});
