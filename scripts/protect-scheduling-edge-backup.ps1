# Local encrypted archive/restore verification only. Does not invoke or deploy functions.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$backupRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../outputs/deployment/scheduling-backup-readiness'))
$sourceRoot = Join-Path $backupRoot 'edge-export'
$archivePath = Join-Path $backupRoot 'edge-source.zip'
$encryptedPath = Join-Path $backupRoot 'edge-source.zip.dpapi'
$restoreRoot = Join-Path $backupRoot 'edge-restore-verification'
if (Test-Path -LiteralPath $restoreRoot) { throw 'Restore target already exists; preserve previous evidence.' }
$before = @{}
Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | ForEach-Object {
    $before[$_.FullName.Substring($sourceRoot.Length + 1)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
}
Compress-Archive -LiteralPath (Join-Path $sourceRoot 'supabase') -DestinationPath $archivePath
try {
    $bytes = [IO.File]::ReadAllBytes($archivePath)
    $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($encryptedPath, $protected)
    $recovered = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($encryptedPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ([Convert]::ToBase64String($bytes) -cne [Convert]::ToBase64String($recovered)) { throw 'Encrypted archive round trip differs' }
    [IO.File]::WriteAllBytes($archivePath, $recovered)
    Expand-Archive -LiteralPath $archivePath -DestinationPath $restoreRoot
    $afterCount = @(Get-ChildItem -LiteralPath $restoreRoot -Recurse -File).Count
    if ($afterCount -ne $before.Count) { throw 'Restored file count differs' }
    foreach ($relative in $before.Keys) {
        if ((Get-FileHash -LiteralPath (Join-Path $restoreRoot $relative) -Algorithm SHA256).Hash -cne $before[$relative]) { throw 'Restored source hash differs' }
    }
    $receipt = @{
        checked_at = [DateTime]::UtcNow.ToString('o')
        files = $before
        encrypted_archive_sha256 = (Get-FileHash -LiteralPath $encryptedPath -Algorithm SHA256).Hash
        restore = 'all exported source bytes match; handlers not executed'
        limitation = 'Windows CurrentUser DPAPI requires this Windows identity; independent disaster-recovery key escrow remains required. This archive contains downloaded functions only; inventory must confirm completeness.'
    }
    $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupRoot 'edge-restore-receipt.json') -Encoding UTF8
    Write-Output "Encrypted Edge source archive restored and verified: $afterCount files. Independent recovery escrow is still required."
} finally {
    # Delete only this known temporary archive, never a directory or computed traversal.
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
}
