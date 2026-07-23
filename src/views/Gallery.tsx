import React, { useState, useMemo, useRef, useEffect } from "react";
import { useAppContext } from "../store";
import { AssetDetailModal } from "../components/AssetDetailModal";
import { SettingsModal } from "../components/SettingsModal";
import { GadgetMenu } from "../components/GadgetMenu";
import { MoodboardView } from "./MoodboardView";
import { Asset, getModelVendorString } from "../types";
import {
  Search,
  Copy,
  Image as ImageIcon,
  Sparkles,
  FilterX,
  Send,
  RefreshCw,
  Wand2,
  Check,
  Settings,
  Trash2,
  ArrowLeft,
  FileSpreadsheet,
  Lock,
  X,
  Shirt,
  KeyRound,
  Sparkle,
  User,
  Palette,
  Camera,
  PlusSquare,
  Loader2,
  ZoomIn,
  Tag,
  Bone,
} from "lucide-react";
import { getDirectImageUrl, mirrorPrompt } from "../lib/utils";
import {
  generateNewPrompts,
  generatePromptsFromCombinations,
  undressAsset,
} from "../services/aiService";
import { parseCSV, exportCSV } from "../services/csvParser";
import { v4 as uuidv4 } from "uuid";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const CATEGORIES = [
  { key: "styleEffect", label: "风格与效果" },
  { key: "lightingAngle", label: "光影与视角" },
  { key: "subjectPose", label: "主体与姿态" },
  { key: "colorVibe", label: "主色与氛围" },
  { key: "backgroundSpace", label: "背景与空间" },
  { key: "propsInteraction", label: "道具与交互" },
  { key: "actionDetails", label: "动作与细节" },
  { key: "outfitStyle", label: "穿搭与风格" },
  { key: "specialEffects", label: "特效与后期" },
] as const;

const GalleryImage = ({ src, alt }: { src: string; alt: string }) => {
  const [hasError, setHasError] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const directSrc = useOriginal
    ? getDirectImageUrl(src, "original")
    : getDirectImageUrl(src, 600);

  React.useEffect(() => {
    setHasError(false);
    setUseOriginal(false);
  }, [src]);

  if (!directSrc || hasError) {
    return <ImageIcon className="w-10 h-10 text-[#EFEBE6]" />;
  }

  return (
    <img
      src={directSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useOriginal) {
          setUseOriginal(true);
        } else {
          setHasError(true);
        }
      }}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
    />
  );
};

