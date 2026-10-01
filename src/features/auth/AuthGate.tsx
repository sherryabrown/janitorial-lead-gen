import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type AuthState = 'loading' | 'signed-out' | 'signed-in';

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthState('signed-out');
      setAuthError('Supabase is not configured. Add the project URL and publishable key to .env.');
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      setAuthState(data.session ? 'signed-in' : 'signed-out');
      if (error) setAuthError(error.message);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthState(nextSession ? 'signed-in' : 'signed-out');
      setAuthError(null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (authState === 'loading') {
    return <AuthMessage title="Checking sign-in" message="Restoring your staff session…" />;
  }

  if (authState === 'signed-out' || !session) {
    return <SignInScreen error={authError} />;
  }

  return children(session);
}

function AuthMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Janitorial leads</p>
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function SignInScreen({ error }: { error: string | null }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const result = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === 'sign-up' && !result.data.session) {
      setMessage('Account created. Check your email to confirm the account, then sign in.');
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Janitorial leads</p>
        <h1>{mode === 'sign-in' ? 'Sign in to view contracts' : 'Create an account'}</h1>
        <p>{mode === 'sign-in' ? 'Sign in to view contracts and leads' : 'Create an account'}</p>
        <div className="auth-mode-toggle" role="group" aria-label="Authentication mode">
          <button className={mode === 'sign-in' ? 'is-active' : ''} onClick={() => { setMode('sign-in'); setMessage(null); }} type="button">Sign in</button>
          <button className={mode === 'sign-up' ? 'is-active' : ''} onClick={() => { setMode('sign-up'); setMessage(null); }} type="button">Sign up</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {message ? <p className="auth-error" role="alert">{message}</p> : null}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
      </section>
    </main>
  );
}

