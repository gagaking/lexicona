const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(require('child_process').exec);

const APP_DIR = (() => {
  try { const { app } = require('electron'); if (app.isPackaged) return path.dirname(app.getPath('exe')); } catch (_) {}
  return path.resolve(__dirname, '..');
})();
const GPU_ENV = path.join(APP_DIR, 'gpu_env');
const MODELS_DIR = path.join(APP_DIR, 'models');
const PYTHON_VENV = path.join(GPU_ENV, 'Scripts', 'python.exe');

// Known local development environment paths (for offline deployment)
function findLocalEnv() {
  const searchPaths = [
    // Same machine dev environment
    'C:\\Users\\sa\\Documents\\lexicona\\gpu_env',
    // If installed via win-unpacked, check the release dir
    path.join(APP_DIR, '..', 'gpu_env'),
    // Adjacent to the app directory
    path.join(path.dirname(APP_DIR), 'gpu_env'),
  ];
  for (const sp of searchPaths) {
    const py = path.join(sp, 'Scripts', 'python.exe');
    if (fs.existsSync(py)) {
      try {
        require('child_process').execSync('"' + py + '" -c "import torch; assert torch.cuda.is_available()"', { timeout: 10000 });
        return sp;
      } catch(_) {}
    }
  }
  return null;
}

function getProxyEnv() {
  const env = {};
  for (const key of ['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy']) {
    const val = process.env[key];
    if (val) { env.HTTPS_PROXY = val; env.HTTP_PROXY = val; break; }
  }
  if (!env.HTTP_PROXY) {
    for (const port of [7890,10809,1080,7897]) {
      try {
        const url = 'http://127.0.0.1:' + port;
        env.HTTPS_PROXY = url; env.HTTP_PROXY = url;
        break;
      } catch(_) {}
    }
  }
  return env;
}

function execWithProgress(cmd, opts, onLine) {
  return new Promise((resolve, reject) => {
    const child = require('child_process').exec(cmd, {
      ...opts,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, ...opts.env, ...getProxyEnv() },
    });
    const timeout = opts.timeout || 0;
    let timedOut = false;
    let timer;
    if (timeout > 0) {
      timer = setTimeout(() => { timedOut = true; child.kill(); reject(new Error('Command timed out')); }, timeout);
    }
    if (child.stdout) child.stdout.on('data', d => { if (onLine) onLine(d.toString()); });
    if (child.stderr) child.stderr.on('data', d => { if (onLine) onLine(d.toString()); });
    child.on('close', code => { if (timer) clearTimeout(timer); if (timedOut) return; if (code === 0) resolve(); else reject(new Error('Exit code ' + code)); });
    child.on('error', err => { if (timer) clearTimeout(timer); if (timedOut) return; reject(err); });
  });
}

async function checkSetup() {
  if (!fs.existsSync(PYTHON_VENV)) { return true; }
  try {
    await execAsync('"' + PYTHON_VENV + '" -c "import torch; assert torch.cuda.is_available()"', { timeout: 10000 });
    return false;
  } catch(e) { return true; }
}

