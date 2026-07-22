import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Image as ImageIcon,
  Upload,
  Trash2,
  FileSpreadsheet,
  Sparkles,
  Play,
  UploadCloud,
  Copy, ChevronDown,
  Check,
  RefreshCw,
  Download,
  X,
} from "lucide-react";
import { useAppContext } from "../store";
import { mirrorPrompt } from "../lib/utils";
import { getModelVendorString, ImagePromptPair } from "../types";
import { saveAs } from "file-saver";
import { v4 as uuidv4 } from "uuid";
import {
  generatePromptFromImage,
  unloadOllamaModel,
  isIgnorableValue,
} from "../services/reversePromptService";

// Fallback to simple unquoted csv if needed, or proper quoting
const escapeCsv = (val: any) => {
  if (val === null || val === undefined) return '""';
  let str: string;
  if (typeof val === "object") {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }
  return `"${str.replace(/"/g, '""')}"`;
};

const categoryLabels: Record<string, string> = {
  styleAndEffect: "风格与效果",
  lightingAndCamera: "光影与机位",
  subjectAndPose: "主体与姿态",
  primaryColorsAndAtmosphere: "主色与氛围",
  backgroundAndSpace: "背景与空间",
  propsAndInteraction: "道具与互动",
  actionAndDetails: "动作与细节",
  outfitAndStyle: "穿搭与风格",
  specialEffects: "特殊效果",
};

const formatStruct = (obj: any) => {
  if (!obj) return "";
  if (typeof obj === "string") {
    const cleanStr = obj.replace(/([,，]\s*)+/g, "，").replace(/^[，\s。；;、]+|[，\s。；;、]+$/g, "");
    return isIgnorableValue(cleanStr) ? "" : cleanStr;
  }
  return Object.entries(obj)
    .map(([k, v]) => {
      let val = v;
      if (Array.isArray(v)) {
        val = v
          .filter(
            (x) =>
              x &&
              String(x).trim() &&
              !isIgnorableValue(x),
          )
          .join("，");
      }
      return val && !isIgnorableValue(val)
        ? String(val)
            .replace(/([,，]\s*)+/g, "，")
            .replace(/^[，\s。；;、]+|[，\s。；;、]+$/g, "")
        : "";
    })
    .filter((x) => x && !isIgnorableValue(x))
    .join("，");
};

