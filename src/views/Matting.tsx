import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  ChevronsLeftRight,
  Download,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  Images,
  Layers,
  Loader2,
  Pencil,
  RotateCcw,
  Scissors,
  Trash2,
  Ungroup,
  Upload,
  X,
} from 'lucide-react';
import { getCompressedImageDataUrl } from '../lib/utils';
import { buildCollageAsync } from '../lib/collageClient';

type MattingStatus = 'pending' | 'running' | 'done' | 'error';
type CollageStatus = 'idle' | 'running' | 'done' | 'error';

interface MattingTask {
  id: string;
  name: string;
  fileName: string;
  /** 本地磁盘路径（链接式引用，Electron 下默认）；粘贴导入时为空 */
  filePath?: string;
  /** PSD 等浏览器无法预览的格式 */
  unsupportedPreview?: boolean;
  sourceUrl: string;
  /** 压缩后的推理输入（首次抠图后缓存，重抠复用，避免重复编码） */
  payloadUrl?: string;
  /** 该结果是否做过边缘精修 */
  refined?: boolean;
  previewUrl: string;
  status: MattingStatus;
  resultUrl?: string;
  resultBlob?: Blob;
  error?: string;
  warning?: string;
  foreground?: number;
  elapsedMs?: number;
  resolution?: number;
}

interface MattingGroup {
  id: string;
  name: string;
  taskIds: string[];
  collageStatus: CollageStatus;
  collageUrl?: string;
  collageBlob?: Blob;
  collageError?: string;
  collageExtension: 'jpg' | 'png';
  /** 组内图片发生变化后，已有拼图需要重拼 */
  collageDirty?: boolean;
  collageMeta?: { width: number; height: number; bytes: number; quality: number; rows: number };
}

const CHECKERBOARD = 'conic-gradient(#E8E8E8 0 25%, #FFFFFF 0 50%, #E8E8E8 0 75%, #FFFFFF 0)';

