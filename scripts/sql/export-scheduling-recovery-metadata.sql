-- Catalog and legacy membership recovery evidence only. No password/verifier reads.
begin isolation level repeatable read read only;
select jsonb_build_object(
 'captured_at',transaction_timestamp(),'server_version',current_setting('server_version'),
 'auth_user_records_included',false,
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl) order by nspname) from pg_namespace where nspname in ('public','auth','storage')),
 'enums',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'values',(select jsonb_agg(enumlabel order by enumsortorder) from pg_enum where enumtypid=t.oid)) order by n.nspname,t.typname) from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typtype='e' and n.nspname in ('public','auth','storage')),
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'view',case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) end,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','p','v','m')),
 'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated) order by n.nspname,r.relname,c.conname) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname in ('public','auth','storage')),
 'indexes',(select jsonb_agg(to_jsonb(i) order by schemaname,tablename,indexname) from pg_indexes i where schemaname in ('public','auth','storage')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','auth','storage')),
 'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) order by n.nspname,r.relname,t.tgname) from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage')),
 'default_privileges',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl) order by d.oid) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
 'sequences',(select jsonb_agg(to_jsonb(s) order by schemaname,sequencename) from pg_sequences s where schemaname in ('public','auth','storage')),
 'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'procurement_members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from public.procurement_members m)
) as recovery_metadata;
commit;
