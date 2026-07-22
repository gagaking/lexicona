import React, { useState, useEffect, useRef } from "react";
import { useAppContext } from "../store";
import { AIProvider } from "../types";
import {
  CloudDownload,
  X,
  Save,
  ExternalLink,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { parseCSV } from "../services/csvParser";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { aiConfig, updateAiConfig, addAssets, clearAllCache } =
    useAppContext();
  const [formData, setFormData] = useState(aiConfig);
  const [saved, setSaved] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingOllama, setFetchingOllama] = useState(false);
  const [fetchingRemoteConfig, setFetchingRemoteConfig] = useState(false);
  const [downloadingOffline, setDownloadingOffline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSave = async () => {
    await updateAiConfig(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
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
      <div className="bg-white w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative shadow-2xl rounded-none">
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
          <div className="border-t border-[#F0F0F0] pt-6 space-y-6">
            <div className="flex justify-between items-start">
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
              <div className="w-64">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] font-sans">
                    温度 (TEMPERATURE) :{" "}
                    {(formData.temperature ?? 0.7).toFixed(1)}
                  </label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature ?? 0.7}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  className="w-full h-1 bg-[#E0E0E0] rounded-lg appearance-none cursor-pointer accent-[#1E1E1E]"
                />
                <div className="flex justify-between text-[10px] text-[#A3A3A3] mt-1 font-sans">
                  <span>更严谨 (推荐)</span>
                  <span>更发散</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-[#F0F0F0] pb-6">
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
                  <option value="ollama">Ollama</option>
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
                  <option value="xiaomi">Xiaomi MiMo</option>
                  <option value="ollama">Ollama (Vision)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Google Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${formData.provider === "google" || formData.reversePromptProvider === "google" ? "border-blue-500 bg-blue-50/30 opacity-100 shadow-sm" : "border-[#E0E0E0] opacity-40 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[#1E1E1E]">
                    Google Gemini
                  </h3>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 获取 API Key
                  </a>
                </div>
                <div>
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
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    模型名称
                  </label>
                  <select
                    value={formData.googleModel || "gemini-2.5-flash"}
                    onChange={(e) =>
                      setFormData({ ...formData, googleModel: e.target.value })
                    }
                    className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none cursor-pointer transition-colors"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                  </select>
                </div>
              </div>

              {/* DeepSeek Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${formData.provider === "deepseek" ? "border-blue-500 bg-blue-50/30 opacity-100 shadow-sm" : "border-[#E0E0E0] opacity-40 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[#1E1E1E]">
                    DeepSeek
                  </h3>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 获取 API Key
                  </a>
                </div>
                <div>
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
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    模型名称
                  </label>
                  <select
                    value={formData.deepseekModel || "deepseek-v4-flash"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        deepseekModel: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none cursor-pointer transition-colors"
                  >
                    <option value="deepseek-v4-flash">deepseek-v4-flash</option>
                    <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                    <option value="deepseek-chat">deepseek-chat (V3)</option>
                    <option value="deepseek-reasoner">
                      deepseek-reasoner (R1)
                    </option>
                  </select>
                </div>
              </div>

              {/* Xiaomi MiMo Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${formData.provider === "xiaomi" || formData.reversePromptProvider === "xiaomi" ? "border-blue-500 bg-blue-50/30 opacity-100 shadow-sm" : "border-[#E0E0E0] opacity-40 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[#1E1E1E]">
                    Xiaomi MiMo
                  </h3>
                  <a
                    href="https://platform.xiaomimimo.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 获取 API Key
                  </a>
                </div>
                <div>
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
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    模型名称
                  </label>
                  <input
                    type="text"
                    value={formData.xiaomiModel || "mimo-v2.5"}
                    onChange={(e) =>
                      setFormData({ ...formData, xiaomiModel: e.target.value })
                    }
                    placeholder="mimo-v2.5"
                    className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors"
                  />
                </div>
              </div>

              {/* Ollama Config */}
              <div
                className={`space-y-4 p-4 border transition-colors ${formData.provider === "ollama" || formData.reversePromptProvider === "ollama" ? "border-blue-500 bg-blue-50/30 opacity-100 shadow-sm" : "border-[#E0E0E0] opacity-40 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[#1E1E1E]">Ollama</h3>
                  <a
                    href="https://ollama.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1E1E1E] hover:underline flex items-center gap-1 font-sans"
                  >
                    <ExternalLink className="w-3 h-3" /> 前往官网
                  </a>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    接口地址 (可填云端地址)
                  </label>
                  <input
                    type="url"
                    value={formData.ollamaEndpoint || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        ollamaEndpoint: e.target.value,
                      })
                    }
                    placeholder="http://127.0.0.1:11434"
                    className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors"
                  />
                </div>
                <div>
                  <label className="flex justify-between items-center text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    <span>已部署模型 (普通对话)</span>
                    <button
                      type="button"
                      onClick={async () => {
                        setFetchingOllama(true);
                        try {
                          const url =
                            (
                              formData.ollamaEndpoint ||
                              "http://127.0.0.1:11434"
                            ).replace(/\/$/, "") + "/api/tags";
                          const res = await fetch(url);
                          const data = await res.json();
                          if (data.models) {
                            setOllamaModels(
                              data.models.map((m: any) => m.name),
                            );
                          }
                        } catch (e: any) {
                          alert("获取 Ollama 模型失败: " + e.message);
                        }
                        setFetchingOllama(false);
                      }}
                      className="text-[#1E1E1E] hover:underline"
                    >
                      {fetchingOllama ? "获取中..." : "拉取列表"}
                    </button>
                  </label>
                  <div className="relative flex items-center mb-4">
                    <input
                      type="text"
                      value={formData.ollamaModel || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          ollamaModel: e.target.value,
                        })
                      }
                      placeholder="llama3 (输入或从列表选择)"
                      className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors pr-8"
                    />
                    {ollamaModels.length > 0 && (
                      <>
                        <select
                          value=""
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              ollamaModel: e.target.value,
                            })
                          }
                          className="absolute right-0 inset-y-0 w-8 opacity-0 cursor-pointer"
                        >
                          <option value="" disabled>
                            选择
                          </option>
                          {ollamaModels.map((m) => (
                            <option key={`normal-${m}`} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2 pointer-events-none text-[#7A7A7A]">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </>
                    )}
                  </div>

                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    视觉模型 (反推专用)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={formData.reversePromptOllamaModel || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          reversePromptOllamaModel: e.target.value,
                        })
                      }
                      placeholder="llava (输入或从列表选择)"
                      className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors pr-8"
                    />
                    {ollamaModels.length > 0 && (
                      <>
                        <select
                          value=""
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              reversePromptOllamaModel: e.target.value,
                            })
                          }
                          className="absolute right-0 inset-y-0 w-8 opacity-0 cursor-pointer"
                        >
                          <option value="" disabled>
                            选择
                          </option>
                          {ollamaModels.map((m) => (
                            <option key={`vision-${m}`} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2 pointer-events-none text-[#7A7A7A]">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Depth Anything V2 Config */}
              <div className="space-y-4 p-4 border border-[#E0E0E0] bg-white md:col-span-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[#1E1E1E]">
                    Depth Anything V2 深度估计模型
                  </h3>
                  <span className="text-xs text-[#7A7A7A] font-sans">
                    本地模型路径配置
                  </span>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#A3A3A3] mb-2 font-sans">
                    模型文件权重路径 (.pth)
                  </label>
                  <input
                    type="text"
                    value={formData.depthModelPath || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, depthModelPath: e.target.value })
                    }
                    placeholder="/models/depth_anything_v2_vitl.pth"
                    className="w-full bg-white border border-[#E0E0E0] text-[#1E1E1E] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2.5 outline-none font-sans rounded-none transition-colors"
                  />
                  <p className="mt-1 text-xs text-[#A3A3A3] font-sans leading-relaxed">
                    在您本地运行此应用时，将会加载该绝对路径下的权重文件进行真实深度估计。
                  </p>
                </div>
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
