import test from 'node:test';
import assert from 'node:assert/strict';
import {adminDatabase} from './helpers/admin-trigger-db.mjs';
import {verifyScheduleAudit} from './helpers/schedule-audit-db.mjs';
import {scheduleEvent} from '../scripts/lib/schedule-change-audit.mjs';
test('schedule mutations enrich existing transactional events without replay/no-op duplicates',async()=>{const sql=await adminDatabase();try{await verifyScheduleAudit(sql);}finally{await sql.close();}});
test('old sparse events remain unknown and stored private fields are not projected',()=>{
 assert.equal(scheduleEvent({summary:{}}).changes,null);
 assert.deepEqual(scheduleEvent({summary:{audit:{version:1,changes:[{field:'private',after:'secret'},{field:'window_policy',before:null,after:{opportunity:{lookback_days:30,secret:'hidden'},private:'hidden'}}]}}}).changes,[{field:'window_policy',before:null,after:{opportunity:{lookback_days:30}}}]);
});
