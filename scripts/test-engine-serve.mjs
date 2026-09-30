/** 验证打包后的引擎支持常驻模式（--serve）：一次加载模型，多次推理。 */
import { spawn } from "node:child_process";

const exe = "build/depth-engine/depth-engine.exe";
const child = spawn(exe, ["--task", "matte", "--serve"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: process.cwd(),
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
      if (payload.ready) {
        console.log(`ready (${Date.now() - started}ms) device=${payload.device}`);
      } else if (payload.id) {
        console.log(`reply id=${payload.id} (+${Date.now() - started}ms)`, JSON.stringify(payload));
        if (payload.id === 2) {
          child.stdin.write(JSON.stringify({ id: 3, action: "exit" }) + "\n");
        }
        if (payload.id === 3) {
          child.kill();
          process.exit(0);
        }
      }
    }
    index = buffer.indexOf("\n");
  }
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString().trim();
  if (text) console.log("[stderr]", text.slice(0, 200));
});

const request = (id) =>
  JSON.stringify({
    id,
    action: "matte",
    modelDir: "models/birefnet/BiRefNet_HR-matting",
    size: 2048,
    items: [{ image: "models/birefnet/_samples/image-2.jpg", output: `build/serve-test-${id}.png` }],
  });

child.stdin.write(request(1) + "\n");
setTimeout(() => child.stdin.write(request(2) + "\n"), 20000);
setTimeout(() => {
  console.log("timeout");
  child.kill();
  process.exit(1);
}, 120000);
