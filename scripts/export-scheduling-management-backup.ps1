param([switch]$IncludeStorage,[switch]$AuthenticationLogsOnly,[switch]$ManualBackupCoverage,[switch]$CaptureChunks,[switch]$CaptureInventory,[switch]$RecoveryMetadata,[string]$ResumeCaptureFolder,[string]$ResumeCaptureKeyFile)
# Read-only exports using the CLI's normal Windows credential provider.
# Never print tokens, function bodies, database rows, or passwords.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SchedulingSupabaseCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Credential {public uint Flags,Type;public string TargetName,Comment;public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;public uint BlobSize;public IntPtr Blob;public uint Persist,AttributeCount;public IntPtr Attributes;public string TargetAlias,UserName;}
 [DllImport("advapi32.dll", EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Read(string target,uint type,uint flags,out IntPtr credential);
 [DllImport("advapi32.dll")] static extern void CredFree(IntPtr credential);
 public static string Token(){IntPtr pointer;if(!Read("Supabase CLI:access-token",1,0,out pointer))throw new Exception("Standard Supabase CLI credential unavailable");try{var c=(Credential)Marshal.PtrToStructure(pointer,typeof(Credential));var bytes=new byte[c.BlobSize];Marshal.Copy(c.Blob,bytes,0,(int)c.BlobSize);return System.Text.Encoding.UTF8.GetString(bytes);}finally{CredFree(pointer);}}
}
'@
$token = [SchedulingSupabaseCredential]::Token()
if ($token.StartsWith('go-keyring-base64:')) { $token = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($token.Substring(18))) }
if ($token -notmatch '^sbp_') { throw 'Unexpected standard CLI credential format' }
$headers = @{Authorization = "Bearer $token"}
$base = 'https://api.supabase.com/v1/projects/zreplhkoxswtzxlchtjf'
$backupRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../outputs/deployment/scheduling-backup-readiness'))
if ($RecoveryMetadata) {
 $sql=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'sql/export-scheduling-recovery-metadata.sql'))
 $rows=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$sql;read_only=$true}|ConvertTo-Json)
 $metadata=@($rows)[0].recovery_metadata
 if(!$metadata){throw 'Recovery catalog export missing'}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($metadata|ConvertTo-Json -Depth 100))
 $path=Join-Path $backupRoot ('recovery-metadata-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.json.dpapi')
 [IO.File]::WriteAllBytes($path,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
 $restored=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 if([Convert]::ToBase64String($bytes) -cne [Convert]::ToBase64String($restored)){throw 'Catalog recovery differs'}
 $receipt=@{checked_at=[DateTime]::UtcNow.ToString('o');file=[IO.Path]::GetFileName($path);relations=@($metadata.relations).Count;enums=@($metadata.enums).Count;policies=@($metadata.policies).Count;triggers=@($metadata.triggers).Count;legacy_members=@($metadata.procurement_members).Count;encrypted_byte_recovery=$true;auth_user_data_included=$false;complete_database_restore=$false}
 $receipt|ConvertTo-Json|Set-Content (Join-Path $backupRoot 'recovery-metadata-receipt.json') -Encoding UTF8
 $receipt|ConvertTo-Json
 exit
}
if ($CaptureInventory) {
 $sql="begin read only;select count(*) as captures,coalesce(sum((octet_length(content_base64)+7999)/8000),0) as parts,coalesce(sum(octet_length(content_base64)),0) as base64_bytes,count(distinct content_sha256) as unique_hashes,(select sum(bytes) from (select min(octet_length(content_base64)) as bytes from public.procurement_public_captures group by content_sha256) unique_bodies) as unique_body_base64_bytes from public.procurement_public_captures;commit;"
 $stats=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$sql;read_only=$true}|ConvertTo-Json)
 $stats|ConvertTo-Json -Depth 6
 exit
}
if ($CaptureChunks) {
 if($ResumeCaptureFolder){
  $resume=[IO.Path]::GetFullPath($ResumeCaptureFolder)
  if([IO.Path]::GetDirectoryName($resume) -ne $backupRoot -or [IO.Path]::GetFileName($resume) -notmatch '^capture-bodies-\d+$' -or $ResumeCaptureKeyFile -notmatch '^capture-key-\d{8}T\d{9}\.dpapi$'){throw 'Unexpected private recovery path'}
  $keyPath=Join-Path $backupRoot $ResumeCaptureKeyFile
  $key=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 }else{
 $key=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($key)}finally{$rng.Dispose()}
 $keyPath=Join-Path $backupRoot ('capture-key-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.dpapi')
 [IO.File]::WriteAllBytes($keyPath,[Security.Cryptography.ProtectedData]::Protect($key,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
 }
 function Invoke-CaptureWorker($Payload,$Verify) {
  $arguments='"'+(Join-Path $PSScriptRoot 'export-procurement-capture-bodies.mjs')+'"'
  if($Verify){$arguments+=' --verify'}
  $start=[Diagnostics.ProcessStartInfo]::new('node',$arguments)
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true
  $child=[Diagnostics.Process]::Start($start);$child.StandardInput.WriteLine(($Payload|ConvertTo-Json -Compress));$child.StandardInput.Close();$child.WaitForExit()
  if($child.ExitCode -ne 0){throw 'Capture export or recovery verification failed'}
 }
 Invoke-CaptureWorker @{token=$token;key=[Convert]::ToBase64String($key);keyFile=[IO.Path]::GetFileName($keyPath);folder=$ResumeCaptureFolder} $false
 $receipt=Get-Content -LiteralPath (Join-Path $backupRoot 'latest-capture-export-receipt.json') -Raw|ConvertFrom-Json
 if($receipt.keyFile -ne [IO.Path]::GetFileName($keyPath)){throw 'Unexpected export receipt'}
 $savedKey=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 Invoke-CaptureWorker @{folder=$receipt.folder;key=[Convert]::ToBase64String($savedKey)} $true
 exit
}
if ($ManualBackupCoverage) {
 $sql=@'
begin isolation level repeatable read read only;
select jsonb_build_object(
 'crm_login_attempts',(select count(*) from public.crm_login_attempts),
 'crm_mapping_feedback',(select count(*) from public.crm_mapping_feedback),
 'debts',(select count(*) from public.debts),
 'procurement_action_requests',(select count(*) from public.procurement_action_requests),
 'procurement_event_receipts',(select count(*) from public.procurement_event_receipts),
 'procurement_lead_links',(select count(*) from public.procurement_lead_links),
 'procurement_public_captures',(select count(*) from public.procurement_public_captures),
 'procurement_schedule_state_memberships',(select count(*) from public.procurement_schedule_state_memberships),
 'procurement_workflow_steps',(select count(*) from public.procurement_workflow_steps),
 'smb_logistics_survey_events',(select count(*) from public.smb_logistics_survey_events),
 'procurement_members',(select count(*) from public.procurement_members)
) as current_counts,
(select jsonb_agg(enumlabel order by enumsortorder) from pg_enum where enumtypid='public.app_role'::regtype) as current_app_role_values;
commit;
'@
 $coverage=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$sql;read_only=$true}|ConvertTo-Json)
 @{checked_at=[DateTime]::UtcNow.ToString('o');read_only=$true;coverage=$coverage;limitation='Current counts do not prove these tables were empty when the manual files were exported.'}|ConvertTo-Json -Depth 20|Set-Content (Join-Path $backupRoot 'manual-export-inspection/current-coverage.json') -Encoding UTF8
 $coverage|ConvertTo-Json -Depth 10
 exit
}
if ($AuthenticationLogsOnly) {
 $summary=@()
 foreach($source in @('postgres_logs','supavisor_logs')) {
  $sql="select timestamp,event_message from $source where regexp_contains(event_message, '(?i)password authentication failed|circuit breaker|authentication.*failed|no pg_hba') order by timestamp desc limit 20"
  $url=$base+'/analytics/endpoints/logs.all?sql='+[Uri]::EscapeDataString($sql)+'&iso_timestamp_start='+[Uri]::EscapeDataString([DateTime]::UtcNow.AddHours(-4).ToString('yyyy-MM-ddTHH:mm:ssZ'))+'&iso_timestamp_end='+[Uri]::EscapeDataString([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))
  try {
   $logs=Invoke-RestMethod -Method Get -Uri $url -Headers $headers
   $bytes=[Text.Encoding]::UTF8.GetBytes(($logs|ConvertTo-Json -Depth 50))
   [IO.File]::WriteAllBytes((Join-Path $backupRoot ($source+'-auth-log.json.dpapi')),[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
   $records=@($logs.result|Where-Object {$null -ne $_})
   $messages=($records|ForEach-Object {$_.event_message}) -join "`n"
   $summary+=@{source=$source;matched_records=$records.Count;password_failure=($messages -match 'password authentication failed');circuit_breaker=($messages -match 'circuit breaker');hba_rejection=($messages -match 'no pg_hba');api_error=([bool]$logs.error)}
  }catch{$summary+=@{source=$source;available=$false}}
 }
 $summary|ConvertTo-Json -Depth 6|Set-Content (Join-Path $backupRoot 'authentication-log-summary.json') -Encoding UTF8
 $summary|ConvertTo-Json -Depth 6
 exit
}
# This is the raw deployed artifact, not an invocation of the Edge Function.
$rawPath = Join-Path $backupRoot 'firecrawl-deployed-body.bin'
Invoke-WebRequest -Uri ($base+'/functions/firecrawl-scrape/body') -Headers $headers -OutFile $rawPath
$raw = [IO.File]::ReadAllBytes($rawPath)
[IO.File]::WriteAllBytes(($rawPath+'.dpapi'),[Security.Cryptography.ProtectedData]::Protect($raw,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
$restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes(($rawPath+'.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
if ([Convert]::ToBase64String($raw) -cne [Convert]::ToBase64String($restored)) { throw 'Raw function artifact encryption round trip failed' }
$sql = @'
begin isolation level repeatable read read only;
select jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'database_role',(select jsonb_build_object('name',rolname,'can_login',rolcanlogin,'valid_until',rolvaliduntil) from pg_roles where rolname='postgres'),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'security_definer',p.prosecdef,'config',p.proconfig) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p'))
) as export;
commit;
'@
$result = Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$sql;read_only=$true}|ConvertTo-Json)
$export = @($result)[0].export
if ($export.read_only -ne 'on') { throw 'Management export read-only guard missing' }
$json = $result | ConvertTo-Json -Depth 100
$bytes = [Text.Encoding]::UTF8.GetBytes($json)
$functionPath = Join-Path $backupRoot 'database-functions.json.dpapi'
[IO.File]::WriteAllBytes($functionPath,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
$roundtrip = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($functionPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
if ([Convert]::ToBase64String($bytes) -cne [Convert]::ToBase64String($roundtrip)) { throw 'Database function encryption round trip failed' }
$receipt = @{
 checked_at=[DateTime]::UtcNow.ToString('o');read_only=$export.read_only;database_role=$export.database_role
 public_routines=@($export.functions).Count
 raw_edge_body_bytes=$raw.Length;raw_edge_body_sha256=(Get-FileHash -LiteralPath $rawPath -Algorithm SHA256).Hash
 raw_edge_restore='encrypted artifact byte round trip passed; source extraction/deployability NOT verified'
 database_function_restore='encrypted definition export byte round trip passed; database restore NOT verified'
}
$liveFunctions=Invoke-RestMethod -Method Get -Uri ($base+'/functions') -Headers $headers
ConvertTo-Json -InputObject $liveFunctions -Depth 20|Set-Content -LiteralPath (Join-Path $backupRoot 'edge-live-inventory-current.json') -Encoding UTF8
$liveFunctions=Get-Content -LiteralPath (Join-Path $backupRoot 'edge-live-inventory-current.json') -Raw|ConvertFrom-Json
$liveList=if($liveFunctions.functions){@($liveFunctions.functions)}elseif($liveFunctions.value){@($liveFunctions.value)}else{@($liveFunctions)}
$archive=Get-Content -LiteralPath (Join-Path $backupRoot 'edge-export/supabase/deployed-functions.json') -Raw|ConvertFrom-Json
$liveShape=@($liveList|Sort-Object slug|ForEach-Object {[pscustomobject]@{slug=$_.slug;version=$_.version;verify_jwt=$_.verify_jwt}})
$archiveShape=@($archive.functions|Sort-Object slug|ForEach-Object {[pscustomobject]@{slug=$_.slug;version=$_.version;verify_jwt=$_.verify_jwt}})
$receipt.edge_function_count=$liveShape.Count
$receipt.edge_versions_and_jwt_match_archive=(($liveShape|ConvertTo-Json -Compress) -ceq ($archiveShape|ConvertTo-Json -Compress))
$receipt|ConvertTo-Json -Depth 8|Set-Content (Join-Path $backupRoot 'management-export-receipt.json') -Encoding UTF8
$receipt|ConvertTo-Json -Depth 8
if ($IncludeStorage) {
 # Owner explicitly approved this existing key for download-only use in memory.
 $apiKeys=Invoke-RestMethod -Method Get -Uri ($base+'/api-keys') -Headers $headers
 $serviceKey=(@($apiKeys)|Where-Object {$_.name -eq 'service_role'}|Select-Object -First 1).api_key
 if (!$serviceKey) { throw 'Storage download credential unavailable' }
 $key=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($key)}finally{$rng.Dispose()}
 $keyPath=Join-Path $backupRoot ('storage-key-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.dpapi')
 [IO.File]::WriteAllBytes($keyPath,[Security.Cryptography.ProtectedData]::Protect($key,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
 $start=[Diagnostics.ProcessStartInfo]::new('node',(Join-Path $PSScriptRoot 'download-scheduling-storage-backup.mjs'))
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true
 $child=[Diagnostics.Process]::Start($start)
 $child.StandardInput.WriteLine((@{token=$token;serviceKey=$serviceKey;encryptionKey=[Convert]::ToBase64String($key);keyFile=[IO.Path]::GetFileName($keyPath)}|ConvertTo-Json -Compress))
 $child.StandardInput.Close();$child.WaitForExit();if($child.ExitCode -ne 0){throw 'Storage backup incomplete'}
 Write-Output 'Storage key is protected locally; independent recovery escrow remains required.'
}
