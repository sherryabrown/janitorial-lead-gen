import assert from 'node:assert/strict';
import {scheduleActivity} from '../../scripts/lib/schedule-activity.mjs';
export async function verifyScheduleActivity({sql,db}){
 const {rows:[s]}=await sql.query('select id,config,version from procurement_schedules limit 1');
 assert.ok(s);
 await sql.query(`insert into procurement_schedule_occurrences(schedule_id,version,due_at,effective_at,origin,run_key,config,state,reason,created_at)
 select $1,$2,'2026-11-01T06:30:00Z'::timestamptz+n*interval '1 minute','2026-11-01T06:30:00Z'::timestamptz+n*interval '1 minute','manual','activity-native-'||n,$3,'skipped','previous_run_active','2026-11-01T06:30:00Z' from generate_series(1,55) n`,[s.id,s.version,s.config]);
 const read=scheduleActivity(db,{now:()=>new Date('2031-01-01T00:00:00Z')});
 const first=await read(s.id,{from:'2026-11-01',through:'2026-11-01',limit:20});
 const second=await read(s.id,{from:'2026-11-01',through:'2026-11-01',limit:20,offset:20,as_of:first.as_of});
 const third=await read(s.id,{from:'2026-11-01',through:'2026-11-01',limit:20,offset:40,as_of:first.as_of});
 assert.equal(first.total,55);assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(third.items.length,15);assert.equal(third.next_offset,null);
 assert.equal(new Set([...first.items,...second.items,...third.items].map(r=>r.id)).size,55);
 assert.equal((await read(s.id,{from:'2026-10-31',through:'2026-10-31'})).total,0,'CT boundary excludes next-day attempts');
 assert.equal((await read(s.id,{from:'2026-11-01',through:'2026-11-01',kind:'run'})).total,0);
 await sql.query(`insert into procurement_schedule_occurrences(schedule_id,version,due_at,effective_at,origin,run_key,config,state,created_at) values($1,$2,'2026-11-01T06:30:00Z','2026-11-01T06:30:00Z','manual','activity-after-boundary',$3,'skipped','2032-01-01T00:00:00Z')`,[s.id,s.version,s.config]);
 assert.equal((await read(s.id,{from:'2026-11-01',through:'2026-11-01',as_of:first.as_of})).total,55,'New records cannot shift the fixed paging boundary');
 const {rows:[acl]}=await sql.query("select has_table_privilege('anon','procurement_schedule_activity','select') a,has_table_privilege('authenticated','procurement_schedule_activity','select') b,has_table_privilege('service_role','procurement_schedule_activity','select') c");
 assert.deepEqual(acl,{a:false,b:false,c:true});
 return {passed:true,pages:3,rows:55,DST:true,private:true};
}
