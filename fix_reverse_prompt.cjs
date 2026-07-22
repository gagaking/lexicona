const fs = require("fs");
const path = __dirname + "/src/views/ReversePrompt.tsx";
let content = fs.readFileSync(path, "utf-8");

// 1. Fix removePair to add cleanup
const oldRemove = `const removePair = (id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id));
  };`;
const newRemove = `const removePair = (id: string) => {
    abortControllers.current[id]?.abort();
    delete abortControllers.current[id];
    setIsProcessing((prev) => { const n = {...prev}; delete n[id]; return n; });
    setIsProcessingDepth((prev) => { const n = {...prev}; delete n[id]; return n; });
    setPairs((prev) => prev.filter((p) => p.id !== id));
  };`;
if (content.includes(oldRemove)) {
  content = content.replace(oldRemove, newRemove);
  console.log("Fixed removePair with cleanup");
} else console.log("removePair not found");

// 2. Fix image rendering to fall back to imageDataUrl
const oldImg = `src={p.activeView === "depth" && p.depthMapUrl ? p.depthMapUrl : p.imageUrl}`;
const newImg = `src={p.activeView === "depth" && p.depthMapUrl ? p.depthMapUrl : (p.imageDataUrl || p.imageUrl)}`;
if (content.includes(oldImg)) {
  content = content.replace(oldImg, newImg);
  console.log("Fixed image src to use imageDataUrl fallback");
} else console.log("image src not found");

// 3. Add data URL conversion after pairs are added in handleFiles
const oldFilesProcess = `          styleName: "待分析...",
        })),
      );
    }

    if (newItems.length > 0) {
      setPairs((prev) => [...prev, ...newItems]);`;
const newFilesProcess = `          styleName: "待分析...",
        })),
      );

      // Convert blob URLs to data URLs for persistence across sessions
      newItems.forEach((item) => {
        const file = item.image;
        if (file && !item.imageDataUrl) {
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result) {
              setPairs((prev) =>
                prev.map((p) =>
                  p.id === item.id ? { ...p, imageDataUrl: reader.result } : p
                )
              );
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (newItems.length > 0) {
      setPairs((prev) => [...prev, ...newItems]);`;
if (content.includes(oldFilesProcess)) {
  content = content.replace(oldFilesProcess, newFilesProcess);
  console.log("Added data URL conversion for new pairs");
} else console.log("handleFiles section not found");

// 4. Fix processImage to use imageDataUrl when image File is unavailable (from IndexedDB)
const oldProcessCheck = `      if (!item.image) {
          throw new Error("\\u56fe\\u7247\\u4e3b\\u4f53\\u672a\\u51c6\\u5907\\u597d");
        }
        mimeType = item.image.type || "image/jpeg";
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(item.image!);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        base64Part = dataUrl.split(",")[1];`;
const newProcessCheck = `      if (!item.image) {
          if (item.imageDataUrl) {
            base64Part = item.imageDataUrl.split(",")[1];
            mimeType = "image/png";
          } else {
            throw new Error("\\u56fe\\u7247\\u4e3b\\u4f53\\u672a\\u51c6\\u5907\\u597d");
          }
        } else {
          mimeType = item.image.type || "image/jpeg";
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(item.image!);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
          });
          base64Part = dataUrl.split(",")[1];
        }`;
if (content.includes(oldProcessCheck)) {
  content = content.replace(oldProcessCheck, newProcessCheck);
  console.log("Fixed processImage to handle IndexedDB data");
} else console.log("processImage check not found");

fs.writeFileSync(path, content, "utf-8");
console.log("ALL FIXES APPLIED");
