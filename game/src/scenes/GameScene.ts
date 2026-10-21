import Phaser from 'phaser';
import { LEVELS, getLevelConfig, getShapeHalfExtents, getSpriteDisplaySize } from '../config/LevelCatalog';
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
  private startScreen: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private muteButton: HTMLButtonElement | null = null;
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
    const missingForTest = import.meta.env.DEV
      ? Number(new URLSearchParams(window.location.search).get('missing'))
      : 0;
    for (const config of LEVELS) {
      if (config.level === missingForTest) continue;
      this.load.image(config.textureKey, `./characters/lv${config.level}.png`);
    }
  }

  create(): void {
    if (window.location.protocol === 'file:') {
      void this.loadLocalFileImages().then(() => this.initializeGame());
      return;
    }
    this.initializeGame();
  }

  private async loadLocalFileImages(): Promise<void> {
    await Promise.all(LEVELS.map(async (config) => {
      const image = new Image();
      const loaded = await new Promise<boolean>((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = new URL(`./assets/characters/lv${config.level}.png`, document.baseURI).href;
      });
      if (loaded) this.textures.addImage(config.textureKey, image);
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
      canDrop: () => this.hasStarted && !this.session.isEnded && !this.stressMode,
      onDrop: (x, level) => {
        const y = BOARD_TOP + getShapeHalfExtents(getLevelConfig(level)).y + 2;
        this.createPiece(level, x, y, this.time.now);
        this.soundFeedback.playDrop();
        if (!this.hasShownFirstDrop) {
          this.hasShownFirstDrop = true;
          this.updateStatus(`首次投放 ${level} 级角色成功`);
          this.floatLabel(x, y + 8, '投放', '#5c4093');
        } else {
          this.updateStatus('同级角色相碰可合成');
        }
      },
      onQueueChange: (_current, next) => this.updateNextLevel(next),
    });
    this.configureTestControls(this.dropController);

    this.matter.world.on('collisionstart', this.onCollisionStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.matter.world.off('collisionstart', this.onCollisionStart, this);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.flushMerges, this);
      this.restartButton?.removeEventListener('click', this.restartGame);
      this.startButton?.removeEventListener('click', this.startGame);
      this.muteButton?.removeEventListener('click', this.toggleMute);
      this.backgroundMusic.close();
      this.soundFeedback.close();
      this.mergeResolver.clear();
      this.pieces.clear();
      this.pieceIdByBodyId.clear();
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
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(30, 112, 420, 500, 28);
    graphics.lineStyle(3, 0xb4a6e7, 1);
    graphics.strokeRoundedRect(30, 112, 420, 500, 28);

    graphics.lineStyle(3, 0x7b66bf, 1);
    graphics.lineBetween(BOARD_LEFT, BOARD_BOTTOM, BOARD_RIGHT, BOARD_BOTTOM);
    graphics.lineStyle(2, 0xd5cbed, 1);
    graphics.lineBetween(BOARD_LEFT, BOARD_TOP, BOARD_LEFT, BOARD_BOTTOM);
    graphics.lineBetween(BOARD_RIGHT, BOARD_TOP, BOARD_RIGHT, BOARD_BOTTOM);

    graphics.lineStyle(2, 0xe76982, 0.85);
    graphics.lineBetween(BOARD_LEFT + 2, FAILURE_LINE_Y, BOARD_RIGHT - 2, FAILURE_LINE_Y);
    this.add.text(BOARD_RIGHT - 9, FAILURE_LINE_Y - 7, '警戒线', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '14px',
      color: '#a73758',
      backgroundColor: '#fff8',
    }).setOrigin(1, 1);

    this.add.text(240, 28, '游戏棋盘', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '23px',
      color: '#38295e',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(240, 60, '待投放角色 ↓', {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '16px',
      color: '#746589',
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
        this.floatLabel(x, y, `+${points}`, '#a73758');
      } finally {
        this.mergeResolver.complete(plan);
      }
    }
  };

  private removePiece(piece: Piece): void {
    const body = piece.image.body as MatterJS.BodyType;
    this.pieces.delete(piece.id);
    this.pieceIdByBodyId.delete(body.id);
    this.session.forgetPiece(piece.id);
    if (this.testOverlinePiece?.id === piece.id) this.testOverlinePiece = null;
    piece.image.destroy();
  }

  private finishGame(): void {
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
    for (const piece of [...this.pieces.values()]) this.removePiece(piece);
    this.pieces.clear();
    this.pieceIdByBodyId.clear();
    this.mergeResolver.clear();
    this.session.reset();
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

  private updateStatus(message: string): void {
    if (this.statusElement) this.statusElement.textContent = message;
  }

  private floatLabel(x: number, y: number, message: string, color: string): void {
    const label = this.add.text(x, y, message, {
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: '20px',
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

