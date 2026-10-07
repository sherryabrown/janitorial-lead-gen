import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {testBatchSql} from './batch-sql-test.mjs';

process.once('message',async input=>{
  const started=Date.now(),root=resolve(tmpdir());
  let dir,peakContainerBytes=0,peakRss=process.memoryUsage().rss;
  const sample=async()=>{
    peakRss=Math.max(peakRss,process.memoryUsage().rss);
    try{peakContainerBytes=Math.max(peakContainerBytes,Number(await readFile('/sys/fs/cgroup/memory.current','utf8')));}catch{/* Not every host exposes cgroups. */}
  };
  const monitor=setInterval(()=>sample().catch(()=>{}),100);
  let result;
  try {
    dir=await mkdtemp(join(root,'procurement-sql-'));
    const template=await readFile(new URL('../../sql-validation-template.tar.gz',import.meta.url));
    result=await testBatchSql(PGlite,input.before,input.schema,input.manifest,input.sql,{engineOptions:{dataDir:dir,
      loadDataDir:new Blob([template]),
      // This pinned WASM build declares 128 MiB as its minimum initial memory.
      initialMemory:128*1024*1024,postgresqlconf:["shared_buffers = '8MB'","work_mem = '1MB'","maintenance_work_mem = '8MB'"]}});
    await sample();
    result.resources={elapsed_ms:Date.now()-started,
      peak_process_bytes:Math.max(peakRss,process.resourceUsage().maxRSS*1024),peak_container_bytes:peakContainerBytes||null};
  }catch(error){result={status:'validation_failed',diagnostic:{code:error.code??null,message:String(error.message).slice(0,500)}};}
  finally {
    clearInterval(monitor);
    // Resolve and verify the exact disposable directory before recursive removal.
    if(dir&&dirname(resolve(dir))===root&&basename(dir).startsWith('procurement-sql-'))await rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
  process.send?.({test:result},()=>process.exit(result.status==='offline_tests_passed'?0:1));
});
