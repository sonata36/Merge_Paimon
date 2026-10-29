import Phaser from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, RENDER_SCALE } from './config/DisplayScale';
import { GameScene } from './scenes/GameScene';
import './style.css';

const config: Phaser.Types.Core.GameConfig = {
  type: window.location.protocol === 'file:' ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game-root',
  width: LOGICAL_WIDTH * RENDER_SCALE,
  height: LOGICAL_HEIGHT * RENDER_SCALE,
  backgroundColor: '#fff8e7',
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      debug: false,
    },
  },
  scene: [GameScene],
};

new Phaser.Game(config);
