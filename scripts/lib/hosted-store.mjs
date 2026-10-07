import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export const checked = response => {
  if (response.error) throw new Error('Database operation failed; inspect server diagnostics privately');
  return response.data;
};
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
