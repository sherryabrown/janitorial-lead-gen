// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountControls } from './AccountControls';
afterEach(cleanup);
it('exposes email on focus and supports keyboard/tap, Escape, outside dismissal and sign-out',()=>{
  const settings=vi.fn(), signOut=vi.fn();
  render(<AccountControls email={'very-long-'.repeat(12)+'@example.invalid'} active onSettings={settings} onSignOut={signOut}/>);
  const profile=screen.getByRole('button',{name:'Profile'});
  expect(screen.getByRole('tooltip').textContent).toContain('@example.invalid');
  expect(profile.getAttribute('aria-describedby')).toBe('account-email');
  fireEvent.click(screen.getByRole('button',{name:'Settings'})); expect(settings).toHaveBeenCalledOnce();
  fireEvent.click(profile); expect(screen.getByRole('dialog',{name:'Account'})).toBeTruthy();
  fireEvent.keyDown(profile,{key:'Escape'}); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(profile);
  fireEvent.click(profile); fireEvent.pointerDown(document.body); expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(profile); fireEvent.click(screen.getByRole('button',{name:'Sign out'})); expect(signOut).toHaveBeenCalledOnce();
});
it('handles missing email without exposing a fake account address',()=>{
  render(<AccountControls active={false} onSettings={()=>{}} onSignOut={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Profile'}));
  expect(screen.getByText('Email unavailable')).toBeTruthy();
});
