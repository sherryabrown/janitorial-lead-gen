import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export const checked = response => {
  if (response.error) {
    // Retain only standardized codes: DB message/details/hint can contain row data or secrets.
    const code = response.error.code;
    const cause = { code: typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code) ? code : 'unknown' };
    throw new Error('Database operation failed; inspect server diagnostics privately', { cause });
  }
  return response.data;
};
// Public status is derived from state, including checkpoints saved by older workers.
// Never publish arbitrary exception text retained in a checkpoint.
export function publicJobAction(job,{countyAutomatic=false}={}) {
  if(job.checkpoint?.automatic?.policy==='county-automatic-v1')return job.checkpoint.stage==='import_reconcile'||job.state==='outcome_unknown'
    ?'Reconcile the saved database outcome before retrying':job.checkpoint.receipt?.verified?'View saved leads and validation results':job.state==='blocked'?'Automatic saving stopped; inspect validation or database diagnostics':'Valid county results are being saved automatically';
  if(job.checkpoint?.bonfire_access_holds?.length)
    return 'Bonfire project access needs review; inspect saved listing and capture evidence before resuming';
  if(job.checkpoint?.hosted_browser_attempt?.failure_code==='human_verification_required')
    return 'Official project verification is required; review saved evidence and access before explicitly resuming';
  const stage = job.checkpoint?.stage ?? '';
  if(countyAutomatic&&job.state==='blocked'&&stage==='interpret'&&!job.checkpoint?.error_code)
    return 'Source checks finished. View automatically saved leads and remaining source gaps.';
  if(job.checkpoint?.error_code==='sam_import_reconciliation_required')return 'Reconcile the previous SAM database result before collecting or saving more SAM records';
  if (job.state === 'outcome_unknown' || stage === 'import_reconcile') return 'Reconcile saved evidence before retrying';
  if (stage === 'import_awaiting_approval') return 'Approve the exact tested batch hash';
  if (stage === 'discovery_resolve') return job.state==='blocked'
    ? 'Official website could not be resolved from the available directory. Other sources can continue.' : 'Finding official website';
  if (stage === 'discovery_verify') return job.state==='blocked'
    ? 'Source could not be verified automatically. View saved evidence; other sources can continue.' : 'Checking source';
  if (stage === 'discovery_save') return 'Saving verified source method';
  if (stage === 'discovery_capture' && job.checkpoint?.automation_policy) return job.state==='blocked'
    ? 'Website unavailable or access required. View saved evidence.' : 'Checking official source pages';
  if (stage === 'discovery_collect') return 'Collecting requested opportunities';
  if (stage === 'discovery_review') return 'Review the saved official-source discovery packet';
  if (stage === 'sam_review') return job.checkpoint.automatic_import_job_id||job.checkpoint.automatic_completed?'View automatically saved SAM results':'SAM results are awaiting automatic validation';
  if (stage === 'sam_reconcile') return 'Review SAM access or reconcile its saved response before any new request';
  if (job.state === 'blocked') return 'Review the saved workflow blocker and server diagnostics before resuming';
  if (job.state === 'cancelled') return 'Resume the saved request when ready';
  if (stage === 'import_verified') return 'Review imported leads';
  if (stage === 'discovery_collected') return 'Review captured category evidence';
  return 'Read saved workflow status and review evidence or required actions';
}
export async function rows(db, table, filter=q=>q, columns='*', {offset=0,limit=10000,order='id'}={}) {
  const output=[];
  for(let start=offset; start<offset+limit; start+=500) {
    const page=checked(await filter(db.from(table).select(columns)).order(order).range(start,Math.min(start+499,offset+limit-1)));
    output.push(...page);
    if(page.length<Math.min(500,offset+limit-start)) return output;
  }
  throw new Error('Scoped read exceeded bound; narrow the query before proceeding');
}
export async function one(db,table,id) { return checked(await db.from(table).select('*').eq('id',id).maybeSingle()); }
export const sha = value => createHash('sha256').update(value).digest('hex');
export function encryptSession(bytes,key,identity) {
  const secret=Buffer.from(key??'','base64');
  if(secret.length!==32) throw new Error('32-byte private session encryption key required');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);
  cipher.setAAD(Buffer.from(identity));
  const data=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]);
}
export function decryptSession(bytes,key,identity) {
  const secret=Buffer.from(key??'','base64');
  if(secret.length!==32) throw new Error('32-byte private session encryption key required');
  const decipher=createDecipheriv('aes-256-gcm',secret,bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(identity));decipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
}
export function artifactStore(db) {
  const bucket=db.storage.from('procurement-private');
  return {
    async put(bytes) {
      const data=Buffer.isBuffer(bytes)?bytes:Buffer.from(JSON.stringify(bytes));
      const path=`artifacts/${sha(data)}`;
      const {error}=await bucket.upload(path,data,{upsert:false,contentType:'application/octet-stream'});
      if(error) {
        const saved=await this.get(path);
        if(!saved.equals(data))throw new Error('Immutable artifact storage outcome uncertain');
      }
      return path;
    },
    async get(path) {
      if(!/^artifacts\/[a-f0-9]{64}$/.test(path))throw new Error('Invalid private artifact reference');
      const {data,error}=await bucket.download(path);
      if(error)throw new Error('Private artifact unavailable');
      const bytes=Buffer.from(await data.arrayBuffer());
      if(sha(bytes)!==path.slice(10))throw new Error('Private artifact hash changed');
      return bytes;
    },
  };
}
