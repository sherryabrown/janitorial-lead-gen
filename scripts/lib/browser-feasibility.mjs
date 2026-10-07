import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { sanitizeBrowserDocument } from './hosted-browser.mjs';
import { sha } from './hosted-store.mjs';

// Operator-only, one public page. This is not a source check or lead coverage.
export async function browserFeasibility({url,artifacts,launch=()=>chromium.launch({headless:true,timeout:30000}),
  memory=async name=>{try{return Number(await readFile(`/sys/fs/cgroup/memory.${name}`,'utf8'));}catch{return null;}}}) {
  const target=new URL(url);
  if(target.protocol!=='https:' || target.hostname!=='nlr.ar.gov' || target.pathname!=='/departments/finance/commerce/')
    throw new Error('Registered benchmark page required');
  const receipt={started_at:new Date().toISOString(),url:target.href,lead_coverage:false,ai_calls:0,status:'blocked',samples:[]};
  receipt.limit_bytes=await memory('max');receipt.kernel_peak_before=await memory('peak');
  let browser,context,timer;
  const sample=async()=>{const value=await memory('current');if(value!==null)receipt.samples.push(value);};
  await sample();timer=setInterval(()=>{void sample();},100);
  try {
    browser=await launch();receipt.launched=true;
    context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const request=route.request();let allowed=false;
      try {const u=new URL(request.url());allowed=u.protocol==='https:'&&u.hostname===target.hostname&&['GET','HEAD'].includes(request.method());}catch { /* abort */ }
      return allowed?route.continue():route.abort();
    });
    const page=await context.newPage();
    const response=await page.goto(target.href,{timeout:30000,waitUntil:'domcontentloaded'});
    if(response?.status()!==200 || new URL(page.url()).hostname!==target.hostname)throw new Error('Page unavailable');
    const raw=await page.content();
    if(Buffer.byteLength(raw)>2*1024*1024 || await page.locator('input[type=password]').count())throw new Error('Page exceeds bounds or requires login');
    const sanitized=sanitizeBrowserDocument(raw);
    receipt.evidence_hash=sha(sanitized);receipt.evidence_path=await artifacts.put(sanitized);
    if(sha(await artifacts.get(receipt.evidence_path))!==receipt.evidence_hash)throw new Error('Evidence readback failed');
    receipt.sanitized_bytes=sanitized.length;receipt.capture_verified=true;
  } catch {receipt.blocker='Browser launch, bounded public capture or private evidence verification failed';}
  finally {
    try {await context?.close();await browser?.close();receipt.browser_closed=Boolean(browser)&&!browser.isConnected();}
    catch {receipt.browser_closed=false;receipt.blocker='Browser cleanup failed';}
    clearInterval(timer);await sample();
  }
  receipt.kernel_peak_after=await memory('peak');
  receipt.sampled_peak_bytes=receipt.samples.length?Math.max(...receipt.samples):null;
  const peak=Math.max(receipt.sampled_peak_bytes??0,receipt.kernel_peak_after??0);
  receipt.status=receipt.capture_verified&&receipt.browser_closed&&receipt.limit_bytes===536870912&&peak>0&&peak<receipt.limit_bytes?'passed':'blocked';
  if(receipt.status==='blocked'&&!receipt.blocker)receipt.blocker='512 MiB memory fit could not be verified';
  receipt.finished_at=new Date().toISOString();
  receipt.receipt_path=await artifacts.put(receipt);
  return receipt;
}

export async function startupBrowserBenchmark({db,artifacts,id}) {
  if(!/^[a-f0-9-]{36}$/.test(id??''))throw new Error('Operator benchmark identifier required');
  const bucket=db.storage.from('procurement-private'),path=`browser-benchmarks/${id}.json`;
  // Immutable intent prevents a cold start from replaying a submitted benchmark.
  const intent=await bucket.upload(path,Buffer.from(JSON.stringify({state:'attempted',at:new Date().toISOString()})),{upsert:false});
  if(intent.error)return {status:'blocked',blocker:'Existing intent or unavailable storage; no browser launched'};
  const active=await db.from('procurement_jobs').select('id').eq('state','running').gt('lease_until',new Date().toISOString()).limit(1);
  if(active.error || active.data.length) {
    const result={status:'blocked',blocker:'Active worker lease or unavailable worker status; no browser launched'};
    await bucket.upload(`browser-benchmarks/${id}-result.json`,Buffer.from(JSON.stringify(result)),{upsert:false});
    return result;
  }
  const source=await db.from('procurement_sources').select('url').eq('id','48d818ae-7718-5381-8045-ceae7fc8404d').single();
  if(source.error)throw new Error('Registered source unavailable');
  const receipt=await browserFeasibility({url:source.data.url,artifacts});
  const saved=await bucket.upload(`browser-benchmarks/${id}-result.json`,Buffer.from(JSON.stringify(receipt)),{upsert:false});
  if(saved.error)throw new Error('Benchmark result persistence failed');
  return receipt;
}
