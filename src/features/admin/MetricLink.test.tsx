// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MetricLink,MetricNavigation,RunLeadCount} from './MetricLink';
import {parseMetricScope,readLeadScope,metricPath} from './metric-scope';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/procurement-workflow',()=>({workflowRequest:request}));
afterEach(cleanup);beforeEach(()=>{request.mockReset();window.history.replaceState({},'','/');});
const scope={metric:'added',label:'Pulaski results',filters:{run:'00000000-0000-4000-8000-000000000001',period:'all'}};
it('links known zero and partial verified values, leaving unknown or identity-less history unlinked',()=>{
 const leads=vi.fn();render(<MetricNavigation onLeads={leads} onRun={()=>{}}><MetricLink scope={scope} value={0}>0</MetricLink><MetricLink scope={{...scope,metric:'updated'}} value={2}>2 known</MetricLink><RunLeadCount id="old" metric="added" value={3} identity={false}/><MetricLink scope={scope} value={null}>Unknown</MetricLink></MetricNavigation>);
 fireEvent.click(screen.getByRole('link',{name:'Pulaski results: 0'}));expect(leads).toHaveBeenCalledWith({...scope,expected:0});expect(screen.getByText('3 · identities unavailable')).toBeTruthy();expect(screen.getAllByRole('link')).toHaveLength(2);
});
it('opens exact issue records, routes to the associated request, and restores source focus',async()=>{
 request.mockResolvedValue({kind:'issues',items:[{id:'bad',kind:'validation',run_id:'run',request_id:'request',blocker:'Evidence missing',next_action:'Inspect saved evidence'}],total:1,next_offset:null,as_of:'2026-10-22T12:00:00Z',snapshot:'hash'});
 const run=vi.fn();render(<MetricNavigation onLeads={()=>{}} onRun={run}><MetricLink scope={{...scope,metric:'validation_failures'}} value={1}>1 issue</MetricLink></MetricNavigation>);
 const link=screen.getByRole('link');link.focus();fireEvent.click(link);await screen.findByText('Evidence missing');expect(request.mock.calls[0][0]).toContain('member_metric=validation_failures');expect(screen.queryByRole('link')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Back to results'}));await waitFor(()=>expect(document.activeElement).toBe(link));
 fireEvent.click(link);await screen.findByText('Evidence missing');fireEvent.click(screen.getByRole('button',{name:'Open saved run results'}));expect(run).toHaveBeenCalledWith('run','request');
});
it('validates bounded location scopes and never accepts arbitrary serialized data',()=>{
 expect(parseMetricScope({metric:'secret',label:'x',filters:{}})).toBeNull();expect(parseMetricScope({...scope,expected:-1})).toBeNull();
 window.history.replaceState({},'','/?leadReport='+encodeURIComponent(JSON.stringify({...scope,filters:{...scope.filters,private:'hidden'}})));expect(readLeadScope()).toEqual(scope);
 expect(metricPath({...scope,expected:0})).toContain('expected=0');
});
