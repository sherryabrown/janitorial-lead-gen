// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SchedulingAccess} from './SchedulingRole';
import {SchedulingRoleContext} from './scheduling-role';
import {SourceStatus} from './SourceStatus';
import {ScheduleDetail} from './ScheduleDetail';
import {RunDetail} from './RunDetail';
import {initialDraft} from './model';
import {adminCapabilities,userCapabilities} from '../../../tests/helpers/render-admin';
import type {SourceReviewItem} from './source-resolution';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:request,mutationKey:()=> 'stable-key',acknowledged:vi.fn()}));
const item:SourceReviewItem={task_id:'task',id:'review',version:1,revision:'revision',scope:{geography_id:'05001',category:'opportunity',source_id:null,capability_id:null},name:'County bid website',location:'Arkansas County',category:'opportunity',title:'No verified website',impact:'This check did not find a verified website.',check:{state:'source_missing',observed_at:'2026-10-20T10:00:00Z',last_success_at:null},decision:'no_website',previous_decision:null,checks_excluded:true,reviewed_at:'2026-10-21T10:00:00Z',responsibility:'Admin',allowed_actions:['view_status']};
const schedule={...initialDraft(),id:'schedule',version:1,next_due_at:null,name:'Weekly leads'};
beforeEach(()=>{sessionStorage.clear();window.history.replaceState({},'','/');request.mockReset();request.mockImplementation(async(path:string)=>{
 if(path==='/v1/capabilities')return userCapabilities;
 if(path==='/v1/schedules/schedule')return schedule;
 if(path.includes('/source-status'))return {items:[item]};
 if(path.startsWith('/v1/admin/history'))return {items:[],next_offset:null};
 return {items:[],next_offset:null};
});});
afterEach(()=>{cleanup();vi.useRealTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});});

