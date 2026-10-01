-- Read-only schema/access inventory. No table rows or secrets are selected.
with scoped as (
  select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and (c.relname like 'procurement\_%' escape '\' or c.relname like 'spin\_%' escape '\')
    and c.relkind in ('r','p','v','m')
)
select jsonb_build_object(
 'tables',(select jsonb_agg(to_jsonb(s)) from scoped s),
 'columns',(select jsonb_agg(jsonb_build_object('table',s.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by s.relname,a.attnum) from scoped s join pg_attribute a on a.attrelid=s.oid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_object('table',s.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid))) from scoped s join pg_constraint k on k.conrelid=s.oid),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where p.schemaname='public' and p.tablename in (select relname from scoped)),
 'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name in (select relname from scoped)),
 'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where i.schemaname='public' and i.tablename in (select relname from scoped)),
 'triggers',(select jsonb_agg(jsonb_build_object('table',s.relname,'definition',pg_get_triggerdef(t.oid))) from scoped s join pg_trigger t on t.tgrelid=s.oid where not t.tgisinternal),
 'views',(select jsonb_agg(jsonb_build_object('name',s.relname,'definition',pg_get_viewdef(s.oid,true),'options',s.reloptions)) from scoped s where s.relkind in ('v','m')),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'security_definer',p.prosecdef,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.proname like '%procurement%' or p.proname like 'spin_%' or p.prosrc like '%procurement_%' or p.prosrc like '%spin_%')),
 'realtime',(select jsonb_agg(to_jsonb(t)) from pg_publication_tables t where t.schemaname='public'),
 'external_views',(select jsonb_agg(jsonb_build_object('name',v.viewname,'definition',v.definition)) from pg_views v where v.schemaname='public' and (v.definition like '%procurement_%' or v.definition like '%spin_%'))
) as inventory;