export function ReversePrompt({ onClose }: { onClose: () => void }) {
  const {
    aiConfig,
    updateAiConfig,
    reversePromptPairs: pairs,
    setReversePromptPairs: setPairs,
  } = useAppContext();
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [isProcessingDepth, setIsProcessingDepth] = useState<Record<string, boolean>>({});
  const [isClearing, setIsClearing] = useState(false);

// 深度图引用版前缀
const DEPTH_REF_PREFIX = "以深度图作为主要空间结构参考，保持原始空间关系、物体位置、比例关系、透视关系、镜头视角和整体构图，不要改变主体的几何结构和空间布局，仅调整主体外观、材质、风格、光影、色彩和环境细节。";

  const [promptCopyVersion, setPromptCopyVersion] = useState<Record<string, "normal" | "depth">>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);


  const toggleActiveView = (id: string, view: 'original' | 'depth') => {
    setPairs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, activeView: view } : p))
    );
  };

  const getBase64FromUrl = async (url: string): Promise<string> => {
    if (url.startsWith("data:image")) return url;
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const generateCanvasDepthMap = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Cannot get 2D context"));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const width = canvas.width;
        const height = canvas.height;
        const cx = width / 2;
        const cy = height * 0.65;
        const maxDist = Math.sqrt(cx * cx + cy * cy);

        for (let y = 0; y < height; y++) {
          const verticalGrad = 110 + (y / height) * 145;

          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            const focusGrad = 255 - (dist / maxDist) * 120;

            let combined = gray * 0.35 + verticalGrad * 0.4 + focusGrad * 0.25;
            combined = ((combined - 128) * 1.35) + 128;
            combined = Math.max(0, Math.min(255, combined));

            data[idx] = combined;
            data[idx + 1] = combined;
            data[idx + 2] = combined;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  };

  const getDepthMap = async (pair: ImagePromptPair) => {
    setIsProcessingDepth((prev) => ({ ...prev, [pair.id]: true }));
    try {
      const imgBase64 = await getBase64FromUrl(pair.imageUrl);
      const response = await fetch("/api/depth-map", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imgBase64,
          modelPath: aiConfig.depthModelPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.depthMapUrl) {
        setPairs((prev) =>
          prev.map((p) =>
            p.id === pair.id
              ? { ...p, depthMapUrl: data.depthMapUrl, activeView: "depth" }
              : p
          )
        );
      } else {
        throw new Error(data.error || "未能生成深度图");
      }
    } catch (err: any) {
      // 后端不可用或 Depth Anything V2 模型未安装，直接报错提示
      const isServerError = err?.message?.includes("fetch") || err?.message?.includes("NetworkError") || err?.message?.includes("Failed to fetch") || err?.message?.includes("HTTP error");
      if (isServerError) {
        alert("深度图功能不可用：服务端后端未运行。\n\n当前运行的是纯前端 Vite 开发服务器，缺少 Express API 后端。\n如需使用深度图功能，请运行 npm run dev（tsx server.ts）启动完整后端。\n\n同时需要安装 Depth Anything V2 模型（.pth 文件）并在设置中配置模型路径。");
      } else {
        alert("获取深度图失败: " + (err?.message || err));
      }
    } finally {
      setIsProcessingDepth((prev) => ({ ...prev, [pair.id]: false }));
    }
  };
  const [isDownloading, setIsDownloading] = useState(false);
 const [subject, setSubject] = useState("");
  const [subjectEnabled, setSubjectEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const abortControllers = useRef<Record<string, AbortController>>({});
  const isProcessAllCanceled = useRef(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOption, setExportOption] = useState<"local" | "imgbb">("local");
  const [imgbbApiKey, setImgbbApiKey] = useState(
    "acebd61ac426801c7e903c53d21bb5aa",
  );

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    const newItems: ImagePromptPair[] = [];

    // Parse CSV
    const csvFiles = filesArray.filter(
      (f) => f.name.endsWith(".csv") || f.type === "text/csv",
    );
    for (const file of csvFiles) {
      try {
        const text = await file.text();
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        const startIdx = lines[0] && !lines[0].startsWith("http") ? 1 : 0;
        for (let i = startIdx; i < lines.length; i++) {
          let url = lines[i].split(",")[0];
          url = url.replace(/^"|"$/g, "").trim();
          if (url.startsWith("http")) {
            // handle google drive specific replacements
            if (
              url.includes("drive.google.com") ||
              url.includes("googleusercontent.com")
            ) {
              const match =
                url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                url.match(/id=([a-zA-Z0-9_-]+)/);
              if (match && match[1]) {
                url = `https://lh3.googleusercontent.com/d/${match[1]}`;
              }
            }
            newItems.push({
              id: uuidv4(),
              imageUrl: url,
              imageName: `Image ${i + 1}`,
              prompt: "",
              styleName: "待分析...",
              isUrlImport: true,
            });
          }
        }
      } catch (err) {
        console.error("CSV Parse Error", err);
      }
    }

   // Parse Images
    const imageFiles = filesArray.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      const imageItems = await Promise.all(imageFiles.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        return {
          id: uuidv4(),
          image: file,
          imageName: file.name,
          imageUrl: URL.createObjectURL(file), // for display
          imageDataUrl: dataUrl,
          prompt: "",
          styleName: "待分析...",
        };
      }));
      newItems.push(...imageItems);
    }

    if (newItems.length > 0) {
      setPairs((prev) => [...newItems, ...prev]);
    }
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files) {
        handleFiles(e.clipboardData.files);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleFiles]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const processImage = async (item: ImagePromptPair) => {
    setIsProcessing((prev) => ({ ...prev, [item.id]: true }));

    const controller = new AbortController();
    abortControllers.current[item.id] = controller;

    try {
      let base64Part = "";
      let mimeType = "image/jpeg";
      const provider = aiConfig.reversePromptProvider || aiConfig.provider;

      const supportsNativeUrl = provider === "xiaomi";

      if (item.isUrlImport && supportsNativeUrl) {
        // Model supports URL natively, skip local fetching
      } else if (item.isUrlImport) {
        // Fetch just in time for Google/Ollama to avoid storing 700+ base64 blobs in memory
        const resp = await fetch(item.imageUrl, { signal: controller.signal });
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        const blob = await resp.blob();
        mimeType = blob.type || "image/jpeg";
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        base64Part = dataUrl.split(",")[1];
      } else {
        if (!item.image) {
          if (item.imageDataUrl) {
            base64Part = item.imageDataUrl.split(",")[1];
            mimeType = "image/png";
          } else {
            throw new Error("图片主体未准备好");
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
        }
      }

      const {
        prompt,
        structuredPrompt,
        negativePrompt,
        styleName,
        imageTags,
} = await generatePromptFromImage(
        base64Part,
        mimeType,
        item.isUrlImport ? item.imageUrl : undefined,
        aiConfig,
       controller.signal,
        subjectEnabled && subject.trim() ? subject : undefined,
      );

      let finalPrompt = prompt;
      let isEdited = false;
      isEdited = subjectEnabled && subject.trim() ? true : false;
      finalPrompt = prompt;

      setPairs((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                prompt: finalPrompt,
                structuredPrompt,
                negativePrompt,
                styleName,
                imageTags,
isEdited,
                editedSubject: isEdited ? subject : undefined,
                modelVendor: getModelVendorString(aiConfig, true),
              }
            : p,
        ),
      );
    } catch (e: any) {
      if (e.name === "AbortError") {
        setPairs((prev) =>
          prev.map((p) =>
            p.id === item.id ? { ...p, prompt: `已终止分析` } : p,
          ),
        );
      } else {
        console.error(e);
        setPairs((prev) =>
          prev.map((p) =>
            p.id === item.id ? { ...p, prompt: `处理错误: ${e.message}` } : p,
          ),
        );
        setApiError(
          `API 运行失败！\n\n提示信息：${e.message}\n\n请检查【设置】中 API 配置是否正确，确认 API 提供商及模型已正确配置。`,
        );
      }
    } finally {
      delete abortControllers.current[item.id];
      setIsProcessing((prev) => ({ ...prev, [item.id]: false }));
      if (
        aiConfig.reversePromptProvider === "ollama" ||
        aiConfig.provider === "ollama"
      ) {
        await unloadOllamaModel(aiConfig);
      }
    }
  };

  const cancelImageProcess = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (abortControllers.current[id]) {
      abortControllers.current[id].abort();
    }
  };

  const handleProcessAllCancel = async () => {
    isProcessAllCanceled.current = true;
    setIsProcessingAll(false);
    Object.values(abortControllers.current).forEach((c: any) => c.abort());
    if (
      aiConfig.reversePromptProvider === "ollama" ||
      aiConfig.provider === "ollama"
    ) {
      await unloadOllamaModel(aiConfig);
    }
  };

  const runBatchProcessing = async (toProcess: ImagePromptPair[]) => {
    if (toProcess.length === 0) return;
    isProcessAllCanceled.current = false;
    setIsProcessingAll(true);

    const concurrency = aiConfig.reversePromptConcurrency || 3;
    let index = 0;

    // 防止触发基于 100 RPM 的调用频率限制，这里设置 80 RPM（即 750ms 间隔）的安全上限
    const safeRpmLimit = 80;
    const intervalMs = 60000 / safeRpmLimit;
    let nextAvailableTime = Date.now();

    const execute = async () => {
      while (index < toProcess.length) {
        if (isProcessAllCanceled.current) break;
        const p = toProcess[index++];

        // 令牌桶/预约机制确保全局调用间隔
        const now = Date.now();
        const scheduledTime = Math.max(now, nextAvailableTime);
        nextAvailableTime = scheduledTime + intervalMs;

        const waitTime = scheduledTime - now;
        if (waitTime > 0 && !isProcessAllCanceled.current) {
          await new Promise((r) => setTimeout(r, waitTime));
        }

        if (isProcessAllCanceled.current) break;
        await processImage(p);

        // 增加不规律的错峰延迟 (500ms - 1500ms)，进一步打散并发时的结束时间聚集
        if (!isProcessAllCanceled.current && index < toProcess.length) {
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, toProcess.length) },
      () => execute(),
    );
    await Promise.all(workers);

    setIsProcessingAll(false);
  };

  const handleProcessAll = async () => {
    const toProcess = pairs.filter(
      (p) => !isProcessing[p.id] && (!p.prompt || p.prompt.startsWith("图片")),
    );
    if (toProcess.length === 0) return alert("没有可处理的全新待办任务。");
    await runBatchProcessing(toProcess);
  };

  const handleRetryErrors = async () => {
    const toProcess = pairs.filter(
      (p) =>
        !isProcessing[p.id] &&
        (!p.prompt ||
          p.prompt.startsWith("图片") ||
          p.prompt.startsWith("错误") ||
          p.prompt.startsWith("已终止") ||
          p.prompt.startsWith("处理错误")),
    );
    if (toProcess.length === 0)
      return alert("当前没有可重试的未生成或失败的任务。");
    await runBatchProcessing(toProcess);
  };

  const removePair = (id: string) => {
    abortControllers.current[id]?.abort();
    delete abortControllers.current[id];
    setIsProcessing((prev) => { const x = {...prev}; delete x[id]; return x; });
    setIsProcessingDepth((prev) => { const x = {...prev}; delete x[id]; return x; });
    setPairs((prev) => prev.filter((p) => p.id !== id));
  };

  const getCombinedPrompt = (p: ImagePromptPair) => {
    if (p.isEdited) return p.prompt; // 如果已经进行了换装等二次编辑，则直接返回最新的正向提示词
    if (!p.structuredPrompt) return p.prompt; // fallback
    const combined = Object.entries(categoryLabels)
      .map(([key, label]) => {
        const text = formatStruct(p.structuredPrompt[key]);
        if (!text) return "";
        return `[${label}: ${text}]`;
      })
     .filter((x) => x)
     .join("; ");
    let result = combined || p.prompt;
    if (p.negativePrompt) {
      result += " --neg " + p.negativePrompt;
    }
    return result;
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
   setTimeout(() => setCopiedId(null), 2000);
  };
  const copyImageToClipboard = async (dataUrl: string, id: string) => {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      navigator.clipboard.writeText(dataUrl);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleExport = async () => {
    if (pairs.length === 0) return;
    if (exportOption === "imgbb" && !imgbbApiKey) {
      alert("请输入 ImgBB API Key");
      return;
    }

    setIsDownloading(true);
    setShowExportModal(false);

    try {
      const headers = [
        "id",
        "title",
        "风格与效果",
        "光影与机位",
        "主体与姿态",
        "主色与氛围",
        "背景与空间",
        "道具与互动",
        "动作与细节",
        "穿搭与风格",
        "特殊效果",
        "提示词",
        "图片URL",
        "标签",
        ];

      const lines = [];
      lines.push(headers.map(escapeCsv).join(","));

      for (const p of pairs) {
        const P = p.structuredPrompt || {};
        let finalImageUrl = p.imgbbUrl || p.imageUrl;

        // If ImgBB upload is selected, upload local images to ImgBB
        if (
          exportOption === "imgbb" &&
          p.image &&
          !p.isUrlImport &&
          !p.imgbbUrl
        ) {
          try {
            const formData = new FormData();
            formData.append("key", imgbbApiKey);
            formData.append("image", p.image);

            const res = await fetch("https://api.imgbb.com/1/upload", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              const data = await res.json();
              finalImageUrl = data.data.url;
              setPairs((prev) =>
                prev.map((item) =>
                  item.id === p.id
                    ? { ...item, imgbbUrl: finalImageUrl }
                    : item,
                ),
              );
            } else {
              console.error("Failed to upload image", p.imageName);
              throw new Error(`Upload failed (${res.status})`);
            }
          } catch (err: any) {
            console.error("ImgBB upload fetch error", err);
            throw new Error(
              `上传 ${p.imageName} 时网络出错。已保存上传成功的进度，请重新点击导出以继续刚才的进度。`,
            );
          }
        }

        const fields = [
          formatStruct(P.styleAndEffect),
          formatStruct(P.lightingAndCamera),
          formatStruct(P.subjectAndPose),
          formatStruct(P.primaryColorsAndAtmosphere),
          formatStruct(P.backgroundAndSpace),
          formatStruct(P.propsAndInteraction),
          formatStruct(P.actionAndDetails),
          formatStruct(P.outfitAndStyle),
          formatStruct(P.specialEffects),
        ];
        const combinedPromptStr = fields.filter(Boolean).join(", ");

        const row = [
          p.id,
          p.styleName || p.imageName,
          ...fields,
          combinedPromptStr,
          finalImageUrl,
          p.imageTags || "",
          ];
        lines.push(row.map(escapeCsv).join(","));
      }

      const csvContent = lines.join("\n");
      const blob = new Blob([`\uFEFF${csvContent}`], {
        type: "text/csv;charset=utf-8;",
      });
      saveAs(blob, "ai-prompts.csv");
    } catch (e: any) {
      console.error("CSV export failed", e);
      alert("导出失败: " + e.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "url,提示词\n";
    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    });
    saveAs(blob, "template.csv");
  };

  return (
    <div
      className="flex flex-col h-full bg-[#FCFBF9] text-[#333130] overflow-hidden font-sans relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-[#F0EEEB]/90 border-4 border-dashed border-[#1E1E1E] rounded-2xl flex items-center justify-center z-50 pointer-events-none m-4">
          <div className="text-center text-[#1E1E1E]">
            <UploadCloud className="w-16 h-16 mx-auto mb-4 text-[#1E1E1E]" />
            <p className="text-2xl font-bold">将图片或CSV拖放到此处</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#F0F0F0] z-10 bg-white sticky top-0 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors py-1.5 px-3 -ml-3 bg-transparent rounded-none hover:bg-gray-50 border border-transparent text-sm font-sans"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回
          </button>
          <h1 className="text-xl font-medium text-[#1E1E1E] flex items-center tracking-tight">
            提示词反推
          </h1>
        </div>
        <div className="flex items-center gap-3">

          <div className="flex items-center gap-2 mr-2 border-r border-[#E0E0E0] pr-4">
            <select
              value={aiConfig.reversePromptProvider || aiConfig.provider}
              onChange={(e) =>
                updateAiConfig({
                  ...aiConfig,
                  reversePromptProvider: e.target.value as any,
                })
              }
              className="w-20 text-sm border border-[#E0E0E0] bg-white rounded-none px-1 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
            >
              <option value="google">Google</option>
              <option value="xiaomi">Xiaomi</option>
              <option value="ollama">Ollama</option>
            </select>

            {(aiConfig.reversePromptProvider || aiConfig.provider) ===
              "google" && (
              <select
                value={aiConfig.googleModel || "gemini-2.5-flash"}
                onChange={(e) =>
                  updateAiConfig({ ...aiConfig, googleModel: e.target.value })
                }
                className="w-20 text-sm border border-[#E0E0E0] bg-white rounded-none px-1 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-3.5-flash">gemini-3.5-flash</option>
              </select>
            )}
            {(aiConfig.reversePromptProvider || aiConfig.provider) ===
              "xiaomi" && (
              <input
                type="text"
                value={aiConfig.xiaomiModel || "mimo-v2.5"}
                onChange={(e) =>
                  updateAiConfig({ ...aiConfig, xiaomiModel: e.target.value })
                }
                placeholder="Xiaomi 模型"
                className="w-20 text-sm border border-[#E0E0E0] bg-white rounded-none px-1 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
              />
            )}
            {(aiConfig.reversePromptProvider || aiConfig.provider) ===
              "ollama" && (
              <input
                type="text"
                value={
                  aiConfig.reversePromptOllamaModel ||
                  aiConfig.ollamaModel ||
                  "llava"
                }
                onChange={(e) =>
                  updateAiConfig({
                    ...aiConfig,
                    reversePromptOllamaModel: e.target.value,
                  })
                }
                placeholder="Ollama 视觉模型"
                className="w-20 text-sm border border-[#E0E0E0] bg-white rounded-none px-1 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
              />
            )}
            <label className="text-xs text-[#7A7A7A] font-medium ml-2 hidden sm:block">
              并发
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={aiConfig.reversePromptConcurrency || 3}
              onChange={(e) =>
                updateAiConfig({
                  ...aiConfig,
                  reversePromptConcurrency: parseInt(e.target.value, 10) || 1,
                })
              }
              className="w-8 text-sm border border-[#E0E0E0] bg-white rounded-none px-1 py-1.5 focus:outline-none focus:border-[#1E1E1E] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          <input
            type="file"
            multiple
            accept="image/*,.csv,text/csv"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-[#1E1E1E] rounded-none transition-colors border border-[#E0E0E0] text-sm font-medium"
          >
            <Upload className="w-4 h-4" /> 上传图片/CSV
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-[#1E1E1E] rounded-none transition-colors border border-[#E0E0E0] text-sm font-medium"
          >
            <Download className="w-4 h-4" /> 下载批量模板
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={pairs.length === 0 || isDownloading}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-[#1E1E1E] rounded-none transition-colors border border-[#E0E0E0] text-sm font-medium disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> 导出 CSV
          </button>
          <button
            onClick={handleRetryErrors}
            disabled={isProcessingAll || pairs.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-[#F0EEEB] hover:bg-[#E0E0E0] text-[#1E1E1E] rounded-none transition-colors border border-[#E0E0E0] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" /> 重推失败/未生成
          </button>
          <button
            onClick={
              isProcessingAll ? handleProcessAllCancel : handleProcessAll
            }
            disabled={pairs.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-none transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${isProcessingAll ? "bg-red-500 hover:bg-red-600 text-white" : "bg-[#1E1E1E] hover:bg-black text-white"}`}
          >
            {isProcessingAll ? (
              <X className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isProcessingAll ? "终止所有任务" : "开始反推"}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 z-10 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Subject replacement bar */}
         <div className="bg-white border border-[#F0F0F0] rounded-none p-4 flex items-center gap-4 shadow-sm">
            <button
              onClick={() => setSubjectEnabled(!subjectEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                subjectEnabled ? 'bg-[#1E1E1E]' : 'bg-[#D0D0D0]'
              }`}
              title={subjectEnabled ? "点击关闭语义替换" : "点击开启语义替换"}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                subjectEnabled ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
            <div className="flex-1">
              <label className="text-xs text-[#7A7A7A] font-medium mb-1.5 block uppercase tracking-wider">
                核心主体 / 语义替换
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="在此输入想要替换的主题或添加的描述，例如：'上海主题同款海报'... 这将基于反推架构重写提示词"
                className="w-full bg-white border border-[#E0E0E0] px-4 py-2.5 text-sm text-[#1E1E1E] placeholder-[#A3A3A3] focus:outline-none focus:border-[#1E1E1E] focus:ring-1 focus:ring-[#1E1E1E] transition-all rounded-none"
              />
           </div>
            <button
              onClick={() => {
    Object.values(abortControllers.current).forEach((c: any) => c.abort());
    abortControllers.current = {};
    setPairs([]);
    setIsProcessing({});
    setIsProcessingDepth({});
  }}
              disabled={pairs.length === 0}
              className="mt-6 flex flex-col items-center justify-center p-2.5 rounded-none border border-[#E0E0E0] text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              title="清空所有任务"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          
          {/* Clear All Button at bottom */}
          

          {/* Empty State */}
          {pairs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-[#E0E0E0] rounded-none bg-white text-center">
              <ImageIcon className="w-16 h-16 text-[#A3A3A3] mb-4" />
              <h3 className="text-xl font-medium text-[#1E1E1E] mb-2 font-serif">
                图片反推工作区为空
              </h3>
              <p className="text-[#7A7A7A]">
                点击上方按钮上传图片、或者拖拽包含图片URL的CSV文件到窗口中
              </p>
              <p className="text-[#A3A3A3] text-sm mt-1">支持 ⌘+V 剪贴板粘贴</p>
            </div>
          )}

          {/* List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
            {pairs.map((p) => (
              <div
                key={p.id}
                className="bg-white border border-[#F0F0F0] rounded-none overflow-hidden flex flex-col sm:flex-row group shadow-sm h-auto sm:h-[280px]"
              >
                <div className="w-full sm:w-[220px] shrink-0 bg-[#f9fafb] relative h-[220px] sm:h-full overflow-hidden">
                  <img
                    src={p.activeView === "depth" && p.depthMapUrl ? p.depthMapUrl : (p.imageDataUrl || p.imageUrl)}
                    alt={p.imageName}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-all duration-300"
                  />
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    {p.isUrlImport && (
                      <span className="bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-sm border border-white/10">
                        URL
                      </span>
                    )}
                  </div>

                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2.5 items-center justify-center z-10">
                    <button
                      onClick={() => processImage(p)}
                      disabled={isProcessing[p.id] || isProcessingDepth[p.id]}
                      className="bg-white hover:bg-gray-100 text-black px-4 py-2 rounded-none text-xs font-semibold disabled:opacity-50 shadow-sm transition-colors cursor-pointer w-[120px] text-center font-sans"
                    >
                      {p.prompt ? "重新分析" : "分析此图"}
                    </button>
                    <button
                     onClick={() => getDepthMap(p)}
                      disabled={isProcessing[p.id] || isProcessingDepth[p.id] || p.isProcessingDepth}
                      className="bg-[#1E1E1E] hover:bg-black text-white px-4 py-2 rounded-none text-xs font-semibold disabled:opacity-50 shadow-sm transition-colors cursor-pointer w-[120px] text-center font-sans"
                    >
                      {p.depthMapUrl ? "更新深度图" : "获取深度图"}
                    </button>
                    <button
                      onClick={async ()=>{try{await processImage(p)}catch(e){console.error(e)}try{await getDepthMap(p)}catch(e){console.error(e)}}}
                      disabled={isProcessing[p.id] || isProcessingDepth[p.id] || p.isProcessingDepth}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-none text-xs font-semibold disabled:opacity-50 shadow-sm transition-colors cursor-pointer w-[120px] text-center font-sans"
                    >
                      同析深图
                    </button>
                  </div>

                  {/* View Toggler Pill */}
                  {p.depthMapUrl && (
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/85 backdrop-blur-sm px-1 py-[3px] rounded-full flex gap-1 z-20 shadow-lg border border-white/10 select-none">
                      <button
                        onClick={() => toggleActiveView(p.id, "original")}
                        className={`px-2.5 py-[3px] rounded-full text-[10px] font-sans font-medium transition-colors cursor-pointer ${
                          (!p.activeView || p.activeView === "original")
                            ? "bg-white text-black font-semibold"
                            : "text-white/80 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        原图
                      </button>
                      <button
                        onClick={() => toggleActiveView(p.id, "depth")}
                        className={`px-2.5 py-[3px] rounded-full text-[10px] font-sans font-medium transition-colors cursor-pointer ${
                          p.activeView === "depth"
                            ? "bg-white text-black font-semibold"
                            : "text-white/80 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        深度图
                      </button>
                    </div>
                  )}

                  {/* Standard processing overlay */}
                  {isProcessing[p.id] && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-20">
                      <div className="w-6 h-6 border-2 border-[#1E1E1E] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-[#1E1E1E] mt-2 font-medium">
                        AI 处理中...
                      </span>
                      <button
                        onClick={(e) => cancelImageProcess(p.id, e)}
                        className="mt-3 px-3 py-1 bg-red-50 text-red-600 border border-red-200 text-xs hover:bg-red-100 transition-colors"
                      >
                        终止
                      </button>
                    </div>
                  )}

                  {/* Depth processing overlay */}
                  {(isProcessingDepth[p.id] || p.isProcessingDepth) && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center z-20 text-white">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-white/95 mt-2.5 font-medium tracking-wide">
                        深度计算中...
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-4 flex flex-col min-w-0">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <h3
                        className="font-semibold text-[#1E1E1E] truncate text-sm font-serif"
                        title={p.imageName}
                      >
                        {p.imageName}
                      </h3>
                      {p.modelVendor && (
                        <span className="px-2 py-0.5 text-[10px] bg-[#F5F5F5] text-[#7A7A7A] border border-[#E0E0E0] rounded-sm font-medium font-sans whitespace-nowrap">
                          {p.modelVendor}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removePair(p.id)}
                      className="text-[#A3A3A3] hover:text-red-500 transition-colors p-1 -mr-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-[120px] bg-[#f9fafb] rounded-none p-3 border border-[#E0E0E0] overflow-y-auto custom-scrollbar relative">
                    {!p.prompt ? (
                      <div className="h-full flex items-center justify-center text-[#7A7A7A] text-sm">
                        等待反推...
                      </div>
                    ) : p.prompt.startsWith("错误") ||
                      p.prompt.startsWith("图片") ? (
                      <div className="text-red-500 text-xs whitespace-pre-wrap">
                        {p.prompt}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between pb-1.5 mb-2 select-none border-b border-gray-100/60 w-full flex-wrap sm:flex-nowrap gap-2">
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-bold text-[#1E1E1E]">
                                正向提示词
                              </span>
                              {p.isEdited && (
                                <span className="px-1.5 py-0.5 text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-sm font-medium">
                                  已编辑
                                </span>
                              )}
                            </div>
                            <div className="flex flex-row items-center gap-1.5 select-none shrink-0">
                              
                              {p.depthMapUrl && (
                              <button
                                onClick={() => copyImageToClipboard(p.depthMapUrl, p.id + "-depth")}
                                className="flex items-center gap-1 text-[10px] text-[#1E1E1E] bg-[#FAFAFA] hover:bg-[#1E1E1E] hover:text-white px-2 py-1 border border-[#E0E0E0] rounded-none font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150"
                                title="复制深度图"
                              >
                                {copiedId === p.id + "-depth" ? (
                                  <>
                                    <Check className="w-3 h-3 text-green-600" /> 已复制
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" /> 复制深度图
                                  </>
                                )}
                              </button>
                            )}
                            <div className="relative inline-flex items-center">
                            <button
                              onClick={() => {
                                const txt = (promptCopyVersion[p.id] === "depth" ? DEPTH_REF_PREFIX + "\n" : "") + (getCombinedPrompt(p) || "");
                                copyText(txt, p.id + "-prompt");
                              }}
                              className="flex items-center gap-1 text-[10px] text-[#1E1E1E] bg-[#FAFAFA] hover:bg-[#1E1E1E] hover:text-white px-2 py-1 border border-[#E0E0E0] rounded-none font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150"
                              title="复制提示词"
                            >
                              {copiedId === p.id + "-prompt" ? (
                                <><Check className="w-3 h-3 text-green-600" /> 已复制</>
                              ) : (
                                <><Copy className="w-3 h-3" /> {promptCopyVersion[p.id] === "depth" ? "深度图引用版" : "复制提示词"}</>
                              )}
                            </button>
                            <button
                              onClick={() => setOpenDropdownId(openDropdownId === p.id ? null : p.id)}
                              className="flex items-center justify-center w-4 h-4 ml-0.5 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            {openDropdownId === p.id && (
                              <div className="absolute top-full left-0 mt-1 bg-white border border-[#E0E0E0] shadow-lg z-50 min-w-[100px] rounded-none">
                                <button
                                  onClick={() => { setPromptCopyVersion(prev => ({ ...prev, [p.id]: "normal" })); setOpenDropdownId(null); }}
                                  className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 text-[#1E1E1E] whitespace-nowrap"
                                >
                                  复制提示词
                                </button>
                                <button
                                  onClick={() => { setPromptCopyVersion(prev => ({ ...prev, [p.id]: "depth" })); setOpenDropdownId(null); }}
                                  className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 text-[#1E1E1E] whitespace-nowrap"
                                >
                                  深度图引用版
                                </button>
                              </div>
                            )}
                          </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-3 mt-3 select-text">
                            {Object.entries(categoryLabels).map(
                              ([key, label]) => {
                                const P = p.structuredPrompt || {};
                                const text = formatStruct(P[key]);
                                if (!text) return null;
                                return (
                                  <div
                                    key={key}
                                    className="flex flex-col min-w-0"
                                  >
                                    <span className="text-[10px] font-semibold text-[#1E1E1E] leading-none mb-1">
                                      {label}
                                    </span>
                                    <span
                                      className="text-[10px] text-[#7A7A7A] leading-normal block truncate select-text font-serif"
                                      title={text}
                                    >
                                      {text}
                                    </span>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>

                        {p.negativePrompt && (
                          <div className="pt-2 border-t border-[#E0E0E0]">
                            <span className="text-[11px] font-semibold text-[#1E1E1E] mb-1 block">
                              负面提示词
                            </span>
                            <p className="text-[11px] text-[#7A7A7A] leading-relaxed break-all whitespace-pre-wrap font-sans">
                              {p.negativePrompt}
                            </p>
                          </div>
                        )}

                        {p.styleName && (
                          <div className="flex flex-wrap gap-2 mt-2 pt-3 border-t border-[#E0E0E0]">
                            <span className="text-[10px] px-2 py-0.5 rounded-none bg-[#E0E0E0]/50 text-[#333130] border border-[#E0E0E0]">
                              {p.styleName}
                            </span>
                            {p.imageTags &&
                              p.imageTags.split(",").map(
                                (t, i) =>
                                  t.trim() && (
                                    <span
                                      key={i}
                                      className="text-[10px] px-2 py-0.5 rounded-none bg-[#E0E0E0]/50 text-[#333130] border border-[#E0E0E0]"
                                    >
                                      {t.trim()}
                                    </span>
                                  ),
                              )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#333130]/40 backdrop-blur-sm p-4 font-sans">
          <div className="bg-white max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-medium text-[#1E1E1E]">
                导出 CSV 选项
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-[#A3A3A3] hover:text-[#1E1E1E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label
                className={`block p-4 border cursor-pointer transition-colors ${exportOption === "local" ? "border-[#1E1E1E] bg-[#FAFAFA]" : "border-[#E0E0E0] hover:bg-[#FAFAFA]"}`}
                onClick={() => setExportOption("local")}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${exportOption === "local" ? "border-[#1E1E1E]" : "border-[#A3A3A3]"}`}
                  >
                    {exportOption === "local" && (
                      <div className="w-2 h-2 rounded-full bg-[#1E1E1E]" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[#1E1E1E]">
                      直接下载 (CSV)
                    </h4>
                    <p className="text-xs text-[#7A7A7A] mt-1">
                      本地图片使用 Blob URL；链接图片保持原样。
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`block p-4 border cursor-pointer transition-colors ${exportOption === "imgbb" ? "border-[#1E1E1E] bg-[#FAFAFA]" : "border-[#E0E0E0] hover:bg-[#FAFAFA]"}`}
                onClick={() => setExportOption("imgbb")}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${exportOption === "imgbb" ? "border-[#1E1E1E]" : "border-[#A3A3A3]"}`}
                  >
                    {exportOption === "imgbb" && (
                      <div className="w-2 h-2 rounded-full bg-[#1E1E1E]" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-[#1E1E1E]">
                      上传到 ImgBB 并直接下载 (CSV)
                    </h4>
                    <p className="text-xs text-[#7A7A7A] mt-1">
                      自动上传本地图片并填入外链链接。需要配置 ImgBB API Key。
                    </p>
                  </div>
                </div>
              </label>

              {exportOption === "imgbb" && (
                <div className="p-4 border border-[#E0E0E0] border-t-0 -mt-4 bg-[#FAFAFA]">
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2">
                    ImgBB API Key (必填)
                  </label>
                  <input
                    type="text"
                    value={imgbbApiKey}
                    onChange={(e) => setImgbbApiKey(e.target.value)}
                    placeholder="acebd61ac426801c7e903c53d21bb5aa"
                    className="w-full bg-white border border-[#E0E0E0] p-2 text-sm focus:border-[#1E1E1E] focus:outline-none"
                  />
                  <p className="text-[10px] text-[#A3A3A3] mt-2">
                    提示: 您可以在 api.imgbb.com 获取您的 API Key。
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-5 py-2 text-sm text-[#7A7A7A] hover:bg-[#FAFAFA]"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                disabled={isDownloading}
                className="px-5 py-2 text-sm bg-[#1E1E1E] hover:bg-black text-white font-medium disabled:opacity-50 flex items-center"
              >
                {isDownloading ? (
                  <span className="animate-pulse">处理中...</span>
                ) : (
                  "下载 / 导出"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {isDownloading && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans text-white transition-all">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-medium tracking-wide">正在导出数据...</h3>
          <p className="text-sm text-white/70 mt-2">
            如选择上传图片到主机，可能需要较长时间，请勿关闭或刷新页面
          </p>
        </div>
      )}

      {apiError && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#333130]/40 backdrop-blur-sm p-4 font-serif">
          <div className="bg-white w-full max-w-md flex flex-col shadow-2xl rounded-none relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
            <div className="px-6 py-5 border-b border-[#F0F0F0]">
              <h2 className="text-base font-medium text-[#1E1E1E] flex items-center">
                <Trash2 className="w-4 h-4 mr-2 text-red-500" /> API
                运行/配置提示
              </h2>
            </div>
            <div className="p-6 font-sans">
              <p className="text-[13px] text-[#4A4A4A] leading-relaxed whitespace-pre-wrap">
                {apiError}
              </p>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setApiError(null)}
                  className="px-6 py-2 bg-[#1E1E1E] hover:bg-black text-white text-sm transition-colors rounded-none"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
