import { Building2, FileCheck2 } from 'lucide-react';
import type { ReactNode } from 'react';

type WorkMode = 'contracts' | 'companies';

function ComingSoon({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span aria-label={`${label}: Coming Soon`} className="coming-soon" tabIndex={0}>
      {children}
      <span className="coming-soon-tooltip" role="tooltip">Coming Soon</span>
    </span>
  );
}

export function ModeSwitch({ workMode, onChange }: { workMode: WorkMode; onChange: (mode: WorkMode) => void }) {
  return (
    <div className="mode-switch" aria-label="Workspace">
      <button className={workMode === 'contracts' ? 'is-active' : ''} onClick={() => onChange('contracts')} type="button">
        <FileCheck2 size={17} />
        Contracts
      </button>
      <ComingSoon label="Companies">
        <button className={workMode === 'companies' ? 'is-active' : ''} disabled type="button">
          <Building2 size={17} />
          Companies
        </button>
      </ComingSoon>
    </div>
  );
}

export { ComingSoon };
