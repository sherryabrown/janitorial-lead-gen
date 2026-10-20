// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {ScheduleList} from './ScheduledTable';
import {initialDraft,recurrenceLabel} from './model';
import type {Schedule} from './types';
afterEach(cleanup);
const schedule:Schedule={...initialDraft(),id:'test',name:'Saline morning',version:1,next_due_at:null,config:{...initialDraft().config,county_ids:['05125']},reporting:{as_of:'2026-10-20T14:00:00Z',last_run:{id:'run',target_kind:'county_scope',state:'completed',created_at:'2026-10-20T13:00:00Z',leads:{added:2,updated:1,unchanged:3,completeness:'known'},usage:{ai:'unknown',input_tokens:null,output_tokens:null,actual_usd:null,known_actual_usd:.03,held_usd:.1,credits:null}}}};
it('shows real last-run outcome columns and safe unknown usage; archived rows retain details',()=>{
 const action=vi.fn();window.confirm=vi.fn(()=>false);
 render(<ScheduleList items={[schedule]} more={false} onMore={()=>{}} onEdit={()=>{}} onAction={action} busy={false} onView={()=>{}}/>);
 expect(screen.getByRole('table')).toBeTruthy();expect(screen.getByText('2 new')).toBeTruthy();expect(screen.getByText('1 updated · 3 unchanged')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Actions for Saline morning'}));
 fireEvent.click(screen.getByRole('menuitem', { name: 'Archive schedule'}));expect(action).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Actions for Saline morning'}));
 fireEvent.click(screen.getByRole('menuitem', { name: 'Go to Stats'}));
 expect(within(screen.getByRole('region',{name:'Schedule details: Saline morning'})).getByText('New leads')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Close schedule details'}));
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Saline morning'}));
});
it('emits server filters/sort rather than pretending loaded rows are the full result set',()=>{
 const filters=vi.fn();
 render(<ScheduleList items={[]} total={150} more onMore={()=>{}} onEdit={()=>{}} onAction={()=>{}} busy={false} onView={()=>{}} onFilters={filters}/>);
 fireEvent.change(screen.getByLabelText('Search schedules'),{target:{value:'Saline'}});
 fireEvent.change(screen.getByLabelText('Target'),{target:{value:'sam'}});
 fireEvent.change(screen.getByLabelText('Order'),{target:{value:'desc'}});
 expect(filters.mock.lastCall?.[0]).toBe('q=Saline&target=sam&direction=desc');expect(screen.getByText('150 schedules')).toBeTruthy();
 expect(recurrenceLabel({...schedule,recurrence:{frequency:'monthly',timezone:'America/Chicago',local_times:['09:00'],month_day:31}})).toContain('day 31');
});
it('keeps mutation guards for busy and archived schedules while allowing details',()=>{
 for(const archived of [false,true]){
  const edit=vi.fn(),action=vi.fn();
  render(<ScheduleList items={[{...schedule,archived}]} more={false} onMore={()=>{}} onEdit={edit} onAction={action} busy={!archived} onView={()=>{}}/>);
  expect(screen.getByRole('button',{name:'Run Saline morning now'})).toHaveProperty('disabled',true);
  fireEvent.click(screen.getByRole('button',{name:'Actions for Saline morning'}));
  for(const name of ['Edit Saline morning',schedule.enabled?'Pause':'Resume','Archive schedule']){
   const item=screen.getByRole('menuitem',{name});expect(item.getAttribute('aria-disabled')).toBe('true');fireEvent.click(item);
  }
  expect(edit).not.toHaveBeenCalled();expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem',{name:'View details'}));
  expect(screen.getByRole('region',{name:'Schedule details: Saline morning'})).toBeTruthy();cleanup();
 }
});
