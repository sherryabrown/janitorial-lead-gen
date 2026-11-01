import { Component, lazy, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import type { CountySelector } from './CountySelector';

const loadSelector = () => import('./CountySelector').then(module => ({default: module.CountySelector}));

class SelectorBoundary extends Component<{children: ReactNode; onRetry: () => void}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    return this.state.failed
      ? <section className="admin-selector" aria-label="County selection"><p role="alert">County selection could not load.</p><button type="button" className="text-button" onClick={this.props.onRetry}>Retry county selection</button></section>
      : this.props.children;
  }
}

// Hidden workspaces defer geometry until first use, then keep the selector mounted.
export function LazyCountySelector({active = true, ...props}: ComponentProps<typeof CountySelector> & {active?: boolean}) {
  const [visited, setVisited] = useState(active);
  const [Selector, setSelector] = useState(() => lazy(loadSelector));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <SelectorBoundary key={attempt} onRetry={() => {setSelector(() => lazy(loadSelector)); setAttempt(value => value + 1);}}>
    <Suspense fallback={<section className="admin-selector" aria-label="County selection" aria-busy="true"><p role="status">Loading county selection…</p></section>}>
      <Selector {...props}/>
    </Suspense>
  </SelectorBoundary>;
}
