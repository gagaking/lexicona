const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const APP_DIR = (() => {
  try { const { app } = require('electron'); if (app.isPackaged) return path.dirname(app.getPath('exe')); } catch (_) {}
  return path.resolve(__dirname, '..');
})();
const GPU_ENV = path.join(APP_DIR, 'gpu_env');
const MODELS_DIR = path.join(APP_DIR, 'models');
const PYTHON_VENV = path.join(GPU_ENV, 'Scripts', 'python.exe');

async function checkSetup() {
  if (!fs.existsSync(PYTHON_VENV)) { return true; }
  try {
    execSync(`"${PYTHON_VENV}" -c "import torch; assert torch.cuda.is_available()"`, { stdio: 'pipe', timeout: 10000 });
    return false;
  } catch { return true; }
}

async function setupPython(onProgress) {
  onProgress({ step: 'check', message: '检查 Python 3.10 环境...', progress: 0 });

  // Try to find Python 3.10
  let pythonPath = findPython310();
  if (!pythonPath) {
    onProgress({ step: 'error', message: '未找到 Python 3.10。\n请先安装 Python 3.10 (https://www.python.org/downloads/release/python-31011/)', progress: 0 });
    throw new Error('Python 3.10 not found');
  }

  onProgress({ step: 'venv', message: '创建虚拟环境...', progress: 0.1 });
  execSync(`"${pythonPath}" -m venv "${GPU_ENV}"`, { stdio: 'pipe', timeout: 30000 });

  onProgress({ step: 'pip', message: '升级 pip...', progress: 0.15 });
  execSync(`"${PYTHON_VENV}" -m pip install --upgrade pip`, { stdio: 'pipe', timeout: 60000 });

  onProgress({ step: 'torch', message: '安装 PyTorch CUDA 支持 (~2.5 GB)\n首次下载可能需要 10-30 分钟...', progress: 0.2 });
  execSync(`"${PYTHON_VENV}" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 --default-timeout 300`, { stdio: 'pipe', timeout: 3600000 });

  onProgress({ step: 'deps', message: '安装依赖...', progress: 0.7 });
  execSync(`"${PYTHON_VENV}" -m pip install opencv-python numpy pillow`, { stdio: 'pipe', timeout: 120000 });

  onProgress({ step: 'copy', message: '配置深度估计模块...', progress: 0.8 });
  const srcPkg = path.join(APP_DIR, 'depth-anything-v2', 'depth_anything_v2');
  const dstPkg = path.join(GPU_ENV, 'Lib', 'site-packages', 'depth_anything_v2');
  if (fs.existsSync(srcPkg)) {
    fs.cpSync(srcPkg, dstPkg, { recursive: true, force: true });
  }

  onProgress({ step: 'model', message: '检查深度图模型...', progress: 0.85 });
  const modelPath = path.join(MODELS_DIR, 'depth_anything_v2_vitl.pth');
  if (!fs.existsSync(modelPath)) {
    try {
      onProgress({ step: 'model', message: '下载深度图模型 (~1.34 GB)...', progress: 0.85 });
      await downloadWithProgress('https://hf-mirror.com/depth-anything/Depth-Anything-V2-Large/resolve/main/depth_anything_v2_vitl.pth', modelPath, (p) => {
        onProgress({ step: 'model', message: '下载深度图模型...', progress: 0.85 + p * 0.14 });
      });
    } catch {
      onProgress({ step: 'model_warn', message: '模型自动下载失败，可稍后手动下载放入 models/ 目录。', progress: 0.99 });
    }
  }

  onProgress({ step: 'verify', message: '验证 GPU 环境...', progress: 0.99 });
  try {
    execSync(`"${PYTHON_VENV}" -c "import torch; print(f'GPU: {torch.cuda.get_device_name(0)}')"`, { stdio: 'pipe', timeout: 10000 });
    onProgress({ step: 'done', message: '环境初始化完成！GPU 已就绪。', progress: 1 });
  } catch {
    onProgress({ step: 'done', message: '环境初始化完成（CPU 模式）。', progress: 1 });
  }
}

function findPython310() {
  const common = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(process.env.ProgramFiles || '', 'Python', 'Python310', 'python.exe'),
    'C:\\Python310\\python.exe',
  ];
  for (const loc of common) {
    if (fs.existsSync(loc)) return loc;
  }
  try {
    const out = execSync('where python 2>nul', { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0];
    if (out) {
      const ver = execSync(`"${out}" --version`, { encoding: 'utf8', stdio: 'pipe' });
      if (ver.includes('3.10')) return out;
    }
  } catch {}
  return null;
}

async function downloadWithProgress(url, dest, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const total = parseInt(response.headers.get('content-length') || '0');
  let received = 0;

  const reader = response.body.getReader();
  const writer = fs.createWriteStream(dest);
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }

  const buf = Buffer.concat(chunks);
  fs.writeFileSync(dest, buf);
}

module.exports = { checkSetup, setupPython };