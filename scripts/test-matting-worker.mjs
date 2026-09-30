/**
 * 验证常驻推理进程：连打 3 次同一个接口，第 1 次含模型加载，后续应只花推理时间。
 * 用法: node scripts/test-matting-worker.mjs [count]
 */
import { readFileSync } from "node:fs";

const base = "http://localhost:3000";
const imagePath = "models/birefnet/_samples/image-2.jpg";
const count = Number(process.argv[2] || 3);
const dataUrl = `data:image/jpeg;base64,${readFileSync(imagePath).toString("base64")}`;

for (let index = 1; index <= count; index += 1) {
  const started = Date.now();
  const response = await fetch(`${base}/api/matting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, model: "matting", size: 2048 }),
  });
  const data = await response.json();
  if (!data.success) {
    console.log(`#${index} FAILED:`, data.error);
    process.exit(1);
  }
  console.log(
    `#${index} wall=${Date.now() - started}ms engine=${data.elapsedMs}ms foreground=${data.foreground}`,
  );
}

const health = await (await fetch(`${base}/api/health`)).json();
console.log("workerAlive:", health.mattingWorkerAlive);

// 取消测试：发一个请求后立刻取消，应当立即中断并返回“已取消”
const inflight = fetch(`${base}/api/matting`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: dataUrl, model: "matting", size: 2048 }),
}).then((response) => response.json().catch(() => ({ success: false })));
await new Promise((resolve) => setTimeout(resolve, 400));
const cancel = await (
  await fetch(`${base}/api/matting/cancel`, { method: "POST" })
).json();
const inflightResult = await inflight;
console.log("cancel:", cancel, "inflight:", inflightResult.error || inflightResult.success);

const release = await (await fetch(`${base}/api/matting/release`, { method: "POST" })).json();
console.log("released:", release);
const healthAfter = await (await fetch(`${base}/api/health`)).json();
console.log("workerAlive after release:", healthAfter.mattingWorkerAlive);
