import {renderAdmin as render} from '../../../tests/helpers/render-admin';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,screen,within} from '@testing-library/react';
import {RequestReview} from './RequestReview';
import {RunDetail} from './RunDetail';
import {ScheduleHistory} from './ScheduleHistory';
import {sourceResult,resultTasks} from './source-results';
import {runBreadcrumbs} from './run-breadcrumbs';
import type {Task} from './types';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:request,mutationKey:()=> 'key',acknowledged:()=>{}}));
afterEach(()=>{cleanup();request.mockReset();});
const task:Task={id:'task',source_id:'airport',source_name:'Airport procurement',location_name:'Pulaski County',category:'opportunity',state:'partial',reason:'Incomplete',pages:0,discovery_state:'blocked',attention:{kind:'manual_action',blocker:'Official access requires a person',next_action:'Open the official portal manually; ask the provider for supported access.',action_kind:'evidence'}};
it('preserves location/category distinctions and manual-only source actions without misleading retries',async()=>{
 expect(resultTasks([task,{...task,id:'repeat'},{...task,id:'award',category:'award'}],true)).toHaveLength(2);
 expect(sourceResult({...task,attention:null,state:'unchecked'}).next).toMatch(/queued/);
 request.mockResolvedValue({automatic_county:true,tasks:[task,task],jobs:[],candidates:[],total_candidates:0,next_offset:null});
 render(<RequestReview presentation="issues" embedded id="request" owner="owner" onViewLeads={()=>{}}/>);
 const table=await screen.findByRole('table',{name:'Source issues and next actions'});expect(within(table).getAllByRole('row')).toHaveLength(2);expect(within(table).getByText(task.attention!.next_action)).toBeTruthy();expect(screen.queryByRole('button',{name:'Retry source'})).toBeNull();expect(screen.getByRole('button',{name:'View source evidence'})).toBeTruthy();expect(request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('makes validation and execution details reachable while keeping source evidence separate',async()=>{
 request.mockResolvedValue({automatic_county:true,automatic_import:{state:'blocked',verified:false,added:0,updated:0,unchanged:0,exclusions:[{intake_id:'bad',title:'Unverified location',reason:'Location evidence missing'}]},tasks:[],jobs:[{id:'job',state:'outcome_unknown',stage:'import_reconcile',next_action:'Check the saved database receipt'}],candidates:[],total_candidates:0,next_offset:null});
 render(<RequestReview presentation="issues" embedded id="request" owner="owner" onViewLeads={()=>{}}/>);
 await screen.findByRole('table',{name:'Saved validation issues'});const summary=screen.getByText('Validation and execution details');expect(summary.closest('details')?.open).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Inspect saved validation details'}));expect(summary.closest('details')?.open).toBe(true);expect(screen.getByRole('table',{name:'Saved execution issues'})).toBeTruthy();expect(request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
it('shows real audit changes and system actions, excluding attempts without inventing historical values',async()=>{
 request.mockResolvedValue({items:[{id:'e',action:'edited',at:'2026-10-22T14:00:00Z',version:2,actor_id:'user',changes:[{field:'enabled',before:false,after:true},{field:'local_times',before:['09:00'],after:['09:00','14:00']}]},{id:'s',action:'owner_inactive',at:'2026-10-21T14:00:00Z',version:1},{id:'q',action:'queued',version:1}],next_offset:null});
 render(<ScheduleHistory id="schedule"/>);const table=await screen.findByRole('table',{name:'Schedule changes'});expect(within(table).getAllByRole('row')).toHaveLength(3);expect(screen.getByText('Off → On')).toBeTruthy();expect(screen.getByText('09:00 → 09:00, 14:00')).toBeTruthy();expect(screen.getByText('System')).toBeTruthy();expect(screen.getByText('Historical details not recorded')).toBeTruthy();expect(request.mock.calls.every(([p])=>p.includes('/events'))).toBe(true);
});
it('uses origin breadcrumbs without inventing a schedule relationship and keeps overview as Issues alias',async()=>{
 expect(runBreadcrumbs({view:'schedules',section:'manual',returnTo:'contracts'},null).map(c=>c.label)).toEqual(['Settings','Schedules','Manual runs']);
 request.mockImplementation(async(p:string)=>p.endsWith('/steps')?{items:[],next_cursor:null}:{id:'run',schedule_id:'different',schedule_name:'Other schedule',created_at:'2026-10-22T14:00:00Z',state:'pending',target_kind:'county_scope',children:[]});
 render(<RunDetail id="run" owner="owner" origin={{view:'history',scheduleId:'unverified',returnTo:'contracts'}} section="overview" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/>);
 const heading=await screen.findByRole('heading',{name:/Oct 20|Oct 22|Oct 19/});expect(heading.textContent).toMatch(/^Oct 22/);expect(heading.querySelector('.run-heading-identity')).toBeNull();const breadcrumb=screen.getByRole('navigation',{name:'Breadcrumb'});expect(breadcrumb.textContent).toContain('Run history');expect(breadcrumb.textContent).toContain('Results');expect(breadcrumb.textContent).not.toContain('Other schedule');expect(breadcrumb.textContent).not.toContain('unverified');expect(screen.getByText('Run attributes').closest('details')?.open).toBe(false);expect(screen.getByRole('button',{name:'Stop run'})).toBeTruthy();
});
it('does not offer a research retry for an explicitly manual-only legacy source barrier',async()=>{
 request.mockResolvedValue({tasks:[task],jobs:[],candidates:[],total_candidates:0,next_offset:null});
 render(<RequestReview presentation="issues" embedded id="request" owner="owner" onViewLeads={()=>{}}/>);
 await screen.findByRole('table',{name:'Source issues and next actions'});expect(screen.queryByRole('button',{name:'Resume saved research'})).toBeNull();expect(screen.getByRole('button',{name:'Review source research'})).toBeTruthy();expect(request.mock.calls.every(([,o])=>!o?.body)).toBe(true);
});
