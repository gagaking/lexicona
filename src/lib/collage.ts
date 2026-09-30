import {
  fitToCanvas,
  fitToWidth,
  layoutRows,
  scaleCells,
  type CellSize,
} from './collageLayout';

export interface CollageOptions {
  /** 图片之间的间距（像素），固定值，不随缩放变化（默认 40） */
  gap?: number;
  /** 单张图片的最大边（默认 2048） */
  maxCell?: number;
  /** 拼图画布最大宽度（默认 4096） */
  maxWidth?: number;
  /** 输出文件最大字节数（默认 5MB，PNG 不压缩时忽略） */
  maxBytes?: number;
  /** JPG 输出的背景色；PNG 输出始终透明底，忽略此参数 */
  background?: string;
  /** 拼图前裁掉透明/空白边（默认开启） */
  trimTransparent?: boolean;
  /** alpha 判定阈值（0-255） */
  alphaThreshold?: number;
  /** 输出格式：jpeg（默认，压缩到 maxBytes 以内）或 png（无损、透明底） */
  format?: 'jpeg' | 'png';
  /** 跳过完全透明（没抠出主体）的图片，默认开启 */
  skipEmpty?: boolean;
}

export interface CollageResult {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
  bytes: number;
  quality: number;
  columns: number;
  rows: number;
  extension: 'jpg' | 'png';
  /** 因为全透明而被跳过的图片数量 */
  skipped: number;
}

export const JPEG_QUALITIES = [0.94, 0.9, 0.85, 0.8, 0.72, 0.62, 0.5];
export const TRIM_SCAN_MAX = 1024;