it('shows an accepted gap to Users without a repair control or private evidence read',async()=>{
 render(<SchedulingRoleContext.Provider value={userCapabilities}><SourceStatus owner="owner" requestId="request"/></SchedulingRoleContext.Provider>);
 await screen.findByText('No website recorded');expect(screen.getByText(/Checks disabled by admin decision/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:/Review \/ repair/})).toBeNull();expect(request.mock.calls.every(([p])=>p.endsWith('/source-status'))).toBe(true);
 expect(screen.queryByText('Fixed and verified')).toBeNull();
});
it('does no Admin queue read for a User direct link',()=>{
 render(<SchedulingRoleContext.Provider value={userCapabilities}><SourceStatus attention owner="owner"/></SchedulingRoleContext.Provider>);
 expect(screen.getByRole('heading',{name:'Admin review required'})).toBeTruthy();expect(request).not.toHaveBeenCalled();
});
it('maps a legacy geography link to read-only scope and a legacy logs link to User results',async()=>{
 const props={id:'schedule',owner:'owner',onSection:vi.fn(),onClose:vi.fn(),onView:vi.fn(),onEdit:vi.fn(),onAction:vi.fn(),busy:false};
 const view=render(<SchedulingRoleContext.Provider value={userCapabilities}><ScheduleDetail {...props} section="geography"/></SchedulingRoleContext.Provider>);
 await screen.findByRole('heading',{name:'Weekly leads'});expect(screen.getByText('Schedule scope and setup').closest('details')?.open).toBe(true);
 expect(screen.getAllByRole('tab').map(t=>t.textContent)).toEqual(['Results','Sources','Schedule changes']);
 view.rerender(<SchedulingRoleContext.Provider value={userCapabilities}><ScheduleDetail {...props} section="logs"/></SchedulingRoleContext.Provider>);
 expect(screen.getByRole('tab',{name:'Results'}).getAttribute('aria-selected')).toBe('true');
 expect(request.mock.calls.some(([p])=>p.includes('/steps')||p.includes('/admin/geographies')||p.includes('/admin/sources'))).toBe(false);expect(props.onEdit).not.toHaveBeenCalled();
});
it('refreshes a failed source read in place without reloading other run reports',async()=>{
 let fail=true;request.mockImplementation(async()=>{if(fail)throw Error('private stack');return {items:[item]};});
 render(<SchedulingRoleContext.Provider value={userCapabilities}><SourceStatus owner="owner" requestId="request"/></SchedulingRoleContext.Provider>);
 await screen.findByRole('button',{name:'Retry source status'});expect(screen.queryByText('private stack')).toBeNull();fail=false;
 fireEvent.click(screen.getByRole('button',{name:'Retry source status'}));await screen.findByText('No website recorded');expect(request.mock.calls.every(([p])=>p.endsWith('/source-status'))).toBe(true);
});
it('does not reinterpret a completed empty check as needing Admin review',async()=>{
 request.mockResolvedValue({items:[{...item,id:null,decision:'unreviewed',checks_excluded:false,allowed_actions:[],check:{...item.check,state:'reviewed_no_results'},title:'Checked · no matching records'}]});
 render(<SchedulingRoleContext.Provider value={adminCapabilities}><SourceStatus owner="owner" requestId="request"/></SchedulingRoleContext.Provider>);
 await screen.findByText('No review decision recorded for this check.');expect(screen.queryByRole('button',{name:/Review \/ repair/})).toBeNull();expect(screen.queryByText(/Responsibility/)).toBeNull();
});
it('keeps an ordinary pending check out of Admin review instead of fabricating an issue',async()=>{
 request.mockResolvedValue({items:[{...item,id:null,decision:'unreviewed',checks_excluded:false,check:{...item.check,state:'unchecked'},title:'Waiting to check'}]});
 render(<SchedulingRoleContext.Provider value={adminCapabilities}><SourceStatus owner="owner" requestId="request"/></SchedulingRoleContext.Provider>);
 await screen.findByText('Waiting to check');expect(screen.queryByText('Needs review')).toBeNull();expect(screen.queryByText(/Responsibility/)).toBeNull();expect(screen.queryByRole('button',{name:/Review \/ repair/})).toBeNull();
});
it('clears privileged panels and saved review drafts when the trusted role changes',async()=>{
 let cap=adminCapabilities as typeof adminCapabilities|typeof userCapabilities;request.mockImplementation(async()=>cap);
 sessionStorage.setItem('spin-admin-source-note:owner:task','private draft');
 function Private(){return <SchedulingRoleContext.Consumer>{value=><p>{value.manage_sources?'Private Admin panel':'User schedule panel'}</p>}</SchedulingRoleContext.Consumer>;}
 render(<SchedulingAccess owner="owner"><Private/></SchedulingAccess>);await screen.findByText('Private Admin panel');cap=userCapabilities;
 fireEvent(window,new Event('focus'));await screen.findByText('User schedule panel');expect(screen.queryByText('Private Admin panel')).toBeNull();expect(sessionStorage.getItem('spin-admin-source-note:owner:task')).toBeNull();
});
it('stops capability polling when the app view or document is hidden',async()=>{
 const view=render(<SchedulingAccess owner="owner"><p>Schedule workspace</p></SchedulingAccess>);await screen.findByText('Schedule workspace');
 vi.useFakeTimers();view.rerender(<SchedulingAccess owner="owner" active={false}><p>Schedule workspace</p></SchedulingAccess>);
 const count=request.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(90000);});expect(request.mock.calls).toHaveLength(count);
});
it('preserves a draft during a permission read failure, then removes it when User authority is confirmed',async()=>{
 let phase='admin';request.mockImplementation(async()=>{if(phase==='offline')throw Error('Offline');return phase==='admin'?adminCapabilities:userCapabilities;});
 sessionStorage.setItem('spin-admin-source-note:owner:task','Admin draft');
 render(<SchedulingAccess owner="owner"><SchedulingRoleContext.Consumer>{value=><p>{value.manage_sources?'Private panel':'User panel'}</p>}</SchedulingRoleContext.Consumer></SchedulingAccess>);
 await screen.findByText('Private panel');phase='offline';fireEvent(window,new Event('focus'));await screen.findByRole('alert');expect(sessionStorage.getItem('spin-admin-source-note:owner:task')).toBe('Admin draft');
 phase='user';fireEvent.click(screen.getByRole('button',{name:'Retry access check'}));await screen.findByText('User panel');expect(sessionStorage.getItem('spin-admin-source-note:owner:task')).toBeNull();
});
it('fails closed on an unrecognized role even if a response claims Admin flags',async()=>{
 request.mockResolvedValue({...adminCapabilities,role:'owner'});render(<SchedulingAccess owner="owner"><p>Private</p></SchedulingAccess>);
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('does not have scheduling access'));expect(screen.queryByText('Private')).toBeNull();
});
it('explains uncertain saved results to a User without exposing a resend or private reconciliation operation',async()=>{
 request.mockResolvedValue({id:'run',created_at:'2026-10-20T10:00:00Z',state:'outcome_unknown',target_kind:'county_scope',children:[]});
 render(<SchedulingRoleContext.Provider value={userCapabilities}><RunDetail id="run" owner="owner" onClose={()=>{}} onViewLeads={()=>{}} onSource={()=>{}} changed={()=>{}}/></SchedulingRoleContext.Provider>);
 await screen.findByRole('heading',{name:'Results need confirmation'});expect(screen.getByText(/An Admin manages reconciliation/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:/resume|retry import|reconcile/i})).toBeNull();expect(request.mock.calls.every(([p])=>p==='/v1/triggers/run')).toBe(true);
});

it('makes reviewed and disabled sources discoverable from an empty Admin issue view without background duplicate reads',async()=>{
 request.mockImplementation(async(path:string)=>({items:path.includes('reviewed=true')?[item]:[],next_offset:null}));
 render(<SchedulingRoleContext.Provider value={adminCapabilities}><SourceStatus attention owner="owner"/></SchedulingRoleContext.Provider>);
 await screen.findByText(/No unresolved source issues/);
 expect(request).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Review decisions and disabled checks'}));
 await screen.findByRole('button',{name:/Review \/ repair/});
 expect(screen.getByText(/Checks disabled by admin decision/)).toBeTruthy();
 expect(request.mock.calls.map(([path])=>path)).toEqual(['/v1/source-reviews?reviewed=false&offset=0','/v1/source-reviews?reviewed=true&offset=0']);
});
