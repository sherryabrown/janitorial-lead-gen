import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function verifyScheduleAudit(sql){
 const actor=randomUUID(),now='2026-10-22T14:00:00Z';await sql.query('insert into auth.users(id)values($1)',[actor]);
 const input={name:'Audit fixture',enabled:false,config:{target_kind:'sam',county_ids:[],requested_categories:['opportunity']},scope_hash:'fixture',window_policy:{opportunity:{lookback_days:30}},recurrence:{frequency:'daily',timezone:'America/Chicago',local_times:['09:00'],weekdays:[],month_day:null},next_due_at:null};
 const save=async(id,version,value,key='audit-'+actor)=> (await sql.query('select save_procurement_schedule($1,$2,$3,$4,$5,$6,$7) id',[id,actor,key,JSON.stringify(value),version,value,now])).rows[0].id;
 const id=await save(null,null,input),events=async()=> (await sql.query('select * from procurement_schedule_events where schedule_id=$1 order by version,at,id',[id])).rows;
 assert.equal((await events()).length,1);assert.equal((await events())[0].summary.audit.version,1);
 assert.equal(await save(null,null,input),id);assert.equal((await events()).length,1,'idempotent create produces one event');
 await save(id,1,input);assert.equal((await events()).length,1,'no-op edit produces no change event');
 const edited={...input,name:'Renamed',recurrence:{...input.recurrence,frequency:'monthly',month_day:21},window_policy:{opportunity:{lookback_days:60}}};
 await save(id,2,edited);let e=(await events()).at(-1);assert.equal(e.actor_id,actor);assert.equal(e.version,3);
 assert.deepEqual(e.summary.audit.changes.find(c=>c.field==='name'),{field:'name',before:'Audit fixture',after:'Renamed'});
 assert.equal(e.summary.audit.changes.find(c=>c.field==='month_day').after,21);
 await assert.rejects(save(id,2,{...edited,name:'Stale'}),/version/);assert.equal((await events()).length,2);
 await sql.query('select control_procurement_schedule($1,$2,$3,$4,$5,$6)',[id,actor,'resume',3,'2026-10-23T14:00:00Z',now]);
 e=(await events()).at(-1);assert.equal(e.action,'resume');assert.deepEqual(e.summary.audit.changes.find(c=>c.field==='enabled'),{field:'enabled',before:false,after:true});
 await sql.query('alter table auth.users add column if not exists banned_until timestamptz');
 await sql.query("update auth.users set banned_until='2070-01-01T00:00:00Z' where id=$1",[actor]);
 await sql.query('select disable_inactive_procurement_schedules($1)',[now]);e=(await events()).at(-1);assert.equal(e.action,'owner_inactive');assert.equal(e.actor_id,null);assert.ok(e.summary.audit.changes.some(c=>c.field==='enabled'&&c.after===false));
 await sql.query('update auth.users set banned_until=null where id=$1',[actor]);
 await sql.query('select control_procurement_schedule($1,$2,$3,$4,$5,$6)',[id,actor,'archive',5,null,now]);assert.ok((await events()).at(-1).summary.audit.changes.some(c=>c.field==='archived_at'));
 const deleted=await save(null,null,input,'delete-'+actor);
 await sql.query('select delete_procurement_schedule($1,$2,1,$3)',[deleted,actor,now]);
 await sql.query('select delete_procurement_schedule($1,$2,1,$3)',[deleted,actor,now]);
 const deletedEvents=(await sql.query('select * from procurement_schedule_events where schedule_id=$1 order by version',[deleted])).rows;
 assert.equal(deletedEvents.length,2);assert.ok(deletedEvents[1].summary.audit.changes.some(c=>c.field==='deleted_at'));
 await sql.query('begin');try{await sql.query("update procurement_schedules set name='Rolled back',version=version+1 where id=$1",[id]);await sql.query('insert into procurement_schedule_events(schedule_id,action,version)values($1,$2,7)',[id,'edited']);await sql.query('rollback');}catch(error){await sql.query('rollback');throw error;}
 assert.equal((await events()).length,5,'rolled back event is absent');assert.equal((await sql.query('select name from procurement_schedules where id=$1',[id])).rows[0].name,'Renamed');
 return {atomic_changes:true,replay:true,no_op:true,stale_version:true,lifecycle:true,delete_retention:true};
}
