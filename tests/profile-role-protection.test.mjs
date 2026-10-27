import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('profile role protection preserves personal edits and trusted role assignment',async()=>{
  const db=new PGlite();
  try {
    // Verified live schema relationship and enum values; disposable database only.
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create type public.app_role as enum ('user','admin');
      create table public.profiles(id uuid primary key default gen_random_uuid(),
        user_id uuid not null unique references auth.users(id),email text not null,
        role public.app_role not null default 'user',first_name text);
      grant usage on schema public to authenticated,service_role;
      grant select,insert,update on public.profiles to authenticated,service_role;
      insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`);
    await db.exec(readFileSync('supabase/migrations/20261026000100_protect_profile_role.sql','utf8'));
    await db.exec(`set role authenticated;insert into public.profiles(user_id,email)
      values('00000000-0000-4000-8000-000000000001','user@example.test');
      update public.profiles set first_name='Pat';`);
    await assert.rejects(db.exec(`update public.profiles set role='admin'`),e=>e.code==='42501');
    await assert.rejects(db.exec(`insert into public.profiles(user_id,email,role)
      values('00000000-0000-4000-8000-000000000002','other@example.test','admin')`),e=>e.code==='42501');
    assert.deepEqual((await db.query('select role::text,first_name from public.profiles')).rows,[{role:'user',first_name:'Pat'}]);
    await db.exec(`reset role;set role service_role;update public.profiles set role='admin';reset role;set role authenticated;
      update public.profiles set first_name='Admin';`);
    await assert.rejects(db.exec(`update public.profiles set role='user'`),e=>e.code==='42501');
    assert.deepEqual((await db.query('select role::text,first_name from public.profiles')).rows,[{role:'admin',first_name:'Admin'}]);
  } finally {await db.close();}
});
