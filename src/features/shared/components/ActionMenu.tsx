import { useId, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export type MenuAction = { label: string; disabled?: boolean; title?: string; onSelect?: () => void; children?: MenuAction[] };

// Controlled by the containing list so only one row's menu can be open.
export function ActionMenu({ label, open, onOpenChange, actions, text }: {
  text?: string; label: string; open: boolean; onOpenChange: (open: boolean) => void; actions: MenuAction[];
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [branch,setBranch]=useState<MenuAction|null>(null);
  const parentItem=useRef<string|null>(null);
  const back=()=>{setBranch(null);requestAnimationFrame(()=>Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]')??[]).find(b=>b.textContent===parentItem.current)?.focus());};
  useEffect(()=>{if(!open)setBranch(null);},[open]);
  const visible=branch ? [{label:"Back",onSelect:back},...branch.children!] : actions;
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
  }, [open, last, onOpenChange, branch]);
  return <>
    <button ref={trigger} type="button" className="secondary-button compact action-menu-trigger"
      aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setBranch(null); setLast(false); onOpenChange(!open); }}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setLast(e.key === 'ArrowUp'); onOpenChange(true); } }}>
      {text??<MoreHorizontal size={20} aria-hidden="true" />}
    </button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={branch?`${branch.label} options`:label} className="floating-action-menu" onKeyDown={e => {
      const items = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (index + 1) % items.length : e.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null;
      if (next !== null) { e.preventDefault(); items[next]?.focus(); }
      if (e.key === 'Escape'||e.key==='ArrowLeft'&&branch) { e.preventDefault(); if(branch){setBranch(null);requestAnimationFrame(()=>Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]')??[]).find(b=>b.textContent===parentItem.current)?.focus());}else{onOpenChange(false);trigger.current?.focus();} }
      if(e.key==='ArrowRight'&&!branch){const action=actions[index];if(action?.children&&!action.disabled){e.preventDefault();parentItem.current=action.label;setBranch(action);}}
      if (e.key === 'Tab') { trigger.current?.focus(); onOpenChange(false); }
    }}>
      {visible.map((action,index) => <div key={action.label}><button type="button" role="menuitem" className="text-button"
        aria-describedby={action.disabled&&action.title?`${id}-reason-${index}`:undefined} aria-haspopup={action.children?"menu":undefined} aria-expanded={action.children?false:undefined} aria-disabled={action.disabled || undefined} title={action.title}
        onClick={() => { if (!action.disabled) { if(action.children){parentItem.current=action.label;setBranch(action);}else if(action.label==='Back'&&branch){action.onSelect?.();}else{onOpenChange(false);trigger.current?.focus();action.onSelect?.();} } }}>{action.label}</button>{action.disabled&&action.title&&<small id={`${id}-reason-${index}`} className="action-menu-reason">{action.title}</small>}</div>)}
    </div>, document.body)}
  </>;
}
