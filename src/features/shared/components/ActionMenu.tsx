import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export type MenuAction = { label: string; disabled?: boolean; title?: string; onSelect: () => void };

// Controlled by the containing list so only one row's menu can be open.
export function ActionMenu({ label, open, onOpenChange, actions }: {
  label: string; open: boolean; onOpenChange: (open: boolean) => void; actions: MenuAction[];
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState(false);
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const panel = menu.current, anchor = trigger.current, gap = 8;
    const box = anchor.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - gap * 2, above = box.top - gap * 2;
    const height = panel.getBoundingClientRect().height;
    const upwards = below < height && above > below;
    panel.style.maxHeight = `${Math.max(0, upwards ? above : below)}px`;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(gap, Math.min(box.right - rect.width, window.innerWidth - rect.width - gap))}px`;
    panel.style.top = `${upwards ? Math.max(gap, box.top - rect.height - gap) : box.bottom + gap}px`;
    const items = panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
    const outside = (e: PointerEvent | FocusEvent) => {
      if (!panel.contains(e.target as Node) && !anchor.contains(e.target as Node)) onOpenChange(false);
    };
    const scroll = (e: Event) => {
      if (e.target instanceof Node && panel.contains(e.target)) return;
      const current = anchor.getBoundingClientRect();
      // A queued scroll event from bringing the trigger into view is harmless.
      if (current.top !== box.top || current.left !== box.left) onOpenChange(false);
    };
    const resize = () => onOpenChange(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open, last, onOpenChange]);
  return <>
    <button ref={trigger} type="button" className="secondary-button compact action-menu-trigger"
      aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setLast(false); onOpenChange(!open); }}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setLast(e.key === 'ArrowUp'); onOpenChange(true); } }}>
      <MoreHorizontal size={20} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="floating-action-menu" onKeyDown={e => {
      const items = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (index + 1) % items.length : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
      if (next !== null) { e.preventDefault(); items[next]?.focus(); }
      if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false); trigger.current?.focus(); }
      if (e.key === 'Tab') { trigger.current?.focus(); onOpenChange(false); }
    }}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem" className="text-button"
        aria-disabled={action.disabled || undefined} title={action.title}
        onClick={() => { if (!action.disabled) { onOpenChange(false); trigger.current?.focus(); action.onSelect(); } }}>{action.label}</button>)}
    </div>, document.body)}
  </>;
}
