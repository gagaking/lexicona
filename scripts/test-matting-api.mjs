import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const [imagePath, model = "matting", size = "2048"] = process.argv.slice(2);
if (!imagePath) throw new Error("usage: node scripts/test-matting-api.mjs <image> [model] [size]");

const base = "http://localhost:3000";
const health = await (await fetch(`${base}/api/health`)).json();
console.log("health.mattingAvailable:", health.mattingAvailable);
console.log("health.mattingModelDir:", health.mattingModelDir);

const dataUrl = `data:image/jpeg;base64,${readFileSync(imagePath).toString("base64")}`;
const started = Date.now();
const response = await fetch(`${base}/api/matting`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: dataUrl, model, size: Number(size) }),
});
const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  throw new Error(`non-JSON response (${response.status}): ${text.slice(0, 300)}`);
}
console.log("status:", response.status, "wallMs:", Date.now() - started);
if (!data.success) {
  console.log("error:", data.error, data.hint || "");
  process.exit(1);
}

const name = path.basename(imagePath).replace(/\.[^.]+$/, "");
const outDir = path.join("models", "birefnet", "_api");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${name}_${model}_${size}抠图.png`);
writeFileSync(outPath, Buffer.from(data.imageUrl.split("base64,")[1], "base64"));
console.log("saved:", outPath);
console.log("serverElapsedMs:", data.elapsedMs, "resolution:", data.resolution);
