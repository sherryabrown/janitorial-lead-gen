-- Approved: preserve every existing role's effective EXECUTE access while
-- removing implicit access for this new importer and subsequently created roles.
do $permissions$
declare function_id oid; existing_role record; signatures text[] := array[
  'public.cleanup_old_audit_logs()', 'public.get_user_role(uuid)',
  'public.has_role(uuid,public.app_role)'
]; signature text;
begin
  foreach signature in array signatures loop
    function_id := to_regprocedure(signature);
    if function_id is null then raise exception 'Expected helper missing'; end if;
    for existing_role in
      select oid,rolname from pg_roles
      where rolname <> 'procurement_import_backend'
        and has_function_privilege(oid,function_id,'EXECUTE')
    loop
      execute format('grant execute on function %s to %I',function_id::regprocedure,existing_role.rolname);
    end loop;
    execute format('revoke execute on function %s from public, procurement_import_backend',function_id::regprocedure);
    if has_function_privilege('procurement_import_backend',function_id,'EXECUTE') then
      raise exception 'Importer still inherits administrative helper execution';
    end if;
  end loop;
end $permissions$;
