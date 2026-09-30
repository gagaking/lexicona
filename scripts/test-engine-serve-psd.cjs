/** 用打包后的引擎验证：批量里同时有 PSD 和 JPG，且只加载一次模型。 */
const { spawn } = require("node:child_process");

const child = spawn("build/depth-engine/depth-engine.exe", ["--task", "matte", "--serve"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const started = Date.now();
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let index = buffer.indexOf("\n");
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line.startsWith("@@LEXICONA@@")) {
      const payload = JSON.parse(line.slice("@@LEXICONA@@".length).trim());
      console.log(`<< (+${Date.now() - started}ms)`, JSON.stringify(payload).slice(0, 220));
      if (payload.id === 1) {
        child.stdin.write(JSON.stringify({ id: 2, action: "release" }) + "\n");
      } else if (payload.id === 2) {
        child.stdin.write(JSON.stringify({ id: 3, action: "exit" }) + "\n");
      } else if (payload.id === 3) {
        child.kill();
        process.exit(0);
      }
    }
    index = buffer.indexOf("\n");
  }
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString().trim();
  if (text && !text.includes("Loading weights")) console.log("[err]", text.slice(0, 140));
});

child.stdin.write(
  JSON.stringify({
    id: 1,
    action: "matte",
    modelDir: "models/birefnet/BiRefNet_HR-matting",
    size: 1024,
    refine: true,
    items: [
      { image: "models/birefnet/_samples/sample.psd", output: "build/serve-psd.png" },
      { image: "models/birefnet/_samples/image-2.jpg", output: "build/serve-jpg.png" },
    ],
  }) + "\n",
);

setTimeout(() => {
  console.log("timeout");
  child.kill();
  process.exit(1);
}, 120000);
