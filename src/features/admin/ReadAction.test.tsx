// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ReadAction} from './ReadAction';
afterEach(cleanup);
it('keeps one stable read control across loading success stale error and recovery',()=>{
 const read=vi.fn();const {rerender}=render(<ReadAction scope="stats" busy onRead={read}/>);
 expect(screen.getAllByRole('button')).toHaveLength(1);expect(screen.getByRole('button',{name:'Loading… stats'})).toHaveProperty('disabled',true);expect(screen.queryByRole('button',{name:'Retry stats'})).toBeNull();
 rerender(<ReadAction scope="stats" loaded onRead={read}/>);expect(screen.getByText(/Last loaded/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Refresh stats'}));expect(read).toHaveBeenCalledOnce();
 rerender(<ReadAction scope="stats" loaded error onRead={read}/>);expect(screen.getByText('Saved view · update failed')).toBeTruthy();expect(screen.getAllByRole('button')).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Retry stats'}));expect(read).toHaveBeenCalledTimes(2);
 rerender(<ReadAction scope="stats" loaded busy onRead={read}/>);expect(screen.getByRole('button',{name:'Refreshing… stats'})).toHaveProperty('disabled',true);
});
