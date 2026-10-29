import Phaser from 'phaser';
import { drawDropLevel, getLevelConfig, getShapeHalfExtents, getSpriteDisplaySize } from '../config/LevelCatalog';
import type { DropLevel, Level } from '../config/LevelCatalog';

type DropControllerOptions = {
  minX: number;
  maxX: number;
  guideEndY: number;
  cooldownMs: number;
  canDrop: () => boolean;
  canReserve: () => boolean;
  onDrop: (x: number, level: Level) => void;
  onQueueChange: (current: Level, next: DropLevel) => void;
  onReserveChange: (held: DropLevel | null, available: boolean) => void;
};

/** 统一处理鼠标与触屏：移动预览，按下后松开投放。 */
export class DropController {
  private x: number;
  private armedPointerId: number | null = null;
  private nextDropAt = 0;
  private currentLevel: Level = drawDropLevel();
  private nextLevel: DropLevel = drawDropLevel();
  private heldLevel: DropLevel | null = null;
  private reserveUsedThisDrop = false;
  private readonly guide: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly preview: Phaser.GameObjects.Image,
    private readonly options: DropControllerOptions,
  ) {
    this.guide = scene.add.graphics().setDepth(-1).setVisible(false);
    this.preview.setDepth(1);
    this.x = (options.minX + options.maxX) / 2;
    this.updatePreview();

    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUpOutside);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.armedPointerId !== null && pointer.id !== this.armedPointerId) return;
    this.movePreview(this.getPointerWorldX(pointer));
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.armedPointerId !== null) return;
    this.armedPointerId = pointer.id;
    this.movePreview(this.getPointerWorldX(pointer));
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.armedPointerId) return;
    this.armedPointerId = null;
    this.movePreview(this.getPointerWorldX(pointer));

    const now = this.scene.time.now;
    if (!this.options.canDrop() || now < this.nextDropAt) return;
    this.nextDropAt = now + this.options.cooldownMs;
    this.options.onDrop(this.x, this.currentLevel);
    this.currentLevel = this.nextLevel;
    this.nextLevel = drawDropLevel();
    this.reserveUsedThisDrop = false;
    this.updatePreview();
  };

  private readonly onPointerUpOutside = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.armedPointerId) this.armedPointerId = null;
  };

  private getPointerWorldX(pointer: Phaser.Input.Pointer): number {
    pointer.updateWorldPoint(this.scene.cameras.main);
    return pointer.worldX;
  }

  private movePreview(pointerX: number): void {
    const halfWidth = getShapeHalfExtents(getLevelConfig(this.currentLevel)).x;
    this.x = Phaser.Math.Clamp(pointerX, this.options.minX + halfWidth + 2, this.options.maxX - halfWidth - 2);
    this.preview.setX(this.x);
    this.drawGuide();
  }

  /** 虚线只标示投放的横向位置，不预测与已有角色碰撞后的最终落点。 */
  private drawGuide(): void {
    const displaySize = getSpriteDisplaySize(getLevelConfig(this.currentLevel));
    const startY = this.preview.y + displaySize / 2 + 5;
    const endY = Math.min(startY + 70, this.options.guideEndY);
    this.guide.clear().lineStyle(2, 0x7eab7c, 0.85);
    for (let y = startY; y < endY; y += 13) {
      this.guide.lineBetween(this.x, y, this.x, Math.min(y + 7, endY));
    }
  }

  setGuideVisible(visible: boolean): void {
    this.guide.setVisible(visible);
  }

  /** 每次实际投放前最多暂存或交换一次。 */
  reserve(): boolean {
    if (!this.options.canReserve() || this.reserveUsedThisDrop || this.currentLevel > 3) return false;
    const current = this.currentLevel as DropLevel;
    if (this.heldLevel === null) {
      this.heldLevel = current;
      this.currentLevel = this.nextLevel;
      this.nextLevel = drawDropLevel();
    } else {
      this.currentLevel = this.heldLevel;
      this.heldLevel = current;
    }
    this.reserveUsedThisDrop = true;
    this.updatePreview();
    return true;
  }

  refreshReserveAvailability(): void {
    this.notifyReserveChange();
  }

  /** 只由本地开发测试面板调用，不改变正常随机池。 */
  forceCurrentLevelForTest(level: Level): void {
    this.currentLevel = level;
    this.updatePreview();
  }

  reset(): void {
    this.armedPointerId = null;
    this.nextDropAt = 0;
    this.currentLevel = drawDropLevel();
    this.nextLevel = drawDropLevel();
    this.heldLevel = null;
    this.reserveUsedThisDrop = false;
    this.x = (this.options.minX + this.options.maxX) / 2;
    this.updatePreview();
  }

  private updatePreview(): void {
    const config = getLevelConfig(this.currentLevel);
    this.preview.setTexture(config.textureKey);
    this.preview.setDisplaySize(getSpriteDisplaySize(config), getSpriteDisplaySize(config));
    this.movePreview(this.x);
    this.options.onQueueChange(this.currentLevel, this.nextLevel);
    this.notifyReserveChange();
  }

  private notifyReserveChange(): void {
    this.options.onReserveChange(
      this.heldLevel,
      !this.reserveUsedThisDrop && this.currentLevel <= 3 && this.options.canReserve(),
    );
  }

  private destroy(): void {
    this.guide.destroy();
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUpOutside);
  }
}
