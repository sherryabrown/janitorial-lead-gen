// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ScheduleList} from './ScheduledTable';
import {initialDraft,recurrenceLabel} from './model';
import type {Schedule} from './types';
afterEach(cleanup);
const schedule:Schedule={...initialDraft(),id:'test',name:'Saline morning',version:1,next_due_at:null,config:{...initialDraft().config,county_ids:['05125']},reporting:{as_of:'2026-10-20T14:00:00Z',last_run:{id:'run',target_kind:'county_scope',state:'completed',created_at:'2026-10-20T13:00:00Z',leads:{added:2,updated:1,unchanged:3,completeness:'known'},usage:{ai:'unknown',input_tokens:null,output_tokens:null,actual_usd:null,known_actual_usd:.03,held_usd:.1,credits:null}}}};
it('shows last-run metrics, nested controls and focused details',async()=>{
 const action=vi.fn();render(<ScheduleList items={[{...schedule,enabled:true}]} more={false} onMore={()=>{}} onEdit={()=>{}} onAction={action} busy={false} onView={()=>{}}/>);
 expect(screen.getByText('2 new')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Actions for Saline morning'}));
 expect(screen.getAllByRole('menuitem').map(x=>x.textContent)).toEqual(['Details','Edit','Disable']);
 fireEvent.click(screen.getByRole('menuitem',{name:'Disable'}));
 expect(screen.getByRole('menuitem',{name:'Delete'}).getAttribute('aria-disabled')).toBe('true');
 fireEvent.keyDown(screen.getByRole('menuitem',{name:'Pause'}),{key:'ArrowLeft'});
 fireEvent.click(screen.getByRole('menuitem',{name:'Details'}));
 expect(screen.getByRole('tab',{name:'Overview'})).toBeTruthy();expect(screen.queryByRole('table',{name:/Schedules/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Back to schedules'}));
 expect(screen.getByRole('button',{name:'Saline morning'})).toBeTruthy();
});
it('emits server filters/sort rather than pretending loaded rows are the full result set',()=>{
 const filters=vi.fn();
 render(<ScheduleList items={[]} total={150} more onMore={()=>{}} onEdit={()=>{}} onAction={()=>{}} busy={false} onView={()=>{}} onFilters={filters}/>);
 fireEvent.change(screen.getByLabelText('Search schedules'),{target:{value:'Saline'}});
 fireEvent.change(screen.getByLabelText('Type'),{target:{value:'sam'}});
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
  for(const name of ['Edit','Disable']){
   const item=screen.getByRole('menuitem',{name});expect(item.getAttribute('aria-disabled')).toBe('true');fireEvent.click(item);
  }
  expect(edit).not.toHaveBeenCalled();expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem',{name:'Details'}));
  expect(screen.getByRole('region',{name:'Schedule details: Saline morning'})).toBeTruthy();cleanup();
 }
});
