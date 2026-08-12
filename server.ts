import express from "express";
import path from "path";
import { existsSync } from "fs";
import os from "os";

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

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000");

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
      issues,
    });
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
      const tempInputPath = path.join(os.tmpdir(), `depth_input_${tempId}.jpg`);
      const tempOutputPath = path.join(os.tmpdir(), `depth_output_${tempId}.png`);
      
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
      
      // Clean up temp files
      try {
        if (existsSync(tempInputPath)) unlinkSync(tempInputPath);
        if (existsSync(tempOutputPath)) unlinkSync(tempOutputPath);
      } catch (err) {
        console.error("Failed to delete temp files", err);
      }
      
      res.json({ success: true, depthMapUrl: outputBase64 });
    } catch (error: any) {
      console.error("Depth map generation failed:", error);
      res.status(500).json({ error: error.message || "Internal error during depth map generation" });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
