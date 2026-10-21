import type { Level } from '../config/LevelCatalog';

export const DROP_GRACE_MS = 2_000;
export const OVER_LINE_MS = 3_000;

/** 分数、结束状态和每枚角色的连续越线起点都属于同一局。 */
export class GameSession {
  private totalScore = 0;
  private ended = false;
  private readonly overLineSince = new Map<number, number>();

  get score(): number {
    return this.totalScore;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  awardMerge(targetLevel: Level): void {
    if (this.ended) return;
    this.totalScore += 2 ** targetLevel;
  }

  /** 返回 true 仅表示这一帧刚达到失败条件。 */
  observePiece(id: number, isOverLine: boolean, releasedAt: number | null, now: number): boolean {
    if (this.ended) return false;
    if (!isOverLine || (releasedAt !== null && now - releasedAt < DROP_GRACE_MS)) {
      this.overLineSince.delete(id);
      return false;
    }

    const since = this.overLineSince.get(id);
    if (since === undefined) {
      this.overLineSince.set(id, now);
      return false;
    }
    if (now - since < OVER_LINE_MS) return false;
    this.ended = true;
    return true;
  }

  forgetPiece(id: number): void {
    this.overLineSince.delete(id);
  }

  reset(): void {
    this.totalScore = 0;
    this.ended = false;
    this.overLineSince.clear();
  }
}
