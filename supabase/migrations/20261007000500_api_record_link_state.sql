-- Preserve the existing lead shape; allow only an explicit unresolved public link.
do $migration$
declare item record;
begin
  for item in select conname from pg_constraint
    where conrelid='public.procurement_leads'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%source_url%https://%%'
      and pg_get_constraintdef(oid) not like '%source_link%'
  loop
    execute format('alter table public.procurement_leads drop constraint %I',item.conname);
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.procurement_leads'::regclass and conname='procurement_leads_public_record_link_check') then
    alter table public.procurement_leads add constraint procurement_leads_public_record_link_check check (coalesce((
      coalesce(payload->>'title','')<>'' and (
        coalesce(payload->>'source_url','') like 'https://%' or (
          payload->'source_url'='null'::jsonb and
          payload#>>'{source_link,policy}'='api-record-links-v1' and
          payload#>>'{source_link,status}'='unresolved' and
          coalesce(payload#>>'{source_link,reason}','')<>'' and
          coalesce(payload#>>'{source_link,next_action}','')<>''
        )
      )
    ),false));
  end if;
end $migration$;