const STATUS_STYLE: Record<MattingStatus, { label: string; className: string; dot: string }> = {
  pending: { label: '待处理', className: 'bg-[#F5F5F5]/90 text-[#7A7A7A] border-[#E0E0E0]', dot: 'bg-[#C4C4C4]' },
  running: { label: '抠图中', className: 'bg-amber-50/95 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  done: { label: '已完成', className: 'bg-emerald-50/95 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  error: { label: '失败', className: 'bg-red-50/95 text-red-600 border-red-200', dot: 'bg-red-500' },
};

const DRAG_MIME = 'application/x-lexicona-task';
let taskSeed = 0;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 组名/文件名安全化，避免写出非法或互相覆盖的文件 */
function sanitizeName(raw: string) {
  const cleaned = (raw || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
  return (cleaned || '未命名').slice(0, 80);
}

function uniqueName(base: string, taken: Set<string>) {
  const safe = sanitizeName(base);
  if (!taken.has(safe.toLowerCase())) return safe;
  for (let index = 2; index < 500; index += 1) {
    const candidate = `${safe}(${index})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${safe}(${Date.now() % 1000})`;
}

/** 自然排序：img2 排在 img10 前面 */
function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

/** 支持的类型：常见位图 + PSD/TIFF（浏览器预览不了的走占位图） */
const EXTRA_IMAGE_EXTENSIONS = ['.psd', '.tif', '.tiff', '.bmp'];
const BROWSER_PREVIEW_EXTENSIONS = ['.psd', '.tif', '.tiff'];

function fileExtension(name: string) {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function isSupportedImageFile(file: File) {
  if (file.type.startsWith('image/')) return true;
  return EXTRA_IMAGE_EXTENSIONS.includes(fileExtension(file.name));
}

function localFileUrl(filePath: string) {
  return `/api/local-file?path=${encodeURIComponent(filePath)}`;
}

/** PSD/TIFF 浏览器解不了，交给引擎生成缩略预览 */
function previewUrlFor(filePath: string, extension: string) {
  if (BROWSER_PREVIEW_EXTENSIONS.includes(extension)) {
    return `/api/preview?path=${encodeURIComponent(filePath)}&size=900`;
  }
  return localFileUrl(filePath);
}

/** Electron 下取文件真实路径；普通浏览器返回空字符串 */
function localPathOf(file: File) {
  const api = (window as any).electronAPI;
  if (!api?.getPathForFile) return '';
  try {
    return (api.getPathForFile(file) as string) || '';
  } catch (_) {
    return '';
  }
}

function hasFiles(event: React.DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function memberColumns(count: number) {
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function buildGroupsFromPaths(files: File[]) {
  const rootFiles: File[] = [];
  const buckets = new Map<string, File[]>();
  let deepIgnored = 0;
  const sorted = [...files].sort((a, b) =>
    naturalCompare(
      ((a as any).webkitRelativePath as string) || a.name,
      ((b as any).webkitRelativePath as string) || b.name,
    ),
  );
  for (const file of sorted) {
    const relative = ((file as any).webkitRelativePath as string) || file.name;
    const parts = relative.split('/').filter(Boolean);
    if (parts.length <= 2) {
      rootFiles.push(file);
    } else if (parts.length === 3) {
      const folder = parts[1];
      if (!buckets.has(folder)) buckets.set(folder, []);
      buckets.get(folder)!.push(file);
    } else {
      // 只识别一层子文件夹，更深的层级忽略
      deepIgnored += 1;
    }
  }
  return { rootFiles, buckets, deepIgnored };
}

function readEntryFile(entry: any): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      entry.file(
        (file: File) => resolve(file),
        () => resolve(null),
      );
    } catch (_) {
      resolve(null);
    }
  });
}

function readDirectoryFiles(entry: any): Promise<File[]> {
  return new Promise((resolve) => {
    try {
      const reader = entry.createReader();
      const collected: File[] = [];
      const readBatch = () => {
        reader.readEntries(
          async (entries: any[]) => {
            if (!entries || entries.length === 0) {
              resolve(collected);
              return;
            }
            for (const item of entries) {
              if (item.isFile) {
                const file = await readEntryFile(item);
              if (file && isSupportedImageFile(file)) collected.push(file);
              }
            }
            readBatch();
          },
          () => resolve(collected),
        );
      };
      readBatch();
    } catch (_) {
      resolve([]);
    }
  });
}

/** PSD/TIFF 这类浏览器解不了的格式用占位图，避免出现裂图 */
function TaskPreview({
  task,
  src,
  className,
}: {
  task: MattingTask;
  src?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={task.fileName}
        className={className}
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className={`${className || ''} flex flex-col items-center justify-center gap-1 bg-[#F5F5F5] text-[#8A8A8A] font-sans`}
    >
      <span className="text-[10px] px-1.5 py-0.5 border border-[#DCDCDC] bg-white">
        {fileExtension(task.fileName).replace('.', '').toUpperCase() || 'IMG'}
      </span>
      <span className="text-[9px] px-1 max-w-full truncate">{task.fileName}</span>
    </div>
  );
}

function TaskThumb({
  task,
  onClick,
  showName,
  inert,
  onRemove,
}: {
  task: MattingTask;
  onClick?: () => void;
  showName?: boolean;
  inert?: boolean;
  onRemove?: () => void;
}) {
  const status = STATUS_STYLE[task.status];
  const image = task.status === 'done' && task.resultUrl ? task.resultUrl : task.previewUrl;
  return (
    <div
      role="button"
      onClick={onClick}
      data-thumb-task-id={task.id}
      title={task.fileName}
      className={`relative w-full aspect-[3/4] border overflow-hidden bg-white text-left group/thumb cursor-pointer ${
        task.status === 'done'
          ? 'border-emerald-200'
          : task.status === 'error'
            ? 'border-red-200'
            : 'border-[#E0E0E0]'
      } ${inert ? 'pointer-events-none' : ''}`}
      style={{ backgroundImage: CHECKERBOARD, backgroundSize: '12px 12px' }}
    >
      <TaskPreview task={task} src={image} className="w-full h-full object-contain" />
      <span className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full ${status.dot} ring-1 ring-white/80`} />
      {onRemove && !inert && (
        <button
          type="button"
          title="移除这张"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute top-0.5 right-0.5 w-4 h-4 bg-white/85 border border-gray-200 flex items-center justify-center text-[#A3A3A3] hover:text-red-500 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
      {task.status === 'running' && (
        <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        </span>
      )}
      {showName && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-0.5 text-[9px] text-white truncate font-sans">
          {task.fileName}
        </span>
      )}
    </div>
  );
}

/** 单张任务卡片：3:4，整卡可拖拽，中间滑杆对比 */
function ComparisonCard({
  task,
  downloadName,
  hint,
  isDragging,
  isDropTarget,
  isAnyDragging,
  dragRef,
  resolutionHint,
  onDragStartTask,
  onDragEndTask,
  onDragOverTask,
  onDropOnTask,
  onOpenDetail,
  onRun,
  onDownload,
  onRemove,
}: {
  task: MattingTask;
  downloadName: string;
  hint?: string;
  isDragging: boolean;
  isDropTarget: boolean;
  isAnyDragging: boolean;
  dragRef: React.MutableRefObject<string | null>;
  resolutionHint?: number;
  onDragStartTask: (id: string) => void;
  onDragEndTask: () => void;
  onDragOverTask: (id: string) => void;
  onDropOnTask: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onRun: (id: string) => void;
  onDownload: (task: MattingTask, downloadName: string) => void;
  onRemove: (id: string) => void;
}) {
  const [position, setPosition] = useState(50);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // 判断这次按下是否落在滑杆上：落在滑杆时要屏蔽卡片的原生拖拽
  const onSliderRef = useRef(false);
  const slidingRef = useRef(false);

  const updateFromX = useCallback((clientX: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  /** 按下即同步挂监听，不依赖 React 重渲染，快速拖动也不会丢事件 */
  const beginSlide = useCallback(
    (clientX: number) => {
      slidingRef.current = true;
      updateFromX(clientX);
      const move = (event: MouseEvent) => {
        if (slidingRef.current) updateFromX(event.clientX);
      };
      const up = () => {
        slidingRef.current = false;
        onSliderRef.current = false;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [updateFromX],
  );

  useEffect(
    () => () => {
      onSliderRef.current = false;
      slidingRef.current = false;
    },
    [],
  );

  const status = STATUS_STYLE[task.status];
  const hasResult = task.status === 'done' && Boolean(task.resultUrl);

  return (
    <div
      ref={surfaceRef}
      data-task-id={task.id}
      draggable
      onDragStart={(event) => {
        if (onSliderRef.current) {
          // 按在滑杆上时不允许整卡拖动（dragstart 的 target 是卡片，只能在卡片这层拦）
          event.preventDefault();
          return;
        }
        try {
          event.dataTransfer?.setData(DRAG_MIME, task.id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        } catch (_) {}
        onDragStartTask(task.id);
      }}
      onDragEnd={onDragEndTask}
      onDoubleClick={(event) => {
        // 双击卡片放大（避开滑块与右上角按钮区）
        if ((event.target as HTMLElement).closest('[data-no-slider]')) return;
        onOpenDetail(task.id);
      }}
      onDragOver={(event) => {
        if (!dragRef.current || dragRef.current === task.id) return;
        event.preventDefault();
        event.stopPropagation();
        onDragOverTask(task.id);
      }}
      onDrop={(event) => {
        if (!dragRef.current || dragRef.current === task.id) return;
        event.preventDefault();
        event.stopPropagation();
        onDropOnTask(task.id);
      }}
      className={`relative w-full aspect-[3/4] bg-white border cursor-grab active:cursor-grabbing transition-all ${
        isDragging
          ? 'opacity-40 border-dashed border-[#1E1E1E]'
          : isDropTarget
            ? 'border-[#1E1E1E] ring-2 ring-[#1E1E1E]'
            : isAnyDragging
              ? 'border-dashed border-[#1E1E1E]/50'
              : task.status === 'done'
                ? 'border-[#E0E0E0] hover:border-[#1E1E1E]'
                : task.status === 'error'
                  ? 'border-red-200'
                  : 'border-[#E0E0E0]'
      }`}
      style={{ backgroundImage: CHECKERBOARD, backgroundSize: '16px 16px' }}
    >
      {hasResult ? (
        <>
          <img
            src={task.resultUrl}
            alt={`${task.name}抠图`}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
            <TaskPreview
              task={task}
              src={task.previewUrl}
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div
            data-no-slider
            className="absolute inset-y-0 w-5 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${position}%` }}
            title="左右拖动对比原图与结果"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSliderRef.current = true;
              beginSlide(event.clientX);
            }}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.45)]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white/95 border border-gray-300 flex items-center justify-center shadow">
              <ChevronsLeftRight className="w-3.5 h-3.5 text-[#1E1E1E]" />
            </div>
          </div>
        </>
      ) : (
        <TaskPreview task={task} src={task.previewUrl} className="absolute inset-0 w-full h-full object-contain" />
      )}

      {task.status === 'running' && (
        <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1.5">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
          <span className="text-[10px] text-white/95 font-sans">
            {task.resolution || resolutionHint ? `${task.resolution || resolutionHint}px` : ''}
          </span>
        </div>
      )}

      {task.status === 'error' && (
        <div className="absolute inset-x-0 bottom-7 mx-1 bg-red-50/95 border border-red-200 px-1.5 py-1 text-[9px] text-red-600 font-sans leading-tight max-h-[52px] overflow-hidden">
          {task.error || '抠图失败'}
        </div>
      )}

      <div className="absolute top-1 left-1 flex items-center gap-1">
        <span className={`text-[9px] px-1 py-[1px] border font-sans ${status.className}`}>
          {status.label}
        </span>
        {task.warning && (
          <span
            title={task.warning}
            className="text-[9px] px-1 py-[1px] border border-amber-300 bg-amber-50 text-amber-700 font-sans"
          >
            几乎空白
          </span>
        )}
      </div>

      <div data-no-slider className="absolute top-1 right-1 flex items-center gap-0.5">
        <button
          onClick={() => onDownload(task, downloadName)}
          disabled={!hasResult}
          title={`下载 ${downloadName}.png`}
          className="w-5 h-5 bg-white/85 border border-gray-200 flex items-center justify-center text-[#7A7A7A] hover:text-[#1E1E1E] disabled:opacity-40"
        >
          <Download className="w-3 h-3" />
        </button>
        <button
          onClick={() => onRun(task.id)}
          disabled={task.status === 'running'}
          title={hasResult ? '重新抠图' : '开始抠图'}
          className="w-5 h-5 bg-white/85 border border-gray-200 flex items-center justify-center text-[#7A7A7A] hover:text-[#1E1E1E] disabled:opacity-40"
        >
          {hasResult ? <RotateCcw className="w-3 h-3" /> : <Scissors className="w-3 h-3" />}
        </button>
        <button
          onClick={() => onRemove(task.id)}
          title="移除"
          className="w-5 h-5 bg-white/85 border border-gray-200 flex items-center justify-center text-[#A3A3A3] hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 pointer-events-none">
        <div className="text-[10px] text-white truncate font-sans">{task.fileName}</div>
        <div className="flex items-center justify-between text-[9px] text-white/80 font-sans">
          <span className="truncate">{hint || (task.resolution ? `${task.resolution}px` : '')}</span>
          <span>{task.elapsedMs ? `${(task.elapsedMs / 1000).toFixed(2)}s` : ''}</span>
        </div>
      </div>

      {isDropTarget && (
        <div className="absolute inset-0 bg-[#1E1E1E]/15 border-2 border-dashed border-[#1E1E1E] flex items-center justify-center pointer-events-none">
          <span className="bg-[#1E1E1E] text-white text-[10px] px-2 py-1 font-sans">合并到这一组</span>
        </div>
      )}
    </div>
  );
}

