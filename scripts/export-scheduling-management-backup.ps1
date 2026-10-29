param([switch]$IncludeStorage,[switch]$AuthenticationLogsOnly)
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
