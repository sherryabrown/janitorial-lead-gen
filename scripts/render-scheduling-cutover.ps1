param([ValidateSet('Inspect','Hold','Normal','Status')][string]$Mode='Inspect')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$root=Join-Path $workspace 'outputs/deployment/scheduling-backup-readiness/cutover-execution'
New-Item -ItemType Directory -Path $root -Force|Out-Null
$receipt=if($Mode -eq 'Inspect'){'RenderOriginal.json'}elseif($Mode -eq 'Hold'){'RenderHoldDeploy.json'}elseif($Mode -eq 'Normal'){'RenderNormalDeploy.json'}else{$null}
if($receipt -and (Test-Path -LiteralPath (Join-Path $root $receipt))){throw 'One-time operation already has a receipt; inspect it instead of replaying or overwriting it'}
$values=@{};Get-Content -LiteralPath (Join-Path $workspace '.env')|ForEach-Object{if($_ -match '^([A-Z0-9_]+)=(.*)$'){$values[$matches[1]]=$matches[2].Trim().Trim('"').Trim("'")}}
if(!$values['RENDER_API_KEY']){throw 'Existing Render credential unavailable'}
$headers=@{Authorization=('Bearer '+$values['RENDER_API_KEY'])};$base='https://api.render.com/v1/services/srv-db2q9mmi0phs738v7f80'
function Call-Render($Method,$Path,$Body){$args=@{Uri=($base+$Path);Method=$Method;Headers=$headers;TimeoutSec=120};if($null -ne $Body){$args.ContentType='application/json';$args.Body=$Body|ConvertTo-Json -Depth 8};return Invoke-RestMethod @args}
if($Mode -eq 'Inspect'){
 $service=Call-Render Get '' $null;$cors=Call-Render Get '/env-vars/PROCUREMENT_ALLOWED_ORIGINS' $null;$deploys=Call-Render Get '/deploys?limit=5' $null
 $state=@{observed_at=[DateTime]::UtcNow.ToString('o');service=$service;cors=$cors;deploys=$deploys}
 $state|ConvertTo-Json -Depth 40|Set-Content (Join-Path $root 'RenderOriginal.json') -Encoding UTF8
 [pscustomobject]@{id=$service.id;branch=$service.branch;autoDeploy=$service.autoDeploy;dockerCommand=$service.serviceDetails.envSpecificDetails.dockerCommand;cors=$cors}|ConvertTo-Json -Depth 5
}
elseif($Mode -eq 'Status'){
 $path=if(Test-Path -LiteralPath (Join-Path $root 'RenderNormalDeploy.json')){Join-Path $root 'RenderNormalDeploy.json'}else{Join-Path $root 'RenderHoldDeploy.json'}
 $deploy=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;$status=Call-Render Get ('/deploys/'+$deploy.id) $null
 $status|ConvertTo-Json -Depth 30|Set-Content (Join-Path $root 'RenderLatestStatus.json') -Encoding UTF8
 $status|Select-Object id,status,commit,createdAt,finishedAt|ConvertTo-Json -Depth 5
}
else{
 $original=Get-Content -LiteralPath (Join-Path $root 'RenderOriginal.json') -Raw|ConvertFrom-Json
 if($original.service.autoDeploy -ne 'no'){throw 'Reconcile unexpected autodeploy setting before changing service'}
 $command=if($Mode -eq 'Hold'){'node scripts/scheduling-cutover-hold.mjs'}else{$original.service.serviceDetails.envSpecificDetails.dockerCommand}
 if($null -eq $command){$command=''}
 if($Mode -eq 'Normal'){
  $old=$original.cors.value;if($null -eq $old -and $original.cors.envVar){$old=$original.cors.envVar.value};if($null -eq $old){throw 'Original CORS value unavailable'}
  $origins=@($old.Split(',')|Where-Object {$_});if($origins -notcontains 'https://spin.aptimap.tools'){$origins+='https://spin.aptimap.tools'}
  $null=Call-Render Put '/env-vars/PROCUREMENT_ALLOWED_ORIGINS' @{value=($origins -join ',')}
 }
 $null=Call-Render Patch '' @{autoDeploy='no';serviceDetails=@{envSpecificDetails=@{dockerCommand=$command}}}
 $deploy=Call-Render Post '/deploys' @{commitId='fa216c0986d16506cd1fcb8184984a0acd1cd904';clearCache='do_not_clear'}
 $name=if($Mode -eq 'Hold'){'RenderHoldDeploy.json'}else{'RenderNormalDeploy.json'}
 $deploy|ConvertTo-Json -Depth 30|Set-Content (Join-Path $root $name) -Encoding UTF8
 $deploy|Select-Object id,status,commit|ConvertTo-Json -Depth 5
}