/** 分组卡片：6:4 宽卡，左 3:4 原组 + 右 3:4 拼图结果 */
function GroupCard({
  group,
  members,
  isDropTarget,
  isAnyDragging,
  dragRef,
  editing,
  editingName,
  onStartRename,
  onChangeName,
  onCommitName,
  onCancelRename,
  onDropTask,
  onDragOverGroup,
  onRunCollage,
  onDownloadCollage,
  onDownloadGroup,
  onUngroup,
  onOpenMember,
  onRemoveMember,
}: {
  group: MattingGroup;
  members: MattingTask[];
  isDropTarget: boolean;
  isAnyDragging: boolean;
  dragRef: React.MutableRefObject<string | null>;
  editing: boolean;
  editingName: string;
  onStartRename: () => void;
  onChangeName: (value: string) => void;
  onCommitName: () => void;
  onCancelRename: () => void;
  onDropTask: () => void;
  onDragOverGroup: () => void;
  onRunCollage: () => void;
  onDownloadCollage: () => void;
  onDownloadGroup: () => void;
  onUngroup: () => void;
  onOpenMember: (taskId: string) => void;
  onRemoveMember: (taskId: string) => void;
}) {
  const columns = memberColumns(Math.max(1, members.length));
  const readyCount = members.filter((task) => task.status === 'done').length;
  const meta = group.collageMeta;
  return (
    <div
      data-group-id={group.id}
      onDragOver={(event) => {
        if (!dragRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onDragOverGroup();
      }}
      onDrop={(event) => {
        if (!dragRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onDropTask();
      }}
      className={`relative col-span-2 aspect-[6/4] bg-white border flex transition-all ${
        isDropTarget
          ? 'border-[#1E1E1E] ring-2 ring-[#1E1E1E]'
          : isAnyDragging
            ? 'border-dashed border-[#1E1E1E]/50'
            : 'border-[#E0E0E0]'
      }`}
    >
      {/* 左：原组 */}
      <div className="w-1/2 min-w-0 flex flex-col border-r border-[#F0F0F0]">
        <div
          className={`flex items-center justify-between gap-1 px-1.5 py-1 border-b border-[#F0F0F0] bg-[#FAFAFA] shrink-0 ${
            isAnyDragging ? 'pointer-events-none' : ''
          }`}
        >
          <div className="flex items-center gap-1 min-w-0">
            <Images className="w-3 h-3 text-[#7A7A7A] shrink-0" />
            {editing ? (
              <input
                autoFocus
                value={editingName}
                onChange={(event) => onChangeName(event.target.value)}
                onBlur={onCommitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onCommitName();
                  if (event.key === 'Escape') onCancelRename();
                }}
                className="text-[11px] border border-[#1E1E1E] px-1 py-0.5 w-[110px] focus:outline-none"
              />
            ) : (
              <button
                onDoubleClick={onStartRename}
                title="双击重命名"
                className="text-[11px] font-semibold text-[#1E1E1E] truncate"
              >
                {group.name}
              </button>
            )}
            <span className="text-[9px] text-[#7A7A7A] font-sans shrink-0">{members.length} 张</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onStartRename}
              title="重命名分组"
              className="w-4 h-4 flex items-center justify-center text-[#A3A3A3] hover:text-[#1E1E1E]"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={onUngroup}
              title="解散分组"
              className="w-4 h-4 flex items-center justify-center text-[#A3A3A3] hover:text-red-500"
            >
              <Ungroup className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div
          className="flex-1 min-h-0 p-1 grid gap-1 content-start overflow-y-auto custom-scrollbar"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {members.map((member) => (
            <TaskThumb
              key={member.id}
              task={member}
              onClick={() => onOpenMember(member.id)}
              inert={isAnyDragging}
              onRemove={() => onRemoveMember(member.id)}
            />
          ))}
          {members.length === 0 && (
            <div className="col-span-full text-[10px] text-[#A3A3A3] font-sans text-center py-6">
              拖动卡片到此分组
            </div>
          )}
        </div>
      </div>

      {/* 右：拼图结果 */}
      <div className="w-1/2 min-w-0 flex flex-col">
        <div
          className={`flex items-center justify-between gap-1 px-1.5 py-1 border-b border-[#F0F0F0] bg-[#FAFAFA] shrink-0 ${
            isAnyDragging ? 'pointer-events-none' : ''
          }`}
        >
          <span className="text-[11px] font-semibold text-[#1E1E1E] shrink-0">拼图结果</span>
          <span className="flex items-center gap-1 text-[9px] text-[#7A7A7A] font-sans truncate">
            {meta ? (
              <>
                {`${meta.width}×${meta.height} · ${formatBytes(meta.bytes)} · ${group.collageExtension.toUpperCase()}`}
                {group.collageDirty && <span className="text-amber-600">· 需重拼</span>}
              </>
            ) : (
              `已抠 ${readyCount}/${members.length}`
            )}
          </span>
        </div>
        <div
          className="flex-1 min-h-0 flex items-center justify-center overflow-hidden relative"
          style={{ backgroundImage: CHECKERBOARD, backgroundSize: '16px 16px' }}
        >
          {group.collageStatus === 'running' && (
            <div className="flex flex-col items-center gap-1.5">
              <Loader2 className="w-5 h-5 animate-spin text-[#1E1E1E]" />
              <span className="text-[10px] text-[#7A7A7A] font-sans">正在拼合…</span>
            </div>
          )}
          {group.collageStatus === 'error' && (
            <div className="px-3 text-[10px] text-red-600 font-sans text-center leading-tight">
              拼图失败：{group.collageError}
            </div>
          )}
          {group.collageStatus === 'done' && group.collageUrl && (
            <img
              data-collage-img
              src={group.collageUrl}
              alt={`${group.name}拼图`}
              className="max-w-full max-h-full object-contain"
            />
          )}
          {group.collageStatus === 'idle' && (
            <span className="text-[10px] text-[#A3A3A3] font-sans">点「拼图」生成</span>
          )}
        </div>
        <div
          className={`shrink-0 border-t border-[#F0F0F0] px-1.5 py-1 flex items-center justify-end gap-1 ${
            isAnyDragging ? 'pointer-events-none' : ''
          }`}
          data-collage-meta={meta ? JSON.stringify(meta) : ''}
        >
          <button
            onClick={onDownloadGroup}
            disabled={members.length === 0}
            title="下载拼图 + 组内全部抠图（组名-序号）"
            className="flex items-center text-[10px] px-2 py-1 bg-white border border-[#E0E0E0] hover:bg-gray-50 font-sans disabled:opacity-40"
          >
            <Download className="w-3 h-3 mr-0.5" /> 下载本组
          </button>
          <button
            onClick={onDownloadCollage}
            disabled={group.collageStatus !== 'done'}
            title={`下载 ${group.name}-拼图.${group.collageExtension}`}
            className="flex items-center text-[10px] px-2 py-1 bg-white border border-[#E0E0E0] hover:bg-gray-50 font-sans disabled:opacity-40"
          >
            <Download className="w-3 h-3 mr-0.5" /> 下载拼图
          </button>
          <button
            onClick={onRunCollage}
            disabled={group.collageStatus === 'running'}
            title="生成/重新生成拼图"
            className="flex items-center text-[10px] px-2 py-1 bg-[#1E1E1E] text-white hover:bg-black font-sans disabled:opacity-50"
          >
            {group.collageStatus === 'running' ? (
              <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />
            ) : group.collageStatus === 'done' ? (
              <RotateCcw className="w-3 h-3 mr-0.5" />
            ) : (
              <Images className="w-3 h-3 mr-0.5" />
            )}
            {group.collageStatus === 'done' ? '重拼' : '拼图'}
          </button>
        </div>
      </div>

      {isDropTarget && (
        <div className="absolute inset-0 bg-[#1E1E1E]/15 border-2 border-dashed border-[#1E1E1E] flex items-center justify-center pointer-events-none">
          <span className="bg-[#1E1E1E] text-white text-[10px] px-2 py-1 font-sans">加入「{group.name}」</span>
        </div>
      )}
    </div>
  );
}

