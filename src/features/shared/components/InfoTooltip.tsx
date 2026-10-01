import { CircleHelp } from 'lucide-react';

export function InfoTooltip({ label, children }: { label: string; children: string }) {
  return (
    <span className="info-tooltip">
      <button aria-label={label} className="info-button" type="button"><CircleHelp size={15} aria-hidden="true" /></button>
      <span className="tooltip-content" role="tooltip">{children}</span>
    </span>
  );
}
