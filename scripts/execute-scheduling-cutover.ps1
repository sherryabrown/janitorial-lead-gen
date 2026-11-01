# Owner-approved November 1 cutover operator. No automatic write retries.
param([ValidateSet('OperatorPreflight','Prestate','PauseDispatch','LeaseCheck','QueueSafety','SchedulerStatus','DataBefore','DataAfter','ApplyBundle','RecordHistory','ReloadSchema','Postflight','Acceptance','RestoreDispatch')][string]$Mode='OperatorPreflight')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateRoot=Join-Path $workspace 'outputs/deployment/scheduling-backup-readiness/cutover-execution'
New-Item -ItemType Directory -Path $privateRoot -Force|Out-Null
if($Mode -in @('Prestate','DataBefore','ApplyBundle','PauseDispatch','RestoreDispatch') -and (Test-Path -LiteralPath (Join-Path $privateRoot ($Mode+'.json')))){throw 'One-time operation already has a receipt; inspect it instead of replaying or overwriting it'}
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class SchedulingCutoverCredential {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct C {public uint Flags,Type;public string Target,Comment;public System.Runtime.InteropServices.ComTypes.FILETIME Written;public uint Size;public IntPtr Blob;public uint Persist,Count;public IntPtr Attributes;public string Alias,User;}
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Read(string target,uint type,uint flags,out IntPtr value);
 [DllImport("advapi32.dll")] static extern void CredFree(IntPtr value);
 public static string Token(){IntPtr p;if(!Read("Supabase CLI:access-token",1,0,out p))throw new Exception("Standard operator credential unavailable");try{var c=(C)Marshal.PtrToStructure(p,typeof(C));var b=new byte[c.Size];Marshal.Copy(c.Blob,b,0,(int)c.Size);return System.Text.Encoding.UTF8.GetString(b);}finally{CredFree(p);}}
}
'@
$token=[SchedulingCutoverCredential]::Token();if($token.StartsWith('go-keyring-base64:')){$token=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($token.Substring(18)))}
if($token -notmatch '^sbp_'){throw 'Unexpected operator credential format'}
$headers=@{Authorization="Bearer $token"}
$api='https://api.supabase.com/v1/projects/zreplhkoxswtzxlchtjf/database/query'
function Invoke-Sql($Query,$ReadOnly){
 $result=Invoke-RestMethod -Method Post -Uri $api -Headers $headers -ContentType 'application/json' -Body (@{query=$Query;read_only=$ReadOnly}|ConvertTo-Json -Depth 5) -TimeoutSec 300
 return $result
}
function Read-ReviewedRequest($Name){
 $root=Join-Path $workspace 'outputs/deployment/scheduling-cutover/api'
 $manifest=Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw|ConvertFrom-Json
 if($manifest.project_ref -ne 'zreplhkoxswtzxlchtjf' -or $manifest.deployment_commit -ne 'fa216c0986d16506cd1fcb8184984a0acd1cd904'){throw 'Unexpected pinned release'}
 $entry=@($manifest.requests)|Where-Object {$_.file -eq $Name};if(@($entry).Count -ne 1){throw 'Unknown reviewed request'}
 $path=Join-Path $root $Name;if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Reviewed request hash differs'}
 return Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
}
if($Mode -eq 'OperatorPreflight'){$request=Read-ReviewedRequest 'operator-preflight.json';$result=Invoke-Sql $request.query $request.read_only}
elseif($Mode -eq 'Prestate'){
 $sql=@'
begin read only;
select jsonb_build_object('observed_at',now(),'operator',current_user,
'procurement_tables',(select count(*) from pg_tables where schemaname='public' and tablename like 'procurement\_%' escape '\'),
'members_present',to_regclass('public.procurement_members') is not null,'safe_view_present',to_regclass('public.procurement_source_labels') is not null,
'role_trigger_present',exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='procurement_protect_profile_role'),
'scheduler_enabled',(select enabled from public.procurement_scheduler_settings where id),
'active_jobs',(select count(*) from public.procurement_jobs where state='running' and (lease_until is null or lease_until>now())),
'active_triggers',(select count(*) from public.procurement_triggers where state='running' and (lease_until is null or lease_until>now())),
'profile_roles',(select jsonb_object_agg(role,n) from(select role::text,count(*) n from public.profiles group by role) p),
'members',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]'::jsonb) from public.procurement_members m),
'history',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations),
'capture_count',(select count(*) from procurement_public_captures)) as prestate;
commit;
'@
 $result=Invoke-Sql $sql $true
}
elseif($Mode -eq 'PauseDispatch'){$state=Get-Content -LiteralPath (Join-Path $privateRoot 'Prestate.json') -Raw|ConvertFrom-Json;$prior=@($state)[0].prestate.scheduler_enabled;if($null -eq $prior){throw 'Scheduler prestate missing'};$literal=if($prior){'true'}else{'false'};$result=Invoke-Sql "begin;update public.procurement_scheduler_settings set enabled=false where id and enabled=$literal returning enabled;commit;" $false}
elseif($Mode -eq 'LeaseCheck'){$result=Invoke-Sql "begin read only;select (select enabled from public.procurement_scheduler_settings where id) as scheduler_enabled,(select count(*) from procurement_jobs where state='running' and(lease_until is null or lease_until>now())) as active_jobs,(select count(*) from procurement_triggers where state='running' and(lease_until is null or lease_until>now())) as active_triggers,(select jsonb_object_agg(state,n) from(select state,count(*) n from procurement_jobs group by state) j) as jobs_by_state,(select jsonb_object_agg(state,n) from(select state,count(*) n from procurement_triggers group by state) t) as triggers_by_state;commit;" $true}
elseif($Mode -eq 'SchedulerStatus'){$result=Invoke-Sql 'begin read only;select public.procurement_scheduler_status() as scheduler_status;commit;' $false}
elseif($Mode -eq 'QueueSafety'){
 $result=Invoke-Sql @'
begin read only;
select (select count(*) from public.procurement_jobs where
 (dedupe_key like 'api-workflow:%' or dedupe_key like 'api-import:%' or dedupe_key like 'api-sam:%')
 and (state='pending' or state='running' and lease_until<now())
 and public.procurement_scheduled_request_runnable(search_request_id)) as eligible_api_jobs,
 (select count(*) from public.procurement_triggers where (state='pending' or state='running' and lease_until<now())
 and public.procurement_scheduled_trigger_runnable(id)) as eligible_triggers,
 (select count(*) from public.procurement_jobs where state='outcome_unknown') as unknown_jobs_retained,
 (select count(*) from public.procurement_triggers where state='outcome_unknown') as unknown_triggers_retained,
 (select count(*) from public.procurement_schedules where enabled and archived_at is null) as enabled_schedules;
commit;
'@ $false
}
elseif($Mode -in @('DataBefore','DataAfter')){
 $entries=@()
 foreach($table in @('procurement_leads','procurement_lead_notes','procurement_lead_note_edits','procurement_lead_stage_changes','procurement_lead_links','procurement_runs','procurement_schedules','profiles')){$entries+="'$table',(select jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(t)::text),',' order by id),''))) from public.$table t)"}
 $sql='begin read only;select jsonb_build_object('+($entries -join ',')+') as protected_data;commit;'
 $result=Invoke-Sql $sql $true
}
elseif($Mode -eq 'Acceptance'){
 $sql=@'
begin;
do $$
declare u uuid; a uuid; c jsonb; denied boolean := false;
begin
 select user_id into strict u from public.profiles where role::text='user' order by id limit 1;
 select user_id into strict a from public.profiles where role::text='admin' order by id limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;
 c:=public.procurement_capabilities();
 if c->>'role'<>'user' or not (c->>'manage_schedules')::boolean or (c->>'manage_sources')::boolean or (c->>'technical_details')::boolean then raise exception 'User capabilities mismatch'; end if;
 if (select count(*) from public.procurement_sources)<>0 then raise exception 'User raw source exposure'; end if;
 if (select count(*) from public.procurement_source_labels)=0 then raise exception 'User safe source labels missing'; end if;
 perform count(*) from public.procurement_leads;
 begin
  update public.profiles set role='admin' where user_id=u;
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'Role protection check failed'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 c:=public.procurement_capabilities();
 if c->>'role'<>'admin' or not (c->>'manage_sources')::boolean or not (c->>'technical_details')::boolean then raise exception 'Admin capabilities mismatch'; end if;
 if (select count(*) from public.procurement_sources)=0 then raise exception 'Admin sources missing'; end if;
 reset role;
end $$;
select true as user_capabilities_passed,true as admin_capabilities_passed,true as source_access_passed,true as self_promotion_denied,
 (select coalesce(jsonb_agg(detail->'record' order by detail->'record'->>'id'),'[]'::jsonb) from public.procurement_events where event_type='legacy_procurement_membership_archived') as archived_members,
 (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations) as history;
rollback;
'@
 $result=Invoke-Sql $sql $false
 $before=Get-Content -LiteralPath (Join-Path $privateRoot 'Prestate.json') -Raw|ConvertFrom-Json
 $original=@(@($before)[0].prestate.members|ForEach-Object {$_|ConvertTo-Json -Compress -Depth 20})
 $archived=@(@($result)[0].archived_members|ForEach-Object {$_|ConvertTo-Json -Compress -Depth 20})
 if(@(Compare-Object $original $archived).Count -ne 0){throw 'Membership archive differs from saved prestate'}
 $expected=@('20261023000400','20261026000100','20261026000200','20261026000300','20261026000400','20261026000500','20261027000100','20261028000100')
 foreach($version in $expected){if(@($result)[0].history -notcontains $version){throw 'Reviewed migration absent from ledger'}}
 foreach($version in @($before)[0].prestate.history){if(@($result)[0].history -notcontains $version){throw 'Prior migration history changed'}}
}
elseif($Mode -eq 'ApplyBundle'){$request=Read-ReviewedRequest 'atomic-cutover.json';$result=Invoke-Sql $request.query $request.read_only}
elseif($Mode -eq 'RecordHistory'){$request=Read-ReviewedRequest 'approved-history.json';$result=Invoke-Sql $request.query $request.read_only}
elseif($Mode -eq 'ReloadSchema'){$result=Invoke-Sql "begin;notify pgrst,'reload schema';commit;" $false}
elseif($Mode -eq 'RestoreDispatch'){$state=Get-Content -LiteralPath (Join-Path $privateRoot 'Prestate.json') -Raw|ConvertFrom-Json;$prior=@($state)[0].prestate.scheduler_enabled;if($null -eq $prior){throw 'Scheduler prestate missing'};$literal=if($prior){'true'}else{'false'};$result=Invoke-Sql "begin;update public.procurement_scheduler_settings set enabled=$literal where id returning enabled;commit;" $false}
elseif($Mode -eq 'Postflight'){$result=Invoke-Sql "begin read only;select (select count(*) from pg_tables where schemaname='public' and tablename like 'procurement\_%' escape '\') as procurement_tables,to_regclass('public.procurement_members') is null as members_retired,to_regclass('public.procurement_source_labels') is not null as safe_view_present,exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='procurement_protect_profile_role') as role_guard,(select count(*) from procurement_events where event_type='legacy_procurement_membership_archived') as archived_members,(select count(*) from procurement_public_captures) as capture_count;commit;" $true}
ConvertTo-Json -InputObject $result -Depth 100|Set-Content -LiteralPath (Join-Path $privateRoot ($Mode+'.json')) -Encoding UTF8
if($Mode -eq 'Prestate'){@($result)[0].prestate|Select-Object observed_at,operator,procurement_tables,members_present,safe_view_present,role_trigger_present,scheduler_enabled,active_jobs,active_triggers,capture_count|ConvertTo-Json}
elseif($Mode -in @('OperatorPreflight','Postflight','PauseDispatch','RestoreDispatch','LeaseCheck','QueueSafety','SchedulerStatus')){$result|ConvertTo-Json -Depth 8}
else{Write-Output ($Mode+' completed; private receipt saved')}