/** 单张放大：3:4 滑杆对比 + 操作 */
function TaskLightbox({
  task,
  downloadName,
  onClose,
  onRun,
  onDownload,
  onRemove,
}: {
  task: MattingTask;
  downloadName: string;
  onClose: () => void;
  onRun: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const [position, setPosition] = useState(50);
  const [sliding, setSliding] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hasResult = task.status === 'done' && Boolean(task.resultUrl);

  const updateFromX = useCallback((clientX: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  useEffect(() => {
    if (!sliding) return;
    const move = (event: MouseEvent) => updateFromX(event.clientX);
    const up = () => setSliding(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [sliding, updateFromX]);

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-white border border-[#E0E0E0] shadow-2xl flex flex-col w-full max-w-[560px] max-h-[92vh]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0F0]">
          <span className="text-xs font-semibold text-[#1E1E1E] truncate">{task.fileName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-[9px] px-1 py-[1px] border font-sans ${STATUS_STYLE[task.status].className}`}>
              {STATUS_STYLE[task.status].label}
            </span>
            <button onClick={onClose} className="p-1 text-[#7A7A7A] hover:text-[#1E1E1E]" title="关闭">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div
          ref={surfaceRef}
          className="relative w-full aspect-[3/4] max-h-[70vh] overflow-hidden"
          style={{ backgroundImage: CHECKERBOARD, backgroundSize: '18px 18px' }}
        >
          {hasResult ? (
            <>
              <img src={task.resultUrl} alt="抠图结果" className="absolute inset-0 w-full h-full object-contain" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
                <TaskPreview task={task} src={task.previewUrl} className="absolute inset-0 w-full h-full object-contain" />
              </div>
              <div
                className="absolute inset-y-0 w-6 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${position}%` }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setSliding(true);
                  updateFromX(event.clientX);
                }}
              >
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.45)]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white/95 border border-gray-300 flex items-center justify-center shadow">
                  <ChevronsLeftRight className="w-4 h-4 text-[#1E1E1E]" />
                </div>
              </div>
            </>
          ) : (
            <TaskPreview task={task} src={task.previewUrl} className="absolute inset-0 w-full h-full object-contain" />
          )}
          {task.status === 'running' && (
            <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span className="text-xs text-white font-sans">抠图中…</span>
            </div>
          )}
          {task.status === 'error' && (
            <div className="absolute inset-x-3 bottom-3 bg-red-50/95 border border-red-200 px-2 py-1.5 text-[11px] text-red-600 font-sans">
              {task.error || '抠图失败'}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#F0F0F0]">
          <span className="text-[10px] text-[#7A7A7A] font-sans truncate">
            {task.resolution ? `${task.resolution}px · ` : ''}
            {task.elapsedMs ? `${(task.elapsedMs / 1000).toFixed(2)}s · ` : ''}
            输出名：{downloadName}.png
          </span>
          {task.warning && (
            <span className="text-[10px] text-amber-700 font-sans shrink-0" title={task.warning}>
              ⚠ 几乎空白
            </span>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onRun}
              disabled={task.status === 'running'}
              className="flex items-center text-[11px] px-2.5 py-1 bg-white border border-[#E0E0E0] hover:bg-gray-50 font-sans disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> 重新抠图
            </button>
            <button
              onClick={onDownload}
              disabled={!hasResult}
              className="flex items-center text-[11px] px-2.5 py-1 bg-[#1E1E1E] text-white hover:bg-black font-sans disabled:opacity-40"
            >
              <Download className="w-3 h-3 mr-1" /> 下载
            </button>
            <button
              onClick={onRemove}
              title="移除该任务"
              className="flex items-center text-[11px] px-2 py-1 bg-white border border-red-200 text-red-500 hover:bg-red-50 font-sans"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Matting({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<MattingTask[]>([]);
  const [groups, setGroups] = useState<MattingGroup[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [model, setModel] = useState<'matting' | 'general'>('matting');
  const [resolution, setResolution] = useState(2048);
  const [pngCollage, setPngCollage] = useState(false);
  // 边缘精修只对发丝/绒毛/半透明这类软边缘有帮助，高清硬边图开启反而会发虚，默认关闭
  const [refineEdges, setRefineEdges] = useState(false);
  // 白边/杂色清理：去掉边缘混进来的背景色与散落杂质，实测更干净，默认开启
  const [cleanEdges, setCleanEdges] = useState(true);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const tasksRef = useRef<MattingTask[]>([]);
  const groupsRef = useRef<MattingGroup[]>([]);
  const draggedRef = useRef<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const batchStop = useRef(false);
  const groupCounter = useRef(0);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    // 进入工作台时释放上次推理残留的本地临时缓存（任务本身只存在内存里，重启即清空）
    fetch('/api/cache/clear', { method: 'POST' }).catch(() => {});
    // 打包版下载会静默存到系统「下载」文件夹，完成后给个提示
    const api = (window as any).electronAPI;
    api?.onDownloadFinished?.((payload: { filename?: string }) => {
      if (payload?.filename) setNotice(`已保存到下载文件夹：${payload.filename}`);
    });
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setAvailable(Boolean(data?.mattingAvailable)))
      .catch(() => setAvailable(null));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const groupOfTask = useMemo(() => {
    const map = new Map<string, MattingGroup>();
    groups.forEach((group) => group.taskIds.forEach((id) => map.set(id, group)));
    return map;
  }, [groups]);

  const createTasks = useCallback(async (files: File[]): Promise<MattingTask[]> => {
    const created: MattingTask[] = [];
    for (const file of files) {
      try {
        taskSeed += 1;
        const id = `${Date.now()}-${taskSeed}`;
        const name = file.name.replace(/\.[^.]+$/, '');
        const extension = fileExtension(file.name);
        const filePath = localPathOf(file);
        if (filePath) {
          // 链接式引用：只记住磁盘路径，图片本身不进内存
          const previewable = !BROWSER_PREVIEW_EXTENSIONS.includes(extension);
          const previewUrl = previewUrlFor(filePath, extension);
          if (!previewable) {
            // PSD/TIFF 需要引擎合成预览图，导入就先在后台生成，等看到卡片时已经好了
            void fetch(previewUrl).catch(() => {});
          }
          created.push({
            id,
            name,
            fileName: file.name,
            filePath,
            unsupportedPreview: !previewable,
            sourceUrl: '',
            previewUrl,
            status: 'pending',
          });
          continue;
        }
        const sourceUrl = await readFileAsDataUrl(file);
        const previewUrl = await getCompressedImageDataUrl(sourceUrl, 900, 0.85);
        created.push({
          id,
          name,
          fileName: file.name,
          unsupportedPreview: BROWSER_PREVIEW_EXTENSIONS.includes(extension),
          sourceUrl,
          previewUrl,
          status: 'pending',
        });
      } catch (err) {
        console.error('读取图片失败', err);
      }
    }
    return created;
  }, []);

  const addFiles = useCallback(
    async (input: FileList | File[] | null) => {
      const files = Array.from(input || []).filter(isSupportedImageFile);
      if (files.length === 0) {
        setNotice('仅支持 PNG / JPG / WebP / PSD');
        return;
      }
      const created = await createTasks(files);
      if (created.length === 0) return;
      setTasks((prev) => [...created, ...prev]);
      setNotice(`已加入 ${created.length} 个抠图任务`);
    },
    [createTasks],
  );

  /** 文件夹导入：所选文件夹内的图片不分组，一层子文件夹各自成为分组 */
  const addFromFolder = useCallback(
    async (files: File[]) => {
      const images = files.filter(isSupportedImageFile);
      if (images.length === 0) {
        setNotice('文件夹里没有可用图片');
        return;
      }
      const { rootFiles, buckets, deepIgnored } = buildGroupsFromPaths(images);
      let addedTasks = 0;
      let addedGroups = 0;
      const takenNames = new Set(groupsRef.current.map((group) => group.name.toLowerCase()));

      if (rootFiles.length > 0) {
        const created = await createTasks(rootFiles);
        if (created.length > 0) {
          addedTasks += created.length;
          setTasks((prev) => [...created, ...prev]);
        }
      }

      for (const [folderName, folderFiles] of buckets) {
        const created = await createTasks(folderFiles);
        if (created.length === 0) continue;
        addedTasks += created.length;
        addedGroups += 1;
        const groupName = uniqueName(folderName, takenNames);
        takenNames.add(groupName.toLowerCase());
        setTasks((prev) => [...created, ...prev]);
        setGroups((prev) => [
          ...prev,
          {
            id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: groupName,
            taskIds: created.map((task) => task.id),
            collageStatus: 'idle',
            collageExtension: pngCollage ? 'png' : 'jpg',
          },
        ]);
      }

      if (addedTasks === 0) {
        setNotice('所选文件夹里没有可直接使用的图片');
        return;
      }
      setNotice(
        `${
          addedGroups > 0
            ? `已导入 ${addedTasks} 张图片，识别出 ${addedGroups} 个子文件夹并建组`
            : `已导入 ${addedTasks} 张图片（未发现子文件夹）`
        }${deepIgnored > 0 ? `；已忽略 ${deepIgnored} 个深层子目录文件` : ''}`,
      );
    },
    [createTasks, pngCollage],
  );

  /** 拖入文件夹时按一层子文件夹分组 */
  const addFromDrop = useCallback(
    async (dataTransfer: DataTransfer | null) => {
      if (!dataTransfer) return;
      const items = Array.from(dataTransfer.items || []);
      const entries = items
        .map((item) => (typeof (item as any).webkitGetAsEntry === 'function' ? (item as any).webkitGetAsEntry() : null))
        .filter(Boolean);
      if (entries.length === 0 || !entries.some((entry: any) => entry.isDirectory)) {
        await addFiles(dataTransfer.files);
        return;
      }
      const rootFiles: File[] = [];
      const buckets = new Map<string, File[]>();
      const takenNames = new Set(groupsRef.current.map((group) => group.name.toLowerCase()));
      for (const entry of entries as any[]) {
        if (entry.isDirectory) {
          const files = await readDirectoryFiles(entry);
          if (files.length > 0) buckets.set(entry.name, files);
        } else if (entry.isFile) {
          const file = await readEntryFile(entry);
          if (file && file.type.startsWith('image/')) rootFiles.push(file);
        }
      }
      let addedTasks = 0;
      let addedGroups = 0;
      if (rootFiles.length > 0) {
        const created = await createTasks(rootFiles);
        addedTasks += created.length;
        setTasks((prev) => [...created, ...prev]);
      }
      for (const [folderName, folderFiles] of buckets) {
        const created = await createTasks(folderFiles);
        if (created.length === 0) continue;
        addedTasks += created.length;
        addedGroups += 1;
        const groupName = uniqueName(folderName, takenNames);
        takenNames.add(groupName.toLowerCase());
        setTasks((prev) => [...created, ...prev]);
        setGroups((prev) => [
          ...prev,
          {
            id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: groupName,
            taskIds: created.map((task) => task.id),
            collageStatus: 'idle',
            collageExtension: pngCollage ? 'png' : 'jpg',
          },
        ]);
      }
      if (addedTasks > 0) {
        setNotice(`已导入 ${addedTasks} 张图片${addedGroups ? `，识别出 ${addedGroups} 个子文件夹并建组` : ''}`);
      }
    },
    [addFiles, createTasks, pngCollage],
  );

  const runTask = useCallback(
    async (id: string): Promise<{ url: string; blob: Blob } | undefined> => {
      const task = tasksRef.current.find((item) => item.id === id);
      if (!task) return undefined;
      setTasks((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'running', error: undefined } : item)),
      );
      try {
        // 本地文件直接用路径推理（不读内存、不上传 base64）；粘贴的图才编码并缓存
        const payload = task.filePath
          ? ''
          : task.payloadUrl || (await getCompressedImageDataUrl(task.sourceUrl, 4096, 0.95));
        const requestBody = task.filePath
          ? {
              filePath: task.filePath,
              model,
              size: resolution,
              refine: refineEdges,
              clean: cleanEdges,
            }
          : { image: payload, model, size: resolution, refine: refineEdges, clean: cleanEdges };
        const response = await fetch('/api/matting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        let data: any = null;
        try {
          data = await response.json();
        } catch (_) {}
        if (!response.ok || !data?.success) {
          const detail = [data?.error, data?.hint].filter(Boolean).join(' ');
          throw new Error(detail || `请求失败 (HTTP ${response.status})`);
        }
        // 结果落成 Blob + 对象 URL，避免 base64 常驻内存；原图 base64 同时释放
        const blob = await (await fetch(data.imageUrl as string)).blob();
        const objectUrl = URL.createObjectURL(blob);
        const foreground = typeof data.foreground === 'number' ? data.foreground : undefined;
        setTasks((prev) =>
          prev.map((item) => {
            if (item.id !== id) return item;
            if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
            return {
              ...item,
              status: 'done',
              resultUrl: objectUrl,
              resultBlob: blob,
              payloadUrl: payload,
              sourceUrl: '',
              elapsedMs: data.elapsedMs,
              resolution: data.resolution,
              foreground,
              refined: Boolean(data.refined),
              warning:
                foreground !== undefined && foreground < 0.005
                  ? '几乎没有抠出主体，建议切换「通用抠图」或换一张图'
                  : undefined,
            };
          }),
        );
        setGroups((prev) =>
          prev.map((group) =>
            group.taskIds.includes(id) ? { ...group, collageDirty: true } : group,
          ),
        );
        return { url: objectUrl, blob };
      } catch (err: any) {
        setTasks((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: 'error', error: err?.message || String(err) } : item,
          ),
        );
        return undefined;
      }
    },
    [model, resolution, refineEdges, cleanEdges],
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

  const downloadTask = useCallback(async (task: MattingTask, downloadName: string) => {
    if (!task.resultBlob) return;
    try {
      saveAs(task.resultBlob, `${sanitizeName(downloadName)}.png`);
    } catch (err: any) {
      setNotice('下载失败：' + (err?.message || err));
    }
  }, []);

  const runCollage = useCallback(
    async (groupId: string) => {
      const group = groupsRef.current.find((item) => item.id === groupId);
      if (!group || group.taskIds.length === 0) return null;
      const extension = pngCollage ? 'png' : 'jpg';
      setGroups((prev) =>
        prev.map((item) =>
          item.id === groupId
            ? { ...item, collageStatus: 'running', collageError: undefined, collageExtension: extension }
            : item,
        ),
      );
      try {
        const blobs: Blob[] = [];
        for (const taskId of group.taskIds) {
          const existing = tasksRef.current.find((task) => task.id === taskId);
          if (existing?.status === 'done' && existing.resultBlob) {
            blobs.push(existing.resultBlob);
            continue;
          }
          const done = await runTask(taskId);
          if (!done) throw new Error(`「${existing?.fileName || taskId}」抠图失败，已中止拼图`);
          blobs.push(done.blob);
        }
        const collage = await buildCollageAsync(blobs, {
          gap: 40,
          maxCell: 2048,
          maxWidth: 4096,
          maxBytes: 5 * 1024 * 1024,
          trimTransparent: true,
          format: extension === 'png' ? 'png' : 'jpeg',
          skipEmpty: true,
        });
        const previous = groupsRef.current.find((item) => item.id === groupId);
        if (previous?.collageUrl) URL.revokeObjectURL(previous.collageUrl);
        setGroups((prev) =>
          prev.map((item) =>
            item.id === groupId
              ? {
                  ...item,
                  collageStatus: 'done',
                  collageDirty: false,
                  collageUrl: collage.objectUrl,
                  collageBlob: collage.blob,
                  collageExtension: collage.extension,
                  collageMeta: {
                    width: collage.width,
                    height: collage.height,
                    bytes: collage.bytes,
                    quality: collage.quality,
                    rows: collage.rows,
                  },
                }
              : item,
          ),
        );
        setNotice(
          `「${group.name}」拼图完成：${collage.width}×${collage.height} · ${formatBytes(collage.bytes)}${
            collage.skipped > 0 ? `（跳过 ${collage.skipped} 张空白结果）` : ''
          }`,
        );
        return { blob: collage.blob, extension: collage.extension };
      } catch (err: any) {
        setGroups((prev) =>
          prev.map((item) =>
            item.id === groupId
              ? { ...item, collageStatus: 'error', collageError: err?.message || String(err) }
              : item,
          ),
        );
        return null;
      }
    },
    [pngCollage, runTask],
  );

  /** 组下载 = 拼图 + 组内每张（组名-序号） */
  const downloadGroup = useCallback(
    async (group: MattingGroup) => {
      const members = group.taskIds
        .map((id) => tasksRef.current.find((task) => task.id === id))
        .filter(Boolean) as MattingTask[];
      const readyMembers = members.filter((task) => task.status === 'done' && task.resultUrl);
      if (readyMembers.length === 0 && group.collageStatus !== 'done') {
        setNotice('该分组还没有抠图结果');
        return;
      }
      // 拼图不存在、或组内图片已变动时，先重拼一次，保证下载的是最新结果
      let collage =
        group.collageStatus === 'done' && !group.collageDirty && group.collageBlob
          ? { blob: group.collageBlob, extension: group.collageExtension }
          : null;
      if (!collage) {
        collage = await runCollage(group.id);
      }
      if (collage) {
        saveAs(collage.blob, `${sanitizeName(group.name)}-拼图.${collage.extension}`);
      }
      for (let index = 0; index < members.length; index += 1) {
        const task = members[index];
        if (task.status !== 'done' || !task.resultUrl) continue;
        await downloadTask(task, `${group.name}-${index + 1}`);
      }
    },
    [downloadTask, runCollage],
  );

  const downloadCollage = useCallback(
    async (group: MattingGroup) => {
      let collage =
        group.collageBlob && !group.collageDirty
          ? { blob: group.collageBlob, extension: group.collageExtension }
          : null;
      if (!collage) {
        collage = await runCollage(group.id);
      }
      if (!collage) {
        setNotice('拼图失败，无法下载');
        return;
      }
      saveAs(collage.blob, `${sanitizeName(group.name)}-拼图.${collage.extension}`);
    },
    [runCollage],
  );

  const downloadAll = useCallback(async () => {
    const allGroups = groupsRef.current;
    const allTasks = tasksRef.current;
    const hasResult = allTasks.some((task) => task.status === 'done' && task.resultUrl);
    if (!hasResult && allGroups.length === 0) {
      setNotice('还没有可下载的抠图结果');
      return;
    }
    for (const group of allGroups) {
      await downloadGroup(group);
    }
    for (const task of allTasks) {
      if (task.status !== 'done' || !task.resultUrl) continue;
      if (groupOfTask.has(task.id)) continue;
      await downloadTask(task, `${task.name}抠图`);
    }
  }, [downloadGroup, downloadTask, groupOfTask]);

  /** 释放常驻推理进程与显存（空闲 2 分钟也会自动释放） */
  const releaseGpu = useCallback(async () => {
    try {
      const response = await fetch('/api/matting/release', { method: 'POST' });
      const data = await response.json().catch(() => null);
      setNotice(data?.released ? '已释放显存，下次抠图会重新加载模型' : '显存已处于空闲状态');
    } catch (_) {
      setNotice('释放显存失败');
    }
  }, []);

  /** 一次性打包成 ZIP：分组目录内含拼图 + 组名-序号.png，未编组为 原名抠图.png */
  const downloadZip = useCallback(async () => {
    const allTasks = tasksRef.current;
    const allGroups = groupsRef.current;
    const hasAnything = allTasks.some((task) => task.status === 'done' && task.resultBlob);
    if (!hasAnything && allGroups.length === 0) {
      setNotice('还没有可下载的结果');
      return;
    }
    setNotice('正在打包 ZIP…');
    const zip = new JSZip();
    let fileCount = 0;

    for (const group of allGroups) {
      const folderName = sanitizeName(group.name);
      const folder = zip.folder(folderName);
      if (!folder) continue;
      const collage =
        group.collageStatus === 'done' && !group.collageDirty && group.collageBlob
          ? { blob: group.collageBlob, extension: group.collageExtension }
          : await runCollage(group.id);
      if (collage) {
        folder.file(`${folderName}-拼图.${collage.extension}`, collage.blob);
        fileCount += 1;
      }
      const members = group.taskIds
        .map((id) => allTasks.find((task) => task.id === id))
        .filter(Boolean) as MattingTask[];
      members.forEach((task, index) => {
        if (task.status === 'done' && task.resultBlob) {
          folder.file(`${folderName}-${index + 1}.png`, task.resultBlob);
          fileCount += 1;
        }
      });
    }

    for (const task of allTasks) {
      if (task.status !== 'done' || !task.resultBlob) continue;
      if (groupOfTask.has(task.id)) continue;
      zip.file(`${sanitizeName(task.name)}抠图.png`, task.resultBlob);
      fileCount += 1;
    }

    if (fileCount === 0) {
      setNotice('没有可打包的结果');
      return;
    }
    try {
      // 图片本身已是压缩格式，用 STORE 直接归档，速度快
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const stamp = new Date().toISOString().slice(0, 10);
      saveAs(blob, `辞谱抠图_${stamp}.zip`);
      setNotice(`已打包 ${fileCount} 个文件（${formatBytes(blob.size)}）`);
    } catch (err: any) {
      setNotice('打包失败：' + (err?.message || err));
    }
  }, [groupOfTask, runCollage]);

  const removeTask = useCallback((id: string) => {
    const target = tasksRef.current.find((task) => task.id === id);
    if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl);
    // 组内最后一张被移除时同步释放该组的拼图缓存
    groupsRef.current
      .filter((group) => group.taskIds.includes(id) && group.taskIds.length <= 1)
      .forEach((group) => {
        if (group.collageUrl) URL.revokeObjectURL(group.collageUrl);
      });
    setTasks((prev) => prev.filter((task) => task.id !== id));
    setGroups((prev) =>
      prev
        .map((group) =>
          group.taskIds.includes(id)
            ? {
                ...group,
                taskIds: group.taskIds.filter((taskId) => taskId !== id),
                collageDirty: true,
              }
            : group,
        )
        .filter((group) => group.taskIds.length > 0),
    );
    setDetailTaskId((prev) => (prev === id ? null : prev));
  }, []);

  const createGroup = useCallback((taskIds: string[]) => {
    groupCounter.current += 1;
    const taken = new Set(groupsRef.current.map((group) => group.name.toLowerCase()));
    const group: MattingGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: uniqueName(`组${groupCounter.current}`, taken),
      taskIds,
      collageStatus: 'idle',
      collageExtension: 'jpg',
    };
    setGroups((prev) => [...prev, group]);
    setNotice(`已创建「${group.name}」，双击组名可重命名`);
    return group;
  }, []);

  const mergeTasks = useCallback(
    (sourceId: string, targetId: string) => {
      if (!sourceId || sourceId === targetId) return;
      const source = tasksRef.current.find((task) => task.id === sourceId);
      const target = tasksRef.current.find((task) => task.id === targetId);
      if (!source || !target) return;
      const targetGroup = groupsRef.current.find((group) => group.taskIds.includes(targetId));
      const sourceGroup = groupsRef.current.find((group) => group.taskIds.includes(sourceId));

      if (targetGroup) {
        setGroups((prev) =>
          prev
            .map((group) => {
              if (group.id === targetGroup.id) {
                if (group.taskIds.includes(sourceId)) return group;
                return { ...group, taskIds: [...group.taskIds, sourceId], collageDirty: true };
              }
              if (sourceGroup && group.id === sourceGroup.id) {
                return { ...group, taskIds: group.taskIds.filter((id) => id !== sourceId) };
              }
              return group;
            })
            .filter((group) => group.taskIds.length > 0),
        );
        setNotice(`已把「${source.fileName}」加入「${targetGroup.name}」`);
        return;
      }

      if (sourceGroup) {
        setGroups((prev) =>
          prev.map((group) =>
            group.id === sourceGroup.id
              ? { ...group, taskIds: [...group.taskIds, targetId], collageDirty: true }
              : group,
          ),
        );
        setNotice(`已把「${target.fileName}」加入「${sourceGroup.name}」`);
        return;
      }

      createGroup([targetId, sourceId]);
    },
    [createGroup],
  );

  const addTaskToGroup = useCallback((sourceId: string, groupId: string) => {
    if (!sourceId) return;
    const sourceGroup = groupsRef.current.find((group) => group.taskIds.includes(sourceId));
    if (sourceGroup?.id === groupId) return;
    setGroups((prev) =>
      prev
        .map((group) => {
          if (group.id === groupId) {
            if (group.taskIds.includes(sourceId)) return group;
            return { ...group, taskIds: [...group.taskIds, sourceId], collageDirty: true };
          }
          if (sourceGroup && group.id === sourceGroup.id) {
            return { ...group, taskIds: group.taskIds.filter((id) => id !== sourceId) };
          }
          return group;
        })
        .filter((group) => group.taskIds.length > 0),
    );
  }, []);

  const ungroup = useCallback((groupId: string) => {
    const target = groupsRef.current.find((group) => group.id === groupId);
    if (target?.collageUrl) URL.revokeObjectURL(target.collageUrl);
    setGroups((prev) => prev.filter((group) => group.id !== groupId));
    setNotice('已解散分组，图片仍在列表中');
  }, []);

  // 关闭抠图工作台时释放本地缓存（拼图 blob）
  useEffect(
    () => () => {
      groupsRef.current.forEach((group) => {
        if (group.collageUrl) URL.revokeObjectURL(group.collageUrl);
      });
      tasksRef.current.forEach((task) => {
        if (task.resultUrl) URL.revokeObjectURL(task.resultUrl);
      });
    },
    [],
  );

  const commitGroupName = useCallback(
    (groupId: string) => {
      const raw = editingName.trim();
      setGroups((prev) => {
        // 同名分组会造成下载互相覆盖，这里自动加序号
        const taken = new Set(
          prev.filter((group) => group.id !== groupId).map((group) => group.name.toLowerCase()),
        );
        const fallback = prev.find((group) => group.id === groupId)?.name || '组';
        const nextName = raw ? uniqueName(raw, taken) : fallback;
        return prev.map((group) => (group.id === groupId ? { ...group, name: nextName } : group));
      });
      setEditingGroupId(null);
      setEditingName('');
    },
    [editingName],
  );

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

  const ungroupedTasks = tasks.filter((task) => !groupOfTask.has(task.id));
  const pendingCount = tasks.filter(
    (task) => task.status === 'pending' || task.status === 'error',
  ).length;
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const detailTask = detailTaskId ? tasks.find((task) => task.id === detailTaskId) : undefined;

  const renderCard = (task: MattingTask) => {
    const group = groupOfTask.get(task.id);
    const index = group ? group.taskIds.indexOf(task.id) : -1;
    const downloadName = group ? `${group.name}-${index + 1}` : `${task.name}抠图`;
    return (
      <ComparisonCard
        key={task.id}
        task={task}
        downloadName={downloadName}
        hint={group ? `${group.name} · 第 ${index + 1} 张` : undefined}
        isDragging={draggedTaskId === task.id}
        isDropTarget={dropTarget === `task:${task.id}`}
        isAnyDragging={Boolean(draggedTaskId)}
        dragRef={draggedRef}
        resolutionHint={resolution}
        onDragStartTask={(id) => {
          draggedRef.current = id || null;
          setDraggedTaskId(id || null);
          if (!id) setDropTarget(null);
        }}
        onDragEndTask={() => {
          draggedRef.current = null;
          setDraggedTaskId(null);
          setDropTarget(null);
        }}
        onDragOverTask={(id) => setDropTarget(`task:${id}`)}
        onDropOnTask={(targetId) => {
          const sourceId = draggedRef.current;
          if (sourceId) mergeTasks(sourceId, targetId);
          draggedRef.current = null;
          setDraggedTaskId(null);
          setDropTarget(null);
        }}
        onOpenDetail={(id) => setDetailTaskId(id)}
        onRun={(id) => void runTask(id)}
        onDownload={(item, name) => void downloadTask(item, name)}
        onRemove={removeTask}
      />
    );
  };

  return (
    <div
      className="h-full flex flex-col bg-[#FCFBF9] font-serif overflow-hidden relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragCounter.current += 1;
        setIsDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragCounter.current = 0;
        setIsDraggingFiles(false);
        void addFromDrop(event.dataTransfer || null);
      }}
    >
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: 'true', directory: 'true' } as any)}
        onChange={(event) => {
          void addFromFolder(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.psd,.tif,.tiff,.bmp"
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

      {draggedTaskId && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[150] bg-[#1E1E1E]/95 text-white px-4 py-2 text-xs font-sans shadow-xl flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5" /> 拖到其它卡片或分组即可编组
        </div>
      )}

      {isDraggingFiles && (
        <div className="absolute inset-0 z-[120] bg-[#F0EEEB]/90 border-4 border-dashed border-[#1E1E1E] m-4 pointer-events-none flex flex-col items-center justify-center gap-3">
          <Upload className="w-12 h-12 text-[#1E1E1E]" />
          <p className="text-lg font-bold text-[#1E1E1E]">松开鼠标导入图片或文件夹</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between items-start gap-3 px-4 sm:px-6 pt-5 pb-3 border-b border-[#F0F0F0] bg-[#FCFBF9] z-[60] w-full shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // 离开工作台时释放推理进程与显存
              void fetch('/api/matting/release', { method: 'POST' }).catch(() => {});
              onClose();
            }}
            title="返回图库"
            className="flex items-center text-[#7A7A7A] hover:text-[#1E1E1E] transition-colors py-1.5 px-3 -ml-3 bg-transparent rounded-none hover:bg-gray-50 border border-transparent"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回
          </button>
          <h1 className="text-xl font-medium text-[#1E1E1E] flex items-center tracking-tight">
            <Scissors className="w-5 h-5 mr-2" /> 抠图
          </h1>
          {tasks.length > 0 && (
            <span className="text-xs text-[#7A7A7A] font-sans">
              共 {tasks.length} · 完成 {doneCount} · 待处理 {pendingCount}
              {groups.length > 0 ? ` · 分组 ${groups.length}` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <label
            className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans"
            title="人像/服饰：模特、服装、鞋包等主体，发丝与轮廓细节更好；物体/场景：家居、道具、场景照等"
          >
            主体
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as 'matting' | 'general')}
              className="text-xs border border-[#E0E0E0] bg-white rounded-none px-2 py-1.5 focus:outline-none focus:border-[#1E1E1E]"
            >
              <option value="matting">人像/服饰</option>
              <option value="general">物体/场景</option>
            </select>
          </label>
          <label
            className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans cursor-pointer select-none border border-[#E0E0E0] bg-white px-2 py-1.5"
            title="勾选后：组拼图导出 PNG 且不做任何压缩；单张任务导出始终是透明 PNG，不受影响"
          >
            <input
              type="checkbox"
              checked={pngCollage}
              onChange={(event) => setPngCollage(event.target.checked)}
              className="w-3.5 h-3.5 accent-[#1E1E1E]"
            />
            拼图PNG
          </label>
          <label
            className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans cursor-pointer select-none border border-[#E0E0E0] bg-white px-2 py-1.5"
            title="仅建议抠发丝、绒毛、纱、玻璃等软边缘时开启（会在边缘做引导滤波+去色）；高清硬边图开启可能发虚并出现杂质，默认关闭"
          >
            <input
              type="checkbox"
              checked={refineEdges}
              onChange={(event) => setRefineEdges(event.target.checked)}
              className="w-3.5 h-3.5 accent-[#1E1E1E]"
            />
            边缘精修
          </label>
          <label
            className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans cursor-pointer select-none border border-[#E0E0E0] bg-white px-2 py-1.5"
            title="白边/杂色清理：用主体内侧颜色替换边缘混进来的背景色（去掉白边），并清掉散落的杂质与针孔；只改轮廓带，主体内部逐像素不动"
          >
            <input
              type="checkbox"
              checked={cleanEdges}
              onChange={(event) => setCleanEdges(event.target.checked)}
              className="w-3.5 h-3.5 accent-[#1E1E1E]"
            />
            白边杂色清理
          </label>
          {/* 带上 2048/1024 数字，避免「高清/快速」看不出差在哪 */}
          <div
            className="flex items-center gap-1.5 text-xs text-[#7A7A7A] font-sans"
            title="高清 2048：抠图时的推理分辨率更高，边缘与细节更好（约 1 秒/张）；快速 1024：耗时约减半，细节略软"
          >
            分辨率
            <div className="flex items-stretch border border-[#E0E0E0] bg-white">
              {[
                { value: 2048, label: '高清 2048' },
                { value: 1024, label: '快速 1024' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setResolution(option.value)}
                  className={`px-2.5 py-1.5 transition-colors ${
                    resolution === option.value
                      ? 'bg-[#1E1E1E] text-white'
                      : 'text-[#7A7A7A] hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => folderInputRef.current?.click()}
            title="选择文件夹：文件夹内的一层子文件夹会自动识别为分组"
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#1E1E1E] hover:bg-gray-50 transition-colors rounded-none font-sans"
          >
            <FolderPlus className="w-3.5 h-3.5 mr-1" /> 文件夹
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="仅选择图片文件（不分组）"
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#7A7A7A] hover:bg-gray-50 transition-colors rounded-none font-sans"
          >
            <Upload className="w-3.5 h-3.5 mr-1" /> 图片
          </button>
          <button
            onClick={() => void downloadAll()}
            disabled={doneCount === 0 && groups.length === 0}
            title="按分组下载（含拼图）与单张结果"
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#1E1E1E] hover:bg-gray-50 transition-colors rounded-none font-sans disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> 全部
          </button>
          <button
            onClick={() => void downloadZip()}
            disabled={doneCount === 0 && groups.length === 0}
            title="打包成一个 ZIP：分组目录内含拼图与「组名-序号.png」，未编组为「原名抠图.png」"
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#1E1E1E] hover:bg-gray-50 transition-colors rounded-none font-sans disabled:opacity-40"
          >
            <Archive className="w-3.5 h-3.5 mr-1" /> ZIP
          </button>
          {isBatchRunning ? (
            <button
              onClick={() => {
                batchStop.current = true;
                setIsBatchRunning(false);
                // 真正中断：结束常驻推理进程，在途的那张也会停
                void fetch('/api/matting/cancel', { method: 'POST' }).catch(() => {});
              }}
              className="flex items-center text-xs px-4 py-1.5 bg-red-500 text-white hover:bg-red-600 transition-colors rounded-none font-sans"
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> 终止
            </button>
          ) : (
            <button
              onClick={() => void runAll()}
              disabled={pendingCount === 0}
              title="一键抠图：跑完所有待处理任务"
              className="flex items-center text-xs px-4 py-1.5 bg-[#1E1E1E] text-white hover:bg-black transition-colors rounded-none font-sans disabled:opacity-40"
            >
              <Scissors className="w-3.5 h-3.5 mr-1" /> 开始
            </button>
          )}
          <button
            onClick={() => void releaseGpu()}
            title="结束常驻推理进程并释放显存（空闲 2 分钟也会自动释放；下次抠图会重新加载模型约 3 秒）"
            className="flex items-center text-xs px-3 py-1.5 bg-white border border-[#E0E0E0] text-[#7A7A7A] hover:bg-gray-50 transition-colors rounded-none font-sans"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> 释放
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
          {tasks.length === 0 && groups.length === 0 ? (
            <div
              className="mt-6 border-2 border-dashed border-[#E0E0E0] bg-white flex flex-col items-center justify-center py-28 text-center cursor-pointer hover:border-[#1E1E1E] transition-colors"
              onClick={() => folderInputRef.current?.click()}
            >
              <ImageIcon className="w-14 h-14 text-[#A3A3A3] mb-4" />
              <h3 className="text-xl font-medium text-[#1E1E1E] mb-2">拖入图片、文件夹，或 Ctrl+V 粘贴</h3>
              <p className="text-[11px] text-[#A3A3A3] font-sans mt-1">文件夹内一层子文件夹自动成为分组</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-[#7A7A7A] font-sans">
                <Layers className="w-4 h-4" /> 任务（{tasks.length}）
                <span className="text-[10px] text-[#A3A3A3]">拖卡片编组 · 双击卡片放大 · 双击组名改名</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3">
                {groups.map((group) => {
                  const members = group.taskIds
                    .map((id) => tasks.find((task) => task.id === id))
                    .filter(Boolean) as MattingTask[];
                  return (
                    <GroupCard
                      key={group.id}
                      group={group}
                      members={members}
                      isDropTarget={dropTarget === `group:${group.id}`}
                      isAnyDragging={Boolean(draggedTaskId)}
                      dragRef={draggedRef}
                      editing={editingGroupId === group.id}
                      editingName={editingName}
                      onStartRename={() => {
                        setEditingGroupId(group.id);
                        setEditingName(group.name);
                      }}
                      onChangeName={setEditingName}
                      onCommitName={() => commitGroupName(group.id)}
                      onCancelRename={() => {
                        setEditingGroupId(null);
                        setEditingName('');
                      }}
                      onDropTask={() => {
                        const sourceId = draggedRef.current;
                        if (sourceId) addTaskToGroup(sourceId, group.id);
                        draggedRef.current = null;
                        setDraggedTaskId(null);
                        setDropTarget(null);
                      }}
                      onDragOverGroup={() => setDropTarget(`group:${group.id}`)}
                      onRunCollage={() => void runCollage(group.id)}
                      onDownloadCollage={() => void downloadCollage(group)}
                      onDownloadGroup={() => void downloadGroup(group)}
                      onUngroup={() => ungroup(group.id)}
                      onOpenMember={(taskId) => setDetailTaskId(taskId)}
                      onRemoveMember={removeTask}
                    />
                  );
                })}
                {ungroupedTasks.map((task) => renderCard(task))}
              </div>
            </div>
          )}
        </div>
      </div>

      {detailTask && (
        <TaskLightbox
          task={detailTask}
          downloadName={
            groupOfTask.get(detailTask.id)
              ? `${groupOfTask.get(detailTask.id)!.name}-${
                  groupOfTask.get(detailTask.id)!.taskIds.indexOf(detailTask.id) + 1
                }`
              : `${detailTask.name}抠图`
          }
          onClose={() => setDetailTaskId(null)}
          onRun={() => void runTask(detailTask.id)}
          onDownload={() =>
            void downloadTask(
              detailTask,
              groupOfTask.get(detailTask.id)
                ? `${groupOfTask.get(detailTask.id)!.name}-${
                    groupOfTask.get(detailTask.id)!.taskIds.indexOf(detailTask.id) + 1
                  }`
                : `${detailTask.name}抠图`,
            )
          }
          onRemove={() => removeTask(detailTask.id)}
        />
      )}
    </div>
  );
}
