/** 打包版验证：本地路径引用（免 base64）、PSD 合成图、本地预览接口。 */
const base = `http://localhost:${process.argv[2] || 5678}`;
const abs = (relative) => require("node:path").resolve(relative);

async function matte(label, body) {
  const started = Date.now();
  const response = await fetch(`${base}/api/matting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (data.success) {
    console.log(
      `${label}: ok http=${response.status} wall=${Date.now() - started}ms engine=${data.elapsedMs}ms ${data.width}x${data.height} refined=${data.refined}`,
    );
  } else {
    console.log(`${label}: FAIL http=${response.status} ${data.error} ${data.hint || ""}`);
  }
}

(async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  console.log("health ok:", health.ok, "workerAlive:", health.mattingWorkerAlive);

  await matte("path jpg", { filePath: abs("models/birefnet/_samples/image-10.jpg"), size: 2048, refine: true });
  await matte("path psd", { filePath: abs("models/birefnet/_samples/sample.psd"), size: 1024, refine: true });
  await matte("bad path", { filePath: abs("package.json"), size: 1024 });

  const preview = await fetch(`${base}/api/local-file?path=${encodeURIComponent(abs("models/birefnet/_samples/image-10.jpg"))}`);
  console.log("preview jpg:", preview.status, preview.headers.get("content-type"), (await preview.arrayBuffer()).byteLength);
  const blocked = await fetch(`${base}/api/local-file?path=${encodeURIComponent(abs("package.json"))}`);
  console.log("preview non-image (expect 404):", blocked.status);

  await fetch(`${base}/api/matting/release`, { method: "POST" });
  const after = await (await fetch(`${base}/api/health`)).json();
  console.log("workerAlive after release:", after.mattingWorkerAlive);
})();
