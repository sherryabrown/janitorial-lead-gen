import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('operator capture export preserves full bytes, resumes within a capture, and denies app roles',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table public.procurement_public_captures(run_id uuid primary key,source_id uuid,requested_url text,final_url text,content_type text,content_sha256 text,retrieved_at timestamptz,content_base64 text);`);
  const originals=[];
  for(const [index,size] of [6000,6001,2000000].entries()){
   const bytes=Buffer.alloc(size,index+1),run=`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
   const hash=createHash('sha256').update(bytes).digest('hex');originals.push({run,bytes,hash,base64:bytes.toString('base64')});
   await db.query("insert into procurement_public_captures values($1,'00000000-0000-4000-8000-000000000099','https://example.gov/bids','https://example.gov/bids','text/html',$2,'2026-10-30T12:00:00Z',$3)",[run,hash,bytes.toString('base64')]);
  }
  const before=(await db.query('select * from procurement_public_captures order by run_id')).rows;
  await db.exec(await readFile('scripts/sql/install-procurement-capture-export.sql','utf8'));
  let cursor=null,part=0;const rows=[];
  // Small pages force a boundary inside a capture; a later page covers maximum-sized content.
  for(let page=0;page<100;page++){
   const result=(await db.query('select * from procurement_export_public_captures($1,$2,$3)',[cursor,part,page<2?2:500])).rows;
   if(!result.length)break;rows.push(...result);cursor=result.at(-1).run_id;part=result.at(-1).part_number;
   if(page===99)assert.fail('Cursor did not terminate');
  }
  for(const original of originals){
   const pieces=rows.filter(r=>r.run_id===original.run);assert.equal(pieces.length,pieces[0].part_count);
   assert.deepEqual(pieces.map(r=>r.part_number),Array.from({length:pieces.length},(_,i)=>i+1));
   assert.ok(pieces.every(r=>r.content_base64_part.length<=8000&&r.content_sha256===original.hash));
   const combined=pieces.map(r=>r.content_base64_part).join('');assert.equal(combined,original.base64);assert.equal(combined.length,pieces[0].content_base64_characters);
   assert.equal(createHash('sha256').update(Buffer.from(combined,'base64')).digest('hex'),original.hash);
  }
  assert.deepEqual((await db.query('select * from procurement_public_captures order by run_id')).rows,before);
  // A one-row page ending at the final part must advance to the next capture.
  const next=(await db.query('select * from procurement_export_public_captures($1,1,1)',[originals[0].run])).rows;
  assert.equal(next.length,1);assert.equal(next[0].run_id,originals[1].run);assert.equal(next[0].part_number,1);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'public.procurement_export_public_captures(uuid,integer,integer)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  for(const args of [[null,1,500],[null,-1,500],[null,0,0],[null,0,1001]])await assert.rejects(db.query('select * from procurement_export_public_captures($1,$2,$3)',args),/cursor|p_limit/);
 }finally{await db.close();}
});
