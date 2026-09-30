/** 拼图排版计算（主线程与 Web Worker 共用，保证结果一致） */

export interface CellSize {
  width: number;
  height: number;
}

export const CANVAS_MAX_SIDE = 16384;
export const CANVAS_MAX_AREA = 268_000_000;

export function rowsOf<T>(cells: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < cells.length; index += 2) {
    rows.push(cells.slice(index, index + 2));
  }
  return rows;
}

export function layoutRows(cells: CellSize[], gap: number) {
  const rows = rowsOf(cells);
  const rowHeights = rows.map((row) => Math.max(...row.map((cell) => cell.height)));
  const width = Math.max(
    ...rows.map((row) => row.reduce((sum, cell) => sum + cell.width, 0) + gap * (row.length + 1)),
  );
  const height = rowHeights.reduce((sum, value) => sum + value, 0) + gap * (rows.length + 1);
  return { rows, rowHeights, width, height };
}

/** 按比例缩放单元格（长宽同时缩放） */
export function scaleCells(cells: CellSize[], factor: number): CellSize[] {
  if (factor === 1) return cells;
  return cells.map((cell) => ({
    width: Math.max(1, Math.round(cell.width * factor)),
    height: Math.max(1, Math.round(cell.height * factor)),
  }));
}

/** 让整幅拼图宽度不超过 maxWidth（间距保持不变） */
export function fitToWidth(cells: CellSize[], gap: number, maxWidth: number) {
  let plan = layoutRows(cells, gap);
  if (plan.width <= maxWidth) return { cells, plan };
  const target = Math.min(
    ...plan.rows.map((row) => {
      const inner = row.reduce((sum, cell) => sum + cell.width, 0);
      const available = maxWidth - gap * (row.length + 1);
      return inner > 0 && available > 0 ? available / inner : 1;
    }),
  );
  const factor = Math.max(0.05, Math.min(1, target));
  const scaled = scaleCells(cells, factor);
  return { cells: scaled, plan: layoutRows(scaled, gap) };
}

/** 画布尺寸硬限制（Chromium 单边 16384 / 面积上限） */
export function fitToCanvas(cells: CellSize[], gap: number) {
  let current = cells;
  let plan = layoutRows(current, gap);
  let guard = 0;
  while (
    (plan.width > CANVAS_MAX_SIDE ||
      plan.height > CANVAS_MAX_SIDE ||
      plan.width * plan.height > CANVAS_MAX_AREA) &&
    guard < 12
  ) {
    current = scaleCells(current, 0.85);
    plan = layoutRows(current, gap);
    guard += 1;
  }
  return { cells: current, plan };
}
