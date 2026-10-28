import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from '../App';
import {supabase} from '../lib/supabase';
import '../styles.css';

export default function Preview(){
 const [role,setRole]=useState<'user'|'admin'>('user'),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;setReady(false);setError('');void (async()=>{
  const response=await fetch('/preview/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});
  if(!response.ok)throw Error('Local preview session is unavailable.');
  const session=await response.json();if(!active)return;
  const result=await supabase!.auth.setSession(session);if(result.error)throw result.error;if(active)setReady(true);
 })().catch(()=>{if(active)setError('The isolated preview could not connect. Restart npm run preview:scheduling.');});return()=>{active=false;};},[role]);
 return <><aside className="preview-banner" style={{padding:'12px 24px',background:'#fff1e6',borderBottom:'1px solid #d8c2b4',display:'flex',flexWrap:'wrap',gap:12,alignItems:'center'}}>
  <strong>Dev preview · sample data</strong><span>Local database only. No live websites or Production changes.</span>
  <label>Test as <select aria-label="Preview role" value={role} onChange={e=>setRole(e.target.value as 'user'|'admin')}><option value="user">User</option><option value="admin">Admin</option></select></label>
  <details><summary>What to test</summary><p>Open Settings → Schedules. Review Results, Sources and Schedule changes. Users manage schedules; Admins review sources from Sources or Needs attention.</p><p>For the supported website repair example, provide <strong>https://repair.example/bids</strong>. Responses are saved fixtures; verification and database application use the real local worker. Other websites remain unsupported in this preview.</p><p>Try No website, No issue, Won’t address and Needs developer. Exclusions require explicit re-enable. Changes persist for this preview session; restarting creates fresh sample data.</p></details>
 </aside>{error?<p role="alert">{error}</p>:ready?<App key={role}/>:<p role="status">Preparing {role==='admin'?'Admin':'User'} preview…</p>}</>;
}

createRoot(document.getElementById('root')!).render(<Preview/>);
