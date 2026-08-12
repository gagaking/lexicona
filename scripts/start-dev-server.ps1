$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'build\dev-server.log'
$err = Join-Path $root 'build\dev-server.err'
$pidFile = Join-Path $root 'build\dev-server.pid'

$env:PORT = '3000'
$env:NODE_ENV = 'production'
$env:LEXICONA_ROOT = $root
$env:LEXICONA_DIST = Join-Path $root 'dist'

$node = (Get-Command node.exe).Source
$process = Start-Process -FilePath $node -ArgumentList @('dist/server.cjs') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
$process.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
Write-Host "Dev server started with PID $($process.Id)"
Write-Host "Log: $log"
Write-Host "URL: http://localhost:3000"