async function setupPython(onProgress) {
  onProgress({ step: 'check', message: '检查 Python 3.10 环境...', progress: 0 });

  // First, try to use a locally pre-built environment (offline deployment)
  const localEnv = findLocalEnv();
  if (localEnv) {
    onProgress({ step: 'local', message: '发现本地深度学习环境，正在复制...', progress: 0.1 });
    try {
      fs.cpSync(localEnv, GPU_ENV, { recursive: true, force: true });
      onProgress({ step: 'local_ok', message: '本地环境复制完成！', progress: 0.4 });
      // Skip venv creation and pip install, go straight to model check
      const srcPkg = path.join(APP_DIR, 'depth-anything-v2', 'depth_anything_v2');
      const dstPkg = path.join(GPU_ENV, 'Lib', 'site-packages', 'depth_anything_v2');
      if (fs.existsSync(srcPkg)) {
        try { fs.cpSync(srcPkg, dstPkg, { recursive: true, force: true }); } catch(e) {}
      }
      onProgress({ step: 'model', message: '检查深度图模型...', progress: 0.45 });
      onProgress({ step: 'verify', message: '验证 GPU 环境...', progress: 0.99 });
      try {
        const out = require('child_process').execSync('"' + PYTHON_VENV + '" -c "import torch; print(torch.cuda.get_device_name(0))"', { timeout: 10000 });
        onProgress({ step: 'done', message: '环境初始化完成！GPU: ' + out.toString().trim() + ' 已就绪。', progress: 1 });
      } catch(e) {
        onProgress({ step: 'done', message: '环境初始化完成（CPU 模式）。', progress: 1 });
      }
      return;
    } catch(e) {
      onProgress({ step: 'local_fail', message: '本地环境复制失败: ' + e.message + '\\n回退到在线安装...', progress: 0.1 });
    }
  }

  let pythonPath = findPython310();
  if (!pythonPath) {
    onProgress({ step: 'error', message: '未找到 Python 3.10。\n请先安装 Python 3.10 (https://www.python.org/downloads/release/python-31011/)', progress: 0 });
    throw new Error('Python 3.10 not found');
  }

  onProgress({ step: 'venv', message: '创建虚拟环境...', progress: 0.1 });
  await execWithProgress('"' + pythonPath + '" -m venv "' + GPU_ENV + '"', { timeout: 30000 });

  onProgress({ step: 'pip', message: '升级 pip...', progress: 0.15 });
  await execWithProgress('"' + PYTHON_VENV + '" -m pip install --upgrade pip', { timeout: 60000 });

  onProgress({ step: 'torch', message: '安装 PyTorch CUDA 支持 (~2.5 GB)\n首次下载可能需要 10-30 分钟...', progress: 0.2 });
  const torchUrls = ['https://download.pytorch.org/whl/cu124', 'https://mirrors.tuna.tsinghua.edu.cn/pytorch/whl/cu124'];
  let torchInstalled = false;
  for (const url of torchUrls) {
    if (torchInstalled) break;
    try {
      await execWithProgress('"' + PYTHON_VENV + '" -m pip install torch torchvision --index-url ' + url + ' --default-timeout 120', { timeout: 5400000 }, line => {
        const m = line.match(/(\d+\.\d+)\/(\d+\.\d+)\s*MB/);
        if (m) {
          const pct = parseFloat(m[1]) / parseFloat(m[2]);
          onProgress({ step: 'torch', message: '安装 PyTorch... ' + (pct*100).toFixed(0) + '%', progress: 0.2 + pct * 0.48 });
        }
      });
      torchInstalled = true;
    } catch(e) {
      onProgress({ step: 'torch', message: 'PyTorch 源 ' + url + ' 失败，尝试下一个镜像...', progress: 0.2 });
    }
  }
  if (!torchInstalled) {
    throw new Error('PyTorch 安装失败，请检查网络连接或尝试使用 VPN 的全局代需模式。');
  }

  onProgress({ step: 'deps', message: '安装其他依赖...', progress: 0.7 });
  await execWithProgress('"' + PYTHON_VENV + '" -m pip install opencv-python', { timeout: 120000 });

  onProgress({ step: 'copy', message: '配置深度估计模块...', progress: 0.8 });
  const srcPkg = path.join(APP_DIR, 'depth-anything-v2', 'depth_anything_v2');
  const dstPkg = path.join(GPU_ENV, 'Lib', 'site-packages', 'depth_anything_v2');
  if (fs.existsSync(srcPkg)) {
    try { fs.cpSync(srcPkg, dstPkg, { recursive: true, force: true }); } catch(e) {}
  }

  onProgress({ step: 'model', message: '检查深度图模型...', progress: 0.85 });
  const modelPath = path.join(MODELS_DIR, 'depth_anything_v2_vitl.pth');
  if (!fs.existsSync(modelPath)) {
    try {
      onProgress({ step: 'model', message: '下载深度图模型 (~1.34 GB)...', progress: 0.85 });
      await downloadWithProgress('https://huggingface.co/depth-anything/Depth-Anything-V2-Large/resolve/main/depth_anything_v2_vitl.pth', modelPath, p => {
        onProgress({ step: 'model', message: '下载深度图模型...', progress: 0.85 + p * 0.14 });
      });
    } catch(e) {
      onProgress({ step: 'model_warn', message: '模型自动下载失败，可稍后手动下载放入 models/ 目录。', progress: 0.99 });
    }
  }

  onProgress({ step: 'verify', message: '验证 GPU 环境...', progress: 0.99 });
  try {
    const out = require('child_process').execSync('"' + PYTHON_VENV + '" -c "import torch; print(torch.cuda.get_device_name(0))"', { timeout: 10000 });
    onProgress({ step: 'done', message: '环境初始化完成！GPU: ' + out.toString().trim() + ' 已就绪。', progress: 1 });
  } catch(e) {
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
    const out = require('child_process').execSync('where python 2>nul', { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0];
    if (out) {
      const ver = require('child_process').execSync('"' + out + '" --version', { encoding: 'utf8', stdio: 'pipe' });
      if (ver.includes('3.10')) return out;
    }
  } catch(e) {}
  return null;
}

async function downloadWithProgress(url, dest, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const total = parseInt(response.headers.get('content-length') || '0');
  let received = 0;
  const reader = response.body.getReader();
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
