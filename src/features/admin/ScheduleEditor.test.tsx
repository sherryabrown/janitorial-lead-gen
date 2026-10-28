// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ScheduleEditor} from './ScheduleEditor';
import {initialDraft} from './model';
import type {AnySchedule,Draft} from './types';
const mocked=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:mocked.request,mutationKey:()=> 'stable-key',acknowledged:()=>{}}));
const scope={id:'05125',name:'Saline County',city_ids:['benton'],cities:[{id:'benton',name:'Benton'}],selection_token:'v1'};
const draft:Draft={...initialDraft(),name:'Weekly checks',config:{...initialDraft().config,county_ids:['05125']}};
beforeEach(()=>{sessionStorage.clear();mocked.request.mockReset();mocked.request.mockImplementation(async(path:string,options:{body:AnySchedule})=>path.includes('/counties')?{counties:[scope]}:path.endsWith('/preview')?{...options.body,config:options.body.config.target_kind==='sam'?options.body.config:{...options.body.config,counties:[scope]},preview_hash:'hash',next_due_at:null}:{...options.body,id:'saved',version:1});});
afterEach(cleanup);
it.each(['county_scope','state_source','sam'])('saves %s with one action and existing preview/version contracts',async target=>{
 const onSaved=vi.fn();render(<ScheduleEditor owner="owner" target={target} initial={target==='state_source'?{...draft,config:{...draft.config,target_kind:'state_source',state_trigger_id:'state'}}:draft} counties={[scope]} sources={[{id:'state',source_id:'source',name:'State bids',category:'opportunity',county_ids:['05125'],schedule_id:null,schedule_enabled:null,next_due_at:null,latest_run:null,last_finished_at:null}]} registryState="ready" onClose={()=>{}} onSaved={onSaved}/>);
 const save=screen.getByRole('button',{name:'Save schedule'});await waitFor(()=>expect(save).toHaveProperty('disabled',false));
 expect(mocked.request.mock.calls.every(([p])=>p.endsWith('/preview')||p.includes('/counties'))).toBe(true);
 fireEvent.click(save);await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 const write=mocked.request.mock.calls.find(([p])=>p==='/v1/schedules');expect(write?.[1].body).toMatchObject({confirmed_scope:true,preview_hash:'hash',config:{target_kind:target}});expect(write?.[1].key).toBe('stable-key');if(target!=='sam')expect(write?.[1].body.config).toMatchObject({maintain_sources:false,check_updates:true});
 expect(screen.queryByRole('button',{name:/Review|Confirm and save/})).toBeNull();
});
it('keeps saved counties read-only and stops a save when the resolved city scope changes',async()=>{
 const onSaved=vi.fn(),saved={...draft,id:'saved',version:3,next_due_at:null,config:{...draft.config,counties:[scope]}};
 render(<ScheduleEditor owner="owner" target="county_scope" saved={saved} counties={[scope]} sources={[{id:'state',source_id:'source',name:'State bids',category:'opportunity',county_ids:['05125'],schedule_id:null,schedule_enabled:null,next_due_at:null,latest_run:null,last_finished_at:null}]} registryState="ready" onClose={()=>{}} onSaved={onSaved}/>);
 expect(screen.queryByRole('checkbox',{name:'Saline County'})).toBeNull();expect(screen.getByRole('button',{name:'About saved counties'})).toBeTruthy();
 const save=screen.getByRole('button',{name:'Save changes'});await waitFor(()=>expect(save).toHaveProperty('disabled',false));
 mocked.request.mockResolvedValueOnce({config:{...draft.config,counties:[{...scope,cities:[]}]},preview_hash:'changed'});
 fireEvent.click(save);await screen.findByRole('alert');expect(onSaved).not.toHaveBeenCalled();expect(mocked.request.mock.calls.some(([p])=>p.endsWith('/update'))).toBe(false);
});
it('keeps its draft and mutation identity when save acknowledgement is lost',async()=>{
 const original=mocked.request.getMockImplementation()!,onSaved=vi.fn();let writes=0;
 mocked.request.mockImplementation(async(path,options)=>{if(path==='/v1/schedules'&&++writes===1)throw Error('Connection interrupted');return original(path,options);});
 render(<ScheduleEditor owner="owner" target="county_scope" initial={draft} counties={[scope]} sources={[{id:'state',source_id:'source',name:'State bids',category:'opportunity',county_ids:['05125'],schedule_id:null,schedule_enabled:null,next_due_at:null,latest_run:null,last_finished_at:null}]} registryState="ready" onClose={()=>{}} onSaved={onSaved}/>);
 const save=screen.getByRole('button',{name:'Save schedule'});await waitFor(()=>expect(save).toHaveProperty('disabled',false));fireEvent.click(save);
 await screen.findByRole('alert');expect(screen.getByLabelText('Schedule name')).toHaveProperty('value','Weekly checks');
 fireEvent.click(save);await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 const writesMade=mocked.request.mock.calls.filter(([p])=>p==='/v1/schedules');expect(writesMade).toHaveLength(2);expect(writesMade[0][1]).toEqual(writesMade[1][1]);
});

