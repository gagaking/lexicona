import React, { useRef, useState, useEffect } from "react";
import { motion } from "motion/react";
import { getDirectImageUrl, mirrorPrompt } from "../lib/utils";
// ...

import { useAppContext } from "../store";
import {
  Trash2,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize,
  Wand2,
  Loader2,
  Copy,
  Download,
  Check,
  FileSpreadsheet,
  X,
  Shirt,
} from "lucide-react";
import { MoodboardItem, Asset } from "../types";
import {
  mixMoodboardImages,
  uploadToImgbb,
  undressMixedPrompt,
} from "../services/aiService";
import { getModelVendorString } from "../types";

import { exportCSV } from "../services/csvParser";
import { v4 as uuidv4 } from "uuid";

let cachedMixedPrompts: {
  prompt: string;
  relationships: any[];
  structuredData?: any;
  label?: string;
}[] = [];

// Add to the top imports, then update the component below...

const DraggableItem = ({
  item,
  bringToFront,
  updateItemPosition,
  removeItem,
  toggleAspect,
}: {
  key?: string | number;
  item: MoodboardItem;
  bringToFront: (id: string) => void;
  updateItemPosition: (id: string, x: number, y: number) => void;
  removeItem: (id: string) => void;
  toggleAspect: (id: string, aspect: string) => void;
}) => {
  const nodeRef = useRef(null);

  const isEnvLocked = item.lockedAspects?.includes("environment");
  const isStyleLocked = item.lockedAspects?.includes("style");
  const isSubjectLocked = item.lockedAspects?.includes("subject");

  const advancedCategories = [
    { id: "backgroundSpace", label: "背景与空间", main: "environment" },
    { id: "lightingAngle", label: "光影与机位", main: "environment" },
    { id: "styleEffect", label: "风格与效果", main: "style" },
    { id: "colorVibe", label: "主色与氛围", main: "style" },
    { id: "specialEffects", label: "特殊效果", main: "style" },
    { id: "subjectPose", label: "主体与姿态", main: "subject" },
    { id: "propsInteraction", label: "道具与互动", main: "subject" },
    { id: "actionDetails", label: "动作与细节", main: "subject" },
    { id: "outfitStyle", label: "穿搭与风格", main: "subject" },
  ];

  const hasLocks = item.lockedAspects && item.lockedAspects.length > 0;
  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ x: item.x, y: item.y }}
      animate={{ x: item.x, y: item.y }}
      onDragStart={() => bringToFront(item.id)}
      onDragEnd={(e, info) => {
        updateItemPosition(
          item.id,
          item.x + info.offset.x,
          item.y + info.offset.y,
        );
      }}
      className={`absolute group cursor-move shadow-md hover:shadow-xl transition-shadow bg-white rounded-none border-2 hover:border-[#1E1E1E]
        ${item.lockedAspects?.length ? "border-[#1E1E1E]" : "border-transparent"}`}
      style={{
        zIndex: item.zIndex,
        width: item.width,
        top: "50%",
        left: "50%",
        marginTop: -(item.height || 300) / 2,
        marginLeft: -(item.width || 300) / 2,
      }}
    >
      <img
        src={
          item.imageUrl.startsWith("data:")
            ? item.imageUrl
            : getDirectImageUrl(item.imageUrl, 600)
        }
        data-src={
          item.imageUrl.startsWith("data:")
            ? item.imageUrl
            : getDirectImageUrl(item.imageUrl, 600)
        }
        alt={item.title || "Moodboard Item"}
        className="w-full h-auto object-cover block pointer-events-none"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          const orig = getDirectImageUrl(item.imageUrl, "original");
          if (target.src !== orig) {
            target.src = orig;
          }
        }}
      />

      <div
        className={`absolute top-2 left-2 flex flex-col gap-1.5 transition-opacity ${hasLocks ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleAspect(item.id, "environment");
          }}
          className={`px-2 py-1 text-[10px] font-sans tracking-wide border backdrop-blur-md transition-colors whitespace-nowrap
                ${isEnvLocked ? "bg-[#1E1E1E] text-white border-[#1E1E1E] font-medium shadow-sm" : "bg-white/90 text-[#7A7A7A] border-[#E0E0E0] hover:bg-gray-50"}`}
        >
          环境与视角
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleAspect(item.id, "style");
          }}
          className={`px-2 py-1 text-[10px] font-sans tracking-wide border backdrop-blur-md transition-colors whitespace-nowrap
                ${isStyleLocked ? "bg-[#1E1E1E] text-white border-[#1E1E1E] font-medium shadow-sm" : "bg-white/90 text-[#7A7A7A] border-[#E0E0E0] hover:bg-gray-50"}`}
        >
          风格与色彩
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleAspect(item.id, "subject");
          }}
          className={`px-2 py-1 text-[10px] font-sans tracking-wide border backdrop-blur-md transition-colors whitespace-nowrap
              ${isSubjectLocked ? "bg-[#1E1E1E] text-white border-[#1E1E1E] font-medium shadow-sm" : "bg-white/90 text-[#7A7A7A] border-[#E0E0E0] hover:bg-gray-50"}`}
        >
          主体与互动
        </button>
      </div>

      <div className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            removeItem(item.id);
          }}
          className="bg-red-500 text-white p-1.5 shadow-sm hover:bg-red-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className={`absolute top-[calc(100%+4px)] left-0 w-full flex transition-opacity z-10 pointer-events-auto
           ${hasLocks ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <div className="grid grid-cols-3 gap-1 bg-white/95 backdrop-blur-md p-1 border border-[#E0E0E0] shadow-sm w-full">
          {advancedCategories.map((cat) => {
            const isLocked = item.lockedAspects?.includes(cat.id);
            const styleClasses = isLocked
              ? "bg-[#1E1E1E] text-white border-[#1E1E1E] font-medium shadow-sm"
              : "bg-white text-[#7A7A7A] border-[#E0E0E0] hover:bg-gray-50";

            return (
              <button
                key={cat.id}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAspect(item.id, cat.id);
                }}
                className={`px-1 py-1 text-[9px] w-full font-sans whitespace-nowrap transition-colors border ${styleClasses}`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export function MoodboardView() {
  const { moodboardItems, setMoodboardItems, aiConfig, assets } =
    useAppContext();
  const boardRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [draggingBoard, setDraggingBoard] = useState(false);
  const [maxZIndex, setMaxZIndex] = useState(1);

  // Auto-calculate max z-index
  useEffect(() => {
    if (moodboardItems.length > 0) {
      setMaxZIndex(
        Math.max(...moodboardItems.map((item) => item.zIndex || 0)) + 1,
      );
    }
  }, [moodboardItems]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept if user is typing in an input field somewhere else
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const files = Array.from(e.clipboardData.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        files.forEach((file: File) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
              const ratio = img.width / img.height;
              const w = 200;
              const h = w / ratio;

              setMoodboardItems((prev) => [
                ...prev,
                {
                  id: `ext-${Date.now()}-${Math.random()}`,
                  imageUrl: dataUrl,
                  assetId: `ext-${Date.now()}`,
                  x: -position.x + (Math.random() * 50 - 25),
                  y: -position.y + (Math.random() * 50 - 25),
                  width: w,
                  height: h,
                  zIndex: maxZIndex + 1,
                  lockedAspects: [],
                },
              ]);
              setMaxZIndex((z) => z + 1);
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        });
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [position, maxZIndex, setMoodboardItems]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setScale((prev) => Math.min(Math.max(0.2, prev - e.deltaY * 0.005), 3));
    }
  };

  const handleBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.target === boardRef.current) {
      setDraggingBoard(true);
    }
  };

  const handleBoardMouseMove = (e: React.MouseEvent) => {
    if (draggingBoard) {
      setPosition((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }
  };

  const handleBoardMouseUp = () => {
    setDraggingBoard(false);
  };

  const bringToFront = (id: string) => {
    setMoodboardItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, zIndex: maxZIndex } : item,
      ),
    );
    setMaxZIndex((prev) => prev + 1);
  };

  const removeItem = (id: string) => {
    setMoodboardItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemPosition = (id: string, x: number, y: number) => {
    setMoodboardItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, x, y } : item)),
    );
  };

  const toggleAspect = (id: string, aspect: string) => {
    setMoodboardItems((prev) => {
      const currentItem = prev.find((i) => i.id === id);
      const isCurrentlyOn = currentItem?.lockedAspects?.includes(aspect);

      const aspectsToCategories: Record<string, string[]> = {
        environment: ["backgroundSpace", "lightingAngle"],
        style: ["styleEffect", "colorVibe", "specialEffects"],
        subject: [
          "subjectPose",
          "outfitStyle",
          "propsInteraction",
          "actionDetails",
        ],
      };

      const categoriesToAspects: Record<string, string> = {};
      Object.entries(aspectsToCategories).forEach(([k, vals]) => {
        vals.forEach((v) => (categoriesToAspects[v] = k));
      });

      if (isCurrentlyOn) {
        return prev.map((i) =>
          i.id === id
            ? {
                ...i,
                lockedAspects: (i.lockedAspects || []).filter(
                  (a) => a !== aspect,
                ),
              }
            : i,
        );
      } else {
        const conflictingAspects = new Set<string>();
        conflictingAspects.add(aspect);
        if (aspectsToCategories[aspect]) {
          aspectsToCategories[aspect].forEach((a) => conflictingAspects.add(a));
        }
        if (categoriesToAspects[aspect]) {
          conflictingAspects.add(categoriesToAspects[aspect]);
        }

        return prev.map((i) => {
          if (i.id === id) {
            let newLocks = (i.lockedAspects || []).filter(
              (a) => !conflictingAspects.has(a),
            );
            return { ...i, lockedAspects: [...newLocks, aspect] };
          }
          return {
            ...i,
            lockedAspects: (i.lockedAspects || []).filter(
              (a) => !conflictingAspects.has(a),
            ),
          };
        });
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter((f: File) =>
      f.type.startsWith("image/"),
    );

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const ratio = img.width / img.height;
          const w = 200;
          const h = w / ratio;

          setMoodboardItems((prev) => [
            ...prev,
            {
              id: `ext-${Date.now()}-${Math.random()}`,
              imageUrl: dataUrl,
              assetId: `ext-${Date.now()}`,
              x: -position.x + (Math.random() * 50 - 25),
              y: -position.y + (Math.random() * 50 - 25),
              width: w,
              height: h,
              zIndex: maxZIndex + 1,
              lockedAspects: [],
            },
          ]);
          setMaxZIndex((z) => z + 1);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [mixedPrompts, setMixedPrompts] =
    useState<
      {
        prompt: string;
        relationships: any[];
        structuredData?: any;
        label?: string;
        modelVendor?: string;
      }[]
    >(cachedMixedPrompts);
  const [copiedMix, setCopiedMix] = useState<number | null>(null);
  const [copiedPoseIndex, setCopiedPoseIndex] = useState<number | null>(null);
  const [outfitChangeType, setOutfitChangeType] = useState<
    "none" | "shoes" | "top" | "bottom" | "set"
  >("none");

  const handleOutfitToggle = () => {
    const states: ("none" | "top" | "bottom" | "shoes" | "set")[] = [
      "none",
      "top",
      "bottom",
      "shoes",
      "set",
    ];
    setOutfitChangeType((prev) => {
      const idx = states.indexOf(prev);
      return states[(idx + 1) % states.length];
    });
  };

  useEffect(() => {
    cachedMixedPrompts = mixedPrompts;
  }, [mixedPrompts]);

  const handleCopyMix = (promptToCopy: any, index: number) => {
    if (!promptToCopy) return;

    let textToCopy = promptToCopy.prompt;
    const targetData =
      promptToCopy.structuredDataZh || promptToCopy.structuredData;

    if (targetData) {
      const labels: Record<string, string> = {
        styleEffect: "风格与效果",
        lightingAngle: "光影与机位",
        subjectPose: "主体与姿态",
        colorVibe: "主色与氛围",
        backgroundSpace: "背景与空间",
        propsInteraction: "道具与互动",
        actionDetails: "动作与细节",
        outfitStyle: "穿搭与风格",
        specialEffects: "特殊效果",
      };
      const CATEGORY_KEYS = [
        "styleEffect",
        "lightingAngle",
        "subjectPose",
        "colorVibe",
        "backgroundSpace",
        "propsInteraction",
        "actionDetails",
        "outfitStyle",
        "specialEffects",
      ];
      textToCopy = CATEGORY_KEYS.map((k) => {
        const val = targetData[k];
        return val && typeof val === "string" && val.trim() !== ""
          ? `${labels[k]}: ${val.trim()}`
          : null;
      })
        .filter(Boolean)
        .join(",\n");
    }

    navigator.clipboard.writeText(textToCopy);
    setCopiedMix(index);
    setTimeout(
      () => setCopiedMix((prev) => (prev === index ? null : prev)),
      2000,
    );
  };

  const handleCopyMixMirror = (promptToCopy: any, index: number) => {
    if (!promptToCopy) return;

    let textToCopy = promptToCopy.prompt;
    const targetData =
      promptToCopy.structuredDataZh || promptToCopy.structuredData;

    if (targetData) {
      const labels: Record<string, string> = {
        styleEffect: "风格与效果",
        lightingAngle: "光影与机位",
        subjectPose: "主体与姿态",
        colorVibe: "主色与氛围",
        backgroundSpace: "背景与空间",
        propsInteraction: "道具与互动",
        actionDetails: "动作与细节",
        outfitStyle: "穿搭与风格",
        specialEffects: "特殊效果",
      };
      const CATEGORY_KEYS = [
        "styleEffect",
        "lightingAngle",
        "subjectPose",
        "colorVibe",
        "backgroundSpace",
        "propsInteraction",
        "actionDetails",
        "outfitStyle",
        "specialEffects",
      ];
      textToCopy = CATEGORY_KEYS.map((k) => {
        const val = targetData[k];
        return val && typeof val === "string" && val.trim() !== ""
          ? `${labels[k]}: ${val.trim()}`
          : null;
      })
        .filter(Boolean)
        .join(",\n");
    }

    navigator.clipboard.writeText(mirrorPrompt(textToCopy));
    setCopiedMix(index + 1000);
    setTimeout(
      () => setCopiedMix((prev) => (prev === index + 1000 ? null : prev)),
      2000,
    );
  };

  const handleExportMixCSV = async () => {
    if (mixedPrompts.length === 0) return setApiError("无可导出内容");

    const assetsToExport = mixedPrompts.map((mp, index) => {
      return {
        id: "mix-" + uuidv4(),
        title: mp.label || "Moodboard 融合提取结果",
        styleEffect: mp.structuredData?.styleEffect || "",
        lightingAngle: mp.structuredData?.lightingAngle || "",
        subjectPose: mp.structuredData?.subjectPose || "",
        colorVibe: mp.structuredData?.colorVibe || "",
        backgroundSpace: mp.structuredData?.backgroundSpace || "",
        propsInteraction: mp.structuredData?.propsInteraction || "",
        actionDetails: mp.structuredData?.actionDetails || "",
        outfitStyle: mp.structuredData?.outfitStyle || "",
        specialEffects: mp.structuredData?.specialEffects || "",
        imageUrl: "",
        tags: "",
        createdAt: Date.now(),
      } as Asset;
    });
    exportCSV(assetsToExport);
  };

  const handleExportBoard = async () => {
    try {
      if (moodboardItems.length === 0) return setApiError("画板为空");

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      const loadedImages = await Promise.all(
        moodboardItems.map((item) => {
          return new Promise<{ img: HTMLImageElement; item: MoodboardItem }>(
            (resolve, reject) => {
              const img = new Image();
              let srcUrl = item.imageUrl.startsWith("data:")
                ? item.imageUrl
                : getDirectImageUrl(item.imageUrl, "original");
              if (!srcUrl.startsWith("data:") && !srcUrl.startsWith("blob:")) {
                srcUrl = `https://wsrv.nl/?url=${encodeURIComponent(srcUrl)}&cors=1`;
                img.crossOrigin = "anonymous";
              }
              img.onload = () => resolve({ img, item });
              img.onerror = () => resolve({ img, item }); // skip on error
              img.src = srcUrl;
            },
          );
        }),
      );

      loadedImages.forEach(({ img, item }) => {
        if (!img.complete || img.naturalWidth === 0) return;
        const height = item.width / (img.width / img.height);

        const left = item.x - item.width / 2;
        const top = item.y - height / 2;
        const right = left + item.width;
        const bottom = top + height;

        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      });

      if (minX === Infinity) return setApiError("无可导出内容");

      const PADDING = 40;
      const baseWidth = maxX - minX + PADDING * 2;
      const baseHeight = maxY - minY + PADDING * 2;

      const EXPORT_SCALE = Math.max(2, 2000 / baseWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(baseWidth * EXPORT_SCALE, 6000);
      canvas.height = Math.min(baseHeight * EXPORT_SCALE, 6000);
      const ctx = canvas.getContext("2d")!;

      const scale = EXPORT_SCALE;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const aspectsMap: Record<string, string> = {
        environment: "环境与视角",
        style: "风格与色彩",
        subject: "主体与互动",
        styleEffect: "风格与效果",
        lightingAngle: "光影与机位",
        subjectPose: "主体与姿态",
        colorVibe: "主色与氛围",
        backgroundSpace: "背景与空间",
        propsInteraction: "道具与互动",
        actionDetails: "动作与细节",
        outfitStyle: "穿搭与风格",
        specialEffects: "特殊效果",
      };

      loadedImages
        .sort((a, b) => a.item.zIndex - b.item.zIndex)
        .forEach(({ img, item }) => {
          if (!img.complete || img.naturalWidth === 0) return;
          const itemH = item.width / (img.width / img.height);
          const x = (item.x - item.width / 2 - minX + PADDING) * scale;
          const y = (item.y - itemH / 2 - minY + PADDING) * scale;

          ctx.fillStyle = "white";
          ctx.shadowColor = "rgba(0,0,0,0.1)";
          ctx.shadowBlur = 10 * scale;
          ctx.fillRect(x, y, item.width * scale, itemH * scale);
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;

          ctx.drawImage(img, x, y, item.width * scale, itemH * scale);

          // Draw locked tags
          if (item.lockedAspects && item.lockedAspects.length > 0) {
            let tagY = y + 8 * scale;
            item.lockedAspects.forEach((aspect) => {
              const text = aspectsMap[aspect] || aspect;
              ctx.font = `${12 * scale}px sans-serif`;
              const textWidth = ctx.measureText(text).width;

              ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
              ctx.fillRect(
                x + 8 * scale,
                tagY,
                textWidth + 16 * scale,
                24 * scale,
              );

              ctx.fillStyle = "white";
              ctx.fillText(text, x + 16 * scale, tagY + 16 * scale);

              tagY += 28 * scale;
            });
          }
        });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const link = document.createElement("a");
      link.download = `moodboard_export_${Date.now()}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      setApiError(`导出失败: ${e.message}`);
    }
  };

  const handleGenerateMix = async () => {
    if (!aiConfig) {
      setApiError("请先在设置中配置 Gemini API Key");
      return;
    }

    const activeItems = moodboardItems.filter(
      (i) => (i.lockedAspects || []).length > 0,
    );
    if (activeItems.length === 0) {
      setApiError("请至少在一张图片上锁定一些提取类别");
      return;
    }

    setIsGenerating(true);
    setMixedPrompts([]);
    try {
      const galleryItems = activeItems.filter((item) =>
        assets.some((a) => a.id === item.assetId),
      );
      const externalItems = activeItems.filter(
        (item) => !assets.some((a) => a.id === item.assetId),
      );

      let base64Image: string | null = null;
      let mapPromptDescriptions = "";

      const aspectsToCategories = {
        environment: ["backgroundSpace", "lightingAngle"],
        style: ["styleEffect", "colorVibe", "specialEffects"],
        subject: [
          "subjectPose",
          "outfitStyle",
          "propsInteraction",
          "actionDetails",
        ],
      };

      if (galleryItems.length > 0) {
        let textDesc = galleryItems
          .map((item, idx) => {
            const asset = assets.find((a) => a.id === item.assetId)!;
            let extracted: string[] = [];
            const CATEGORY_ORDER = [
              "styleEffect",
              "lightingAngle",
              "subjectPose",
              "colorVibe",
              "backgroundSpace",
              "propsInteraction",
              "actionDetails",
              "outfitStyle",
              "specialEffects",
            ];
            CATEGORY_ORDER.forEach((cat) => {
              const isLocked = (item.lockedAspects || []).some(
                (aspect) =>
                  aspect === cat ||
                  (
                    aspectsToCategories[
                      aspect as keyof typeof aspectsToCategories
                    ] || []
                  ).includes(cat),
              );
              if (isLocked && asset[cat as keyof Asset]) {
                extracted.push(`${cat}: ${asset[cat as keyof Asset]}`);
              }
            });
            return `- From Text Source ${idx + 1}, strictly use these features: ${extracted.join(", ")}`;
          })
          .join("\n");
        mapPromptDescriptions +=
          "Text Sources (from Gallery Attributes):\n" + textDesc + "\n\n";
      }

      if (externalItems.length === 0) {
        // Fast path: No external images, locally merge to avoid slow AI calls
        const finalStructuredData: any = {};
        const orderedEnglishPieces: string[] = [];
        const orderedChinesePieces: string[] = [];

        const ORDER = [
          "styleEffect",
          "lightingAngle",
          "subjectPose",
          "colorVibe",
          "backgroundSpace",
          "propsInteraction",
          "actionDetails",
          "outfitStyle",
          "specialEffects",
        ];

        ORDER.forEach((cat) => {
          const vals: string[] = [];
          const enVals: string[] = [];
          galleryItems.forEach((item) => {
            const asset = assets.find((a) => a.id === item.assetId)!;
            if (
              item.lockedAspects?.some(
                (aspect) =>
                  aspect === cat ||
                  (
                    aspectsToCategories[
                      aspect as keyof typeof aspectsToCategories
                    ] || []
                  ).includes(cat),
              )
            ) {
              if (asset[cat as keyof Asset]) {
                vals.push(asset[cat as keyof Asset] as string);
              }
              if (asset.englishTranslations && asset.englishTranslations[cat]) {
                enVals.push(asset.englishTranslations[cat] as string);
              }
            }
          });

          if (vals.length > 0) {
            const uniqueVals = Array.from(new Set(vals)).join(", ");
            finalStructuredData[cat] = uniqueVals;
            orderedChinesePieces.push(uniqueVals);
          }
          if (enVals.length > 0) {
            orderedEnglishPieces.push(Array.from(new Set(enVals)).join(", "));
          }
        });

        const CATEGORY_LABELS_ZH = {
          styleEffect: "风格与效果",
          lightingAngle: "光影与机位",
          subjectPose: "主体与姿态",
          colorVibe: "主色与氛围",
          backgroundSpace: "背景与空间",
          propsInteraction: "道具与互动",
          actionDetails: "动作与细节",
          outfitStyle: "穿搭与风格",
          specialEffects: "特殊效果",
        };

        if (outfitChangeType && outfitChangeType !== "none") {
          let label = "服饰";
          if (outfitChangeType === "shoes") label = "鞋子";
          else if (outfitChangeType === "top") label = "衣服";
          else if (outfitChangeType === "bottom") label = "裤子";
          else if (outfitChangeType === "set") label = "套装饰品";

          finalStructuredData.outfitStyle =
            (finalStructuredData.outfitStyle || "") +
            ` (注: 图中的模特穿着图中的${label})`;
        }

        setMixedPrompts([
          {
            prompt: orderedChinesePieces.join(", "),
            structuredData: finalStructuredData,
            relationships: [],
            modelVendor: "Local Merge (No AI calls)",
          },
        ]);
        setIsGenerating(false);
        return;
      }

      if (externalItems.length > 0) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");

        const MAX_WIDTH = 1200;
        const COLUMNS = 2;
        const PADDING = 20;
        const ITEM_WIDTH = (MAX_WIDTH - (COLUMNS + 1) * PADDING) / COLUMNS;

        const loadedImages = await Promise.all(
          externalItems.map((item) => {
            return new Promise<{
              img: HTMLImageElement;
              height: number;
              item: MoodboardItem;
            }>((resolve, reject) => {
              const img = new Image();
              let srcUrl = item.imageUrl.startsWith("data:")
                ? item.imageUrl
                : getDirectImageUrl(item.imageUrl);
              if (!srcUrl.startsWith("data:") && !srcUrl.startsWith("blob:")) {
                srcUrl = `https://wsrv.nl/?url=${encodeURIComponent(srcUrl)}&cors=1`;
                img.crossOrigin = "anonymous";
              }
              img.onload = () => {
                const height = ITEM_WIDTH / (img.width / img.height);
                resolve({ img, height, item });
              };
              img.onerror = () => {
                console.error("Failed to load image for mix:", srcUrl);
                resolve(null);
              };
              img.src = srcUrl;
            });
          }),
        );

        const validLoadedImages = loadedImages.filter(
          (
            info,
          ): info is {
            img: HTMLImageElement;
            height: number;
            item: MoodboardItem;
          } => info !== null,
        );

        // Calculate total height
        let leftColY = PADDING;
        let rightColY = PADDING;

        validLoadedImages.forEach((info, idx) => {
          if (idx % 2 === 0) {
            leftColY += info.height + PADDING;
          } else {
            rightColY += info.height + PADDING;
          }
        });

        const totalHeight = Math.max(leftColY, rightColY);
        canvas.width = MAX_WIDTH;
        canvas.height = totalHeight;

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, MAX_WIDTH, totalHeight);

        leftColY = PADDING;
        rightColY = PADDING;

        const visionPromptDescriptions = validLoadedImages
          .map((info, idx) => {
            const isLeft = idx % 2 === 0;
            const x = isLeft ? PADDING : PADDING * 2 + ITEM_WIDTH;
            const y = isLeft ? leftColY : rightColY;

            ctx.drawImage(info.img, x, y, ITEM_WIDTH, info.height);

            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(x, y, 60, 30);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 16px Arial";
            ctx.fillText(`ID: ${idx + 1}`, x + 10, y + 20);

            if (isLeft) leftColY += info.height + PADDING;
            else rightColY += info.height + PADDING;

            const aspectsMap: any = {
              environment:
                "Environmental details (Lighting, Space, Background)",
              style: "Style and Color (Vibe, Rendering, Post-processing)",
              subject: "Subject details (Pose, Outfit, Props, Action)",
              styleEffect: "Style Effect",
              lightingAngle: "Lighting and Angle",
              subjectPose: "Subject Pose",
              colorVibe: "Color Vibe",
              backgroundSpace: "Background Space",
              propsInteraction: "Props and Interaction",
              actionDetails: "Action Details",
              outfitStyle: "Outfit and Style",
              specialEffects: "Special Effects",
            };
            const targets =
              info.item.lockedAspects
                ?.map((a) => aspectsMap[a])
                .join(" and ") || "";

            return `- From Image ID ${idx + 1}, strictly extract: ${targets}`;
          })
          .join("\n");

        base64Image = canvas.toDataURL("image/jpeg", 0.9);
        mapPromptDescriptions +=
          "Image Sources (from Vision composite):\n" +
          visionPromptDescriptions +
          "\n\n";
      }

      const prompt = `Extract specific features based on the following rules:\n${mapPromptDescriptions}\nCombine all the extracted/provided features logically into a single cohesive Midjourney English prompt.`;

      const response = await mixMoodboardImages(
        prompt,
        base64Image,
        aiConfig,
        outfitChangeType,
      );

      const finalResp = (response as any)?.data
        ? Array.isArray((response as any).data)
          ? (response as any).data[0]
          : (response as any).data
        : Array.isArray(response)
          ? response[0]
          : response;

      if (finalResp && (finalResp.prompt || finalResp.structuredData)) {
        if (outfitChangeType && outfitChangeType !== "none") {
          let label = "服饰";
          if (outfitChangeType === "shoes") label = "鞋子";
          else if (outfitChangeType === "top") label = "衣服";
          else if (outfitChangeType === "bottom") label = "裤子";
          else if (outfitChangeType === "set") label = "套装饰品";

          if (finalResp.structuredDataZh) {
            finalResp.structuredDataZh.outfitStyle =
              (finalResp.structuredDataZh.outfitStyle || "") +
              ` (注: 图中的模特穿着图中的${label})`;
          }
          if (finalResp.structuredData) {
            finalResp.structuredData.outfitStyle =
              (finalResp.structuredData.outfitStyle || "") +
              ` (Note: The model in the image is wearing the ${label} shown in the image)`;
          }
        }

        // Ensure prompt is a string if missing but we have structured data
        if (!finalResp.promptZh && finalResp.structuredDataZh) {
          const CATEGORY_KEYS = [
            "styleEffect",
            "lightingAngle",
            "subjectPose",
            "colorVibe",
            "backgroundSpace",
            "propsInteraction",
            "actionDetails",
            "outfitStyle",
            "specialEffects",
          ];
          finalResp.promptZh = CATEGORY_KEYS.map(
            (k) => finalResp.structuredDataZh[k],
          )
            .filter(Boolean)
            .join(", ");
        }
        if (!finalResp.prompt && finalResp.structuredData) {
          const CATEGORY_KEYS = [
            "styleEffect",
            "lightingAngle",
            "subjectPose",
            "colorVibe",
            "backgroundSpace",
            "propsInteraction",
            "actionDetails",
            "outfitStyle",
            "specialEffects",
          ];
          finalResp.prompt = CATEGORY_KEYS.map(
            (k) => finalResp.structuredData[k],
          )
            .filter(Boolean)
            .join(", ");
        }
        if (!finalResp.prompt) {
          finalResp.prompt = finalResp.promptZh || "Generated Prompt";
        }

        setMixedPrompts([
          {
            ...finalResp,
            label: "融合提取结果",
            modelVendor: getModelVendorString(aiConfig),
          },
        ]);
      } else {
        throw new Error(
          "模型未返回有效的提取数据结构: " +
            JSON.stringify(response).substring(0, 150),
        );
      }
      setIsGenerating(false);
    } catch (e) {
      console.error(e);
      setApiError(`生成遇到问题: ${e.message || e}`);
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F8F8F8] flex flex-col md:flex-row">
      {/* Left Canvas Area */}
      <div
        className="flex-grow h-full relative overflow-hidden select-none"
        onWheel={handleWheel}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={handleBoardMouseUp}
        onMouseLeave={handleBoardMouseUp}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
      >
        {/* Zoom Controls */}
        <div
          className="absolute top-4 left-4 z-50 flex gap-1.5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setScale((prev) => Math.min(prev + 0.1, 3))}
            className="bg-white p-2 shadow-xs border border-[#E0E0E0] hover:bg-gray-50 rounded-none transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-[#1E1E1E]" />
          </button>
          <button
            onClick={() => setScale(1)}
            className="bg-white px-3 py-2 text-xs font-semibold shadow-xs border border-[#E0E0E0] hover:bg-gray-50 rounded-none transition-colors"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={() => setScale((prev) => Math.max(prev - 0.1, 0.2))}
            className="bg-white p-2 shadow-xs border border-[#E0E0E0] hover:bg-gray-50 rounded-none transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-[#1E1E1E]" />
          </button>
          <button
            onClick={() => setPosition({ x: 0, y: 0 })}
            className="bg-white p-2 shadow-xs border border-[#E0E0E0] hover:bg-gray-50 ml-1 rounded-none transition-colors"
            title="复位视图"
          >
            <Maximize className="w-4 h-4 text-[#1E1E1E]" />
          </button>
        </div>

        {/* Hint tooltip */}
        <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none transition-opacity">
          <span className="opacity-45 hover:opacity-100 text-[10px] text-[#A3A3A3] bg-white/65 backdrop-blur-sm px-2 py-1 rounded-sm border border-transparent font-sans">
            鼠标中键/拖拽空白处移动画板 · 直接拖入图片即可导入
          </span>
        </div>

        {/* Infinity Canvas Content */}
        <div
          ref={boardRef}
          className="absolute transition-transform origin-center "
          style={{
            width: "5000px",
            height: "5000px",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: draggingBoard ? "grabbing" : "grab",
            backgroundImage: "radial-gradient(#E0E0E0 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0, overflow: "visible" }}
          >
            {moodboardItems.map((item) => {
              if (item.sourceItemIds && item.sourceItemIds.length > 0) {
                return item.sourceItemIds.map((srcId) => {
                  const srcItem = moodboardItems.find((i) => i.id === srcId);
                  if (srcItem) {
                    return (
                      <line
                        key={`${srcId}-${item.id}`}
                        x1={srcItem.x}
                        y1={srcItem.y}
                        x2={item.x}
                        y2={item.y}
                        stroke="#A3A3A3"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                    );
                  }
                  return null;
                });
              }
              return null;
            })}
          </svg>

          {moodboardItems.map((item) => (
            <DraggableItem
              key={item.id}
              item={item}
              bringToFront={bringToFront}
              updateItemPosition={updateItemPosition}
              removeItem={removeItem}
              toggleAspect={toggleAspect}
            />
          ))}

          {moodboardItems.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-[#A3A3A3] flex flex-col items-center p-12 bg-white/60 backdrop-blur-xs border border-[#E0E0E0] border-dashed">
                <ImageIcon className="w-12 h-12 mb-4 opacity-40" />
                <p className="font-medium tracking-widest uppercase mb-1.5 text-xs text-[#1E1E1E]">
                  Moodboard 画板
                </p>
                <p className="text-xs font-sans">
                  点击画廊中的图片快捷加入，或直接将图片拖入此处
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar Action & Result Panel */}
      <div
        className="w-full md:w-[400px] h-[340px] md:h-full bg-white border-t md:border-t-0 md:border-l border-[#EAEAEA] flex flex-col z-45 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header and Control Zone */}
        <div className="p-4 border-b border-[#EAEAEA] bg-white flex flex-col gap-3 shrink-0">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E1E1E]">
              情绪板特征混合操作
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleExportBoard}
                title="导出画板 (JPG/PNG)"
                className="p-1 px-2 border border-gray-100 hover:border-gray-300 text-[#7A7A7A] hover:text-[#1E1E1E] hover:bg-gray-50 transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMoodboardItems([])}
                title="清空画板"
                className="p-1 px-2 border border-red-100 hover:border-red-300 text-[#7A7A7A] hover:text-red-600 hover:bg-red-50 transition-colors shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerateMix}
            disabled={isGenerating || moodboardItems.length === 0}
            className="w-full flex items-center justify-center px-4 py-2.5 bg-[#1E1E1E] text-white hover:bg-black font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide shadow-xs"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 mr-1.5" />
            )}
            智能融合混合生成
          </button>

          <div className="text-[11px] text-[#8C8C8C] leading-normal font-sans">
            锁定画板特定维度元素属性（选择锁定或双击编辑），混合AI引擎将智能融合跨物种图像的多维视觉核心特征并生成精准重构提示词。
          </div>
        </div>

        {/* Mixed Prompts Display Zone */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#FAFAFA]">
          {mixedPrompts.length > 0 ? (
            <>
              {/* Result controls bar */}
              <div className="px-4 py-2 bg-white border-b border-[#EAEAEA] flex items-center justify-between shrink-0">
                <span className="text-[11px] font-semibold text-[#1E1E1E]">
                  融合提示词结果 ({mixedPrompts.length})
                </span>
                <div className="flex items-center gap-1.5">
                  {/* One-click undress */}
                  <div className="relative flex items-stretch group/undress">
                    <button
                      disabled={isGenerating}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs border bg-white border-[#E0E0E0] hover:bg-gray-50 text-[#7A7A7A] group-hover/undress:text-[#1E1E1E] disabled:opacity-50 transition-colors font-sans rounded-none"
                      title="一键卸装"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Shirt className="w-3.5 h-3.5" />
                      )}
                      <span>快速换装</span>
                    </button>
                    <div className="absolute top-full right-0 pt-[2px] w-[85px] z-50 opacity-0 invisible group-hover/undress:opacity-100 group-hover/undress:visible transition-all duration-150 shadow-md">
                      <div className="bg-white border border-[#E0E0E0] flex flex-col py-1">
                        {["衣服", "裤子", "鞋子", "全套"].map((label, i) => {
                          const types = ["top", "bottom", "shoes", "set"];
                          return (
                            <button
                              key={label}
                              onClick={() => {
                                if (isGenerating) return;
                                setIsGenerating(true);
                                undressMixedPrompt(
                                  mixedPrompts[0],
                                  types[i],
                                  aiConfig,
                                )
                                  .then((updated) => {
                                    setMixedPrompts((prev) => [
                                      {
                                        ...updated,
                                        label: `换装/去件: ${label}`,
                                      },
                                      ...prev,
                                    ]);
                                  })
                                  .catch((err) => {
                                    setApiError(
                                      "换装失败: " +
                                        (err.message || String(err)),
                                    );
                                  })
                                  .finally(() => {
                                    setIsGenerating(false);
                                  });
                              }}
                              className="px-2 py-1 text-[11px] text-center font-sans tracking-wide hover:bg-gray-100 text-[#5A5A5A] hover:text-[#1E1E1E] transition-colors border-b border-gray-50"
                            >{`去${label}`}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleExportMixCSV}
                    title="导出结果为 CSV 报表"
                    className="p-1 px-2 border border-[#E0E0E0] bg-white hover:bg-gray-50 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors rounded-none"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Result Items List - Allows highlights select-text copy-paste */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar select-text">
                {mixedPrompts.map((mp, index) => (
                  <div
                    key={index}
                    className={`p-3 relative flex flex-col gap-2.5 shadow-2xs rounded-none border ${mp.label && (mp.label.includes("换装") || mp.label.includes("去件")) ? "bg-[#FAF8F5] border-[#DCDAD2]" : "bg-white border-[#EAEAEA]"}`}
                  >
                    <div className="flex items-center justify-between border-b border-[#F5F5F5] pb-2 mb-0.5 gap-1 select-none">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-semibold text-[#1E1E1E] text-xs">
                          分析组合 #{mixedPrompts.length - index}
                        </div>
                        {mp.label && (
                          <span className="bg-[#FAFAFA] text-[#7A7A7A] border border-gray-100 text-[9px] px-1.5 py-0.5 font-medium">
                            {mp.label}
                          </span>
                        )}
                        {mp.modelVendor && (
                          <span className="bg-gray-50 text-gray-400 text-[9px] px-1.5 py-0.5 border border-transparent font-medium">
                            {mp.modelVendor}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyMix(mp, index)}
                          title="复制完整提示词"
                          className="p-1 border border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors shadow-3xs"
                        >
                          {copiedMix === index ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleCopyMixMirror(mp, index)}
                          title="左右镜像复制提示词 (将左/left与右/right互相替换)"
                          className="p-1 border border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors shadow-3xs"
                        >
                          {copiedMix === index + 1000 ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 scale-x-[-1]" />
                          )}
                        </button>
                      </div>
                    </div>

                    {mp.structuredData ? (
                      <div className="flex flex-col gap-2 select-text">
                        {[
                          "styleEffect",
                          "lightingAngle",
                          "subjectPose",
                          "colorVibe",
                          "backgroundSpace",
                          "propsInteraction",
                          "actionDetails",
                          "outfitStyle",
                          "specialEffects",
                        ].map((k) => {
                          const val = mp.structuredData[k];
                          if (!val || val.trim() === "") return null;
                          const labels = {
                            styleEffect: "风格与效果",
                            lightingAngle: "光影与机位",
                            subjectPose: "主体与姿态",
                            colorVibe: "主色与氛围",
                            backgroundSpace: "背景与空间",
                            propsInteraction: "道具与互动",
                            actionDetails: "动作与细节",
                            outfitStyle: "穿搭与风格",
                            specialEffects: "特殊效果",
                          };
                          const label = labels[k] || k;
                          return (
                            <div
                              key={k}
                              className="p-2 bg-[#FAFAFA] border border-[#F2F2F2] text-[11px]"
                            >
                              <div className="font-semibold text-gray-500 mb-0.5 text-[10px] select-none">
                                {label}
                              </div>
                              <div className="text-gray-900 leading-normal select-text font-serif break-words">
                                {val}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-900 leading-relaxed font-sans break-words whitespace-pre-wrap select-text px-1">
                        {mp.prompt}
                      </div>
                    )}

                    {mp.relationships && mp.relationships.length > 0 && (
                      <div className="text-[#8A8A8A] text-[10px] pt-2 border-t border-[#F5F5F5] flex flex-col gap-1 mt-1 font-sans select-text">
                        <div className="font-semibold text-gray-700 select-none">
                          各图像继承关联：
                        </div>
                        {mp.relationships.map((rel, idx) => (
                          <span
                            key={idx}
                            className="bg-white border border-[#E9E9E9] p-1.5 text-stone-600 leading-normal select-text"
                          >
                            <span className="font-semibold text-[#1E1E1E]">
                              图像 {rel.sourceImageIndex}
                            </span>{" "}
                            ({rel.aspect}): {rel.extractedDetails}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#A3A3A3] select-none">
              <Wand2 className="w-8 h-8 mb-2 opacity-30 stroke-1" />
              <p className="text-xs font-semibold text-gray-500">
                当下无混合提取成果
              </p>
              <p className="text-[10px] scale-95 mt-1 text-gray-400 leading-normal font-sans">
                勾选图片各维特征后，点击上方「智能融合混合生成」，在此处将按次序展示极细颗粒度、可解耦的多维提示词面板。
              </p>
            </div>
          )}
        </div>
      </div>

      {apiError && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#333130]/40 backdrop-blur-sm p-4 font-sans"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="bg-white w-full max-w-md flex flex-col shadow-2xl border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
            <div className="px-6 py-5 border-b border-[#F0F0F0]">
              <h2 className="text-base font-semibold text-[#1E1E1E] flex items-center">
                <Trash2 className="w-4 h-4 mr-2 text-red-500" /> 提示信息
              </h2>
            </div>
            <div className="p-6">
              <p className="text-[13px] text-[#4A4A4A] font-sans leading-relaxed">
                {apiError}
              </p>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setApiError(null)}
                  className="px-6 py-2 bg-[#1E1E1E] hover:bg-black text-white text-sm font-semibold transition-colors rounded-none font-sans"
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
