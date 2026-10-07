import {X509Certificate} from 'node:crypto';

export function restrictedImportPoolOptions(env,project) {
  if(!env.PROCUREMENT_DATABASE_URL)return null;
  const url=new URL(env.PROCUREMENT_DATABASE_URL);
  const role='procurement_import_backend';
  const pooler=url.hostname.endsWith('.pooler.supabase.com');
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.pathname!=='/postgres'||
    !(pooler||url.hostname===`db.${project}.supabase.co`)||
    decodeURIComponent(url.username)!==(pooler?`${role}.${project}`:role)||!url.password||
    [...url.searchParams.keys()].some(k=>k.startsWith('ssl')))
    throw new Error('Pinned restricted import connection required; TLS overrides are not allowed');
  const ca=Buffer.from(env.PROCUREMENT_DATABASE_CA_BASE64??'','base64').toString('utf8');
  let certificate;
  try{certificate=new X509Certificate(ca);}catch{throw new Error('Verified Supabase database CA certificate required');}
  if(!certificate.ca||Date.parse(certificate.validTo)<=Date.now())throw new Error('Valid Supabase database CA certificate required');
  return {connectionString:url.toString(),max:1,ssl:{rejectUnauthorized:true,ca},
    connectionTimeoutMillis:10000,statement_timeout:90000};
}