it('shows cities before a name, keeps schedule defaults separate, and restores per-type scope without confirmation',async()=>{
 const confirm=vi.spyOn(window,'confirm');render(<ScheduleEditor owner="owner" target="county_scope" counties={[scope]} sources={[]} registryState="ready" onClose={()=>{}} onSaved={()=>{}}/>);
 fireEvent.click(screen.getByLabelText('Saline County',{selector:'input'}));await screen.findByText('Saline County (1 cities)');
 expect(screen.getByLabelText('Schedule name')).toHaveProperty('value','');expect(screen.getByRole('checkbox',{name:'Enabled'})).toHaveProperty('checked',true);
 expect(screen.getByText('Work · Check for lead updates').parentElement).toHaveProperty('open',false);
 expect(screen.getByText('Date window · Next 120 days · CT')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:'Retained name'}});
 fireEvent.click(screen.getByRole('radio',{name:'SAM.gov'}));expect(screen.getByLabelText('Posted within the last (days)')).toHaveProperty('value','120');
 fireEvent.click(screen.getByRole('radio',{name:'Counties'}));expect(screen.getByLabelText('Saline County',{selector:'input'})).toHaveProperty('checked',true);
 expect(screen.getByLabelText('Schedule name')).toHaveProperty('value','Retained name');expect(confirm).not.toHaveBeenCalled();confirm.mockRestore();
});
it('blocks duplicate and blank times instead of silently dropping the extra entry',async()=>{
 render(<ScheduleEditor owner="owner" target="county_scope" initial={draft} counties={[scope]} sources={[]} registryState="ready" onClose={()=>{}} onSaved={()=>{}}/>);
 // Poll the mounted button's state without rescanning all 75 map buttons.
 const save=screen.getByRole('button',{name:'Save schedule'});
 await waitFor(()=>expect(save).toHaveProperty('disabled',false));
 fireEvent.click(screen.getByRole('button',{name:'+ Another time'}));expect(save).toHaveProperty('disabled',true);
 fireEvent.change(screen.getByLabelText('Run at 2'),{target:{value:'09:00'}});expect(save).toHaveProperty('disabled',true);
 fireEvent.change(screen.getByLabelText('Run at 2'),{target:{value:'14:00'}});await waitFor(()=>expect(save).toHaveProperty('disabled',false));
});
it('saves multiple physical state sources together and deduplicates their affected counties',async()=>{
 const common={schedule_id:null,schedule_enabled:null,next_due_at:null,latest_run:null,last_finished_at:null};
 const sources=[{...common,id:'a',source_id:'source-a',name:'Source A public procurement',category:'opportunity' as const,county_ids:['05125']},{...common,id:'b',source_id:'source-b',name:'Source B public procurement',category:'opportunity' as const,county_ids:['05125']}];
 render(<ScheduleEditor owner="owner" target="state_source" counties={[scope]} sources={sources} registryState="ready" onClose={()=>{}} onSaved={()=>{}}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:/Source A/}));fireEvent.click(screen.getByRole('checkbox',{name:/Source B/}));
 await screen.findByText('Saline County (1 cities)');expect(screen.getAllByText('Saline County (1 cities)')).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:'Grouped sources'}});await waitFor(()=>expect(screen.getByRole('button',{name:'Save schedule'})).toHaveProperty('disabled',false));
 fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));await waitFor(()=>expect(mocked.request.mock.calls.some(([p])=>p==='/v1/schedules')).toBe(true));
 expect(mocked.request.mock.calls.find(([p])=>p==='/v1/schedules')?.[1].body.config).toMatchObject({state_trigger_ids:['a','b'],county_ids:['05125'],state_trigger_id:null});
});

it('shows actionable reservation conflicts and prevents an overlapping save',async()=>{
 const original=mocked.request.getMockImplementation()!;
 mocked.request.mockImplementation(async(path,options)=>{const value=await original(path,options);return path.endsWith('/preview')?{...value,conflicts:[{schedule_id:'existing',name:'Existing county updates',county_id:'05125',work:'check_updates'}]}:value;});
 render(<ScheduleEditor owner="owner" target="county_scope" initial={draft} counties={[scope]} sources={[]} registryState="ready" onClose={()=>{}} onSaved={()=>{}}/>);
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Save schedule'})).toHaveProperty('disabled',true);
 expect(screen.getByRole('link',{name:'View Existing county updates'}).getAttribute('href')).toContain('adminSchedule=existing');
 expect(mocked.request.mock.calls.some(([p])=>p==='/v1/schedules')).toBe(false);
});
