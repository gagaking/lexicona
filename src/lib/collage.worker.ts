/// <reference lib="webworker" />
import {
  JPEG_QUALITIES,
  TRIM_SCAN_MAX,
  boxFromAlpha,
  planCollage,
  type CollageOptions,
} from './collage';

const scope = self as any;

function measureContentBox(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  alphaThreshold: number,
) {
  const scale = Math.min(1, TRIM_SCAN_MAX / Math.max(width, height));
  const scanWidth = Math.max(1, Math.round(width * scale));
  const scanHeight = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(scanWidth, scanHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, scanWidth, scanHeight);
  const data = context.getImageData(0, 0, scanWidth, scanHeight).data;
  return boxFromAlpha(data, scanWidth, scanHeight, 1 / scale, width, height, alphaThreshold);
}

scope.onmessage = async (event: MessageEvent) => {
  const {
    id,
    sources,
    options,
  } = event.data as { id: number; sources: Blob[]; options: CollageOptions };
  const gap = options?.gap ?? 40;
  const maxCell = options?.maxCell ?? 2048;
  const maxWidth = options?.maxWidth ?? 4096;
  const maxBytes = options?.maxBytes ?? 5 * 1024 * 1024;
  const background = options?.background ?? '#FFFFFF';
  const trimTransparent = options?.trimTransparent ?? true;
  const alphaThreshold = options?.alphaThreshold ?? 8;
  const format = options?.format ?? 'jpeg';
  const transparent = format === 'png';
  const skipEmpty = options?.skipEmpty ?? true;

  try {
    const bitmaps: ImageBitmap[] = [];
    for (const blob of sources) {
      bitmaps.push(await createImageBitmap(blob));
    }

    let skipped = 0;
    const kept: ImageBitmap[] = [];
    const regions: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const bitmap of bitmaps) {
      const full = { x: 0, y: 0, width: bitmap.width || 1, height: bitmap.height || 1 };
      const box = trimTransparent
        ? measureContentBox(bitmap, bitmap.width || 1, bitmap.height || 1, alphaThreshold)
        : full;
      if (!box) {
        skipped += 1;
        if (skipEmpty) continue;
        kept.push(bitmap);
        regions.push(full);
        continue;
      }
      kept.push(bitmap);
      regions.push(box);
    }
    if (kept.length === 0) {
      throw new Error('组内没有可拼合的有效抠图结果（可能都没抠出主体）');
    }

    const { cells, plan } = planCollage(
      regions.map((box) => ({ width: box.width, height: box.height })),
      gap,
      maxCell,
      maxWidth,
    );

    const canvas = new OffscreenCanvas(plan.width, plan.height);
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
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
        const bitmap = kept[cursor];
        const region = regions[cursor];
        cursor += 1;
        context.drawImage(
          bitmap,
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

    let blob: Blob | null = null;
    let quality = 1;
    if (transparent) {
      blob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      for (const candidate of JPEG_QUALITIES) {
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: candidate });
        quality = candidate;
        if (blob.size <= maxBytes) break;
      }
    }

    let width = canvas.width;
    let height = canvas.height;
    let outCanvas: OffscreenCanvas = canvas;
    let round = 0;
    while (blob && !transparent && blob.size > maxBytes && round < 3) {
      round += 1;
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
      const scaled = new OffscreenCanvas(width, height);
      const scaledContext = scaled.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (!scaledContext) break;
      scaledContext.imageSmoothingEnabled = true;
      scaledContext.imageSmoothingQuality = 'high';
      scaledContext.fillStyle = background;
      scaledContext.fillRect(0, 0, width, height);
      scaledContext.drawImage(outCanvas, 0, 0, width, height);
      outCanvas = scaled;
      for (const candidate of JPEG_QUALITIES) {
        blob = await outCanvas.convertToBlob({ type: 'image/jpeg', quality: candidate });
        quality = candidate;
        if (blob.size <= maxBytes) break;
      }
    }

    if (!blob) throw new Error('拼图导出失败');

    scope.postMessage({
      id,
      ok: true,
      blob,
      width,
      height,
      bytes: blob.size,
      quality: transparent ? 1 : quality,
      rows: plan.rows.length,
      skipped,
      extension: transparent ? 'png' : 'jpg',
    });
  } catch (error) {
    scope.postMessage({ id, ok: false, error: String((error as Error)?.message || error) });
  }
};
