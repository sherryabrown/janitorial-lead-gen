import { describe, expect, it } from 'vitest';
import { formatDateLabel, formatKeyDate, normalizeUrl, parseContractDate } from './contract-utils';
import { saveLeadChange } from './save-lead-change';

describe('calendar dates and optional source links', () => {
  it('retains calendar days and rejects impossible dates', () => {
    expect(formatDateLabel('2026-09-17','due')).toBe('Due Sep 17, 2026');
    expect(formatKeyDate({kind:'date',value:'2026-03-08'})).toBe('Mar 8, 2026');
    expect(parseContractDate('2026-02-30').getTime()).toBeNaN();
    expect(formatDateLabel('','due')).toBe('Due date pending');
    expect(parseContractDate('2026-09-17T10:30:00-05:00').toISOString()).toBe('2026-09-17T15:30:00.000Z');
  });
  it('allows public HTTP(S) links and bare domains only', () => {
    for (const value of ['', '  ', 'https://', 'javascript:alert(1)', 'data:text/html,x', '/relative', 'https://user:password@example.org']) expect(normalizeUrl(value)).toBeUndefined();
    expect(normalizeUrl(' example.org/bids ')).toBe('https://example.org/bids');
    expect(normalizeUrl('http://example.org/bids')).toBe('http://example.org/bids');
  });
});

it.each(['single','bulk'])('keeps a committed %s write successful when the follow-up read fails', async () => {
  const events:string[]=[];
  const result=await saveLeadChange({write:async()=>['saved'],commit:()=>events.push('committed'),refresh:async()=>{events.push('read');throw Error('offline');},onRefreshError:()=>events.push('retry available')});
  expect(result).toEqual(['saved']);expect(events).toEqual(['committed','read','retry available']);
});

it('does not commit optimistic success or refresh when a write fails', async () => {
  const events:string[]=[];
  await expect(saveLeadChange({write:async()=>{throw Error('denied');},commit:()=>events.push('commit'),refresh:async()=>events.push('read'),onRefreshError:()=>events.push('error')})).rejects.toThrow('denied');
  expect(events).toEqual([]);
});
