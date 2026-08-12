$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root 'gpu_env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
  throw 'gpu_env not found. Run the app setup once or create the Python environment first.'
}

& $python -m pip show pyinstaller *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Installing PyInstaller into gpu_env...'
  & $python -m pip install pyinstaller
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to install PyInstaller.'
  }
}

$dist = Join-Path $root 'build'
$work = Join-Path $root 'build\pyinstaller-work'
$spec = Join-Path $root 'build\pyinstaller-spec'
$source = Join-Path $root 'run_depth_anything.py'
$depthRoot = Join-Path $root 'depth-anything-v2'

& $python -m PyInstaller --noconfirm --clean --onedir --name depth-engine --distpath $dist --workpath $work --specpath $spec --paths $depthRoot --collect-all torch --collect-all cv2 --collect-all numpy --log-level WARN $source
if ($LASTEXITCODE -ne 0) {
  throw 'PyInstaller depth engine build failed.'
}

$engine = Join-Path $dist 'depth-engine\depth-engine.exe'
if (-not (Test-Path -LiteralPath $engine)) {
  throw 'Depth engine exe was not produced.'
}

Write-Host "Depth engine built: $engine"
