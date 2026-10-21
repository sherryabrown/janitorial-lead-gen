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
beforeEach(()=>{sessionStorage.clear();mocked.request.mockReset();mocked.request.mockImplementation(async(path:string,options:{body:AnySchedule})=>path.endsWith('/preview')?{...options.body,config:options.body.config.target_kind==='sam'?options.body.config:{...options.body.config,counties:[scope]},preview_hash:'hash',next_due_at:null}:{...options.body,id:'saved',version:1});});
afterEach(cleanup);
it.each(['county_scope','state_source','sam'])('saves %s with one action and existing preview/version contracts',async target=>{
 const onSaved=vi.fn();render(<ScheduleEditor owner="owner" target={target} initial={target==='state_source'?{...draft,config:{...draft.config,target_kind:'state_source',state_trigger_id:'state'}}:draft} counties={[scope]} sources={[]} registryState="ready" onClose={()=>{}} onSaved={onSaved}/>);
 const save=screen.getByRole('button',{name:'Save schedule'});await waitFor(()=>expect(save).toHaveProperty('disabled',false));
 expect(mocked.request.mock.calls.every(([p])=>p.endsWith('/preview'))).toBe(true);
 fireEvent.click(save);await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 const write=mocked.request.mock.calls.find(([p])=>p==='/v1/schedules');expect(write?.[1].body).toMatchObject({confirmed_scope:true,preview_hash:'hash',config:{target_kind:target}});expect(write?.[1].key).toBe('stable-key');
 expect(screen.queryByRole('button',{name:/Review|Confirm and save/})).toBeNull();
});
it('keeps saved counties read-only and stops a save when the resolved city scope changes',async()=>{
 const onSaved=vi.fn(),saved={...draft,id:'saved',version:3,next_due_at:null,config:{...draft.config,counties:[scope]}};
 render(<ScheduleEditor owner="owner" target="county_scope" saved={saved} counties={[scope]} sources={[]} registryState="ready" onClose={()=>{}} onSaved={onSaved}/>);
 expect(screen.queryByRole('checkbox',{name:'Saline County'})).toBeNull();expect(screen.getByRole('button',{name:'About saved counties'})).toBeTruthy();
 const save=screen.getByRole('button',{name:'Save changes'});await waitFor(()=>expect(save).toHaveProperty('disabled',false));
 mocked.request.mockResolvedValueOnce({config:{...draft.config,counties:[{...scope,cities:[]}]},preview_hash:'changed'});
 fireEvent.click(save);await screen.findByRole('alert');expect(onSaved).not.toHaveBeenCalled();expect(mocked.request.mock.calls.some(([p])=>p.endsWith('/update'))).toBe(false);
});
it('keeps its draft and mutation identity when save acknowledgement is lost',async()=>{
 const original=mocked.request.getMockImplementation()!,onSaved=vi.fn();let writes=0;
 mocked.request.mockImplementation(async(path,options)=>{if(path==='/v1/schedules'&&++writes===1)throw Error('Connection interrupted');return original(path,options);});
 render(<ScheduleEditor owner="owner" target="county_scope" initial={draft} counties={[scope]} sources={[]} registryState="ready" onClose={()=>{}} onSaved={onSaved}/>);
 const save=screen.getByRole('button',{name:'Save schedule'});await waitFor(()=>expect(save).toHaveProperty('disabled',false));fireEvent.click(save);
 await screen.findByRole('alert');expect(screen.getByLabelText('Schedule name')).toHaveProperty('value','Weekly checks');
 fireEvent.click(save);await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 const writesMade=mocked.request.mock.calls.filter(([p])=>p==='/v1/schedules');expect(writesMade).toHaveLength(2);expect(writesMade[0][1]).toEqual(writesMade[1][1]);
});
