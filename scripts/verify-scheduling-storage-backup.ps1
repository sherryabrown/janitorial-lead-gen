# Fresh-process recovery using the saved local encrypted key. No live API access.
param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$backupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../outputs/deployment/scheduling-backup-readiness'))
$resolved=[IO.Path]::GetFullPath($Folder)
if([IO.Path]::GetDirectoryName($resolved) -ne $backupRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^storage-encrypted-\d+$'){throw 'Unexpected backup folder'}
$receipt=Get-Content -LiteralPath (Join-Path $resolved 'receipt.json') -Raw|ConvertFrom-Json
if($receipt.keyFile -notmatch '^storage-key-\d{8}T\d{9}\.dpapi$'){throw 'Unexpected recovery key reference'}
$key=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $backupRoot $receipt.keyFile)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$start=[Diagnostics.ProcessStartInfo]::new('node',(Join-Path $PSScriptRoot 'verify-scheduling-storage-backup.mjs'))
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true
$child=[Diagnostics.Process]::Start($start)
$child.StandardInput.WriteLine((@{folder=$resolved;key=[Convert]::ToBase64String($key)}|ConvertTo-Json -Compress))
$child.StandardInput.Close();$child.WaitForExit();if($child.ExitCode -ne 0){throw 'Independent recovery failed'}
