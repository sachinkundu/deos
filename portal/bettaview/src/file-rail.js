export const MIN_FILE_RAIL_WIDTH = 140;
export const MAX_FILE_RAIL_WIDTH = 520;

export function defaultFileRailWidth(viewportWidth) {
  return viewportWidth / 8;
}

export function maxFileRailWidth(viewportWidth, currentThreadRailWidth) {
  const compact = viewportWidth <= 1300;
  const documentWidth = compact ? 590 : 620;
  const threadRailWidth = currentThreadRailWidth ?? Math.max(240, viewportWidth / 4);
  return Math.max(
    MIN_FILE_RAIL_WIDTH,
    Math.min(MAX_FILE_RAIL_WIDTH, viewportWidth - documentWidth - threadRailWidth),
  );
}

export function clampFileRailWidth(width, viewportWidth, currentThreadRailWidth) {
  const numericWidth = Number.isFinite(width) ? width : defaultFileRailWidth(viewportWidth);
  return Math.min(maxFileRailWidth(viewportWidth, currentThreadRailWidth), Math.max(MIN_FILE_RAIL_WIDTH, numericWidth));
}
