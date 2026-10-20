// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ActionMenu } from './ActionMenu';
afterEach(cleanup);
const select = vi.fn();
function Fixture() {
  const [id, setId] = useState('');
  return <><button>Before</button>{['First','Second'].map(name => <ActionMenu key={name} label={name} open={id===name} onOpenChange={v=>setId(v?name:'')} actions={[
    {label:'Edit',onSelect:select}, {label:'Archived action',disabled:true,onSelect:select}, {label:'Details',onSelect:select},
  ]}/>)}<button>After</button></>;
}
it('opens only on activation, allows one portal menu, dismisses outside and dispatches valid actions only',()=>{
  select.mockClear();render(<Fixture/>);
  const first=screen.getByRole('button',{name:'First'});
  fireEvent.mouseOver(first);expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(first);expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Edit'}));
  expect(screen.getByRole('menu').parentElement).toBe(document.body);
  fireEvent.click(screen.getByRole('menuitem',{name:'Archived action'}));expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Second'}));expect(screen.getAllByRole('menu')).toHaveLength(1);expect(first.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('menuitem',{name:'Details'}));expect(select).toHaveBeenCalledOnce();expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(first);fireEvent.pointerDown(screen.getByRole('button',{name:'After'}));expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(first);fireEvent.click(first);expect(screen.queryByRole('menu')).toBeNull();
});
it('supports arrow/Home/End/Escape, focus return, Tab exit and safe scroll/resize dismissal',()=>{
  render(<Fixture/>);const trigger=screen.getByRole('button',{name:'First'});
  fireEvent.keyDown(trigger,{key:'ArrowUp'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Details'}));
  fireEvent.keyDown(document.activeElement!,{key:'Home'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Edit'}));
  fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Archived action'}));
  fireEvent.keyDown(document.activeElement!,{key:'End'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Details'}));
  fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByRole('menu')).toBeNull();expect(document.activeElement).toBe(trigger);
  fireEvent.keyDown(trigger,{key:'ArrowDown'});fireEvent.keyDown(document.activeElement!,{key:'Tab'});expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger);fireEvent.scroll(window);expect(screen.queryByRole('menu')).toBeTruthy();
  fireEvent.keyDown(document.activeElement!,{key:'Escape'});
  fireEvent.click(trigger);fireEvent.resize(window);expect(screen.queryByRole('menu')).toBeNull();
});