export interface TrimBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 从 alpha 数据里求内容包围盒（worker 与主线程共用） */
export function boxFromAlpha(
  data: Uint8ClampedArray,
  scanWidth: number,
  scanHeight: number,
  inverseScale: number,
  naturalWidth: number,
  naturalHeight: number,
  alphaThreshold: number,
): TrimBox | null {
  let minX = scanWidth;
  let minY = scanHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < scanHeight; y += 1) {
    const rowOffset = y * scanWidth * 4;
    for (let x = 0; x < scanWidth; x += 1) {
      if (data[rowOffset + x * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  const x = Math.max(0, Math.floor(minX * inverseScale) - 1);
  const y = Math.max(0, Math.floor(minY * inverseScale) - 1);
  const width = Math.min(naturalWidth - x, Math.ceil((maxX - minX + 1) * inverseScale) + 2);
  const height = Math.min(naturalHeight - y, Math.ceil((maxY - minY + 1) * inverseScale) + 2);
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

/** 计算最终排版：先按单图上限缩放，再限制总宽，最后限制画布尺寸 */
export function planCollage(
  contents: CellSize[],
  gap: number,
  maxCell: number,
  maxWidth: number,
) {
  let cells = contents.map((content) => {
    const scale = Math.min(1, maxCell / Math.max(content.width, content.height));
    return {
      width: Math.max(1, Math.round(content.width * scale)),
      height: Math.max(1, Math.round(content.height * scale)),
    };
  });
  cells = fitToWidth(cells, gap, maxWidth).cells;
  cells = fitToCanvas(cells, gap).cells;
  return { cells, plan: layoutRows(cells, gap) };
}

export function sourceBoxSize(image: HTMLImageElement): CellSize {
  return { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，无法拼图'));
    image.src = src;
  });
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function toPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** 让出主线程，避免长时间阻塞界面 */
const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * 计算图片内容的包围盒，用来裁掉抠图结果四周多余的透明像素。
 * 先在缩小图上扫描，再映射回原图坐标，速度快且足够精确。
 */
function measureContentBox(image: HTMLImageElement, alphaThreshold: number) {
  const naturalWidth = image.naturalWidth || 1;
  const naturalHeight = image.naturalHeight || 1;
  const scale = Math.min(1, TRIM_SCAN_MAX / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);

  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch (_) {
    return null;
  }
  return boxFromAlpha(
    data,
    width,
    height,
    1 / scale,
    naturalWidth,
    naturalHeight,
    alphaThreshold,
  );
}

/**
 * 将多张抠图结果按 2 列 × n 行上下拼合（主线程实现，作为 Worker 不可用时的兜底）。
 * 单图最大边 ≤ maxCell，画布宽度 ≤ maxWidth，图片间距固定 gap，
 * JPG 输出白底并压到 maxBytes 内；PNG 输出透明底且不压缩。
 */
export async function buildCollage(
  sources: string[],
  options: CollageOptions = {},
): Promise<CollageResult> {
  const gap = options.gap ?? 40;
  const maxCell = options.maxCell ?? 2048;
  const maxWidth = options.maxWidth ?? 4096;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const background = options.background ?? '#FFFFFF';
  const trimTransparent = options.trimTransparent ?? true;
  const alphaThreshold = options.alphaThreshold ?? 8;
  const format = options.format ?? 'jpeg';
  // PNG 导出要求透明底，只在 JPG 时铺白底
  const transparent = format === 'png';
  const skipEmpty = options.skipEmpty ?? true;

  if (sources.length === 0) throw new Error('没有可用于拼图的抠图结果');

  const loaded = await Promise.all(sources.map(loadImage));
  await yieldToUi();

  let skipped = 0;
  const regions: Array<TrimBox | null> = [];
  const kept: HTMLImageElement[] = [];
  for (const image of loaded) {
    const full: TrimBox = {
      x: 0,
      y: 0,
      width: image.naturalWidth || 1,
      height: image.naturalHeight || 1,
    };
    const box = trimTransparent ? measureContentBox(image, alphaThreshold) : full;
    if (!box) {
      skipped += 1;
      if (skipEmpty) continue;
      regions.push(full);
      kept.push(image);
      continue;
    }
    regions.push(box);
    kept.push(image);
  }
  if (kept.length === 0) {
    throw new Error('组内没有可拼合的有效抠图结果（可能都没抠出主体）');
  }
  await yieldToUi();

  const { cells, plan } = planCollage(
    regions.map((box) => ({ width: box!.width, height: box!.height })),
    gap,
    maxCell,
    maxWidth,
  );

  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建画布，拼图失败');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (!transparent) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  let y = gap;
  let cursor = 0;
  plan.rows.forEach((row, rowIndex) => {
    let x = gap;
    row.forEach((cell) => {
      const image = kept[cursor];
      const region = regions[cursor]!;
      cursor += 1;
      context.drawImage(
        image,
        region.x,
        region.y,
        region.width,
        region.height,
        x,
        y,
        cell.width,
        cell.height,
      );
      x += cell.width + gap;
    });
    y += plan.rowHeights[rowIndex] + gap;
  });
  await yieldToUi();

  let blob: Blob | null = null;
  let quality = JPEG_QUALITIES[0];
  if (transparent) {
    blob = await toPngBlob(canvas);
  } else {
    for (const candidate of JPEG_QUALITIES) {
      const result = await toJpegBlob(canvas, candidate);
      if (result) {
        blob = result;
        quality = candidate;
        if (result.size <= maxBytes) break;
      }
      await yieldToUi();
    }
  }

  // 仍超出体积限制时整体缩小重试
  let round = 0;
  while (blob && !transparent && blob.size > maxBytes && round < 3) {
    round += 1;
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.round(canvas.width * 0.75));
    scaled.height = Math.max(1, Math.round(canvas.height * 0.75));
    const scaledContext = scaled.getContext('2d');
    if (!scaledContext) break;
    scaledContext.imageSmoothingEnabled = true;
    scaledContext.imageSmoothingQuality = 'high';
    scaledContext.fillStyle = background;
    scaledContext.fillRect(0, 0, scaled.width, scaled.height);
    scaledContext.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    context.drawImage(scaled, 0, 0);
    for (const candidate of JPEG_QUALITIES) {
      const result = await toJpegBlob(canvas, candidate);
      if (result) {
        blob = result;
        quality = candidate;
        if (result.size <= maxBytes) break;
      }
    }
    await yieldToUi();
  }

  if (!blob) throw new Error('拼图导出失败');

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    bytes: blob.size,
    quality: transparent ? 1 : quality,
    columns: 2,
    rows: plan.rows.length,
    extension: transparent ? 'png' : 'jpg',
    skipped,
  };
}

export { scaleCells };
