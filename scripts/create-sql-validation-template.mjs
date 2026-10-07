import {writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Built from the pinned dependency, without credentials or project data.
// Each validation restores a fresh copy; no tested package or business facts are cached here.
const db=new PGlite({postgresqlconf:["shared_buffers = '8MB'","work_mem = '1MB'","maintenance_work_mem = '8MB'"]});
try {
  await db.waitReady;
  const archive=await db.dumpDataDir('gzip');
  await writeFile(new URL('../sql-validation-template.tar.gz',import.meta.url),Buffer.from(await archive.arrayBuffer()));
  console.log('Created empty SQL validation template.');
}finally{await db.close();}
