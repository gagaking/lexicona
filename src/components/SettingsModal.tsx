import React, { useState, useEffect, useRef } from "react";
import { useAppContext } from "../store";
import {
  AIConfig,
  AIProvider,
  AIModelOption,
  getModelOptions,
  getSelectedModelName,
} from "../types";
import {
  CloudDownload,
  X,
  Save,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Trash2,
  Plus,
} from "lucide-react";
import { parseCSV } from "../services/csvParser";
import { dbStore } from "../lib/db";

const MODEL_FIELDS: Record<AIProvider, keyof AIConfig> = {
  google: "googleModel",
  deepseek: "deepseekModel",
  xiaomi: "xiaomiModel",
};

function ModelManager({
  managing,
  options,
  value,
  onSelect,
  onAdd,
  onDelete,
}: {
  managing: boolean;
  options: AIModelOption[];
  value: string;
  onSelect: (name: string) => void;
  onAdd: (label: string, name: string) => boolean;
  onDelete: (name: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");

  const submitAdd = () => {
    const labelValue = label.trim();
    const nameValue = name.trim();
    if (!labelValue || !nameValue) {
      alert("请填写模型缩写和真实 API 模型名称");
      return;
    }
    if (onAdd(labelValue, nameValue)) {
      setLabel("");
      setName("");
    }
  };

  if (!managing) {
    return (
      <select
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none cursor-pointer transition-colors"
      >
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-2 border border-[#E0E0E0] bg-[#FAFAFA] p-2">
      <div className="space-y-1.5">
        {options.map((option) => (
          <div key={option.name} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(option.name)}
              className={`flex-1 min-w-0 text-left px-2 py-1.5 text-sm border transition-colors ${
                value === option.name
                  ? "border-blue-500 bg-blue-50/50 text-[#1E1E1E]"
                  : "border-[#E0E0E0] bg-white text-[#333130] hover:border-[#A3A3A3]"
              }`}
            >
              <span className="block truncate">{option.label}</span>
              <span className="block truncate text-[10px] text-[#A3A3A3] font-mono">
                {option.name}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(option.name)}
              title="删除模型"
              className="p-2 text-[#A3A3A3] hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {options.length === 0 && (
          <p className="text-xs text-[#A3A3A3] font-sans">暂无模型，请添加。</p>
        )}
      </div>
      <div className="border-t border-[#E0E0E0] pt-2 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="显示缩写，例如 G3.5"
            className="px-2 py-1.5 text-xs border border-[#E0E0E0] bg-white focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="真实 API 完整名称"
            className="px-2 py-1.5 text-xs border border-[#E0E0E0] bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={submitAdd}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#1E1E1E] text-white hover:bg-black transition-colors"
        >
          <Plus className="w-3 h-3" /> 添加模型
        </button>
      </div>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { aiConfig, updateAiConfig, addAssets, clearAllCache, reversePromptPairs, setReversePromptPairs } =
    useAppContext();
  const [formData, setFormData] = useState(aiConfig);
  const [saved, setSaved] = useState(false);
  const [managingProvider, setManagingProvider] = useState<AIProvider | null>(null);
  const [fetchingRemoteConfig, setFetchingRemoteConfig] = useState(false);
  const [downloadingOffline, setDownloadingOffline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const depthFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(aiConfig);
  }, [aiConfig]);

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

  const handleClearReverseCache = async () => {
    if (confirm("确定要清除所有反推解析记录吗？这将只清除反推历史记录，不会影响图库数据。")) {
      setReversePromptPairs([]);
      await dbStore.setReversePromptPairs([]);
      alert("反推记录已清除");
    }
  };

  const handleModelSelect = (provider: AIProvider, name: string) => {
    setFormData({
      ...formData,
      [MODEL_FIELDS[provider]]: name,
    });
  };

  const handleAddModel = (provider: AIProvider, label: string, name: string) => {
    const current = getModelOptions(formData, provider);
    if (current.some((option) => option.name === name)) {
      alert("该 API 模型名称已经存在");
      return false;
    }
    const next = [...current, { label, name }];
    setFormData({
      ...formData,
      modelOptions: {
        ...formData.modelOptions,
        [provider]: next,
      },
      [MODEL_FIELDS[provider]]: name,
    });
    return true;
  };

  const handleDeleteModel = (provider: AIProvider, name: string) => {
    const current = getModelOptions(formData, provider);
    const next = current.filter((option) => option.name !== name);
    const update: any = {
      ...formData,
      modelOptions: {
        ...formData.modelOptions,
        [provider]: next,
      },
    };
    if (update[MODEL_FIELDS[provider]] === name) {
      update[MODEL_FIELDS[provider]] = next[0]?.name || "";
    }
    setFormData(update);
  };

  const handleSave = async () => {
    await updateAiConfig(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };
  const handleSelectDepthModel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, depthModelPath: (file as any).path || file.name });
    }
  };

  const handleFetchRemoteCsv = async () => {
    if (!formData.remoteCsvUrl) return alert("请输入云端 CSV 表格链接");
    setFetchingRemoteConfig(true);
    try {
      let fetchUrl = formData.remoteCsvUrl;

      // Auto-convert Google Sheets share URL to export CSV URL
      if (fetchUrl.includes("docs.google.com/spreadsheets")) {
        if (fetchUrl.match(/\/pubhtml/)) {
          fetchUrl = fetchUrl.replace(/\/pubhtml.*/, "/pub?output=csv");
        } else if (fetchUrl.includes("/pub?")) {
          if (!fetchUrl.includes("output=csv")) {
            fetchUrl += "&output=csv";
          }
        } else if (!fetchUrl.includes("/export")) {
          const match = fetchUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match && match[1] && match[1] !== "e") {
            fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
          }
        }
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const text = await res.text();
      const file = new File([text], "remote.csv", { type: "text/csv" });
      const newAssets = await parseCSV(file);

      const shouldClear = confirm(
        "是否清空当前图库中的所有旧图片再导入新表格？（如果不清空，新表格的数据将与旧数据合并）",
      );
      if (shouldClear) {
        await clearAllCache();
        await addAssets(newAssets);
        alert(`已清空旧数据，并成功载入 ${newAssets.length} 条新数据。`);
        // We might want to reload the page or state properly, but addAssets works locally
        window.location.reload();
      } else {
        await addAssets(newAssets);
        alert(`已将 ${newAssets.length} 条新数据追加合并到当前图库中。`);
      }
    } catch (e: any) {
      alert(
        "同步失败: " +
          e.message +
          " (确保连接包含真实数据且支持跨域。由于浏览器限制，如果提取 Google 表格失败，请将其“发布到网络”并选择以 CSV 格式发布)",
      );
    } finally {
      setFetchingRemoteConfig(false);
    }
  };

  const handleDownloadOffline = async () => {
    if (downloadingOffline) return;
    try {
      setDownloadingOffline(true);
      const res = await fetch("/api/download-offline");
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          errorText ||
            "离线版文件仍在生成中，请稍后再试或确保已运行 npm run build 构建。",
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "Lexicona-Offline.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 10000);

      // 增加离线使用提示
      alert(
        "下载请求已发起！如果由于浏览器安全限制未能下载，请尝试通过应用右上角的“在新标签页打开(Open in New Tab)”体验完整功能，或者在弹出窗口中右键“另存为...”。",
      );
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDownloadingOffline(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#333130]/40 backdrop-blur-sm p-4 font-serif">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative shadow-2xl rounded-none">
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#F0F0F0] bg-white sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-medium text-[#1E1E1E]">设置面板</h2>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImportCsv}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1.5 border border-[#1E1E1E] text-[#1E1E1E] hover:bg-[#1E1E1E] hover:text-white transition-colors font-sans flex items-center"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> 导入本地表格
            </button>
            <button
              onClick={handleClearCache}
              className="text-xs px-3 py-1.5 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors font-sans flex items-center"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> 清空所有缓存
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-transparent text-[#A3A3A3] hover:text-[#1E1E1E] transition-colors rounded-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Remote Data Sync */}
          <div className="space-y-4">
            <h2 className="text-base font-medium text-[#1E1E1E]">
              云端数据同步
            </h2>
            <div>
              <label className="block text-sm text-[#7A7A7A] mb-2 font-sans tracking-wide">
                云端 CSV 表格 URL
              </label>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={formData.remoteCsvUrl || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, remoteCsvUrl: e.target.value })
                  }
                  placeholder="https://example.com/data.csv"
                  className="flex-1 bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-[#1E1E1E] focus:ring-1 focus:ring-[#1E1E1E] p-2.5 outline-none font-sans rounded-none transition-colors"
                />
                <button
                  onClick={handleFetchRemoteCsv}
                  disabled={fetchingRemoteConfig || !formData.remoteCsvUrl}
                  className="px-6 py-2.5 bg-[#1E1E1E] hover:bg-black text-white disabled:bg-[#F5F5F5] disabled:text-[#A3A3A3] disabled:border-[#E0E0E0] disabled:border rounded-none text-sm transition-colors whitespace-nowrap flex items-center font-sans tracking-wide"
                >
                  <CloudDownload className="w-4 h-4 mr-2" />
                  {fetchingRemoteConfig ? "拉取中..." : "同步"}
                </button>
              </div>
              <p className="mt-2 text-xs text-[#A3A3A3] font-sans leading-relaxed">
                {formData.remoteCsvUrl?.includes(
                  "docs.google.com/spreadsheets",
                ) &&
                (!formData.remoteCsvUrl?.includes("pub") ||
                  formData.remoteCsvUrl?.includes("/edit")) ? (
                  <span className="text-red-500 font-medium">
                    ⚠️
                    检测到您填写的是普通共享链接。在本地离线版中运行由于浏览器限制将无法同步数据。
                    <br />
                    请在 Google 表格中点击
                    「文件」&gt;「共享」&gt;「发布到网络」，选择「网页」下拉列表中的「CSV」，点击发布并将生成的新链接填入此处。
                  </span>
                ) : (
                  "URL 必须返回原生 CSV 格式的数据。"
                )}
              </p>
            </div>
          </div>

          {/* AI Config */}
          <div className="border-t border-[#F0F0F0] pt-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-[#1E1E1E]">
                AI 接口
                <span
                  onClick={handleDownloadOffline}
                  className="cursor-pointer ml-1 opacity-80 hover:opacity-100 transition-opacity"
                  title="下载离线单页面版"
                >
                  {downloadingOffline ? "构建中..." : "设置"}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-[#F0F0F0] pb-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                  默认 AI 模型供应商
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      provider: e.target.value as AIProvider,
                    })
                  }
                  className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none cursor-pointer rounded-none font-sans transition-colors"
                >
                  <option value="google">Google Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="xiaomi">Xiaomi MiMo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                  反推 API 选择
                </label>
                <select
                  value={formData.reversePromptProvider || "google"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reversePromptProvider: e.target.value as AIProvider,
                    })
                  }
                  className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none cursor-pointer rounded-none font-sans transition-colors"
                >
                  <option value="google">Google Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="xiaomi">Xiaomi MiMo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Google Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${"border-[#E0E0E0] bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[#1E1E1E]">
                      Google Gemini
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setManagingProvider(
                          managingProvider === "google" ? null : "google",
                        )
                      }
                      title={managingProvider === "google" ? "完成管理" : "添加模型"}
                      className="p-1 text-[#7A7A7A] hover:text-[#1E1E1E] hover:bg-[#EAEAEA] transition-colors"
                    >
                      {managingProvider === "google" ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 获取 API Key
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={managingProvider === "google" ? "md:col-span-2" : ""}>
                    <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                      API 密钥
                    </label>
                    <input
                      type="password"
                      value={formData.googleApiKey || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, googleApiKey: e.target.value })
                      }
                      placeholder="留空使用系统内置 KEY"
                      className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors"
                    />
                  </div>
                  <div className={managingProvider === "google" ? "md:col-span-2" : ""}>
                    <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                      模型名称
                    </label>
                    <ModelManager
                      managing={managingProvider === "google"}
                      options={getModelOptions(formData, "google")}
                      value={getSelectedModelName(formData, "google")}
                      onSelect={(name) => handleModelSelect("google", name)}
                      onAdd={(label, name) =>
                        handleAddModel("google", label, name)
                      }
                      onDelete={(name) => handleDeleteModel("google", name)}
                    />
                  </div>
                </div>
              </div>

              {/* DeepSeek Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${"border-[#E0E0E0] bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[#1E1E1E]">
                      DeepSeek
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setManagingProvider(
                          managingProvider === "deepseek" ? null : "deepseek",
                        )
                      }
                      title={managingProvider === "deepseek" ? "完成管理" : "添加模型"}
                      className="p-1 text-[#7A7A7A] hover:text-[#1E1E1E] hover:bg-[#EAEAEA] transition-colors"
                    >
                      {managingProvider === "deepseek" ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 获取 API Key
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={managingProvider === "deepseek" ? "md:col-span-2" : ""}>
                    <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                      API 密钥
                    </label>
                    <input
                      type="password"
                      value={formData.deepseekApiKey || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deepseekApiKey: e.target.value,
                        })
                      }
                      placeholder="DeepSeek API Key"
                      className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors"
                    />
                  </div>
                  <div className={managingProvider === "deepseek" ? "md:col-span-2" : ""}>
                    <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                      模型名称
                    </label>
                    <ModelManager
                      managing={managingProvider === "deepseek"}
                      options={getModelOptions(formData, "deepseek")}
                      value={getSelectedModelName(formData, "deepseek")}
                      onSelect={(name) => handleModelSelect("deepseek", name)}
                      onAdd={(label, name) =>
                        handleAddModel("deepseek", label, name)
                      }
                      onDelete={(name) => handleDeleteModel("deepseek", name)}
                    />
                  </div>
                </div>
              </div>

              {/* Xiaomi MiMo Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${"border-[#E0E0E0] bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[#1E1E1E]">
                      Xiaomi MiMo
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setManagingProvider(
                          managingProvider === "xiaomi" ? null : "xiaomi",
                        )
                      }
                      title={managingProvider === "xiaomi" ? "完成管理" : "添加模型"}
                      className="p-1 text-[#7A7A7A] hover:text-[#1E1E1E] hover:bg-[#EAEAEA] transition-colors"
                    >
                      {managingProvider === "xiaomi" ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <a
                    href="https://platform.xiaomimimo.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 获取 API Key
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={managingProvider === "xiaomi" ? "md:col-span-2" : ""}>
                    <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                      API 密钥
                    </label>
                    <input
                      type="password"
                      value={formData.xiaomiApiKey || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, xiaomiApiKey: e.target.value })
                      }
                      placeholder="Xiaomi MiMo API Key"
                      className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors"
                    />
                  </div>
                  <div className={managingProvider === "xiaomi" ? "md:col-span-2" : ""}>
                    <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                      模型名称
                    </label>
                    <ModelManager
                      managing={managingProvider === "xiaomi"}
                      options={getModelOptions(formData, "xiaomi")}
                      value={getSelectedModelName(formData, "xiaomi")}
                      onSelect={(name) => handleModelSelect("xiaomi", name)}
                      onAdd={(label, name) =>
                        handleAddModel("xiaomi", label, name)
                      }
                      onDelete={(name) => handleDeleteModel("xiaomi", name)}
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="border-t border-[#F0F0F0] pt-6">
            <h2 className="text-base font-medium text-[#1E1E1E] mb-4">缓存管理</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-[#E0E0E0] bg-[#FAFAFA]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#1E1E1E]">反推解析记录</span>
                  <span className="text-xs text-[#7A7A7A] font-sans">{reversePromptPairs.length} 条记录</span>
                </div>
                <p className="text-xs text-[#A3A3A3] font-sans mb-3">包含图片的反推解析历史记录，包括原图、提示词、深度图等数据。</p>
                <div className="flex gap-2">
                  <button onClick={handleClearReverseCache} className="px-4 py-2 text-xs font-sans border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors rounded-none">清除反推记录</button>
                  <button onClick={handleClearCache} className="px-4 py-2 text-xs font-sans border border-[#E0E0E0] text-[#7A7A7A] hover:bg-[#1E1E1E] hover:text-white transition-colors rounded-none">清空全部缓存</button>
                </div>
              </div>
              <div className="p-4 border border-[#E0E0E0] bg-[#FAFAFA]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#1E1E1E]">深度图模型</span>
                  <span className="text-xs text-[#7A7A7A] font-sans">~1.34 GB</span>
                </div>
                <p className="text-xs text-[#A3A3A3] font-sans mb-3">Depth Anything V2 vitl 模型权重文件 (.pth)。点击下方按钮选择模型文件。</p>
                <div className="flex items-center gap-2">
                  <input type="file" accept=".pth" className="hidden" ref={depthFileRef} onChange={handleSelectDepthModel} />
                  <input type="text" readOnly value={formData.depthModelPath || ""} placeholder="D:\画廊app\models\depth_anything_v2_vitl.pth" className="flex-1 text-xs px-3 py-2 border border-[#E0E0E0] bg-white text-[#1E1E1E] font-sans" />
                  <button onClick={() => depthFileRef.current?.click()} className="text-xs px-3 py-2 border border-[#1E1E1E] text-[#1E1E1E] hover:bg-[#1E1E1E] hover:text-white transition-colors font-sans whitespace-nowrap flex items-center"><FolderOpen className="w-3.5 h-3.5 mr-1" />浏览</button>
                </div>
                <div className="mt-1.5 text-xs text-[#A3A3A3] font-sans">当前路径: {aiConfig.depthModelPath || "未配置"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border-t border-[#F0F0F0] px-6 py-4 shrink-0 flex justify-end items-center gap-4">
          {saved && (
            <span className="text-[#1E1E1E] text-sm font-sans mr-2">
              配置已保存
            </span>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2 text-[#7A7A7A] hover:bg-gray-100 rounded-none text-sm transition-colors font-sans tracking-wide"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 flex items-center bg-[#1E1E1E] hover:bg-black text-white rounded-none text-sm transition-colors font-sans tracking-wide"
          >
            <Save className="w-4 h-4 mr-2" /> 保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
