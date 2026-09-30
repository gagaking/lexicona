import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  Image as ImageIcon,
  Layers,
  Loader2,
  RotateCcw,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react';
import { getCompressedImageDataUrl } from '../lib/utils';

type MattingStatus = 'pending' | 'running' | 'done' | 'error';

interface MattingTask {
  id: string;
  name: string;
  fileName: string;
  sourceUrl: string;
  previewUrl: string;
  status: MattingStatus;
  resultUrl?: string;
  error?: string;
  elapsedMs?: number;
  resolution?: number;
}

const CHECKERBOARD =
  'conic-gradient(#E8E8E8 0 25%, #FFFFFF 0 50%, #E8E8E8 0 75%, #FFFFFF 0)';

const STATUS_STYLE: Record<MattingStatus, { label: string; className: string }> = {
  pending: { label: '待处理', className: 'bg-[#F5F5F5] text-[#7A7A7A] border-[#E0E0E0]' },
  running: { label: '抠图中', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  done: { label: '已完成', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  error: { label: '失败', className: 'bg-red-50 text-red-600 border-red-200' },
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Matting({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<MattingTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [model, setModel] = useState<'matting' | 'general'>('matting');
  const [resolution, setResolution] = useState(2048);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  const tasksRef = useRef<MattingTask[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const batchStop = useRef(false);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setAvailable(Boolean(data?.mattingAvailable)))
      .catch(() => setAvailable(null));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const addFiles = useCallback(async (input: FileList | File[] | null) => {
    const files = Array.from(input || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      setNotice('仅支持图片文件（PNG / JPG / WebP）');
      return;
    }
    const created: MattingTask[] = [];
    for (const file of files) {
      try {
        const sourceUrl = await readFileAsDataUrl(file);
        const previewUrl = await getCompressedImageDataUrl(sourceUrl, 900, 0.85);
        created.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          sourceUrl,
          previewUrl,
          status: 'pending',
        });
      } catch (err) {
        console.error('读取图片失败', err);
      }
    }
    if (created.length === 0) return;
    setTasks((prev) => [...created, ...prev]);
    setNotice(`已加入 ${created.length} 个抠图任务`);
  }, []);

  const runTask = useCallback(
    async (id: string) => {
      const task = tasksRef.current.find((item) => item.id === id);
      if (!task) return;
      setTasks((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'running', error: undefined } : item,
        ),
      );
      try {
        const payload = await getCompressedImageDataUrl(task.sourceUrl, 4096, 0.95);
        const response = await fetch('/api/matting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: payload, model, size: resolution }),
        });
        let data: any = null;
        try {
          data = await response.json();
        } catch (_) {}
        if (!response.ok || !data?.success) {
          const detail = [data?.error, data?.hint].filter(Boolean).join(' ');
          throw new Error(detail || `请求失败 (HTTP ${response.status})`);
        }
        setTasks((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'done',
                  resultUrl: data.imageUrl,
                  elapsedMs: data.elapsedMs,
                  resolution: data.resolution,
                }
              : item,
          ),
        );
      } catch (err: any) {
        setTasks((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: 'error', error: err?.message || String(err) } : item,
          ),
        );
      }
    },
    [model, resolution],
  );

  const runAll = useCallback(async () => {
    batchStop.current = false;
    setIsBatchRunning(true);
    const queue = tasksRef.current.filter(
      (item) => item.status === 'pending' || item.status === 'error',
    );
    if (queue.length === 0) {
      setNotice('没有待处理的抠图任务');
      setIsBatchRunning(false);
      return;
    }
    for (const task of queue) {
      if (batchStop.current) break;
      await runTask(task.id);
    }
    setIsBatchRunning(false);
  }, [runTask]);

  const downloadTask = useCallback(async (task: MattingTask) => {
    if (!task.resultUrl) return;
    try {
      const blob = await (await fetch(task.resultUrl)).blob();
      saveAs(blob, `${task.name}抠图.png`);
    } catch (err: any) {
      setNotice('下载失败：' + (err?.message || err));
    }
  }, []);

  const downloadAll = useCallback(async () => {
    const done = tasksRef.current.filter((item) => item.status === 'done' && item.resultUrl);
    if (done.length === 0) {
      setNotice('还没有可下载的抠图结果');
      return;
    }
    for (const task of done) {
      await downloadTask(task);
    }
  }, [downloadTask]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length > 0) {
        event.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const pendingCount = tasks.filter(
    (task) => task.status === 'pending' || task.status === 'error',
  ).length;
  const doneCount = tasks.filter((task) => task.status === 'done').length;

  return (
    <div
      className="h-full flex flex-col bg-[#FCFBF9] font-serif overflow-hidden relative"
      onDragEnter={(event) => {
        event.preventDefault();
        dragCounter.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);
        void addFiles(event.dataTransfer?.files || null);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {notice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-[#1E1E1E] text-white px-5 py-2.5 text-xs font-sans shadow-xl">
          {notice}
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-[120] bg-[#F0EEEB]/90 border-4 border-dashed border-[#1E1E1E] m-4 pointer-events-none flex flex-col items-center justify-center gap-3">
          <Upload className="w-12 h-12 text-[#1E1E1E]" />
          <p className="text-lg font-bold text-[#1E1E1E]">松开鼠标导入图片</p>
          <p className="text-xs text-[#7A7A7A] font-sans">支持 PNG / JPG / WebP，可多选批量抠图</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between items-start gap-3 px-4 sm:px-6 pt-5 pb-3 border-b border-[#F0F0F0] bg-[#FCFBF9] z-[60] w-full shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors py-1.5 px-3 -ml-3 bg-transparent rounded-none hover:bg-gray-50 border border-transparent"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回图库
          </button>
          <h1 className="text-xl font-medium text-[#1E1E1E] flex items-center tracking-tight">
            <Scissors className="w-5 h-5 mr-2" /> 抠图工作台
          </h1>
          {tasks.length > 0 && (
            <span className="text-xs text-[#7A7A7A] font-sans">
              共 {tasks.length} · 完成 {doneCount} · 待处理 {pendingCount}
            </span>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans">
            模式
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as 'matting' | 'general')}
              className="text-xs border border-[#E0E0E0] bg-white rounded-none px-2 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
            >
              <option value="matting">精细抠图（人像/服装/发丝）</option>
              <option value="general">通用抠图（物体/场景）</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans">
            精度
            <select
              value={resolution}
              onChange={(event) => setResolution(parseInt(event.target.value, 10))}
              className="text-xs border border-[#E0E0E0] bg-white rounded-none px-2 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
            >
              <option value={2048}>高清 2048</option>
              <option value={1024}>快速 1024</option>
            </select>
          </label>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#1E1E1E] hover:bg-gray-50 transition-colors rounded-none font-sans"
          >
            <Upload className="w-3.5 h-3.5 mr-1" /> 上传图片
          </button>
          <button
            onClick={() => void downloadAll()}
            disabled={doneCount === 0}
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#1E1E1E] hover:bg-gray-50 transition-colors rounded-none font-sans disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> 下载全部
          </button>
          {isBatchRunning ? (
            <button
              onClick={() => {
                batchStop.current = true;
                setIsBatchRunning(false);
              }}
              className="flex items-center text-xs px-4 py-1.5 bg-red-500 text-white hover:bg-red-600 transition-colors rounded-none font-sans"
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> 终止
            </button>
          ) : (
            <button
              onClick={() => void runAll()}
              disabled={pendingCount === 0}
              className="flex items-center text-xs px-4 py-1.5 bg-[#1E1E1E] text-white hover:bg-black transition-colors rounded-none font-sans disabled:opacity-40"
            >
              <Scissors className="w-3.5 h-3.5 mr-1" /> 一键抠图
            </button>
          )}
          <button
            onClick={() => setTasks([])}
            disabled={tasks.length === 0}
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors rounded-none font-sans disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> 清空
          </button>
        </div>
      </div>

      {available === false && (
        <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-sans">
          未检测到抠图模型权重（models/birefnet/BiRefNet_HR-matting）。请使用完整版安装包，或确认模型文件存在。
        </div>
      )}

      {/* Workspace */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="max-w-[1600px] mx-auto p-4 sm:px-6 pb-24">
          {tasks.length === 0 ? (
            <div
              className="mt-6 border-2 border-dashed border-[#E0E0E0] bg-white flex flex-col items-center justify-center py-28 text-center cursor-pointer hover:border-[#1E1E1E] transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="w-14 h-14 text-[#A3A3A3] mb-4" />
              <h3 className="text-xl font-medium text-[#1E1E1E] mb-2">把图片拖到这里开始抠图</h3>
              <p className="text-xs text-[#7A7A7A] font-sans">
                支持拖拽、点击上传或 ⌘/Ctrl+V 粘贴，可一次导入多张；导入后点击「一键抠图」
              </p>
              <p className="text-[11px] text-[#A3A3A3] font-sans mt-1">
                输出为保留透明通道的 PNG，文件名自动为「原图名+抠图」
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 auto-rows-max">
              {tasks.map((task) => {
                const status = STATUS_STYLE[task.status];
                return (
                  <div
                    key={task.id}
                    className={`bg-white border flex flex-col transition-colors ${
                      task.status === 'done'
                        ? 'border-emerald-200'
                        : task.status === 'error'
                          ? 'border-red-200'
                          : 'border-[#E0E0E0]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#F0F0F0]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-semibold text-xs text-[#1E1E1E] truncate"
                          title={task.fileName}
                        >
                          {task.fileName}
                        </span>
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-0.5 border font-sans ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {task.status === 'running' && (
                          <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                        )}
                        <button
                          onClick={() => void downloadTask(task)}
                          disabled={task.status !== 'done'}
                          title={`下载 ${task.name}抠图.png`}
                          className="p-1 border border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void runTask(task.id)}
                          disabled={task.status === 'running'}
                          title={task.status === 'done' ? '重新抠图' : '开始抠图'}
                          className="p-1 border border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors disabled:opacity-30"
                        >
                          {task.status === 'done' ? (
                            <RotateCcw className="w-3.5 h-3.5" />
                          ) : (
                            <Scissors className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setTasks((prev) => prev.filter((item) => item.id !== task.id))}
                          title="移除任务"
                          className="p-1 border border-gray-100 hover:border-red-200 hover:bg-red-50 text-[#A3A3A3] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-3 p-3 items-stretch">
                      <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[10px] text-[#A3A3A3] font-sans select-none">原图</span>
                        <div className="w-[130px] h-[130px] border border-[#F0F0F0] bg-[#FAFAFA] flex items-center justify-center overflow-hidden">
                          <img
                            src={task.previewUrl}
                            alt={task.fileName}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <span className="text-[10px] text-[#A3A3A3] font-sans select-none">抠图结果</span>
                        <div
                          className="flex-1 min-h-[130px] border border-[#F0F0F0] flex items-center justify-center overflow-hidden relative"
                          style={{ backgroundImage: CHECKERBOARD, backgroundSize: '18px 18px' }}
                        >
                          {task.status === 'done' && task.resultUrl ? (
                            <img
                              src={task.resultUrl}
                              alt={`${task.name}抠图`}
                              className="max-w-full max-h-[320px] object-contain"
                            />
                          ) : task.status === 'running' ? (
                            <div className="flex flex-col items-center gap-2 bg-white/70 px-4 py-3">
                              <Loader2 className="w-5 h-5 animate-spin text-[#1E1E1E]" />
                              <span className="text-[11px] text-[#7A7A7A] font-sans">
                                正在抠图（{resolution}px）
                              </span>
                            </div>
                          ) : task.status === 'error' ? (
                            <div className="px-4 py-3 text-[11px] text-red-600 font-sans bg-white/80 text-center leading-relaxed break-words max-w-full">
                              {task.error || '抠图失败'}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 bg-white/70 px-4 py-3">
                              <Layers className="w-5 h-5 text-[#C0C0C0]" />
                              <span className="text-[11px] text-[#A3A3A3] font-sans">等待抠图</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {task.status === 'done' && (
                      <div className="px-3 pb-3 flex items-center justify-between text-[10px] text-[#A3A3A3] font-sans">
                        <span className="flex items-center gap-1 text-emerald-600">
                          <Check className="w-3 h-3" /> 输出文件名：{task.name}抠图.png
                        </span>
                        <span>
                          {task.resolution ? `${task.resolution}px · ` : ''}
                          {task.elapsedMs ? `${(task.elapsedMs / 1000).toFixed(2)}s` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