export function Gallery({ onOpenReverse }: { onOpenReverse?: () => void }) {
  const {
    assets,
    addAssets,
    clearAllCache,
    aiConfig,
    generatedPrompts,
    setGeneratedPrompts,
    lockedFields,
    setLockedFields,
    moodboardItems,
    setMoodboardItems,
    setReversePromptPairs,
  } = useAppContext();

  const [depthMapUrls, setDepthMapUrls] = useState({});
  const [depthMapLoading, setDepthMapLoading] = useState({});
  const [depthMapAssetId, setDepthMapAssetId] = useState(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenMoodboard = () => {
    // Collect specific images that users selected
    const existingIds = new Set(moodboardItems.map((i) => i.id));

    const assetsToAdd = new Set<string>(selectedIds);

    const nextItems = [...moodboardItems];

    Array.from(assetsToAdd).forEach((id, idx) => {
      const asset = assets.find((a) => a.id === id);
      if (!asset) return;

      const lockedAspects: ("environment" | "style" | "subject")[] = [];
      // Map the 9 categories to the 3 Moodboard aspects
      const checkLock = (keys: string[]) => {
        const validKeys = keys.filter((k) => asset[k as keyof Asset]);
        return (
          validKeys.length > 0 &&
          validKeys.every((k) => lockedFields[k]?.assetId === asset.id)
        );
      };

      if (checkLock(["backgroundSpace", "lightingAngle"])) {
        lockedAspects.push("environment");
      }
      if (checkLock(["styleEffect", "colorVibe", "specialEffects"])) {
        lockedAspects.push("style");
      }
      if (
        checkLock([
          "subjectPose",
          "outfitStyle",
          "propsInteraction",
          "actionDetails",
        ])
      ) {
        lockedAspects.push("subject");
      }

      const existingIndex = nextItems.findIndex((i) => i.id === id);

      if (existingIndex >= 0) {
        // Preserve its location but update aspects
        nextItems[existingIndex] = {
          ...nextItems[existingIndex],
          lockedAspects,
        };
      } else {
        nextItems.push({
          id: asset.id,
          assetId: asset.id,
          imageUrl: asset.imageUrl,
          x: Math.random() * 60 - 30,
          y: Math.random() * 60 - 30,
          width: 200,
          height: 200,
          zIndex: nextItems.length + 1,
          title: asset.title,
          lockedAspects,
        });
      }
    });

    setMoodboardItems(nextItems);
    setViewMode("moodboard");
  };

  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebounce(searchInput, 300);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setShowTagDropdown(false);
    if (showTagDropdown) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showTagDropdown]);

  const [showSettings, setShowSettings] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generation States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generateCount, setGenerateCount] = useState<number>(1);
  const [modificationRequest, setModificationRequest] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"gallery" | "results" | "moodboard">(
    "gallery",
  );
  const [outfitChangeType, setOutfitChangeType] = useState<
    "none" | "shoes" | "top" | "bottom" | "set"
  >("none");
  const [language, setLanguage] = useState<"cn" | "en">("cn");
  const [apiError, setApiError] = useState<string | null>(null);

  const [undressingAssets, setUndressingAssets] = useState<
    Record<string, boolean>
  >({});

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

  const handleUndressGenerated = async (asset: Asset, type: string) => {
    if (!aiConfig) {
      alert("请先在设置中配置 Gemini API Key");
      return;
    }
    setUndressingAssets((prev) => ({ ...prev, [asset.id]: true }));
    try {
      const updatedAsset = await undressAsset(asset, type, aiConfig);

      // We want to differentiate it and also prepend a newly generated ID
      const newAsset = {
        ...updatedAsset,
        id: Math.random().toString(36).substring(2, 10),
        title: `${updatedAsset.title} (卸装)`,
        modelVendor: getModelVendorString(aiConfig),
      };

      setGeneratedPrompts((prev) => [newAsset, ...prev]);
    } catch (e: any) {
      console.error("[Gallery] undress error:", e);
      setApiError(e.message || String(e));
    } finally {
      setUndressingAssets((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  const exportResultAssetsCSV = async () => {
    let updatedAssets = [...generatedPrompts];
    let needsUpload = updatedAssets.some(
      (a) => a.imageUrl && a.imageUrl.startsWith("data:image"),
    );

    if (needsUpload) {
      try {
        const { uploadToImgbb } = await import("../services/aiService");
        // Show simple global loading or alert?
        updatedAssets = await Promise.all(
          updatedAssets.map(async (a) => {
            if (a.imageUrl && a.imageUrl.startsWith("data:image")) {
              const newUrl = await uploadToImgbb(a.imageUrl);
              return { ...a, imageUrl: newUrl };
            }
            return a;
          }),
        );
        setGeneratedPrompts(updatedAssets);
      } catch (e) {
        alert("部分图片上传Imgbb失败，导出的表中可能缺少部分图片。");
      }
    }
    exportCSV(updatedAssets);
  };

  const getModelLabel = () => {
    if (aiConfig.provider === "google")
      return aiConfig.googleModel.replace(/-/g, "");
    if (aiConfig.provider === "deepseek") return aiConfig.deepseekModel;
    return aiConfig.ollamaModel || "llama3";
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const newAssets = await parseCSV(file);
      await addAssets(newAssets);
      alert(`成功导入 ${newAssets.length} 条数据。`);
    } catch (err: any) {
      alert(`导入失败: ${err.message}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearCache = async () => {
    if (
      confirm(
        "确定要清空应用的整个数据库并卸载云端表格吗？所有导入的模型和历史记录都将丢失。\n\n注意：云端表格将被卸载，不会再次自动加载。",
      )
    ) {
      await clearAllCache();
      alert("缓存已清空并卸载云端表格");
    }
  };

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    assets.forEach((a) => {
      if (a.tags) {
        a.tags
          .split(/[,，、;；|]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((t) => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let result = assets;

    if (selectedFilterTags.length > 0) {
      result = result.filter((a) => {
        if (!a.tags) return false;
        const assetTags = a.tags
          .split(/[,，、;；|]/)
          .map((t) => t.trim().toLowerCase());
        return selectedFilterTags.every((t) =>
          assetTags.includes(t.toLowerCase()),
        );
      });
    }

    if (!searchTerm.trim()) return result;

    const isExactMatch = searchTerm.includes("+");

    if (isExactMatch) {
      const queries = searchTerm
        .split("+")
        .map((q) => q.trim().toLowerCase())
        .filter(Boolean);
      return result.filter((a) => {
        const searchableFields = [
          a.title,
          a.tags,
          a.styleEffect,
          a.lightingAngle,
          a.subjectPose,
          a.colorVibe,
          a.backgroundSpace,
          a.propsInteraction,
          a.actionDetails,
          a.outfitStyle,
          a.specialEffects,
        ].filter(Boolean);

        return queries.every((kw) => {
          return searchableFields.some(
            (f) => f.toLowerCase() === kw || f.toLowerCase().includes(kw),
          );
        });
      });
    }

    // For normal space-separated terms, use native fast text matching
    const queries = searchTerm.trim().split(/\s+/).filter(Boolean);

    return result.filter((a) => {
      const searchableText = [
        a.title,
        a.tags,
        a.styleEffect,
        a.lightingAngle,
        a.subjectPose,
        a.colorVibe,
        a.backgroundSpace,
        a.propsInteraction,
        a.actionDetails,
        a.outfitStyle,
        a.specialEffects,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return queries.every((kw) => searchableText.includes(kw.toLowerCase()));
    });
  }, [assets, searchTerm, selectedFilterTags]);

  const handleQuickCopy = (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    const promptStr = [
      asset.styleEffect,
      asset.lightingAngle,
      asset.subjectPose,
      asset.colorVibe,
      asset.backgroundSpace,
      asset.propsInteraction,
      asset.actionDetails,
      asset.outfitStyle,
      asset.specialEffects,
    ]
      .filter(Boolean)
      .join(", ");
    navigator.clipboard.writeText(
      promptStr +
        " --neg 低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;",
    );
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
    setToastMessage("控制词已成功复制");
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleQuickMirrorCopy = (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    const promptStr = [
      asset.styleEffect,
      asset.lightingAngle,
      asset.subjectPose,
      asset.colorVibe,
      asset.backgroundSpace,
      asset.propsInteraction,
      asset.actionDetails,
      asset.outfitStyle,
      asset.specialEffects,
    ]
      .filter(Boolean)
      .join(", ");
    const fullText =
      promptStr +
      " --neg 低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;";
    navigator.clipboard.writeText(mirrorPrompt(fullText));
    setCopiedId(asset.id + "-mirror");
    setTimeout(() => setCopiedId(null), 2000);
    setToastMessage("控制词镜像复制成功");
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleToggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleComboLock = (asset: Asset, keys: string[]) => {
    setLockedFields((prev) => {
      const next = { ...prev };
      const allLocked = keys.every((k) => {
        const val = asset[k as keyof Asset] as string;
        if (!val) return true;
        return next[k]?.assetId === asset.id;
      });

      if (allLocked) {
        keys.forEach((k) => {
          if (next[k]?.assetId === asset.id) delete next[k];
        });
      } else {
        keys.forEach((k) => {
          const val = asset[k as keyof Asset] as string;
          if (val) next[k] = { value: val, assetId: asset.id };
        });
      }
      return next;
    });
  };

  const toggleLockFromCard = (asset: Asset, key: string, value: string) => {
    setLockedFields((prev) => {
      const next = { ...prev };
      const isLocked = next[key]?.assetId === asset.id;
      if (isLocked) {
        delete next[key];

        // Unlock cascades if they were linked to this same asset
        if (key === "subjectPose") {
          if (next["actionDetails"]?.assetId === asset.id)
            delete next["actionDetails"];
          if (next["propsInteraction"]?.assetId === asset.id)
            delete next["propsInteraction"];
          if (next["outfitStyle"]?.assetId === asset.id)
            delete next["outfitStyle"];
        }
        if (key === "styleEffect") {
          if (next["colorVibe"]?.assetId === asset.id) delete next["colorVibe"];
          if (next["specialEffects"]?.assetId === asset.id)
            delete next["specialEffects"];
          if (next["lightingAngle"]?.assetId === asset.id)
            delete next["lightingAngle"];
        }
      } else {
        next[key] = { value, assetId: asset.id };

        // Lock cascades, BUT ONLY IF NOT ALREADY LOCKED
        if (key === "subjectPose") {
          if (!prev["actionDetails"] && asset.actionDetails)
            next["actionDetails"] = {
              value: asset.actionDetails,
              assetId: asset.id,
            };
          if (!prev["propsInteraction"] && asset.propsInteraction)
            next["propsInteraction"] = {
              value: asset.propsInteraction,
              assetId: asset.id,
            };
          if (!prev["outfitStyle"] && asset.outfitStyle)
            next["outfitStyle"] = {
              value: asset.outfitStyle,
              assetId: asset.id,
            };
        }
        if (key === "styleEffect") {
          if (!prev["colorVibe"] && asset.colorVibe)
            next["colorVibe"] = { value: asset.colorVibe, assetId: asset.id };
          if (!prev["specialEffects"] && asset.specialEffects)
            next["specialEffects"] = {
              value: asset.specialEffects,
              assetId: asset.id,
            };
          if (!prev["lightingAngle"] && asset.lightingAngle)
            next["lightingAngle"] = {
              value: asset.lightingAngle,
              assetId: asset.id,
            };
        }
      }
      return next;
    });
  };

  const getCombinationsFromPool = () => {
    let pool = assets.filter((a) => selectedIds.has(a.id));
    if (pool.length === 0 && searchTerm.trim()) {
      pool = filteredAssets;
    }
    const simplifiedLockedFields = Object.fromEntries(
      Object.entries(lockedFields).map(([k, v]) => [
        k,
        (v as { value: string }).value,
      ]),
    );
    if (pool.length === 0 && Object.keys(simplifiedLockedFields).length === 0)
      return [];

    const keys = CATEGORIES.map((c) => c.key);
    const results = [];

    for (let i = 0; i < Math.max(1, generateCount); i++) {
      const comb: any = {};
      const refImageSet = new Set<string>();
      const englishTranslations: Record<string, string> = {};
      let titleTokens: string[] = [];

      keys.forEach((k) => {
        if (lockedFields[k]) {
          const lockedAsset = assets.find(
            (a) => a.id === lockedFields[k].assetId,
          );
          comb[k] = lockedFields[k].value;
          if (lockedAsset) {
            if (
              lockedAsset.englishTranslations &&
              lockedAsset.englishTranslations[k]
            ) {
              englishTranslations[k] = lockedAsset.englishTranslations[k];
            }
            if (lockedAsset.id) {
              refImageSet.add(lockedAsset.id);
            }
            if (lockedAsset.title) titleTokens.push(lockedAsset.title);
          }
        } else {
          const validAssets = pool.filter((a) => !!a[k as keyof Asset]);
          if (validAssets.length > 0) {
            const randomAsset =
              validAssets[Math.floor(Math.random() * validAssets.length)];
            comb[k] = randomAsset[k as keyof Asset];
            if (
              randomAsset.englishTranslations &&
              randomAsset.englishTranslations[k]
            ) {
              englishTranslations[k] = randomAsset.englishTranslations[k];
            }
            if (randomAsset.id) {
              refImageSet.add(randomAsset.id);
            }
            if (randomAsset.title) titleTokens.push(randomAsset.title);
          }
        }
      });
      comb.englishTranslations = englishTranslations;
      comb.referenceImages = Array.from(refImageSet);
      comb.title =
        titleTokens.length > 0
          ? "组合: " + Array.from(new Set(titleTokens)).slice(0, 2).join(" + ")
          : "本地快速组合";
      comb.tags = "本地快速生成";
      results.push(comb);
    }
    return results;
  };

  const handleGenerate = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (
      !searchTerm.trim() &&
      selectedIds.size === 0 &&
      Object.keys(lockedFields).length === 0
    )
      return alert("请先选中、搜索一些图片或锁定架构作为素材池。");

    setIsGenerating(true);
    try {
      let rawNewItems;
      const combinations = getCombinationsFromPool();
      const simplifiedLockedFields = Object.fromEntries(
        Object.entries(lockedFields).map(([k, v]) => [
          k,
          (v as { value: string }).value,
        ]),
      );

      const isFastPath =
        !modificationRequest.trim() &&
        outfitChangeType === "none" &&
        combinations.length > 0;

      if (isFastPath) {
        rawNewItems = combinations;
      } else if (combinations.length > 0) {
        rawNewItems = await generatePromptsFromCombinations(
          combinations,
          modificationRequest,
          aiConfig,
          simplifiedLockedFields,
          outfitChangeType,
        );
      } else {
        // Fallback for purely text-based generation without ANY combinations
        rawNewItems = await generateNewPrompts(
          searchTerm,
          modificationRequest,
          generateCount,
          {},
          aiConfig,
          simplifiedLockedFields,
          outfitChangeType,
        );
        const lockedAssetIds = new Set<string>();
        Object.values(lockedFields).forEach((f) => {
          if ((f as any).assetId) lockedAssetIds.add((f as any).assetId);
        });
        const refImages = Array.from(lockedAssetIds);
        const rawNewItemsArray = Array.isArray(rawNewItems)
          ? rawNewItems
          : [rawNewItems];
        rawNewItemsArray.forEach((item) => {
          if (!item.referenceImages) item.referenceImages = refImages;
        });
        rawNewItems = rawNewItemsArray;
      }

      const newItemsArray = Array.isArray(rawNewItems)
        ? rawNewItems
        : [rawNewItems];

      const parsedAssets: Asset[] = newItemsArray.map(
        (item: any, i: number) => ({
          id: uuidv4(),
          title: item.title || "生成组合",
          styleEffect: item.styleEffect || "",
          lightingAngle: item.lightingAngle || "",
          subjectPose: item.subjectPose || "",
          colorVibe: item.colorVibe || "",
          backgroundSpace: item.backgroundSpace || "",
          propsInteraction: item.propsInteraction || "",
          actionDetails: item.actionDetails || "",
          outfitStyle: item.outfitStyle || "",
          specialEffects: item.specialEffects || "",
          englishTranslations: item.englishTranslations || {},
          referenceImages: item.referenceImages || [],
          imageUrl: "",
          tags: item.tags || "Generated",
          modelVendor: isFastPath ? undefined : getModelVendorString(aiConfig),
          createdAt: Date.now() - i,
        }),
      );

      setGeneratedPrompts((prev) => [...parsedAssets, ...prev]);
      setViewMode("results");
    } catch (e: any) {
      setApiError(e.message || String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyGenerated = (asset: Asset) => {
    const promptStr = CATEGORIES.map((c) =>
      language === "en"
        ? asset.englishTranslations?.[c.key] || asset[c.key as keyof Asset]
        : asset[c.key as keyof Asset],
    )
      .filter(Boolean)
      .join(", ");
    navigator.clipboard.writeText(
      promptStr +
        " --neg 低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;",
    );
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyGeneratedMirror = (asset: Asset) => {
    const promptStr = CATEGORIES.map((c) =>
      language === "en"
        ? asset.englishTranslations?.[c.key] || asset[c.key as keyof Asset]
        : asset[c.key as keyof Asset],
    )
      .filter(Boolean)
      .join(", ");
    const fullText =
      promptStr +
      " --neg 低分辨率, 模糊, 背景杂乱, 畸形,collage, grid, split screen, multiple views, multiple angles, triptych, photobooth grid, repeating patterns, a pair of shoes, collection sheet;";
    navigator.clipboard.writeText(mirrorPrompt(fullText));
    setCopiedId(asset.id + "-mirror");
        setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDepthMap = async (asset) => {
    const promptFields = CATEGORIES.map((c) => {
      const val = asset[c.key];
      return val ? "[" + c.label + ": " + val + "]" : "";
    }).filter(Boolean).join("，");
   const pairId = uuidv4();
    const galleryToReverseKeyMap = {
      styleEffect: 'styleAndEffect',
      lightingAngle: 'lightingAndCamera',
      subjectPose: 'subjectAndPose',
      colorVibe: 'primaryColorsAndAtmosphere',
      backgroundSpace: 'backgroundAndSpace',
      propsInteraction: 'propsAndInteraction',
      actionDetails: 'actionAndDetails',
      outfitStyle: 'outfitAndStyle',
      specialEffects: 'specialEffects',
    };
    const newPair = {
      id: pairId,
      imageUrl: asset.imageUrl,
      imageName: asset.title || "深度图",
      prompt: promptFields,
      structuredPrompt: Object.fromEntries(
        CATEGORIES.map((c) => {
          const val = asset[c.key];
          if (!val) return null;
          return [galleryToReverseKeyMap[c.key] || c.key, val];
        }).filter(Boolean)
      ),
      styleName: asset.styleEffect || "",
      isUrlImport: true,
      isProcessingDepth: true,
      activeView: "original",
    };

    setReversePromptPairs((prev) => [newPair, ...prev]);
    onOpenReverse?.();

    try {
      setDepthMapLoading((prev) => ({ ...prev, [asset.id]: true }));
      const resp = await fetch(asset.imageUrl);
      const blob = await resp.blob();
      const b64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const depthResp = await fetch("/api/depth-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, modelPath: aiConfig.depthModelPath }),
      });
      const data = await depthResp.json();
      if (data.success && data.depthMapUrl) {
        setReversePromptPairs((prev) =>
          prev.map((p) =>
            p.id === pairId ? { ...p, depthMapUrl: data.depthMapUrl, activeView: "depth", isProcessingDepth: false } : p
          )
        );
        setDepthMapUrls((prev) => ({ ...prev, [asset.id]: data.depthMapUrl }));
        setDepthMapAssetId(asset.id);
      } else {
        setReversePromptPairs((prev) =>
          prev.map((p) =>
            p.id === pairId ? { ...p, prompt: "深度图生成失败: " + (data.error || "未知错误"), isProcessingDepth: false } : p
          )
        );
      }
    } catch (err) {
      setReversePromptPairs((prev) =>
        prev.map((p) =>
          p.id === pairId ? { ...p, prompt: "深度图生成失败: " + (err.message || err), isProcessingDepth: false } : p
        )
      );
    } finally {
      setDepthMapLoading((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#FCFBF9] font-serif overflow-hidden relative">
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-[#1E1E1E] text-white px-6 py-3 rounded-none shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-sm font-sans tracking-wide">
            {toastMessage}
          </span>
        </div>
      )}
      <input
        type="file"
        accept=".csv"
        className="hidden"
        ref={fileInputRef}
        onChange={handleImportCsv}
      />

      {/* Static Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between items-start gap-4 px-4 sm:px-6 pt-5 pb-3 border-b border-[#F0F0F0] bg-[#FCFBF9] z-[60] w-full shrink-0 relative">
        <div className="flex items-center flex-wrap gap-3">
          {viewMode === "results" ? (
            <>
              <button
                onClick={() => setViewMode("gallery")}
                className="flex items-center text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors py-1.5 px-3 -ml-3 bg-transparent rounded-none hover:bg-gray-50 border border-transparent"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回图库
              </button>
              <h1 className="text-xl font-medium text-[#1E1E1E] flex items-center tracking-tight">
                矩阵构建结果
              </h1>
              <button
                onClick={exportResultAssetsCSV}
                className="flex items-center text-xs ml-4 px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#1E1E1E] hover:bg-gray-50 transition-colors rounded-none"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> 导出表格
              </button>
          <button onClick={() => setGeneratedPrompts([])} className="flex items-center text-xs ml-2 px-3 py-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors rounded-none"><RefreshCw className="w-3.5 h-3.5 mr-1" /> 清空全部</button>
            </>
          ) : viewMode === "moodboard" ? (
            <>
              <button
                onClick={() => setViewMode("gallery")}
                className="flex items-center text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors py-1.5 px-3 -ml-3 bg-transparent rounded-none hover:bg-gray-50 border border-transparent"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回图库
              </button>
              <h1 className="text-xl font-medium text-[#1E1E1E] flex items-center tracking-tight">
                情绪板 Moodboard
              </h1>
            </>
          ) : (
            <div className="flex items-end gap-3">
              <h1 className="text-xl font-medium text-[#1E1E1E] flex items-center tracking-tight">
                辞谱 Lexicona
              </h1>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {viewMode === "gallery" && generatedPrompts.length > 0 && (
            <button
              onClick={() => setViewMode("results")}
              className="flex items-center justify-center px-4 py-1.5 bg-[#F5F5F5] text-[#1E1E1E] hover:bg-[#EAEAEA] transition-all text-[13px] font-sans mr-2 font-medium"
            >
              查看结果 ({generatedPrompts.length})
            </button>
          )}
          <GadgetMenu />
          {viewMode !== "moodboard" && (
            <button
              onClick={handleOpenMoodboard}
              title="情绪板 Moodboard"
              className="flex items-center justify-center px-2.5 py-1.5 text-xs font-sans font-medium bg-transparent text-[#7A7A7A] hover:text-[#1E1E1E] transition-all"
            >
              <Palette className="w-4 h-4 mr-1.5" /> 情绪板
            </button>
          )}
          <button
            onClick={onOpenReverse}
            title="反推解析"
            className="flex items-center justify-center px-2.5 py-1.5 text-xs font-sans font-medium bg-transparent text-[#7A7A7A] hover:text-[#1E1E1E] transition-all"
          >
            <Sparkles className="w-4 h-4 mr-1.5" /> 反推解析
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="设置"
            className="flex items-center justify-center px-2.5 py-1.5 text-xs font-sans font-medium bg-transparent text-[#7A7A7A] hover:text-[#1E1E1E] transition-all"
          >
            <Settings className="w-4 h-4 mr-1.5" /> 设置
          </button>
          
        </div>
      </div>

      {/* Main Workspace Area (Gallery OR Results) */}
     <div className="flex-1 bg-transparent relative flex flex-col min-h-0 overflow-hidden">
       {viewMode === "moodboard" ? (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <MoodboardView />
          </div>
       ) : (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative">
            <div className="max-w-[1600px] mx-auto flex flex-col min-h-full p-4 sm:px-6 pb-20">
              {/* Results Workspace */}
              {viewMode === "results" ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  <div className="grid grid-cols-1 xl:grid-cols-2 3xl:grid-cols-3 gap-6 pb-12 auto-rows-max">
                    {generatedPrompts.map((asset, index) => (
                      <div
                        key={asset.id}
                        className={`bg-white border p-4 relative group transition-all flex h-full rounded-none gap-4 items-stretch ${asset.title.includes("(卸装)") ? "border-amber-300 hover:border-amber-500 shadow-sm bg-amber-50/10" : "border-[#E0E0E0] hover:border-[#1E1E1E]"}`}
                      >
                        {/* References or Generated Image Column */}
                        {(asset.imageUrl ||
                          (asset.referenceImages &&
                            asset.referenceImages.length > 0)) && (
                          <div className="w-[110px] sm:w-[150px] shrink-0 flex flex-col gap-1 relative overflow-hidden">
                            {asset.imageUrl ? (
                              <div
                                className="flex-1 border border-[#E0E0E0] bg-[#F5F5F5] overflow-hidden flex items-center justify-center p-1 cursor-zoom-in relative group/img"
                                onClick={() =>
                                  setFullscreenImage(asset.imageUrl!)
                                }
                              >
                                <img
                                  src={asset.imageUrl}
                                  alt="Generated"
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                  <ZoomIn className="w-5 h-5 text-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 gap-1 pb-1">
                                  {asset.referenceImages!.map(
                                    (idOrUrl, idx) => {
                                      const src =
                                        assets.find((a) => a.id === idOrUrl)
                                          ?.imageUrl || idOrUrl;
                                      return (
                                        <div
                                          key={idx}
                                          className="aspect-[3/4] relative border border-[#E0E0E0] bg-[#F5F5F5] overflow-hidden"
                                        >
                                          <GalleryImage src={src} alt="" />
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="text-[10px] text-center mt-1 text-[#A3A3A3] font-sans tracking-widest shrink-0">
                              {asset.imageUrl ? "生成结果图" : "引用图片"}
                            </div>
                          </div>
                        )}

                        {/* Matrix Column */}
                        <div className="flex-1 flex flex-col min-w-0 relative">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2 pr-48 min-w-0 w-full">
                              <h3
                                className="text-lg font-medium text-[#1E1E1E] leading-snug truncate"
                                title={asset.title}
                              >
                                {asset.title.replace(" (卸装)", "")}
                              </h3>
                              {asset.title.includes("(卸装)") && (
                                <span className="shrink-0 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-medium tracking-wider whitespace-nowrap">
                                  卸装修改后
                                </span>
                              )}
                              {asset.modelVendor && (
                                <span className="shrink-0 bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 text-xs font-medium tracking-wider whitespace-nowrap">
                                  {asset.modelVendor}
                                </span>
                              )}
                            </div>
                            <div className="absolute top-0 right-0 flex gap-1 sm:gap-2 bg-white pl-2">
                              <div className="relative flex items-stretch group/undress">
                                <button
                                  disabled={undressingAssets[asset.id]}
                                  className="flex items-center px-2 py-1.5 text-xs font-medium font-sans border bg-white border-[#E0E0E0] hover:bg-gray-50 text-[#7A7A7A] group-hover/undress:text-[#1E1E1E] disabled:opacity-50"
                                  title="一键卸装"
                                >
                                  {undressingAssets[asset.id] ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Shirt className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <div className="absolute top-full right-0 pt-[2px] w-[75px] z-50 opacity-0 invisible group-hover/undress:opacity-100 group-hover/undress:visible transition-all duration-150">
                                  <div className="bg-white border border-[#E0E0E0] shadow-xl flex flex-col py-1">
                                    <button
                                      onClick={() =>
                                        handleUndressGenerated(asset, "top")
                                      }
                                      className="px-2 py-1.5 text-[11px] text-center font-sans tracking-wide hover:bg-gray-100 text-[#5A5A5A] hover:text-[#1E1E1E] transition-colors border-b border-white/50"
                                    >
                                      卸衣服
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUndressGenerated(asset, "bottom")
                                      }
                                      className="px-2 py-1.5 text-[11px] text-center font-sans tracking-wide hover:bg-gray-100 text-[#5A5A5A] hover:text-[#1E1E1E] transition-colors border-b border-white/50"
                                    >
                                      卸裤子
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUndressGenerated(asset, "shoes")
                                      }
                                      className="px-2 py-1.5 text-[11px] text-center font-sans tracking-wide hover:bg-gray-100 text-[#5A5A5A] hover:text-[#1E1E1E] transition-colors"
                                    >
                                      卸鞋子
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUndressGenerated(asset, "set")
                                      }
                                      className="px-2 py-1.5 text-[11px] text-center font-sans tracking-wide hover:bg-[#1E1E1E] hover:text-white text-[#1E1E1E] font-medium transition-colors border-t border-[#EAEAEA]"
                                    >
                                      卸全套
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  setGeneratedPrompts((prev) =>
                                    prev.filter((a) => a.id !== asset.id),
                                  )
                                }
                                title="删除"
                                className="flex items-center px-2 py-1.5 text-xs font-medium font-sans transition-colors rounded-none border bg-white border-[#E0E0E0] text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCopyGenerated(asset)}
                                className={`flex items-center px-3 py-1.5 text-xs font-medium font-sans transition-colors rounded-none border ${copiedId === asset.id ? "bg-[#1E1E1E] text-white border-[#1E1E1E]" : "bg-white border-[#E0E0E0] text-[#7A7A7A] hover:bg-gray-50 hover:text-[#1E1E1E]"}`}
                              >
                                {copiedId === asset.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 mr-1" />{" "}
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 mr-1" /> 复制
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDepthMap(asset)}
                                disabled={depthMapLoading[asset.id]}
                                title="获取深度图"
                                className={`flex items-center px-3 py-1.5 text-xs font-medium font-sans transition-colors rounded-none border ${depthMapUrls[asset.id] && depthMapAssetId === asset.id ? "bg-[#1E1E1E] text-white border-[#1E1E1E]" : "bg-white border-[#E0E0E0] text-[#7A7A7A] hover:bg-gray-50 hover:text-[#1E1E1E]"}`}
                              >
                                {depthMapLoading[asset.id] ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> 深度计算中
                                  </>
                                ) : depthMapUrls[asset.id] && depthMapAssetId === asset.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 mr-1" /> 深度图
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 mr-1" /> 获取深度图
                                  </>
                                )}
                              </button>
                                                          </div>
                          </div>

                          <div className="grid grid-cols-3 gap-[1px] bg-[#E0E0E0] border border-[#E0E0E0] mt-auto">
                            {CATEGORIES.map((item) => {
                              const val =
                                language === "en"
                                  ? asset.englishTranslations?.[item.key] ||
                                    (asset[item.key as keyof Asset] as string)
                                  : (asset[item.key as keyof Asset] as string);
                              if (!val)
                                return (
                                  <div
                                    key={item.key}
                                    className="bg-white p-1.5 flex flex-col opacity-40"
                                  >
                                    <div className="text-[#A3A3A3] text-[9px] tracking-wider mb-1 line-clamp-1">
                                      {item.label}
                                    </div>
                                    <span className="text-[10px] text-[#A3A3A3]">
                                      -
                                    </span>
                                  </div>
                                );
                              return (
                                <div
                                  key={item.key}
                                  className="bg-[#FAFAFA] p-1.5 hover:bg-white transition-colors flex flex-col"
                                >
                                  <div className="text-[#1E1E1E] text-[9px] mb-1 line-clamp-1">
                                    {item.label}
                                  </div>
                                  <div
                                    className="text-[#4A4A4A] text-[10px] leading-tight font-sans line-clamp-2"
                                    title={val}
                                  >
                                    {val}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Gallery Workspace */
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pt-4 pb-32">
                    {filteredAssets.map((asset) => {
                      const isSelected = selectedIds.has(asset.id);
                      return (
                        <div
                          key={asset.id}
                          onClick={() => setSelectedAsset(asset)}
                          className={`group cursor-pointer bg-[#FAFAFA] overflow-hidden transition-all duration-300 flex flex-col relative
                               ${isSelected ? "ring-2 ring-[#1E1E1E] ring-offset-2" : ""}`}
                        >
                          <div
                            onClick={(e) => handleToggleSelection(asset.id, e)}
                            className={`absolute top-3 right-3 w-6 h-6 border flex items-center justify-center z-20 transition-colors rounded-none
                                 ${isSelected ? "bg-[#1E1E1E] border-[#1E1E1E] text-white" : "opacity-0 group-hover:opacity-100 bg-black/20 border-white/40 text-transparent hover:bg-black/40 backdrop-blur-sm"}`}
                          >
                            <Check className="w-4 h-4" />
                          </div>

                          {isSelected &&
                            (() => {
                              const checkLock = (keys: string[]) => {
                                const validKeys = keys.filter(
                                  (k) => asset[k as keyof Asset],
                                );
                                return (
                                  validKeys.length > 0 &&
                                  validKeys.every(
                                    (k) =>
                                      lockedFields[k]?.assetId === asset.id,
                                  )
                                );
                              };
                              const isEnvLocked = checkLock([
                                "backgroundSpace",
                                "lightingAngle",
                              ]);
                              const isStyleLocked = checkLock([
                                "styleEffect",
                                "colorVibe",
                                "specialEffects",
                              ]);
                              const isSubjectLocked = checkLock([
                                "subjectPose",
                                "outfitStyle",
                                "propsInteraction",
                                "actionDetails",
                              ]);

                              const isAnyLocked = CATEGORIES.some(
                                (c) =>
                                  asset[c.key as keyof Asset] &&
                                  lockedFields[c.key]?.assetId === asset.id,
                              );

                              return (
                                <div
                                  className="absolute top-3 left-3 flex gap-1.5 z-20"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    className={`w-6 h-6 border flex items-center justify-center transition-colors backdrop-blur-sm rounded-none cursor-pointer group/droplock ${isAnyLocked ? "bg-[#1E1E1E] border-[#1E1E1E] text-white" : "bg-black/20 border-white/40 text-white hover:bg-black/40"}`}
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    <div className="absolute top-full left-0 mt-1 w-24 bg-white/95 backdrop-blur-md border border-[#E0E0E0] shadow-sm opacity-0 invisible group-hover/droplock:opacity-100 group-hover/droplock:visible transition-all duration-200 z-30">
                                      <div className="py-1 flex flex-col">
                                        {CATEGORIES.map((c) => {
                                          const val = asset[
                                            c.key as keyof Asset
                                          ] as string;
                                          if (!val) return null;
                                          const isLocked =
                                            lockedFields[c.key]?.assetId ===
                                            asset.id;
                                          return (
                                            <div
                                              key={c.key}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLockFromCard(
                                                  asset,
                                                  c.key,
                                                  val,
                                                );
                                              }}
                                              className={`flex justify-between items-center px-3 py-1.5 cursor-pointer transition-colors ${
                                                isLocked
                                                  ? "bg-[#1E1E1E] text-white"
                                                  : "hover:bg-[#F5F5F5] text-[#4A4A4A]"
                                              }`}
                                            >
                                              <span className="text-[11px] tracking-wide leading-none font-medium">
                                                {c.label}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>

                                  <div
                                    className={`w-6 h-6 border flex items-center justify-center transition-colors backdrop-blur-sm rounded-none cursor-pointer shadow-sm ${isEnvLocked ? "bg-white border-white text-black" : "bg-black/20 border-white/40 text-white hover:bg-black/40"}`}
                                    title="锁定环境与视角 (背景与空间、光影与视角)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleComboLock(asset, [
                                        "backgroundSpace",
                                        "lightingAngle",
                                      ]);
                                    }}
                                  >
                                    <Camera className="w-3 h-3" />
                                  </div>
                                  <div
                                    className={`w-6 h-6 border flex items-center justify-center transition-colors backdrop-blur-sm rounded-none cursor-pointer shadow-sm ${isStyleLocked ? "bg-white border-white text-black" : "bg-black/20 border-white/40 text-white hover:bg-black/40"}`}
                                    title="锁定风格与色彩 (风格与效果、主色与氛围、特效与后期)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleComboLock(asset, [
                                        "styleEffect",
                                        "colorVibe",
                                        "specialEffects",
                                      ]);
                                    }}
                                  >
                                    <Palette className="w-3 h-3" />
                                  </div>
                                  <div
                                    className={`w-6 h-6 border flex items-center justify-center transition-colors backdrop-blur-sm rounded-none cursor-pointer shadow-sm ${isSubjectLocked ? "bg-white border-white text-black" : "bg-black/20 border-white/40 text-white hover:bg-black/40"}`}
                                    title="锁定主体与互动 (主体与姿态、服装与造型、道具与交互、动作与细节)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleComboLock(asset, [
                                        "subjectPose",
                                        "outfitStyle",
                                        "propsInteraction",
                                        "actionDetails",
                                      ]);
                                    }}
                                  >
                                    <User className="w-3 h-3" />
                                  </div>
                                </div>
                              );
                            })()}

                          <div className="aspect-[3/4] bg-[#F0F0F0] flex items-center justify-center relative overflow-hidden group-hover:opacity-90 transition-opacity">
                            <GalleryImage
                              src={asset.imageUrl}
                              alt={asset.title}
                            />

                            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end">
                              <span className="text-white/90 text-xs line-clamp-2 leading-relaxed font-sans drop-shadow-md mb-2">
                                {[
                                  asset.styleEffect,
                                  asset.subjectPose,
                                  asset.backgroundSpace,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              <div className="flex justify-between items-center">
                                <span className="text-white/80 text-[11px] tracking-wider drop-shadow-md truncate max-w-[50%]">
                                  {asset.title}
                                </span>
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={(e) => handleQuickCopy(e, asset)}
                                    className={`flex items-center justify-center transition-colors w-7 h-7 rounded ${copiedId === asset.id ? "bg-green-600 text-white" : "text-white/90 bg-black/40 hover:bg-black/80"}`}
                                    title="快速复制提取架构"
                                  >
                                    {copiedId === asset.id ? (
                                      <Check className="w-4 h-4" />
                                    ) : (
                                      <Copy className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDepthMap(asset); }}
                                    disabled={depthMapLoading[asset.id]}
                                    className={`flex items-center justify-center transition-colors w-7 h-7 rounded ${depthMapUrls[asset.id] && depthMapAssetId === asset.id ? "bg-green-600 text-white" : "text-white/90 bg-black/40 hover:bg-black/80"}`}
                                    title="获取深度图"
                                  >
                                    {depthMapLoading[asset.id] ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : depthMapUrls[asset.id] && depthMapAssetId === asset.id ? (
                                      <Check className="w-4 h-4" />
                                    ) : (
                                      <Send className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredAssets.length === 0 && (
                      <div className="col-span-full py-32 text-center text-[#A3A3A3] text-sm flex flex-col items-center justify-center font-sans tracking-wide">
                        <FilterX className="w-10 h-10 mb-4 opacity-20" />
                        未找到对应的图库素材。
                        <br />
                        请尝试导入 CSV，或调整搜索词。
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {viewMode !== "moodboard" && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex justify-center w-full max-w-[95vw] sm:max-w-max">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-[#E0E0E0] flex items-stretch p-1.5 gap-1.5 sm:gap-2 h-[52px] transition-all">
            {viewMode === "gallery" && (
              <div
                className="relative flex items-center shrink-0 h-full px-3 cursor-pointer group hover:bg-[#EAEAEA] transition-colors border-r border-transparent hover:border-[#E0E0E0] bg-[#F5F5F5]"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagDropdown(!showTagDropdown);
                }}
              >
                <Tag className="w-4 h-4 text-[#7A7A7A] group-hover:text-[#1E1E1E] transition-colors" />
                {selectedFilterTags.length > 0 && (
                  <span className="ml-1.5 text-[11px] font-medium bg-[#1E1E1E] text-white px-1.5 py-0.5">
                    {selectedFilterTags.length}
                  </span>
                )}

                {showTagDropdown && (
                  <div
                    className="absolute bottom-[calc(100%+0.5rem)] left-0 w-72 bg-white/95 backdrop-blur-md border border-[#E0E0E0] shadow-xl z-50 p-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[11px] font-sans font-medium text-[#7A7A7A] mb-3 uppercase tracking-wider">
                      标签筛选
                    </div>
                    <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                      {allTags.length === 0 ? (
                        <span className="text-xs text-[#A3A3A3] italic w-full text-center py-2">
                          暂无可用标签
                        </span>
                      ) : (
                        (() => {
                          const sceneTypeTags = [
                            "模特类",
                            "静物类",
                            "局部类",
                            "棚拍类",
                          ];
                          const sceneControlTags = [
                            "纯色背景",
                            "真实场景",
                            "影棚布景",
                            "CG/合成感",
                            "明亮高调",
                            "暗调氛围",
                            "强对比光",
                            "柔和漫射光",
                            "饱和",
                            "低饱和",
                            "暖色氛围",
                            "冷色氛围",
                          ];

                          const types = allTags
                            .filter((t) => sceneTypeTags.includes(t))
                            .sort(
                              (a, b) =>
                                sceneTypeTags.indexOf(a) -
                                sceneTypeTags.indexOf(b),
                            );
                          const controls = allTags
                            .filter((t) => sceneControlTags.includes(t))
                            .sort(
                              (a, b) =>
                                sceneControlTags.indexOf(a) -
                                sceneControlTags.indexOf(b),
                            );
                          const others = allTags.filter(
                            (t) =>
                              !sceneTypeTags.includes(t) &&
                              !sceneControlTags.includes(t),
                          );

                          const renderTag = (tag: string) => {
                            const isSelected = selectedFilterTags.includes(tag);
                            return (
                              <button
                                key={tag}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isSelected) {
                                    setSelectedFilterTags((prev) =>
                                      prev.filter((t) => t !== tag),
                                    );
                                  } else {
                                    setSelectedFilterTags((prev) => [
                                      ...prev,
                                      tag,
                                    ]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-[11px] transition-colors font-sans border rounded-sm outline-none focus:outline-none ${isSelected ? "bg-[#1E1E1E] text-white border-[#1E1E1E]" : "bg-white text-[#4A4A4A] border-[#E0E0E0] hover:border-[#1E1E1E]"}`}
                              >
                                {tag}
                              </button>
                            );
                          };

                          return (
                            <div className="flex flex-col gap-3 w-full">
                              {types.length > 0 && (
                                <div className="flex flex-col gap-1.5 border-b border-[#F0F0F0] pb-2">
                                  <div className="text-[10px] text-[#A3A3A3] font-medium tracking-wide">
                                    画面类型
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {types.map(renderTag)}
                                  </div>
                                </div>
                              )}
                              {controls.length > 0 && (
                                <div className="flex flex-col gap-1.5 border-b border-[#F0F0F0] pb-2">
                                  <div className="text-[10px] text-[#A3A3A3] font-medium tracking-wide">
                                    画面控制
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {controls.map(renderTag)}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                    {selectedFilterTags.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFilterTags([]);
                          }}
                          className="text-[11px] text-[#A3A3A3] hover:text-[#1E1E1E] transition-colors"
                        >
                          清除选中
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {viewMode === "gallery" && (
              <div className="flex items-center shrink-0 min-w-[200px] sm:min-w-[240px] px-3 bg-[#F5F5F5] hover:bg-[#EAEAEA] focus-within:bg-[#EAEAEA] focus-within:ring-1 focus-within:ring-[#1E1E1E] transition-all cursor-text relative group">
                <Search className="w-3.5 h-3.5 text-[#7A7A7A] shrink-0 mr-2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="空格分词 +号精确"
                  className="w-full bg-transparent text-[#1E1E1E] text-[13px] border-none focus:ring-0 p-0 outline-none placeholder-[#A3A3A3] font-sans h-full"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGenerate(e);
                  }}
                />
                {filteredAssets.length > 0 && searchInput.trim() && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#A3A3A3] font-medium bg-white px-1.5 shadow-sm border border-[#E0E0E0]">
                    {filteredAssets.length}
                  </span>
                )}
              </div>
            )}

            {viewMode === "gallery" && (
              <div className="w-[1px] bg-[#E0E0E0] mx-0.5 my-1"></div>
            )}

            {selectedIds.size > 0 && (
              <div
                onClick={() => setSelectedIds(new Set())}
                className="px-3 shrink-0 flex items-center text-[12px] font-medium text-[#1E1E1E] bg-[#F5F5F5] border border-transparent hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer group"
                title="清空选中的素材池"
              >
                <span className="bg-[#1E1E1E] group-hover:bg-red-600 text-white text-[11px] px-1.5 py-0.5 mr-2 transition-colors flex items-center justify-center min-w-[20px]">
                  <span className="group-hover:hidden">{selectedIds.size}</span>
                  <X className="w-3 h-3 hidden group-hover:block" />
                </span>
                作为池
              </div>
            )}

            {Object.keys(lockedFields).length > 0 && (
              <div
                className="flex items-center px-3 border border-[#1E1E1E] bg-[#1E1E1E] text-white tracking-wide text-[12px] font-medium cursor-pointer hover:bg-black transition-colors group relative shrink-0"
                onClick={() => setLockedFields({})}
              >
                <Lock className="w-3 h-3 mr-1.5" />
                锁定 {Object.keys(lockedFields).length}
                <X className="w-3 h-3 ml-1.5 opacity-60 hover:opacity-100" />
                <div className="absolute bottom-full left-0 mb-4 hidden group-hover:block bg-[#1E1E1E] text-white text-[11px] p-2 whitespace-nowrap shadow-lg">
                  {CATEGORIES.filter((c) => lockedFields[c.key])
                    .map((c) => c.label)
                    .join("、")}
                  <div className="absolute -bottom-1 left-4 w-2 h-2 bg-[#1E1E1E] rotate-45"></div>
                </div>
              </div>
            )}

            <div className="flex items-center px-2.5 bg-[#F5F5F5] hover:bg-[#EAEAEA] focus-within:bg-[#EAEAEA] focus-within:ring-1 focus-within:ring-[#1E1E1E] transition-all shrink-0 cursor-text">
              <span className="text-[11px] text-[#7A7A7A] mr-1.5 font-sans font-medium">
                生成
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                value={generateCount}
                onChange={(e) => {
                  let val = Number(e.target.value);
                  if (val > 1000) val = 1000;
                  setGenerateCount(val);
                }}
                className="bg-transparent border-none outline-none text-[13px] text-[#1E1E1E] font-medium p-0 text-center w-10 z-10 relative selection:bg-black/10"
              />
              <span className="text-[11px] text-[#7A7A7A] ml-1.5 font-sans font-medium">
                项
              </span>
            </div>

            <div className="flex items-center bg-[#F5F5F5] hover:bg-[#EAEAEA] focus-within:bg-[#EAEAEA] focus-within:ring-1 focus-within:ring-[#1E1E1E] transition-all min-w-[200px] sm:min-w-[360px]">
              <input
                type="text"
                placeholder="自定义生成要求 (可选)..."
                value={modificationRequest}
                onChange={(e) => setModificationRequest(e.target.value)}
                className="bg-transparent border-none outline-none font-sans text-[13px] w-full h-full px-3 text-[#1E1E1E] placeholder-[#A3A3A3]"
                onKeyDown={(e) => e.key === "Enter" && handleGenerate(e)}
              />
            </div>

            <div className="flex items-stretch gap-1.5 shrink-0 ml-1">
              <button
                type="button"
                onClick={handleOutfitToggle}
                className={`px-3 flex items-center justify-center transition-all gap-1.5 border ${outfitChangeType !== "none" ? "bg-[#1E1E1E] text-white border-[#1E1E1E]" : "bg-[#FAFAFA] text-[#7A7A7A] border-[#E0E0E0] hover:border-[#1E1E1E] hover:text-[#1E1E1E]"}`}
                title="一键卸装 (点击切换: 衣服/裤子/鞋子/套装)"
              >
                <Shirt className="w-3.5 h-3.5" />
                <span
                  className={`hidden sm:inline text-[12px] font-medium tracking-wide ${outfitChangeType !== "none" ? "text-white" : ""}`}
                >
                  {outfitChangeType === "shoes"
                    ? "卸鞋子"
                    : outfitChangeType === "top"
                      ? "卸衣服"
                      : outfitChangeType === "bottom"
                        ? "卸裤子"
                        : outfitChangeType === "set"
                          ? "卸全套"
                          : "卸装(关)"}
                </span>
              </button>
              <button
                onClick={handleGenerate}
                disabled={
                  isGenerating ||
                  (selectedIds.size === 0 &&
                    !searchTerm.trim() &&
                    Object.keys(lockedFields).length === 0)
                }
                className="px-5 sm:px-6 bg-gradient-to-br from-[#1E1E1E] to-black text-white hover:opacity-90 disabled:opacity-50 disabled:from-[#F5F5F5] disabled:to-[#F5F5F5] disabled:text-[#A3A3A3] text-[13px] font-medium flex items-center justify-center transition-all tracking-widest shadow-md"
              >
                {isGenerating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin sm:mr-1.5" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">
                  {isGenerating ? "生成中..." : "生成组合"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}

      {apiError && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#333130]/40 backdrop-blur-sm p-4 font-serif">
          <div className="bg-white w-full max-w-md flex flex-col shadow-2xl rounded-none relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
            <div className="px-6 py-5 border-b border-[#F0F0F0]">
              <h2 className="text-base font-medium text-[#1E1E1E] flex items-center">
                <Trash2 className="w-4 h-4 mr-2 text-red-500" /> 生成遇到问题
              </h2>
            </div>
            <div className="p-6">
              <p className="text-[13px] text-[#4A4A4A] font-sans leading-relaxed">
                {apiError}
              </p>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setApiError(null)}
                  className="px-6 py-2 bg-[#1E1E1E] hover:bg-black text-white text-sm transition-colors rounded-none font-sans"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Overlay */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <img
            src={fullscreenImage}
            alt="Fullscreen"
            className="max-w-full max-h-full object-contain pointer-events-none"
          />
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenImage(null);
            }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
