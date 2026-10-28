// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SourceResolution} from './SourceResolution';
import type {SourceResolutionDetail} from './source-resolution';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:request,mutationKey:()=> 'stable-review-key',acknowledged:vi.fn()}));
const initial=():SourceResolutionDetail=>({item:{task_id:'task',id:'review',version:2,revision:'source-revision',scope:{geography_id:'county',category:'opportunity',source_id:'source',capability_id:null},
 name:'County bid website',location:'Arkansas County',category:'opportunity',title:'Bid listings need setup',impact:'This run did not check opportunity listings from this website.',
 check:{state:'method_missing',observed_at:null,last_success_at:null},decision:'unreviewed',previous_decision:null,checks_excluded:false,reviewed_at:null,responsibility:'Admin',
 allowed_actions:['provide_website','no_website','no_issue','wont_address','needs_developer']},reason:'',website:'https://county.example/',verification:null,can_reenable:false,
 impact:{scope:'Arkansas County · opportunity',schedules:[{id:'schedule',name:'Weekly county leads',version:3}],explanation:'Only the selected check is affected. Other sources continue.'},preview_token:'current-preview',history:[],more_history:false});
let detail:SourceResolutionDetail;
beforeEach(()=>{detail=initial();sessionStorage.clear();request.mockReset();request.mockImplementation(async(_path:string,options?:{body?:Record<string,unknown>})=>{
 if(options?.body){if(options.body.decision)detail={...detail,item:{...detail.item,version:3,decision:options.body.decision as typeof detail.item.decision,checks_excluded:['no_website','wont_address'].includes(String(options.body.decision))}};return {job_id:'job',state:'pending'};}
 return structuredClone(detail);
});});
afterEach(()=>{cleanup();vi.useRealTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
const props={requestId:'request',taskId:'task',owner:'owner',canManage:true,onBack:vi.fn(),onDone:vi.fn()};
async function start(){render(<SourceResolution {...props}/>);await screen.findByRole('heading',{name:'County bid website'});}

it.each([['No website','no_website'],['No issue','no_issue'],['Won’t address','wont_address'],['Needs developer','needs_developer']])('records %s with a short reason and honest check facts',async(label,decision)=>{
 await start();fireEvent.click(screen.getByLabelText(label));fireEvent.change(screen.getByLabelText('Short reason'),{target:{value:'Reviewed this source and its impact'}});
 const save=screen.getByRole('button',{name:'Save decision'});
 if(['no_website','wont_address'].includes(decision)){
  expect(save).toHaveProperty('disabled',true);expect(screen.getByText('Weekly county leads')).not.toBeNull();
  fireEvent.click(screen.getByLabelText('Skip this check until an admin re-enables it.'));
 }
 fireEvent.click(save);
 await waitFor(()=>expect(request.mock.calls.some(c=>c[1]?.body?.decision===decision)).toBe(true));
 const body=request.mock.calls.find(c=>c[1]?.body?.decision===decision)![1].body;
 expect(body).toMatchObject({version:2,revision:'source-revision',decision,reason:'Reviewed this source and its impact'});
 await screen.findByText('Decision saved.');expect(detail.item.check.state).toBe('method_missing');
 expect(screen.queryByText('Fixed and verified')).toBeNull();
});

it('verifies a website without technical inputs or claiming that a homepage fixes listings',async()=>{
 await start();fireEvent.change(screen.getByLabelText('Official website'),{target:{value:'https://county.example/bids'}});
 fireEvent.click(screen.getByRole('button',{name:'Verify website'}));
 await waitFor(()=>expect(request.mock.calls.some(c=>c[0].endsWith('/verify'))).toBe(true));
 expect(request.mock.calls.find(c=>c[0].endsWith('/verify'))![1].body).toEqual({url:'https://county.example/bids',version:2,revision:'source-revision'});
 expect(screen.getByText(/working homepage alone does not fix/)).not.toBeNull();
 expect(screen.queryByLabelText(/parser|SQL|UUID|FIPS/i)).toBeNull();
});

it('requires the current impact confirmation before applying verified setup',async()=>{
 detail.verification={job_id:'job',state:'blocked',kind:'website',checked_at:null,can_apply_website:true,can_apply_method:false,needs_reconciliation:false,fixed:false,
  title:'Official website entry verified',explanation:'Listing checks remain incomplete.',diagnostic_reference:'private-reference'};
 await start();const apply=screen.getByRole('button',{name:'Use this website'});expect(apply).toHaveProperty('disabled',true);
 fireEvent.click(screen.getByLabelText('I reviewed the affected scope and schedules.'));fireEvent.click(apply);
 await waitFor(()=>expect(request.mock.calls.some(c=>c[0].endsWith('/apply'))).toBe(true));
 expect(request.mock.calls.find(c=>c[0].endsWith('/apply'))![1].body).toEqual({job_id:'job',confirmed_scope:true,preview_token:'current-preview'});
 expect(screen.queryByText('private-reference')).toBeNull();
});

it('keeps a note after a failed save and clears privileged content on role loss',async()=>{
 const view=render(<SourceResolution {...props}/>);await screen.findByRole('heading',{name:'County bid website'});
 fireEvent.click(screen.getByLabelText('No issue'));fireEvent.change(screen.getByLabelText('Short reason'),{target:{value:'Keep this review note'}});
 request.mockImplementationOnce(async()=>{throw Error('Source decision changed. Reload before saving.');});
 fireEvent.click(screen.getByRole('button',{name:'Save decision'}));await screen.findByRole('alert');
 expect(screen.getByLabelText('Short reason')).toHaveProperty('value','Keep this review note');
 const calls=request.mock.calls.length;view.rerender(<SourceResolution {...props} canManage={false}/>);
 expect(screen.getByRole('heading',{name:'Admin review required'})).not.toBeNull();
 expect(screen.queryByText('Keep this review note')).toBeNull();expect(request.mock.calls.length).toBe(calls);
 expect(sessionStorage.getItem('spin-admin-source-note:owner:task')).toBeNull();
});

it('does no source review read for a regular User',()=>{
 render(<SourceResolution {...props} canManage={false}/>);expect(request).not.toHaveBeenCalled();
});

it('suspends verification polling while its workspace is hidden',async()=>{
 detail.verification={job_id:'job',state:'pending',kind:'website',checked_at:null,can_apply_website:false,can_apply_method:false,needs_reconciliation:false,fixed:false,title:'Checking this source',explanation:'Verification is running.',diagnostic_reference:'reference'};
 const view=render(<SourceResolution {...props}/>);await screen.findByRole('heading',{name:'County bid website'});
 vi.useFakeTimers();view.rerender(<SourceResolution {...props} active={false}/>);
 const calls=request.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(request.mock.calls.length).toBe(calls);
});
