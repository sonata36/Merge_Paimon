/** 棋盘和物理世界仍用 480×640 坐标；画布按显示密度提高实际像素数。 */
export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 640;
export const RENDER_SCALE = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio * 1.5)));
