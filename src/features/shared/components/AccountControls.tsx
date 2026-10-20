import { useEffect, useRef, useState } from 'react';
import { Settings, UserRound } from 'lucide-react';

export function AccountControls({ email, active, onSettings, onSignOut }: {
  email?: string; active: boolean; onSettings: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false), [dismissed, setDismissed] = useState(false);
  const container = useRef<HTMLDivElement>(null), profile = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissHover = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && container.current?.matches(':hover')) setDismissed(true);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', dismissHover);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', dismissHover); };
  }, []);
  return <div className="topbar-actions account-controls">
    <button type="button" className={`account-icon${active ? ' is-active' : ''}`} aria-label="Settings" aria-pressed={active}
      onClick={onSettings}><Settings size={21} aria-hidden="true" /></button>
    <div ref={container} className="account-profile" data-dismissed={dismissed}
      onMouseLeave={() => { if (!container.current?.contains(document.activeElement)) setDismissed(false); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setDismissed(false); } }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); setDismissed(true); profile.current?.focus(); }
      }}>
      <button ref={profile} type="button" className="account-icon" aria-label="Profile" aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'account-panel' : undefined} aria-describedby={!open && !dismissed ? 'account-email' : undefined}
        onClick={() => { setOpen(value => !value); setDismissed(false); }}><UserRound size={21} aria-hidden="true" /></button>
      {!open && <span id="account-email" className="account-tooltip" role="tooltip">{email || 'Email unavailable'}</span>}
      {open && <div id="account-panel" className="account-panel" role="dialog" aria-label="Account">
        <span className="account-email">{email || 'Email unavailable'}</span>
        <button type="button" className="text-button" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
      </div>}
    </div>
  </div>;
}
