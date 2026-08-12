$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$engineScript = Join-Path $root 'scripts\build-depth-engine.ps1'
$fullConfig = Join-Path $root 'electron-builder.full.yml'
$releaseFull = Join-Path $root 'release-full'
$zip = Join-Path $releaseFull 'Lexicona-Full-win-x64.zip'

Push-Location $root
try {
  Write-Host 'Building web/server bundle...'
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }

  Write-Host 'Building self-contained depth engine...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $engineScript
  if ($LASTEXITCODE -ne 0) { throw 'Depth engine build failed.' }

  Write-Host 'Packaging win-unpacked...'
  & npx.cmd electron-builder --dir --config $fullConfig
  if ($LASTEXITCODE -ne 0) { throw 'electron-builder --dir failed.' }

  if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
  }
  Write-Host 'Creating full distribution zip...'
  & tar.exe -a -c -f $zip -C $releaseFull win-unpacked
  if ($LASTEXITCODE -ne 0) { throw 'tar zip creation failed.' }

  Write-Host "Full package created: $zip"
}
finally {
  Pop-Location
}
