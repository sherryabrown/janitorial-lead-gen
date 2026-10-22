// @vitest-environment jsdom
import {useState} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Catalog} from './Catalog';
import {ReadWorkspace,WorkspaceReadAction} from './ReadWorkspace';
const mocks=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mocks.request}));
const source={id:'source',name:'Official county bids with a long name',kind:'county',code:'official',url:'https://example.gov/',mapping_status:'mapped',readiness:'needs_attention',warnings:[],legacy_notes_present:true,check_basis:'Collection history unavailable; registry remains readable',last_check:null,next_action:'Review dated methods',associations:[],routes:[{geography_id:'05125',geography:'Saline County',kind:'opportunity',status:'method_blocked',next_action:'Renew the verified method',methods:[{id:'method',status:'blocked',method:'browser',runner:null,verified_at:'2026-01-01',verified_until:'2026-10-01',evidence_url:null,blocker:'Verification expired'}],assessment:null}]};
const geography={id:'05125',name:'Saline County',kind:'county',active:true,counties:[],basis:'Registered GIS membership',associations:[],cities:[{id:'tull',name:'Tull',active:true,counties:[{id:'05125',name:'Saline County'},{id:'05053',name:'Grant County'}]}],saved:{comparison_available:true,changed:true,cities:[],added:[{id:'tull',name:'Tull'}],removed:[]}};
const result=(items:unknown[],extra={})=>({items,total:items.length,next_offset:null,as_of:'2026-10-22T12:00:00Z',scope:null,basis:'Current registry; not proof of collection',...extra});
beforeEach(()=>{sessionStorage.clear();mocks.request.mockReset();mocks.request.mockImplementation(async(p:string)=>result(p.includes('geographies')?[geography]:[source]));});
afterEach(cleanup);
function Sources(){const [id,setId]=useState<string|undefined>();return <Catalog mode="sources" owner="user" sourceId={id} onSource={setId}/>;}
it('keeps registered methods, dated blockers and missing collection history distinct; restores row focus',async()=>{
 render(<Sources/>);const row=await screen.findByRole('button',{name:source.name});row.focus();fireEvent.click(row);
 await screen.findByRole('table',{name:'Source category methods'});expect(screen.getByText('Verification expired')).toBeTruthy();expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);expect(screen.getByText(/Historical access\/research notes/)).toBeTruthy();
 expect(screen.getByRole('button',{name:'Refresh sources'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Back to registered sources'}));await waitFor(()=>expect(document.activeElement).toBe(row));expect(mocks.request.mock.calls.every(c=>!c[1]?.body)).toBe(true);
});
it('filters and pages on the server and restores owner-scoped filters without storing registry data',async()=>{
 mocks.request.mockImplementation(async(p:string)=>p.includes('offset=25')?result([{...source,id:'next',name:'Next page source'}],{total:51,next_offset:50}):result([source],{total:51,next_offset:25}));
 const mounted=render(<Catalog mode="sources" owner="owner"/>);await screen.findByText('51 registered sources');fireEvent.change(screen.getByLabelText('Search sources'),{target:{value:'Official'}});await waitFor(()=>expect(mocks.request.mock.calls.at(-1)?.[0]).toContain('q=Official'));
 fireEvent.click(screen.getByRole('button',{name:'Next page'}));await screen.findByRole('button',{name:'Next page source'});mounted.unmount();render(<Catalog mode="sources" owner="owner"/>);expect(screen.getByLabelText('Search sources')).toHaveProperty('value','Official');await screen.findByRole('button',{name:'Next page source'});expect(sessionStorage.getItem('spin-admin-catalog-filter:owner:global:sources')).not.toContain('routes');
});
it('ignores obsolete filter responses and never shows old-scope rows after a failed new filter',async()=>{
 let late!:(v:unknown)=>void;
 mocks.request.mockImplementation(async(p:string)=>p.includes('q=late')?new Promise(resolve=>{late=resolve;}):p.includes('q=failed')?Promise.reject(Error('PRIVATE TRACE')):result([source]));
 render(<Catalog mode="sources" owner="user"/>);await screen.findByRole('button',{name:source.name});fireEvent.change(screen.getByLabelText('Search sources'),{target:{value:'late'}});fireEvent.change(screen.getByLabelText('Search sources'),{target:{value:'failed'}});await screen.findByRole('alert');await act(async()=>late(result([{...source,name:'Obsolete source'}])));expect(screen.queryByRole('button',{name:source.name})).toBeNull();expect(screen.queryByText('Obsolete source')).toBeNull();expect(screen.queryByText('PRIVATE TRACE')).toBeNull();expect(screen.getByRole('button',{name:'Retry sources'})).toBeTruthy();
});
it('retains same-scope results on refresh failure with one parent read owner and targeted recovery',async()=>{
 let fail=false;mocks.request.mockImplementation(async()=>{if(fail)throw Error('PRIVATE');return result([source]);});
 render(<ReadWorkspace><WorkspaceReadAction/><Catalog mode="sources" owner="user" scheduleId="schedule"/></ReadWorkspace>);await screen.findByRole('button',{name:source.name});fail=true;fireEvent.click(await screen.findByRole('button',{name:'Refresh schedule'}));await screen.findByRole('button',{name:'Retry schedule'});expect(screen.getByRole('button',{name:source.name})).toBeTruthy();expect(screen.queryByRole('button',{name:'Refresh sources'})).toBeNull();fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry schedule'}));await screen.findByRole('button',{name:'Refresh schedule'});
});
it('shows real multi-county membership and immutable saved/current differences',async()=>{
 function Fixture(){const [id,setId]=useState<string|undefined>();return <Catalog mode="geography" owner="user" scheduleId="schedule" geographyId={id} onGeography={setId}/>;}
 render(<Fixture/>);fireEvent.click(await screen.findByRole('button',{name:'Saline County'}));await screen.findByRole('table',{name:'Current municipality memberships'});expect(screen.getByText('Saline County, Grant County')).toBeTruthy();expect(screen.getByText('Current GIS scope differs from saved selection')).toBeTruthy();expect(screen.getByText('Added: Tull')).toBeTruthy();expect(screen.getByText('Saved schedule remains unchanged.')).toBeTruthy();
});
it('renders unsafe metadata as text, suppresses unsafe links and handles missing selections',async()=>{
 mocks.request.mockImplementation(async(p:string)=>result(p.includes('source=missing')?[]:[{...source,name:'<script>alert(1)</script>',url:'javascript:alert(1)'}]));
 const mounted=render(<Catalog mode="sources" owner="user" sourceId="source" onSource={()=>{}}/>);await screen.findByRole('heading',{name:'<script>alert(1)</script>'});expect(document.querySelector('script')).toBeNull();expect(screen.queryByRole('link',{name:'Official source'})).toBeNull();mounted.rerender(<Catalog mode="sources" owner="user" sourceId="missing" onSource={()=>{}}/>);await screen.findByText(/Selection is unavailable/);expect(screen.queryByRole('table',{name:'Source category methods'})).toBeNull();
});
it('pages gaps separately and preserves category filter on their paging',async()=>{
 mocks.request.mockResolvedValue(result([source],{gaps:{total:30,next_offset:25,items:[{geography_id:'05125',geography:'Saline County',kind:'award',status:'source_missing',next_action:'Verify official channel'}]}}));
 render(<Catalog mode="sources" owner="user"/>);await screen.findByText('30 missing source/category routes');fireEvent.click(screen.getByText('More filters'));fireEvent.change(screen.getByLabelText('Category'),{target:{value:'award'}});await waitFor(()=>expect(mocks.request.mock.calls.at(-1)?.[0]).toContain('category=award'));fireEvent.click(screen.getByText('30 missing source/category routes'));fireEvent.click(screen.getByRole('button',{name:'Next gaps'}));await waitFor(()=>expect(mocks.request.mock.calls.at(-1)?.[0]).toContain('gap_offset=25'));
 expect(await within(screen.getByRole('region',{name:'Registered sources'})).findByText(/Verify official channel/)).toBeTruthy();
});
