// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { parseAdminContext, readAdminContext, saveAdminContext, clearAdminSession } from './navigation';
beforeEach(()=>sessionStorage.clear());
it('validates saved navigation and isolates owners without retaining arbitrary data',()=>{
  expect(parseAdminContext({view:'unsafe',token:'secret'})).toEqual({view:'schedules',returnTo:'contracts'});
  expect(parseAdminContext({view:'history',runId:'<script>',scheduleId:'valid-id',section:'logs',token:'secret'})).toEqual({view:'history',scheduleId:'valid-id',section:'logs',returnTo:'contracts'});
  saveAdminContext('owner',{view:'history',returnTo:'contracts'});
  expect(readAdminContext('owner').view).toBe('history'); expect(readAdminContext('other').view).toBe('schedules');
  sessionStorage.setItem('spin-admin-navigation:owner','broken'); expect(readAdminContext('owner').view).toBe('schedules');
  clearAdminSession('owner'); expect(sessionStorage.getItem('spin-admin-navigation:owner')).toBeNull();
});

it('keeps schedule-selected runs distinct from standalone run navigation and clears owner data',()=>{
 const context=parseAdminContext({view:'schedules',scheduleId:'schedule',scheduleRunId:'older',runId:'standalone',section:'logs'});expect(context.scheduleRunId).toBe('older');expect(context.runId).toBe('standalone');
 expect(parseAdminContext({view:'schedules',scheduleRunId:'<script>'}).scheduleRunId).toBeUndefined();
 sessionStorage.setItem('spin-admin-schedule-run:owner:schedule','older');sessionStorage.setItem('spin-admin-schedule-runs-page:owner:schedule','100');sessionStorage.setItem('spin-admin-schedule-run:other:schedule','keep');clearAdminSession('owner');expect(sessionStorage.getItem('spin-admin-schedule-run:owner:schedule')).toBeNull();expect(sessionStorage.getItem('spin-admin-schedule-runs-page:owner:schedule')).toBeNull();expect(sessionStorage.getItem('spin-admin-schedule-run:other:schedule')).toBe('keep');
});
