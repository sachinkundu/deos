export const MIN_THREAD_RAIL_WIDTH = 240;
export const MAX_THREAD_RAIL_WIDTH = 600;

export function defaultThreadRailWidth(viewportWidth) {
  return viewportWidth / 4;
}

export function maxThreadRailWidth(viewportWidth, fileRailWidth) {
  const documentWidth = viewportWidth <= 1300 ? 590 : 620;
  return Math.max(
    MIN_THREAD_RAIL_WIDTH,
    Math.min(MAX_THREAD_RAIL_WIDTH, viewportWidth - fileRailWidth - documentWidth),
  );
}

export function clampThreadRailWidth(width, viewportWidth, fileRailWidth) {
  const numericWidth = Number.isFinite(width) ? width : defaultThreadRailWidth(viewportWidth);
  return Math.min(
    maxThreadRailWidth(viewportWidth, fileRailWidth),
    Math.max(MIN_THREAD_RAIL_WIDTH, numericWidth),
  );
}

export function threadRailFontScale(width, viewportWidth, fileRailWidth = 280) {
  const availableMax = maxThreadRailWidth(viewportWidth, fileRailWidth);
  const baselineWidth = Math.min(defaultThreadRailWidth(viewportWidth), availableMax);
  const usableRange = Math.max(1, availableMax - baselineWidth);
  return Math.min(1, Math.max(0, (width - baselineWidth) / usableRange));
}
