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
