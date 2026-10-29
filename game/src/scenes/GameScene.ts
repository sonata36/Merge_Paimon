import Phaser from 'phaser';
import { LEVELS, getLevelConfig, getShapeHalfExtents, getSpriteDisplaySize } from '../config/LevelCatalog';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, RENDER_SCALE } from '../config/DisplayScale';
import type { DropLevel, Level } from '../config/LevelCatalog';
import { createCompoundBody } from '../domain/CompoundBody';
import { DropController } from '../domain/DropController';
import { GameSession } from '../domain/GameSession';
import { MergeResolver } from '../domain/MergeResolver';
import { BackgroundMusic } from '../domain/BackgroundMusic';
import { SoundFeedback } from '../domain/SoundFeedback';
import type { Piece } from '../domain/Piece';

const BOARD_LEFT = 50;
const BOARD_RIGHT = 430;
const BOARD_TOP = 130;
const BOARD_BOTTOM = 584;
const WALL_THICKNESS = 24;
const FAILURE_LINE_Y = 210;

export class GameScene extends Phaser.Scene {
  private readonly session = new GameSession();
  private readonly mergeResolver = new MergeResolver();
  private readonly pieces = new Map<number, Piece>();
  private readonly pieceIdByBodyId = new Map<number, number>();
  private nextPieceId = 1;
  private mergeFlushScheduled = false;
  private scoreElement: HTMLElement | null = null;
  private nextElement: HTMLElement | null = null;
  private nextImage: HTMLImageElement | null = null;
  private nextFallback: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private celebrationElement: HTMLElement | null = null;
  private celebrationTimer: Phaser.Time.TimerEvent | null = null;
  private hasCelebratedLevelEight = false;
  private startScreen: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private muteButton: HTMLButtonElement | null = null;
  private reserveButton: HTMLButtonElement | null = null;
  private strategyHelpButton: HTMLButtonElement | null = null;
  private strategyHelpPanel: HTMLElement | null = null;
  private reserveImage: HTMLImageElement | null = null;
  private reserveFallback: HTMLElement | null = null;
  private reserveValue: HTMLElement | null = null;
  private pushButton: HTMLButtonElement | null = null;
  private pushLeftButton: HTMLButtonElement | null = null;
  private pushRightButton: HTMLButtonElement | null = null;
  private pushCancelButton: HTMLButtonElement | null = null;
  private pushCountElement: HTMLElement | null = null;
  private pushHintElement: HTMLElement | null = null;
  private pushesLeft = 2;
  private pushMode = false;
  private selectedPushPieceId: number | null = null;
  private readonly pushEligibleAfter = new Map<number, number>();
  private readonly backgroundMusic = new BackgroundMusic();
  private readonly soundFeedback = new SoundFeedback();
  private readonly missingLevels = new Set<Level>();
  private hasStarted = false;
  private hasShownFirstDrop = false;
  private gameOverElement: HTMLElement | null = null;
  private finalScoreElement: HTMLElement | null = null;
  private restartButton: HTMLButtonElement | null = null;
  private dropController: DropController | null = null;
  private testOverlinePiece: Piece | null = null;
  private stressMode = false;
  private stressStartedAt = 0;
  private stressFrames = 0;
  private stressReported = false;
  private stressResult: HTMLElement | null = null;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    if (window.location.protocol === 'file:') return;
    for (const config of LEVELS) {
      if (this.isMissingForTest(config.level)) continue;
      this.load.image(config.textureKey, `./characters/lv${config.level}.png`);
    }
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
    void this.loadMissingImages().then(() => {
      if (this.sys.isActive()) this.initializeGame();
    });
  }

  private isMissingForTest(level: Level): boolean {
    return import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get('missing')) === level;
  }

  /** 初次请求偶发失败时再取一次图片；真正缺图仍由占位纹理接管。 */
  private async loadMissingImages(): Promise<void> {
    const isLocalFile = window.location.protocol === 'file:';
    await Promise.all(LEVELS.map(async (config) => {
      if (this.textures.exists(config.textureKey) || this.isMissingForTest(config.level)) return;
      const assetUrl = new URL(
        isLocalFile ? `./assets/characters/lv${config.level}.png` : `./characters/lv${config.level}.png`,
        document.baseURI,
      );
      for (let attempt = 0; attempt < (isLocalFile ? 1 : 2); attempt += 1) {
        const url = new URL(assetUrl.href);
        if (attempt > 0) url.searchParams.set('retry', String(Date.now()));
        const image = new Image();
        const loaded = await new Promise<boolean>((resolve) => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = url.href;
        });
        if (loaded) {
          this.textures.addImage(config.textureKey, image);
          return;
        }
      }
    }));
  }

  private initializeGame(): void {
    const missingLevels = this.createPlaceholderTextures();
    this.missingLevels.clear();
    for (const level of missingLevels) this.missingLevels.add(level);
    this.populateLevelList();
    const assetWarning = document.getElementById('asset-warning');
    if (assetWarning) {
      assetWarning.hidden = missingLevels.length === 0;
      assetWarning.textContent = missingLevels.length === 0
        ? ''
        : `角色图 ${missingLevels.map((level) => `lv${level}.png`).join('、')} 未加载；对应等级使用程序占位图。`;
    }
    this.drawBoard();
    this.createWalls();

    this.scoreElement = document.getElementById('score-value');
    this.nextElement = document.getElementById('next-value');
    this.nextImage = document.getElementById('next-image') as HTMLImageElement | null;
    this.nextFallback = document.getElementById('next-fallback');
    this.statusElement = document.getElementById('game-status');
    this.celebrationElement = document.getElementById('level-eight-celebration');
    this.startScreen = document.getElementById('start-screen');
    this.startButton = document.getElementById('start-button') as HTMLButtonElement | null;
    this.startButton?.addEventListener('click', this.startGame);
    if (this.startButton) {
      this.startButton.disabled = false;
      this.startButton.textContent = '开始游戏';
    }
    this.muteButton = document.getElementById('mute-toggle') as HTMLButtonElement | null;
    this.muteButton?.addEventListener('click', this.toggleMute);
    if (this.muteButton) this.muteButton.disabled = false;
    this.reserveButton = document.getElementById('reserve-button') as HTMLButtonElement | null;
    this.strategyHelpButton = document.getElementById('strategy-help-toggle') as HTMLButtonElement | null;
    this.strategyHelpPanel = document.getElementById('strategy-help');
    this.strategyHelpButton?.addEventListener('click', this.toggleStrategyHelp);
    this.reserveImage = document.getElementById('reserve-image') as HTMLImageElement | null;
    this.reserveFallback = document.getElementById('reserve-fallback');
    this.reserveValue = document.getElementById('reserve-value');
    this.reserveButton?.addEventListener('click', this.useReserve);
    this.pushButton = document.getElementById('push-button') as HTMLButtonElement | null;
    this.pushLeftButton = document.getElementById('push-left') as HTMLButtonElement | null;
    this.pushRightButton = document.getElementById('push-right') as HTMLButtonElement | null;
    this.pushCancelButton = document.getElementById('push-cancel') as HTMLButtonElement | null;
    this.pushCountElement = document.getElementById('push-count');
    this.pushHintElement = document.getElementById('push-hint');
    this.pushButton?.addEventListener('click', this.beginPush);
    this.pushLeftButton?.addEventListener('click', this.pushLeft);
    this.pushRightButton?.addEventListener('click', this.pushRight);
    this.pushCancelButton?.addEventListener('click', this.cancelPush);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPushPointerDown);
    this.updatePushControls();
    this.updateStatus('阅读提示后，点击“开始游戏”');
    this.gameOverElement = document.getElementById('game-over');
    this.finalScoreElement = document.getElementById('final-score');
    this.restartButton = document.getElementById('restart-button') as HTMLButtonElement | null;
    this.restartButton?.addEventListener('click', this.restartGame);
    this.updateScore();

    const preview = this.add.image(240, 92, getLevelConfig(1).textureKey).setAlpha(0.68);
    this.dropController = new DropController(this, preview, {
      minX: BOARD_LEFT,
      maxX: BOARD_RIGHT,
      guideEndY: FAILURE_LINE_Y - 8,
      cooldownMs: 400,
      canDrop: () => this.hasStarted && !this.session.isEnded && !this.stressMode && !this.pushMode,
      canReserve: () => this.hasStarted && !this.session.isEnded && !this.stressMode,
      onDrop: (x, level) => {
        const y = BOARD_TOP + getShapeHalfExtents(getLevelConfig(level)).y + 2;
        this.createPiece(level, x, y, this.time.now);
        this.soundFeedback.playDrop();
        if (!this.hasShownFirstDrop) {
          this.hasShownFirstDrop = true;
          this.updateStatus(`首次投放 ${level} 级角色成功`);
          this.floatLabel(x, y + 8, '投放', '#4d8062');
        } else {
          this.updateStatus('同级角色相碰可合成');
        }
      },
      onQueueChange: (_current, next) => this.updateNextLevel(next),
      onReserveChange: (held, available) => this.updateReserveSlot(held, available),
    });
    this.configureTestControls(this.dropController);

    this.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.matter.world.off('collisionstart', this.onCollisionStart, this);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.flushMerges, this);
      this.restartButton?.removeEventListener('click', this.restartGame);
      this.startButton?.removeEventListener('click', this.startGame);
      this.muteButton?.removeEventListener('click', this.toggleMute);
      this.reserveButton?.removeEventListener('click', this.useReserve);
      this.strategyHelpButton?.removeEventListener('click', this.toggleStrategyHelp);
      this.pushButton?.removeEventListener('click', this.beginPush);
      this.pushLeftButton?.removeEventListener('click', this.pushLeft);
      this.pushRightButton?.removeEventListener('click', this.pushRight);
      this.pushCancelButton?.removeEventListener('click', this.cancelPush);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPushPointerDown);
      this.backgroundMusic.close();
      this.soundFeedback.close();
      this.hideLevelEightCelebration();
      this.mergeResolver.clear();
      this.pieces.clear();
      this.pieceIdByBodyId.clear();
      this.pushEligibleAfter.clear();
      this.session.reset();
    });
  }

  update(): void {
    if (this.stressMode) {
      this.stressFrames += 1;
      const elapsed = performance.now() - this.stressStartedAt;
      if (!this.stressReported && elapsed >= 30_000) {
        this.stressReported = true;
        if (this.stressResult) {
          this.stressResult.textContent = `50 枚复合体运行 30 秒：平均 ${(this.stressFrames * 1000 / elapsed).toFixed(1)} 帧/秒；刷新页面退出压力测试。`;
        }
      }
      return;
    }
    if (this.session.isEnded) return;
    for (const piece of this.pieces.values()) {
      const body = piece.image.body as MatterJS.BodyType;
      const overLine = body.bounds.min.y < FAILURE_LINE_Y;
      if (this.session.observePiece(piece.id, overLine, piece.releasedAt, this.time.now)) {
        this.finishGame();
        break;
      }
    }
  }

  private createPlaceholderTextures(): Level[] {
    const missing: Level[] = [];
    for (const config of LEVELS) {
      if (this.textures.exists(config.textureKey)) continue;
      missing.push(config.level);

      const halfExtents = getShapeHalfExtents(config);
      const size = Math.ceil(Math.max(halfExtents.x, halfExtents.y) * 2 + 8);
      const texture = this.textures.createCanvas(config.textureKey, size, size);
      if (!texture) throw new Error(`无法创建 ${config.textureKey} 占位纹理`);
      const context = texture.getContext();
      const center = size / 2;

      context.fillStyle = config.fill;
      context.lineWidth = 3;
      context.strokeStyle = config.stroke;

      const tracePart = (part: (typeof config.parts)[number]): void => {
        const x = center + part.x * config.radius;
        const y = center + part.y * config.radius;
        context.beginPath();
        if (part.kind === 'circle') {
          context.arc(x, y, part.radius * config.radius, 0, Math.PI * 2);
        } else {
          context.rect(
            x - part.width * config.radius / 2,
            y - part.height * config.radius / 2,
            part.width * config.radius,
            part.height * config.radius,
          );
        }
      };
      for (const part of config.parts) {
        tracePart(part);
        context.fill();
      }
      for (const part of config.parts) {
        tracePart(part);
        context.stroke();
      }

      context.fillStyle = config.label;
      context.font = `bold ${Math.max(16, Math.round(Math.min(config.radius * 0.9, halfExtents.y * 1.1)))}px Microsoft YaHei, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(config.level), center, center + 1);
      texture.refresh();
    }
    return missing;
  }

  private drawBoard(): void {
    const graphics = this.add.graphics().setDepth(-2);
    graphics.fillStyle(0xfffcf3, 1);
    graphics.fillRoundedRect(30, 112, 420, 500, 28);
    graphics.lineStyle(3, 0xd5b56f, 1);
    graphics.strokeRoundedRect(30, 112, 420, 500, 28);

    graphics.lineStyle(3, 0xa6b987, 1);
    graphics.lineBetween(BOARD_LEFT, BOARD_BOTTOM, BOARD_RIGHT, BOARD_BOTTOM);
    graphics.lineStyle(2, 0xd8d5b0, 1);
    graphics.lineBetween(BOARD_LEFT, BOARD_TOP, BOARD_LEFT, BOARD_BOTTOM);
    graphics.lineBetween(BOARD_RIGHT, BOARD_TOP, BOARD_RIGHT, BOARD_BOTTOM);

    graphics.lineStyle(2, 0xd8646a, 0.9);
    graphics.lineBetween(BOARD_LEFT + 2, FAILURE_LINE_Y, BOARD_RIGHT - 2, FAILURE_LINE_Y);
    this.add.text(BOARD_RIGHT - 9, FAILURE_LINE_Y - 7, '警戒线', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      resolution: RENDER_SCALE,
      color: '#ad454b',
      backgroundColor: '#fff8e6cc',
    }).setOrigin(1, 1);

    this.add.text(240, 28, '游戏棋盘', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '23px',
      resolution: RENDER_SCALE,
      color: '#3d6958',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(240, 60, '待投放角色 ↓', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      resolution: RENDER_SCALE,
      color: '#6e8a72',
    }).setOrigin(0.5);
  }

  private createWalls(): void {
    const wallHeight = BOARD_BOTTOM - BOARD_TOP + WALL_THICKNESS;
    const wallY = (BOARD_TOP + BOARD_BOTTOM) / 2 + WALL_THICKNESS / 2;
    const wallOptions = { isStatic: true, friction: 0.8, restitution: 0.1 };

    const leftWall = this.matter.add.rectangle(
      BOARD_LEFT - WALL_THICKNESS / 2, wallY,
      WALL_THICKNESS, wallHeight, wallOptions,
    );
    const rightWall = this.matter.add.rectangle(
      BOARD_RIGHT + WALL_THICKNESS / 2, wallY,
      WALL_THICKNESS, wallHeight, wallOptions,
    );
    const floor = this.matter.add.rectangle(
      (BOARD_LEFT + BOARD_RIGHT) / 2, BOARD_BOTTOM + WALL_THICKNESS / 2,
      BOARD_RIGHT - BOARD_LEFT + WALL_THICKNESS * 2,
      WALL_THICKNESS, wallOptions,
    );
    for (const wall of [leftWall, rightWall, floor]) this.matter.world.setBodyRenderStyle(wall);
  }

  private createPiece(level: Level, x: number, y: number, releasedAt: number | null): Piece {
    const config = getLevelConfig(level);
    const image = this.matter.add.image(x, y, config.textureKey);
    const displaySize = getSpriteDisplaySize(config);
    image.setDisplaySize(displaySize, displaySize);
    const compound = createCompoundBody(config, x, y, this.matter);
    const centerOffsetX = compound.position.x - x;
    const centerOffsetY = compound.position.y - y;
    // Matter 的质量中心可能偏离图片中心；纹理原点跟随该偏移，画面与子碰撞体才不会错位。
    image.setExistingBody(compound);
    image.setOrigin(0.5 + centerOffsetX / displaySize, 0.5 + centerOffsetY / displaySize);
    image.setPosition(x, y);
    const body = image.body as MatterJS.BodyType;
    this.matter.world.setBodyRenderStyle(body);
    const piece: Piece = { id: this.nextPieceId++, level, image, releasedAt };
    this.pieces.set(piece.id, piece);
    this.pushEligibleAfter.set(piece.id, this.time.now + 600);
    this.pieceIdByBodyId.set(body.id, piece.id);
    return piece;
  }

  private readonly onCollisionStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
    if (this.session.isEnded || this.stressMode) return;
    let queued = false;
    for (const pair of event.pairs) {
      const firstId = this.pieceIdByBodyId.get(pair.bodyA.parent.id);
      const secondId = this.pieceIdByBodyId.get(pair.bodyB.parent.id);
      if (firstId === undefined || secondId === undefined) continue;
      const first = this.pieces.get(firstId);
      const second = this.pieces.get(secondId);
      if (first && second && this.mergeResolver.queue(first, second)) queued = true;
    }

    if (queued && !this.mergeFlushScheduled) {
      this.mergeFlushScheduled = true;
      this.events.once(Phaser.Scenes.Events.POST_UPDATE, this.flushMerges, this);
    }
  };

  private readonly flushMerges = (): void => {
    this.mergeFlushScheduled = false;
    if (this.session.isEnded) {
      this.mergeResolver.clear();
      return;
    }
    for (const plan of this.mergeResolver.drain()) {
      try {
        const first = this.pieces.get(plan.firstId);
        const second = this.pieces.get(plan.secondId);
        if (!first || !second) continue;

        const config = getLevelConfig(plan.targetLevel);
        const midpointX = (first.image.x + second.image.x) / 2;
        const midpointY = (first.image.y + second.image.y) / 2;
        const halfExtents = getShapeHalfExtents(config);
        const x = Phaser.Math.Clamp(midpointX, BOARD_LEFT + halfExtents.x + 2, BOARD_RIGHT - halfExtents.x - 2);
        const y = Phaser.Math.Clamp(midpointY, BOARD_TOP + halfExtents.y + 2, BOARD_BOTTOM - halfExtents.y - 2);

        this.removePiece(first);
        this.removePiece(second);
        this.createPiece(plan.targetLevel, x, y, null);
        this.session.awardMerge(plan.targetLevel);
        this.updateScore();
        this.soundFeedback.playMerge(plan.targetLevel);
        const points = 2 ** plan.targetLevel;
        this.updateStatus(`合成 ${plan.targetLevel} 级，获得 ${points} 分`);
        this.floatLabel(x, y, `+${points}`, '#b57931');
        if (plan.targetLevel === 8 && !this.hasCelebratedLevelEight) this.showLevelEightCelebration(x, y);
      } finally {
        this.mergeResolver.complete(plan);
      }
    }
  };

  private removePiece(piece: Piece): void {
    if (this.selectedPushPieceId === piece.id) this.clearPushSelection();
    const body = piece.image.body as MatterJS.BodyType;
    this.pieces.delete(piece.id);
    this.pieceIdByBodyId.delete(body.id);
    this.pushEligibleAfter.delete(piece.id);
    this.session.forgetPiece(piece.id);
    if (this.testOverlinePiece?.id === piece.id) this.testOverlinePiece = null;
    piece.image.destroy();
  }

  private finishGame(): void {
    this.cancelPush();
    this.dropController?.refreshReserveAvailability();
    this.dropController?.setGuideVisible(false);
    this.mergeResolver.clear();
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.flushMerges, this);
    this.mergeFlushScheduled = false;
    this.matter.world.off('collisionstart', this.onCollisionStart, this);
    this.matter.world.pause();
    this.backgroundMusic.pause();
    this.soundFeedback.playFail();
    this.updateStatus(`游戏结束，本局得分 ${this.session.score}`);
    if (this.finalScoreElement) this.finalScoreElement.textContent = String(this.session.score);
    if (this.gameOverElement) this.gameOverElement.hidden = false;
  }

  private readonly restartGame = (): void => {
    if (!this.session.isEnded) return;
    this.hideLevelEightCelebration();
    this.hasCelebratedLevelEight = false;
    for (const piece of [...this.pieces.values()]) this.removePiece(piece);
    this.pieces.clear();
    this.pieceIdByBodyId.clear();
    this.mergeResolver.clear();
    this.session.reset();
    this.pushesLeft = 2;
    this.cancelPush();
    this.nextPieceId = 1;
    this.hasShownFirstDrop = false;
    this.testOverlinePiece = null;
    this.dropController?.reset();
    this.dropController?.setGuideVisible(true);
    this.updateScore();
    this.updateStatus('新的一局：点击棋盘投放角色');
    if (this.gameOverElement) this.gameOverElement.hidden = true;
    this.matter.world.resume();
    this.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.backgroundMusic.play();
  };

  private updateScore(): void {
    if (this.scoreElement) this.scoreElement.textContent = String(this.session.score);
  }

  private readonly startGame = (): void => {
    if (this.hasStarted) return;
    this.hasStarted = true;
    this.updatePushControls();
    this.dropController?.refreshReserveAvailability();
    this.dropController?.setGuideVisible(true);
    this.soundFeedback.unlock();
    this.backgroundMusic.play();
    if (this.startScreen) this.startScreen.hidden = true;
    this.updateStatus('游戏进行中：点击棋盘投放角色');
  };

  private readonly toggleMute = (): void => {
    this.soundFeedback.setMuted(!this.soundFeedback.isMuted);
    this.backgroundMusic.setMuted(this.soundFeedback.isMuted);
    if (!this.muteButton) return;
    this.muteButton.textContent = this.soundFeedback.isMuted ? '开启声音' : '静音';
    this.muteButton.setAttribute('aria-pressed', String(this.soundFeedback.isMuted));
    this.muteButton.setAttribute('aria-label', this.soundFeedback.isMuted ? '当前已静音，点击开启声音' : '当前有声音，点击静音');
  };

  private readonly useReserve = (): void => {
    if (this.dropController?.reserve()) this.updateStatus('已切换预备位；投放后可再次使用');
  };

  private readonly toggleStrategyHelp = (): void => {
    if (!this.strategyHelpPanel || !this.strategyHelpButton) return;
    this.strategyHelpPanel.hidden = !this.strategyHelpPanel.hidden;
    const expanded = !this.strategyHelpPanel.hidden;
    this.strategyHelpButton.setAttribute('aria-expanded', String(expanded));
    this.strategyHelpButton.setAttribute('aria-label', expanded ? '收起策略说明' : '查看策略说明');
    this.strategyHelpButton.title = expanded ? '收起策略说明' : '查看策略说明';
  };

  private readonly beginPush = (): void => {
    if (!this.hasStarted || this.session.isEnded || this.stressMode || this.pushesLeft <= 0) return;
    if (this.pushMode) {
      this.cancelPush();
      return;
    }
    this.pushMode = true;
    this.updatePushControls();
    this.updateStatus('轻推：点击一枚已落稳的 1～4 级角色');
  };

  private readonly onPushPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.pushMode || this.session.isEnded) return;
    pointer.updateWorldPoint(this.cameras.main);
    let nearest: Piece | null = null;
    let nearestDistance = Infinity;
    for (const piece of this.pieces.values()) {
      const body = piece.image.body as MatterJS.BodyType;
      if (piece.level > 4 || body.isStatic || body.speed >= 0.7 || this.time.now < (this.pushEligibleAfter.get(piece.id) ?? Infinity)) continue;
      const distance = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, piece.image.x, piece.image.y);
      const reach = Math.max(getShapeHalfExtents(getLevelConfig(piece.level)).x, getShapeHalfExtents(getLevelConfig(piece.level)).y) + 10;
      if (distance <= reach && distance < nearestDistance) {
        nearest = piece;
        nearestDistance = distance;
      }
    }
    this.clearPushSelection();
    if (!nearest) {
      this.updateStatus('请选择已落稳的 1～4 级角色');
      return;
    }
    this.selectedPushPieceId = nearest.id;
    nearest.image.setTint(0xffe58a);
    this.updatePushControls();
    this.updateStatus(`已选中 ${nearest.level} 级角色，选择左推或右推`);
  };

  private readonly pushLeft = (): void => this.applyPush(-1);
  private readonly pushRight = (): void => this.applyPush(1);

  private applyPush(direction: -1 | 1): void {
    if (!this.pushMode || this.selectedPushPieceId === null || this.pushesLeft <= 0 || this.session.isEnded) return;
    const piece = this.pieces.get(this.selectedPushPieceId);
    if (!piece) { this.clearPushSelection(); return; }
    const body = piece.image.body as MatterJS.BodyType;
    if (piece.level > 4 || body.isStatic || body.speed >= 0.7) {
      this.clearPushSelection();
      this.updateStatus('角色正在移动，请重新选择落稳的角色');
      return;
    }
    piece.image.applyForce(new Phaser.Math.Vector2(direction * body.mass * 0.007, 0));
    this.pushesLeft -= 1;
    this.cancelPush();
    this.updateStatus(`轻推已使用，剩余 ${this.pushesLeft} 次`);
  }

  private clearPushSelection(): void {
    if (this.selectedPushPieceId !== null) this.pieces.get(this.selectedPushPieceId)?.image.clearTint();
    this.selectedPushPieceId = null;
    this.updatePushControls();
  }

  private readonly cancelPush = (): void => {
    this.clearPushSelection();
    this.pushMode = false;
    this.updatePushControls();
  };

  private updatePushControls(): void {
    if (this.pushButton) {
      this.pushButton.disabled = !this.hasStarted || this.session.isEnded || this.stressMode || this.pushesLeft <= 0;
      this.pushButton.setAttribute('aria-pressed', String(this.pushMode));
      this.pushButton.textContent = this.pushMode ? '取消轻推' : '选择轻推目标';
    }
    if (this.pushCountElement) this.pushCountElement.textContent = String(this.pushesLeft);
    if (this.pushLeftButton) this.pushLeftButton.disabled = this.selectedPushPieceId === null;
    if (this.pushRightButton) this.pushRightButton.disabled = this.selectedPushPieceId === null;
    if (this.pushCancelButton) this.pushCancelButton.hidden = !this.pushMode;
    if (this.pushHintElement) this.pushHintElement.textContent = this.pushMode
      ? this.selectedPushPieceId === null ? '点击棋盘中已落稳的 1～4 级角色' : '选择方向，或点击取消'
      : '选中角色后可向左或向右轻推';
  }

  private updateStatus(message: string): void {
    if (this.statusElement) this.statusElement.textContent = message;
  }

  private showLevelEightCelebration(x: number, y: number): void {
    this.hasCelebratedLevelEight = true;
    this.updateStatus('恭喜合成开心大派蒙！');
    if (this.celebrationElement) this.celebrationElement.hidden = false;
    this.celebrationTimer = this.time.delayedCall(3200, () => {
      this.celebrationTimer = null;
      if (this.celebrationElement) this.celebrationElement.hidden = true;
    });

    const halo = this.add.graphics().setPosition(x, y).setDepth(6);
    halo.lineStyle(4, 0xe2b358, 0.95).strokeCircle(0, 0, 28);
    this.tweens.add({
      targets: halo, scaleX: 3, scaleY: 3, alpha: 0, duration: 750,
      onComplete: () => halo.destroy(),
    });
    for (let index = 0; index < 10; index += 1) {
      const angle = index * Math.PI * 2 / 10;
      const sparkle = this.add.text(x, y, '✦', {
        fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '22px',
        resolution: RENDER_SCALE,
        color: index % 2 === 0 ? '#e4af51' : '#79a87a',
        stroke: '#fffdf2', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(7);
      this.tweens.add({
        targets: sparkle,
        x: x + Math.cos(angle) * 85,
        y: y + Math.sin(angle) * 85,
        alpha: 0,
        duration: 820,
        onComplete: () => sparkle.destroy(),
      });
    }
  }

  private hideLevelEightCelebration(): void {
    this.celebrationTimer?.remove(false);
    this.celebrationTimer = null;
    if (this.celebrationElement) this.celebrationElement.hidden = true;
  }

  private floatLabel(x: number, y: number, message: string, color: string): void {
    const label = this.add.text(x, y, message, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '20px',
      resolution: RENDER_SCALE,
      fontStyle: 'bold',
      color,
      stroke: '#ffffff',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);
    this.tweens.add({
      targets: label,
      y: y - 34,
      alpha: 0,
      duration: 650,
      onComplete: () => label.destroy(),
    });
  }

  private updateNextLevel(level: DropLevel): void {
    if (this.nextElement) this.nextElement.textContent = `${level} 级`;
    if (this.nextImage) {
      this.nextImage.hidden = this.missingLevels.has(level);
      this.nextImage.src = window.location.protocol === 'file:'
        ? `./assets/characters/lv${level}.png`
        : `./characters/lv${level}.png`;
    }
    if (this.nextFallback) {
      this.nextFallback.hidden = !this.missingLevels.has(level);
      this.nextFallback.textContent = String(level);
    }
  }

  private updateReserveSlot(held: DropLevel | null, available: boolean): void {
    if (this.reserveButton) this.reserveButton.disabled = !available;
    if (this.reserveValue) this.reserveValue.textContent = held === null ? '空' : `${held} 级`;
    if (this.reserveImage) {
      this.reserveImage.hidden = held === null || this.missingLevels.has(held);
      if (held !== null) this.reserveImage.src = window.location.protocol === 'file:'
        ? `./assets/characters/lv${held}.png`
        : `./characters/lv${held}.png`;
    }
    if (this.reserveFallback) {
      this.reserveFallback.hidden = held === null || !this.missingLevels.has(held);
      if (held !== null) this.reserveFallback.textContent = String(held);
    }
  }

  private populateLevelList(): void {
    const list = document.getElementById('level-list');
    if (!list) return;
    list.replaceChildren();
    for (const config of LEVELS) {
      const item = document.createElement('li');
      item.className = `level-card level-card--${config.level}`;
      const imageBox = document.createElement('span');
      imageBox.className = 'level-card-image';
      if (this.missingLevels.has(config.level)) {
        const fallback = document.createElement('span');
        fallback.className = 'level-card-fallback';
        fallback.textContent = String(config.level);
        imageBox.append(fallback);
      } else {
        const image = document.createElement('img');
        image.src = window.location.protocol === 'file:'
          ? `./assets/characters/lv${config.level}.png`
          : `./characters/lv${config.level}.png`;
        image.alt = `${config.level} 级角色形象`;
        imageBox.append(image);
      }
      const label = document.createElement('span');
      label.className = 'level-card-label';
      label.textContent = `${config.level} 级`;
      item.append(imageBox, label);
      list.append(item);
    }
  }

  private configureTestControls(controller: DropController): void {
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get('test') !== '1') return;

    const tools = document.getElementById('test-tools');
    const select = document.getElementById('test-level') as HTMLSelectElement | null;
    const apply = document.getElementById('test-apply');
    const cluster = document.getElementById('test-cluster');
    const overline = document.getElementById('test-overline');
    const recover = document.getElementById('test-recover');
    const returnOverline = document.getElementById('test-return');
    const stress = document.getElementById('test-stress') as HTMLButtonElement | null;
    this.stressResult = document.getElementById('stress-result');
    if (!tools || !select || !apply || !cluster || !overline || !recover || !returnOverline || !stress || !this.stressResult) return;
    tools.hidden = false;
    const onApply = (): void => controller.forceCurrentLevelForTest(Number(select.value) as Level);
    const onCluster = (): void => {
      if (this.session.isEnded || this.stressMode) return;
      for (const x of [218, 240, 262]) this.createPiece(1, x, 454, null);
    };
    const onOverline = (): void => {
      if (this.session.isEnded || this.stressMode) return;
      if (this.testOverlinePiece) this.removePiece(this.testOverlinePiece);
      const piece = this.createPiece(1, 240, 160, this.time.now);
      piece.image.setStatic(true);
      this.testOverlinePiece = piece;
    };
    const onRecover = (): void => {
      if (this.session.isEnded || this.stressMode) return;
      this.testOverlinePiece?.image.setPosition(240, 300);
    };
    const onReturn = (): void => {
      if (this.session.isEnded || this.stressMode) return;
      this.testOverlinePiece?.image.setPosition(240, 160);
    };
    const onStress = (): void => {
      if (this.session.isEnded || this.stressMode) return;
      this.stressMode = true;
      this.cancelPush();
      this.dropController?.refreshReserveAvailability();
      this.dropController?.setGuideVisible(false);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.flushMerges, this);
      this.mergeFlushScheduled = false;
      this.mergeResolver.clear();
      for (const piece of [...this.pieces.values()]) this.removePiece(piece);
      for (let row = 0; row < 10; row += 1) {
        for (let column = 0; column < 5; column += 1) {
          const level: Level = (row + column) % 2 === 0 ? 1 : 2;
          this.createPiece(level, 90 + column * 75, 160 + row * 42, null);
        }
      }
      this.stressStartedAt = performance.now();
      this.stressFrames = 0;
      this.stressReported = false;
      stress.disabled = true;
      if (this.stressResult) this.stressResult.textContent = '50 枚复合体压力测试中；30 秒后显示平均帧率。测试期间暂不合成或判负。';
    };
    apply.addEventListener('click', onApply);
    cluster.addEventListener('click', onCluster);
    overline.addEventListener('click', onOverline);
    recover.addEventListener('click', onRecover);
    returnOverline.addEventListener('click', onReturn);
    stress.addEventListener('click', onStress);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      apply.removeEventListener('click', onApply);
      cluster.removeEventListener('click', onCluster);
      overline.removeEventListener('click', onOverline);
      recover.removeEventListener('click', onRecover);
      returnOverline.removeEventListener('click', onReturn);
      stress.removeEventListener('click', onStress);
    });
  }
}

