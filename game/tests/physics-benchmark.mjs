import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { LEVELS } from '../src/config/LevelCatalog.ts';
import { createCompoundBody } from '../src/domain/CompoundBody.ts';

const require = createRequire(import.meta.url);
const bodies = require('phaser/src/physics/matter-js/lib/factory/Bodies.js');
const body = require('phaser/src/physics/matter-js/lib/body/Body.js');
const engineFactory = require('phaser/src/physics/matter-js/lib/core/Engine.js');
const composite = require('phaser/src/physics/matter-js/lib/body/Composite.js');
const engine = engineFactory.create();
const pieces = [];

composite.add(engine.world, [
  bodies.rectangle(240, 596, 400, 24, { isStatic: true }),
  bodies.rectangle(40, 350, 24, 600, { isStatic: true }),
  bodies.rectangle(440, 350, 24, 600, { isStatic: true }),
]);
for (let row = 0; row < 10; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const config = LEVELS[(row + column) % 2];
    const piece = createCompoundBody(config, 95 + column * 70, 80 + row * 55, { bodies, body });
    pieces.push(piece);
    composite.add(engine.world, piece);
  }
}

const frames = 1_800;
const started = performance.now();
for (let frame = 0; frame < frames; frame += 1) engineFactory.update(engine, 1000 / 60);
const elapsed = performance.now() - started;
assert.equal(pieces.length, 50);
for (const piece of pieces) {
  assert.ok(Number.isFinite(piece.position.x));
  assert.ok(Number.isFinite(piece.position.y));
  assert.ok(Number.isFinite(piece.angle));
}
console.log(`50 个复合体，模拟 30 秒 / ${frames} 帧：实际 ${elapsed.toFixed(1)} ms，平均 ${(elapsed / frames).toFixed(3)} ms/帧。`);
