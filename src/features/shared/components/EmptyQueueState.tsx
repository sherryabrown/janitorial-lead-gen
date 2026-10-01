import { CheckCheck } from 'lucide-react';

export function EmptyQueueState({
  actionLabel,
  hint,
  title,
  onAction,
}: {
  actionLabel: string;
  hint: string;
  title: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <CheckCheck size={24} />
      <h3>{title}</h3>
      <p>{hint}</p>
      <button className="primary-button compact" onClick={onAction} type="button">{actionLabel}</button>
    </div>
  );
}
