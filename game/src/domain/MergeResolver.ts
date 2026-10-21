import { MAX_LEVEL } from '../config/LevelCatalog.ts';
import type { Level } from '../config/LevelCatalog.ts';

export type MergeCandidate = { id: number; level: Level };

export type MergePlan = {
  firstId: number;
  secondId: number;
  targetLevel: Level;
};

/** 在同一物理步内锁定角色，防止一个角色被多个接触对重复结算。 */
export class MergeResolver {
  private readonly lockedIds = new Set<number>();
  private readonly pending: MergePlan[] = [];

  queue(first: MergeCandidate, second: MergeCandidate): boolean {
    if (first.id === second.id || first.level !== second.level || first.level >= MAX_LEVEL) return false;
    if (this.lockedIds.has(first.id) || this.lockedIds.has(second.id)) return false;

    this.lockedIds.add(first.id);
    this.lockedIds.add(second.id);
    this.pending.push({
      firstId: first.id,
      secondId: second.id,
      targetLevel: (first.level + 1) as Level,
    });
    return true;
  }

  drain(): MergePlan[] {
    return this.pending.splice(0);
  }

  complete(plan: MergePlan): void {
    this.lockedIds.delete(plan.firstId);
    this.lockedIds.delete(plan.secondId);
  }

  clear(): void {
    this.pending.length = 0;
    this.lockedIds.clear();
  }
}
