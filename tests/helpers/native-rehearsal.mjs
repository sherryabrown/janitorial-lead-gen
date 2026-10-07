import {PGlite} from '@electric-sql/pglite';
import {nativeRehearsal} from '../../scripts/lib/native-sql-rehearsal.mjs';

// Exercise the native connection/session protocol offline against a real SQL engine.
// Permission and platform behavior still need the live restricted-login test.
export async function offlineNativeSession() {
  const db=new PGlite();
  await db.exec('create role procurement_rehearsal_backend; create schema procurement_test authorization procurement_rehearsal_backend; set role procurement_rehearsal_backend;');
    const client={async query(sql,params){
      if(sql.startsWith('select current_user'))return {rows:[{role:'procurement_rehearsal_backend',database:'postgres',version:'offline protocol verification'}]};
      if(params)return db.query(sql,params);
      return (await db.exec(sql)).at(-1)??{rows:[]};
    },release(){}};
  return {db,client,run:async input=>{
    try{return await nativeRehearsal({connect:async()=>client})(input);}
    catch(error){throw new Error(error.privateDiagnostic?.message??error.message);}
  },close:()=>db.close()};
}
export async function offlineNativeRehearsal(input) {
  const session=await offlineNativeSession();
  try{return await session.run(input);}finally{await session.close();}
}
