-- Run ONCE in Supabase SQL Editor as postgres. This creates only an operator helper.
-- It does not update captures, grant app access, or belong to the release migrations.
begin;

create function public.procurement_export_public_captures(
  p_after_run_id uuid default null,
  p_after_part integer default 0,
  p_limit integer default 500
)
returns table (
  run_id uuid,
  source_id uuid,
  requested_url text,
  final_url text,
  content_type text,
  content_sha256 text,
  retrieved_at timestamptz,
  content_base64_characters integer,
  part_number integer,
  part_count integer,
  content_base64_part text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $export$
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'p_limit must be between 1 and 1000';
  end if;
  if p_after_part is null or p_after_part < 0 or (p_after_run_id is null and p_after_part <> 0) then
    raise exception 'Use both cursor values from the previous page, or NULL and 0 for the first page';
  end if;

  return query
  with candidates as materialized (
    select c.*,
      length(c.content_base64) as characters,
      (length(c.content_base64) + 7999) / 8000 as parts,
      case when c.run_id = p_after_run_id then p_after_part + 1 else 1 end as first_part
    from public.procurement_public_captures c
    where p_after_run_id is null or c.run_id > p_after_run_id
      or (c.run_id = p_after_run_id and (length(c.content_base64) + 7999) / 8000 > p_after_part)
    order by c.run_id
    limit p_limit
  )
  select c.run_id, c.source_id, c.requested_url, c.final_url, c.content_type,
    c.content_sha256, c.retrieved_at, c.characters,
    part.number, c.parts,
    substring(c.content_base64 from (part.number - 1) * 8000 + 1 for 8000)
  from candidates c
  cross join lateral generate_series(c.first_part, least(c.parts, c.first_part + p_limit - 1)) as part(number)
  order by c.run_id, part.number
  limit p_limit;
end;
$export$;

-- No SECURITY DEFINER and no new access for browser/API/service roles.
revoke all on function public.procurement_export_public_captures(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.procurement_export_public_captures(uuid, integer, integer)
  is 'Operator-only capture export: complete base64 in ordered parts of at most 8000 characters. No source-row writes.';

commit;
