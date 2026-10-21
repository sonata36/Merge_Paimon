export const MAX_LEVEL = 8;
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DropLevel = 1 | 2 | 3;

/** 坐标和尺寸以本级 radius 为单位，原点是贴图与刚体共同的中心。 */
export type ShapePart =
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number };

export type LevelConfig = {
  level: Level;
  radius: number;
  fill: string;
  stroke: string;
  label: string;
  textureKey: string;
  parts: readonly ShapePart[];
};

export const LEVELS: readonly LevelConfig[] = [
  { level: 1, radius: 28, fill: '#ffd2df', stroke: '#c96b8b', label: '#61334a', textureKey: 'level-1', parts: [
    { kind: 'circle', x: 0, y: 0, radius: 0.8 },
    { kind: 'circle', x: 0, y: -0.3, radius: 0.63 },
    { kind: 'circle', x: 0, y: 0.45, radius: 0.48 },
  ] },
  { level: 2, radius: 34, fill: '#ffe4a1', stroke: '#d49a38', label: '#654b21', textureKey: 'level-2', parts: [
    { kind: 'circle', x: 0, y: -0.12, radius: 0.72 },
    { kind: 'rect', x: 0, y: 0.27, width: 1.35, height: 0.78 },
    { kind: 'circle', x: -0.7, y: 0.12, radius: 0.27 },
    { kind: 'circle', x: 0.7, y: 0.12, radius: 0.27 },
  ] },
  { level: 3, radius: 40, fill: '#bcebd1', stroke: '#58ab80', label: '#235842', textureKey: 'level-3', parts: [
    { kind: 'circle', x: 0, y: -0.33, radius: 0.62 },
    { kind: 'rect', x: 0, y: 0.32, width: 0.9, height: 1.2 },
    { kind: 'circle', x: -0.43, y: 0.08, radius: 0.18 },
    { kind: 'circle', x: 0.43, y: 0.08, radius: 0.18 },
  ] },
  { level: 4, radius: 46, fill: '#beddfc', stroke: '#5c95cf', label: '#25496e', textureKey: 'level-4', parts: [
    { kind: 'circle', x: -0.18, y: -0.23, radius: 0.65 },
    { kind: 'rect', x: 0.2, y: 0.38, width: 1.1, height: 0.8 },
    { kind: 'circle', x: 0.68, y: -0.25, radius: 0.24 },
    { kind: 'circle', x: 0.28, y: 0.7, radius: 0.25 },
  ] },
  { level: 5, radius: 53, fill: '#d9cafa', stroke: '#9875cb', label: '#4d3771', textureKey: 'level-5', parts: [
    { kind: 'rect', x: 0, y: 0.08, width: 1.46, height: 0.78 },
    { kind: 'circle', x: -0.32, y: -0.1, radius: 0.5 },
    { kind: 'circle', x: -0.76, y: 0.1, radius: 0.21 },
    { kind: 'circle', x: 0.76, y: 0.1, radius: 0.21 },
    { kind: 'circle', x: 0.66, y: 0.36, radius: 0.2 },
  ] },
  { level: 6, radius: 61, fill: '#ffc7ae', stroke: '#dc8057', label: '#703d2c', textureKey: 'level-6', parts: [
    { kind: 'circle', x: 0, y: -0.3, radius: 0.65 },
    { kind: 'rect', x: 0, y: 0.37, width: 1.3, height: 0.9 },
    { kind: 'circle', x: -0.68, y: 0.18, radius: 0.24 },
    { kind: 'circle', x: 0.68, y: 0.18, radius: 0.24 },
    { kind: 'circle', x: -0.45, y: 0.68, radius: 0.27 },
    { kind: 'circle', x: 0.45, y: 0.68, radius: 0.27 },
  ] },
  { level: 7, radius: 74, fill: '#8edddf', stroke: '#369da2', label: '#1d5559', textureKey: 'level-7', parts: [
    { kind: 'circle', x: 0, y: -0.26, radius: 0.64 },
    { kind: 'rect', x: 0, y: 0.35, width: 0.9, height: 1.1 },
    { kind: 'circle', x: -0.6, y: -0.15, radius: 0.25 },
    { kind: 'circle', x: 0.6, y: -0.15, radius: 0.25 },
    { kind: 'circle', x: -0.25, y: 0.7, radius: 0.25 },
    { kind: 'circle', x: 0.25, y: 0.7, radius: 0.25 },
  ] },
  { level: 8, radius: 90, fill: '#f9d46d', stroke: '#b68319', label: '#604610', textureKey: 'level-8', parts: [
    { kind: 'circle', x: 0, y: -0.24, radius: 0.66 },
    { kind: 'rect', x: 0, y: 0.27, width: 1.12, height: 0.92 },
    { kind: 'circle', x: -0.68, y: 0.12, radius: 0.24 },
    { kind: 'circle', x: 0.68, y: 0.12, radius: 0.24 },
    { kind: 'circle', x: -0.47, y: 0.65, radius: 0.3 },
    { kind: 'circle', x: 0.47, y: 0.65, radius: 0.3 },
  ] },
];

/** 512px 素材统一留约 20px 透明边距；主体最大边约为画布的 92%。 */
export function getSpriteDisplaySize(config: LevelConfig): number {
  return config.radius * 2.1;
}

export function getLevelConfig(level: Level): LevelConfig {
  return LEVELS[level - 1];
}

export function getShapeHalfExtents(config: LevelConfig): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const part of config.parts) {
    const halfWidth = part.kind === 'circle' ? part.radius : part.width / 2;
    const halfHeight = part.kind === 'circle' ? part.radius : part.height / 2;
    x = Math.max(x, Math.abs(part.x) + halfWidth);
    y = Math.max(y, Math.abs(part.y) + halfHeight);
  }
  return { x: x * config.radius, y: y * config.radius };
}

/** Math.random() 的 [0, 1) 区间均分为三个等长区间。 */
export function drawDropLevel(random: () => number = Math.random): DropLevel {
  return (Math.floor(random() * 3) + 1) as DropLevel;
}
