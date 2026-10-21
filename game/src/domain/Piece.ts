import type Phaser from 'phaser';
import type { Level } from '../config/LevelCatalog';

export type Piece = {
  id: number;
  level: Level;
  image: Phaser.Physics.Matter.Image;
  releasedAt: number | null;
};
