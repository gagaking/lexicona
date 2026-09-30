import { createServer } from "http";
import express from "express";
import path from "path";
import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import os from "os";

// 抠图/深度推理会在系统临时目录落地输入输出文件；进程异常退出时可能残留，
// 这里在启动时和前端进入工作台时统一清理，释放本地缓存。
const LEXICONA_TEMP_PREFIXES = [
  "matting_input_",
  "matting_output_",
  "depth_input_",
  "depth_output_",
];

function sweepLexiconaTemp(): number {
  let removed = 0;
  // 只清理 10 分钟前的文件：避免多个实例同时运行时误删对方正在使用的临时文件
  const expireBefore = Date.now() - 10 * 60 * 1000;
  const previewExpireBefore = Date.now() - 3 * 24 * 60 * 60 * 1000;
  try {
    const dir = os.tmpdir();
    for (const name of readdirSync(dir)) {
      if (!LEXICONA_TEMP_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
      const fullPath = path.join(dir, name);
      try {
        if (statSync(fullPath).mtimeMs > expireBefore) continue;
        unlinkSync(fullPath);
        removed += 1;
      } catch (_) {}
    }
    // 预览缓存（PSD 合成图）留 3 天
    const previewDir = path.join(dir, "lexicona-previews");
    if (existsSync(previewDir)) {
      for (const name of readdirSync(previewDir)) {
        const fullPath = path.join(previewDir, name);
        try {
          if (statSync(fullPath).mtimeMs > previewExpireBefore) continue;
          unlinkSync(fullPath);
          removed += 1;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return removed;
}

function findProjectRoot(): string {
  const markers = ["gpu_env", "models", "depth-engine", "depth-anything-v2", "run_depth_anything.py"];
  const candidates: string[] = [];
  try {
    const exeDir = path.dirname(process.execPath);
    candidates.push(exeDir);
  } catch (_) {}
  candidates.push(process.cwd());
  try {
    const rp = (process as any).resourcesPath;
    if (rp) candidates.push(rp);
  } catch (_) {}
  try {
    const exeDir = path.dirname(process.execPath);
    candidates.push(path.resolve(exeDir, "..", ".."));
  } catch (_) {}
  for (const candidate of candidates) {
    if (markers.some((m) => existsSync(path.join(candidate, m)))) return candidate;
  }
  return process.cwd();
}const ROOT = process.env.LEXICONA_ROOT || findProjectRoot();

function findDepthEngine(): string | null {
  const candidates: string[] = [];
  if (process.env.LEXICONA_DEPTH_ENGINE) candidates.push(process.env.LEXICONA_DEPTH_ENGINE);
  try {
    const rp = (process as any).resourcesPath;
    if (rp) {
      candidates.push(path.join(rp, "depth-engine", "depth-engine.exe"));
      candidates.push(path.join(rp, "run_depth_anything", "run_depth_anything.exe"));
    }
  } catch (_) {}
  candidates.push(path.join(ROOT, "build", "depth-engine", "depth-engine.exe"));
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function resolveModelPath(modelPath: string | undefined): string | null {
  const raw = (modelPath || "").trim();
  const defaultModel = path.join(ROOT, "models", "depth_anything_v2_vitl.pth");
  if (!raw || raw === "/models/depth_anything_v2_vitl.pth" || raw === "models/depth_anything_v2_vitl.pth") {
    return existsSync(defaultModel) ? defaultModel : null;
  }

  const candidates = [raw];
  if (raw.startsWith("/")) {
    candidates.push(path.join(ROOT, raw.slice(1)));
  } else if (!path.isAbsolute(raw)) {
    candidates.push(path.join(ROOT, raw));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  if (existsSync(defaultModel)) {
    console.warn(`Depth model path not found, falling back to bundled model: ${raw}`);
    return defaultModel;
  }
  return null;
}

const MATTING_FOLDERS: Record<string, string[]> = {
  // 精细模式：人像/服装等带发丝与半透明边缘的主体
  matting: ["BiRefNet_HR-matting", "BiRefNet-matting", "BiRefNet-portrait", "BiRefNet"],
  // 通用模式：物体、场景等边界清晰的主体
  general: ["BiRefNet", "BiRefNet_HR"],
};

// 允许直接按路径读取的本地文件类型（抠图输入 + 预览）
const LOCAL_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".psd",
];
const LOCAL_IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".psd": "image/vnd.adobe.photoshop",
};

/** 校验并解析本地图片路径，避免把任意路径当资源读取 */
function resolveLocalImagePath(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const resolved = path.resolve(value);
  if (!LOCAL_IMAGE_EXTENSIONS.includes(path.extname(resolved).toLowerCase())) return null;
  try {
    if (!existsSync(resolved) || !statSync(resolved).isFile()) return null;
  } catch (_) {
    return null;
  }
  return resolved;
}

function mattingRoots(): string[] {
  const roots = [path.join(ROOT, "models", "birefnet")];
  try {
    const rp = (process as any).resourcesPath;
    if (rp) roots.push(path.join(rp, "models", "birefnet"));
  } catch (_) {}
  try {
    const exeDir = path.dirname(process.execPath);
    roots.push(path.join(exeDir, "models", "birefnet"));
  } catch (_) {}
  return roots;
}

function resolveMattingModelDir(kind: string | undefined): string | null {
  const folders = MATTING_FOLDERS[kind === "general" ? "general" : "matting"];
  for (const root of mattingRoots()) {
    for (const folder of folders) {
      const dir = path.join(root, folder);
      if (existsSync(path.join(dir, "model.safetensors"))) return dir;
    }
  }
  return null;
}

function findMattingScript(): string | null {
  const candidates = [path.join(ROOT, "birefnet_matting.py")];
  try {
    const rp = (process as any).resourcesPath;
    if (rp) candidates.push(path.join(rp, "birefnet_matting.py"));
  } catch (_) {}
  try {
    const exeDir = path.dirname(process.execPath);
    candidates.push(path.join(exeDir, "birefnet_matting.py"));
  } catch (_) {}
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

// ---------------------------------------------------------------------------
// 常驻抠图进程：模型只加载一次，批量抠图不再每张都重启引擎
// ---------------------------------------------------------------------------
const MATTING_PROTOCOL_PREFIX = "@@LEXICONA@@";
const MATTING_IDLE_MS = 2 * 60 * 1000;

type MattingWorker = {
  child: import("child_process").ChildProcess;
  pending: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>;
  nextId: number;
  idleTimer: NodeJS.Timeout | null;
  stdoutBuffer: string;
};

let mattingWorker: MattingWorker | null = null;
/** 预览生成中的任务（同一文件同一尺寸并发请求只跑一次） */
const previewTasks = new Map<string, Promise<string>>();

function mattingWorkerCommand(): { program: string; args: string[] } | null {
  const pythonPath = path.join(ROOT, "gpu_env", "Scripts", "python.exe");
  const engineScript = path.join(ROOT, "engine.py");
  // 开发环境用 gpu_env 跑统一入口；打包版走内置引擎
  if (existsSync(engineScript) && existsSync(pythonPath)) {
    return { program: pythonPath, args: [engineScript, "--task", "matte", "--serve"] };
  }
  const engine = findDepthEngine();
  if (engine) return { program: engine, args: ["--task", "matte", "--serve"] };
  return null;
}

function shutdownMattingWorker(reason: string) {
  const worker = mattingWorker;
  if (!worker) return;
  mattingWorker = null;
  if (worker.idleTimer) clearTimeout(worker.idleTimer);
  worker.pending.forEach(({ reject }) => reject(new Error(reason)));
  worker.pending.clear();
  try {
    worker.child.stdin?.write(JSON.stringify({ action: "exit" }) + "\n");
    worker.child.stdin?.end();
  } catch (_) {}
  const child = worker.child;
  setTimeout(() => {
    try {
      child.kill();
    } catch (_) {}
  }, 600);
}

function scheduleMattingIdleStop() {
  const worker = mattingWorker;
  if (!worker) return;
  if (worker.idleTimer) clearTimeout(worker.idleTimer);
  worker.idleTimer = setTimeout(() => {
    console.log("Matting worker idle, releasing GPU memory.");
    shutdownMattingWorker("推理进程空闲超时，已释放显存");
  }, MATTING_IDLE_MS);
  worker.idleTimer.unref?.();
}

function ensureMattingWorker(): MattingWorker {
  if (mattingWorker) return mattingWorker;
  const command = mattingWorkerCommand();
  if (!command) {
    throw new Error("未找到本地推理引擎或 Python 环境，请安装完整版 Lexicona。");
  }
  const child = spawn(command.program, command.args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const worker: MattingWorker = {
    child,
    pending: new Map(),
    nextId: 0,
    idleTimer: null,
    stdoutBuffer: "",
  };
  mattingWorker = worker;

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    worker.stdoutBuffer += chunk;
    let index = worker.stdoutBuffer.indexOf("\n");
    while (index >= 0) {
      const line = worker.stdoutBuffer.slice(0, index).trim();
      worker.stdoutBuffer = worker.stdoutBuffer.slice(index + 1);
      if (line.startsWith(MATTING_PROTOCOL_PREFIX)) {
        try {
          const payload = JSON.parse(line.slice(MATTING_PROTOCOL_PREFIX.length).trim());
          if (payload.id !== undefined && payload.id !== null) {
            const pending = worker.pending.get(payload.id);
            if (pending) {
              worker.pending.delete(payload.id);
              pending.resolve(payload);
            }
          }
        } catch (err) {
          console.warn("Unparsable matting worker line:", line.slice(0, 200));
        }
      }
      index = worker.stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    const text = String(chunk).trim();
    if (text) console.log("[matting-engine]", text.slice(0, 400));
  });
  const handleExit = (code: number | null) => {
    if (mattingWorker === worker) mattingWorker = null;
    worker.pending.forEach(({ reject }) =>
      reject(new Error(`推理进程已退出 (code ${code ?? "null"})`)),
    );
    worker.pending.clear();
  };
  child.on("exit", handleExit);
  child.on("error", () => handleExit(null));
  console.log("Matting worker started:", command.program, command.args.join(" "));
  return worker;
}

// 主进程退出时顺手结束常驻推理进程，避免残留占用显存
const killMattingWorkerOnExit = () => {
  try {
    mattingWorker?.child.kill();
  } catch (_) {}
};
process.once("exit", killMattingWorkerOnExit);
process.once("SIGINT", killMattingWorkerOnExit);
process.once("SIGTERM", killMattingWorkerOnExit);

async function runMattingBatch(payload: {
  modelDir: string;
  size: number;
  refine?: boolean;
  items: Array<{ image: string; output: string }>;
}) {
  const response = await runMattingWorkerRequest({
    action: "matte",
    modelDir: payload.modelDir,
    size: payload.size,
    refine: payload.refine !== false,
    items: payload.items,
  });
  return (response.results || []) as Array<{
    ok: boolean;
    width: number;
    height: number;
    elapsedMs: number;
    foreground: number;
    refined?: boolean;
  }>;
}

/** 给常驻 worker 发一条请求（matte / preview / …），返回原始回包 */
async function runMattingWorkerRequest(body: Record<string, unknown>) {
  const worker = ensureMattingWorker();
  if (worker.idleTimer) clearTimeout(worker.idleTimer);
  const id = (worker.nextId += 1);
  const response = await new Promise<any>((resolve, reject) => {
    worker.pending.set(id, { resolve, reject });
    try {
      worker.child.stdin?.write(
        JSON.stringify({ id, ...body }) + "\n",
      );
    } catch (err) {
      worker.pending.delete(id);
      reject(err as Error);
    }
  });
  scheduleMattingIdleStop();
  if (!response?.ok) {
    throw new Error(response?.error || "推理失败");
  }
  return response;
}

// Windows 的 TCP 保留端口段（Hyper-V/WSL）会随重启变化，落在其中的端口 listen 会报 EACCES；
// 端口被别的进程占用时报 EADDRINUSE。两种情况都顺延到下一个可用端口。
async function listenOnAvailablePort(app: express.Express, basePort: number, maxAttempts = 200) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = basePort + attempt;
    const server = createServer(app);
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => reject(err);
        server.once("error", onError);
        server.listen(port, "0.0.0.0", () => {
          server.removeListener("error", onError);
          resolve();
        });
      });
      return { server, port };
    } catch (err) {
      server.close();
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EADDRINUSE") {
        console.warn(`Port ${port} unavailable (${code}), trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`No available port in range ${basePort}-${basePort + maxAttempts - 1}`);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000");

  // 软件启动时清理上次运行残留的推理临时文件，释放本地缓存
  const sweptTempFiles = sweepLexiconaTemp();
  if (sweptTempFiles > 0) {
    console.log(`Cleaned ${sweptTempFiles} leftover inference temp file(s)`);
  }

  app.use(express.json({ limit: "200mb" }));
  
  // CORS middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    const engine = findDepthEngine();
    const defaultModel = path.join(ROOT, "models", "depth_anything_v2_vitl.pth");
    const pythonPath = path.join(ROOT, "gpu_env", "Scripts", "python.exe");
    const mattingModel = resolveMattingModelDir("matting");
    const mattingScript = findMattingScript();
    const issues: string[] = [];
    if (!engine && !existsSync(pythonPath)) {
      issues.push("未找到内置深度引擎或 Python 环境");
    }
    if (!existsSync(defaultModel)) {
      issues.push("默认模型不存在: " + defaultModel);
    }
    res.json({
      ok: issues.length === 0,
      root: ROOT,
      engineFound: Boolean(engine),
      enginePath: engine,
      pythonFound: existsSync(pythonPath),
      modelFound: existsSync(defaultModel),
      modelPath: defaultModel,
      mattingModelDir: mattingModel,
      mattingAvailable: Boolean(mattingModel) && Boolean(engine || (existsSync(pythonPath) && mattingScript)),
      mattingWorkerAlive: Boolean(mattingWorker),
      issues,
    });
  });

  // 释放本地推理缓存（临时输入/输出文件）
  app.post("/api/cache/clear", (_req, res) => {
    const removed = sweepLexiconaTemp();
    res.json({ success: true, removed });
  });

  // 读取本地图片用于预览（"链接式"引用）：只允许支持的图片/PSD 与真实存在的文件
  app.get("/api/local-file", (req, res) => {
    const resolved = resolveLocalImagePath((req.query as any)?.path);
    if (!resolved) {
      return res.status(404).json({ error: "文件不存在或格式不支持" });
    }
    const extension = path.extname(resolved).toLowerCase();
    res.setHeader("Content-Type", LOCAL_IMAGE_MIME[extension] || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.sendFile(resolved, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: "读取本地文件失败" });
      }
    });
  });

  // 浏览器渲染不了的格式（PSD/TIFF）由引擎生成缩略预览图
  app.get("/api/preview", async (req, res) => {
    const { readFileSync, existsSync, mkdirSync, statSync } = await import("fs");
    const crypto = await import("crypto");
    const resolved = resolveLocalImagePath((req.query as any)?.path);
    if (!resolved) {
      return res.status(404).json({ error: "文件不存在或格式不支持" });
    }
    const extension = path.extname(resolved).toLowerCase();
    if (![".psd", ".tif", ".tiff"].includes(extension)) {
      // 普通位图直接回源文件，浏览器自己解
      return res.redirect(`/api/local-file?path=${encodeURIComponent(resolved)}`);
    }
    if (!mattingWorkerCommand()) {
      return res.status(500).json({ error: "未找到本地推理引擎，无法生成预览" });
    }
    const size = Math.max(120, Math.min(2000, parseInt(String((req.query as any)?.size), 10) || 900));
    try {
      // 磁盘缓存 + 并发去重：同一文件同一尺寸只生成一次，之后秒开
      const stats = statSync(resolved);
      const cacheKey = crypto
        .createHash("sha1")
        .update(`${resolved}|${stats.mtimeMs}|${stats.size}|${size}`)
        .digest("hex")
        .slice(0, 24);
      const cacheDir = path.join(os.tmpdir(), "lexicona-previews");
      const cachePath = path.join(cacheDir, `${cacheKey}.jpg`);

      if (!existsSync(cachePath)) {
        const inflight = previewTasks.get(cacheKey);
        const task =
          inflight ||
          (async () => {
            mkdirSync(cacheDir, { recursive: true });
            await runMattingWorkerRequest({
              action: "preview",
              maxSize: size,
              items: [{ image: resolved, output: cachePath }],
            });
            if (!existsSync(cachePath)) throw new Error("预览图未生成");
            return cachePath;
          })().finally(() => previewTasks.delete(cacheKey));
        if (!inflight) previewTasks.set(cacheKey, task);
        await task;
      }

      const buffer = readFileSync(cachePath);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(buffer);
    } catch (error: any) {
      console.error("Preview failed:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message || "生成预览失败" });
      }
    }
  });

  // 取消当前抠图：直接结束常驻推理进程，正在跑的那张也会立刻中断
  app.post("/api/matting/cancel", (_req, res) => {
    const wasRunning = Boolean(mattingWorker);
    shutdownMattingWorker("已取消当前抠图任务");
    res.json({ success: true, cancelled: wasRunning });
  });

  // 主动释放推理进程与显存（空闲 2 分钟也会自动释放）
  app.post("/api/matting/release", (_req, res) => {
    const wasRunning = Boolean(mattingWorker);
    shutdownMattingWorker("已释放推理进程");
    res.json({ success: true, released: wasRunning });
  });

  // API proxy route for Nvidia
  app.post("/api/proxy/nvidia", async (req, res) => {
    try {
      const { url, headers, body } = req.body;
      const apiRes = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
      });
      const text = await apiRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        data = { message: text };
      }
      res.status(apiRes.status).json(data);
    } catch (error: any) {
      console.error("Nvidia proxy error:", error);
      res.status(500).json({ error: error.message, message: error.message });
    }
  });

  // API route for local Depth Anything V2 model processing
  app.post("/api/depth-map", async (req, res) => {
    const { writeFileSync, unlinkSync, existsSync, readFileSync } = await import("fs");
    const { execFile } = await import("child_process");
    let tempInputPath = "";
    let tempOutputPath = "";

    try {
      const { image, modelPath } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data" });
      }

      const defaultModelPath = path.join(ROOT, "models", "depth_anything_v2_vitl.pth");
      const activeModelPath = resolveModelPath(modelPath) || defaultModelPath;

      if (!existsSync(activeModelPath)) {
        return res.status(400).json({
          error: "未找到深度估计模型文件: " + activeModelPath,
          hint: modelPath ? "请检查设置中的深度模型路径是否正确" : "请确认项目目录下有 models/depth_anything_v2_vitl.pth"
        });
      }
      
      // Clean up base64 prefix
      let base64Data = image;
      if (image.includes("base64,")) {
        base64Data = image.split("base64,")[1];
      }
      
      const buffer = Buffer.from(base64Data, "base64");
      const tempId = Date.now() + "_" + Math.floor(Math.random() * 1000);
      tempInputPath = path.join(os.tmpdir(), `depth_input_${tempId}.jpg`);
      tempOutputPath = path.join(os.tmpdir(), `depth_output_${tempId}.png`);
      
      writeFileSync(tempInputPath, buffer);
      
      // Run the self-contained depth engine when bundled; fall back to the local Python env.
      const depthEngine = findDepthEngine();
      const pythonPath = path.join(ROOT, "gpu_env", "Scripts", "python.exe");
      let scriptPath = path.join(ROOT, "run_depth_anything.py");
      if (!existsSync(scriptPath)) {
        try {
          const rp = (process as any).resourcesPath;
          if (rp) {
            const rpScript = path.join(rp, "run_depth_anything.py");
            if (existsSync(rpScript)) scriptPath = rpScript;
          }
        } catch (_) {}
      }
      if (!depthEngine && !existsSync(pythonPath)) {
        throw new Error("未找到深度图推理引擎或 Python 环境，请安装完整版 Lexicona。");
      }
      if (!depthEngine && !existsSync(scriptPath)) {
        throw new Error("未找到 run_depth_anything.py，无法执行深度图推理。");
      }

      await new Promise<void>((resolve, reject) => {
        const args = ["--image", tempInputPath, "--model", activeModelPath, "--output", tempOutputPath];
        const program = depthEngine || pythonPath;
        const programArgs = depthEngine ? args : [scriptPath, ...args];
        console.log(`Executing depth map: ${program} ${programArgs.join(" ")}`);
        execFile(program, programArgs, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            console.error(`Depth execution error: ${error.message}. Stderr: ${stderr}`);
            return reject(new Error((stderr || error.message || "Depth engine failed").trim()));
          }
          console.log(`Depth stdout: ${stdout}`);
          resolve();
        });
      });
      
      if (!existsSync(tempOutputPath)) {
        throw new Error("Output depth map image was not generated by script");
      }
      
      // Read output image and convert back to base64
      const outputBuffer = readFileSync(tempOutputPath);
      const outputBase64 = `data:image/png;base64,${outputBuffer.toString("base64")}`;
      
      res.json({ success: true, depthMapUrl: outputBase64 });
    } catch (error: any) {
      console.error("Depth map generation failed:", error);
      res.status(500).json({ error: error.message || "Internal error during depth map generation" });
    } finally {
      for (const file of [tempInputPath, tempOutputPath]) {
        try {
          if (file && existsSync(file)) unlinkSync(file);
        } catch (_) {}
      }
    }
  });

  // API route for local BiRefNet matting (抠图)
  app.post("/api/matting", async (req, res) => {
    const { writeFileSync, unlinkSync, existsSync, readFileSync } = await import("fs");
    let tempInputPath = "";
    let tempOutputPath = "";

    try {
      const { image, model, size, refine } = req.body || {};
      const { filePath } = req.body || {};
      if (!image && !filePath) {
        return res.status(400).json({ error: "Missing image data" });
      }
      // 本地文件走"链接式"引用：直接用磁盘路径推理，不收 base64、不写临时文件
      const localInput = filePath ? resolveLocalImagePath(filePath) : null;
      if (filePath && !localInput) {
        return res.status(400).json({
          error: "本地文件不存在或格式不支持",
          hint: String(filePath),
        });
      }

      const kind = model === "general" ? "general" : "matting";
      const modelDir = resolveMattingModelDir(kind);
      if (!modelDir) {
        return res.status(400).json({
          error: "未找到抠图模型权重",
          hint: "请确认 models/birefnet/BiRefNet_HR-matting/model.safetensors 存在（完整版安装包已内置）",
        });
      }

      if (!mattingWorkerCommand()) {
        throw new Error("未找到本地推理引擎或 Python 环境，请安装完整版 Lexicona。");
      }

      const tempId = Date.now() + "_" + Math.floor(Math.random() * 1000);
      tempOutputPath = path.join(os.tmpdir(), `matting_output_${tempId}.png`);
      let engineInputPath = "";
      if (localInput) {
        engineInputPath = localInput;
      } else {
        // 粘贴/浏览器上传的图片没有磁盘路径，退回 base64 → 临时文件
        let base64Data = image;
        let extension = "jpg";
        if (image.includes("base64,")) {
          const header = image.slice(0, image.indexOf("base64,"));
          if (header.includes("png")) extension = "png";
          else if (header.includes("webp")) extension = "webp";
          base64Data = image.split("base64,")[1];
        }
        const buffer = Buffer.from(base64Data, "base64");
        tempInputPath = path.join(os.tmpdir(), `matting_input_${tempId}.${extension}`);
        writeFileSync(tempInputPath, buffer);
        engineInputPath = tempInputPath;
      }

      const resolution = Math.max(
        256,
        Math.min(4096, parseInt(String(size), 10) || (kind === "general" ? 1024 : 2048)),
      );

      const startedAt = Date.now();
      // 走常驻推理进程：模型只加载一次，批量时每张只花推理时间
      const results = await runMattingBatch({
        modelDir,
        size: resolution,
        refine: refine !== false,
        items: [{ image: engineInputPath, output: tempOutputPath }],
      });

      if (!existsSync(tempOutputPath)) {
        throw new Error("Output matting image was not generated by script");
      }

      const outputBuffer = readFileSync(tempOutputPath);
      const imageUrl = `data:image/png;base64,${outputBuffer.toString("base64")}`;

      const meta: any = results[0] || {};

      res.json({
        success: true,
        imageUrl,
        model: kind,
        modelDir,
        resolution,
        elapsedMs: Date.now() - startedAt,
        ...meta,
      });
    } catch (error: any) {
      console.error("Matting failed:", error);
      res.status(500).json({ error: error.message || "Internal error during matting" });
    } finally {
      // 无论成功失败都清理临时文件，避免本地缓存堆积
      for (const file of [tempInputPath, tempOutputPath]) {
        try {
          if (file && existsSync(file)) unlinkSync(file);
        } catch (_) {}
      }
    }
  });

  // API route to download offline HTML directly
  app.get("/api/download-offline", async (req, res) => {
    const { existsSync } = await import("fs");
    const { exec } = await import("child_process");
    const offlinePathDist = path.join(ROOT, "dist", "PromptEagle_Offline.html");
    const offlinePathPublic = path.join(ROOT, "public", "PromptEagle_Offline.html");
    
    // In development, or if file is missing, build it dynamically
    if (process.env.NODE_ENV !== "production" || (!existsSync(offlinePathDist) && !existsSync(offlinePathPublic))) {
      try {
        console.log("Generating offline compilation...");
        await new Promise((resolve, reject) => {
          exec("npm run build", (error, stdout, stderr) => {
            if (error) {
              console.error("Build failed:", error);
              return reject(error);
            }
            resolve(stdout);
          });
        });
      } catch (err: any) {
        return res.status(500).send("构建离线文件失败，请查看云端日志：" + err.message);
      }
    }

    if (existsSync(offlinePathDist)) {
      res.download(offlinePathDist, "Lexicona-Offline.html");
    } else if (existsSync(offlinePathPublic)) {
      res.download(offlinePathPublic, "Lexicona-Offline.html");
    } else {
      res.status(404).send("离线版文件尚未生成！请先在网页加载后运行 npm run build 构建。");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
} else {
   const distPath = process.env.LEXICONA_DIST || path.join(ROOT, "dist");
    app.get("*", (req, res) => {
      const { readFileSync, existsSync } = require("fs");
      let filePath = path.join(distPath, req.path === "/" ? "index.html" : req.path.substring(1));
      try {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          const mime = {".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".ico":"image/x-icon",".json":"application/json",".woff":"font/woff",".woff2":"font/woff2",".ttf":"font/ttf",".map":"application/json"};
          res.set("Content-Type", mime[path.extname(filePath).toLowerCase()] || "application/octet-stream");
          res.send(content);
        } else {
          filePath = path.join(distPath, "index.html");
          if (existsSync(filePath)) {
            res.set("Content-Type", "text/html");
            res.send(readFileSync(filePath));
          } else {
            res.status(404).send("Not Found");
          }
        }
      } catch (e) {
        res.status(500).send("Server Error");
      }
    });
  }

  app.use((err: any, _req: any, res: any, _next: any) => {
    const tooLarge = err?.type === "entity.too.large" || err?.status === 413;
    const badJson = err?.type === "entity.parse.failed" || err?.status === 400;
    console.error("API request error:", err);
    const message = tooLarge
      ? "图片数据过大，请压缩图片后再生成深度图"
      : badJson
        ? "请求数据格式错误，请重新尝试"
        : err?.message || "请求处理失败";
    res.status(tooLarge ? 413 : 400).json({ error: message });
  });

  const { port: actualPort } = await listenOnAvailablePort(app, PORT);
  process.env.LEXICONA_ACTIVE_PORT = String(actualPort);
  // @types/node 把 process.emit 收窄成信号重载，这里按事件签名发送自定义事件
  (process.emit as (event: string, ...args: unknown[]) => boolean)("lexicona:port", actualPort);
  console.log(`Server running on http://0.0.0.0:${actualPort}`);
}

startServer();
