import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { LEVELS, getShapeHalfExtents } from '../src/config/LevelCatalog.ts';
import { createCompoundBody } from '../src/domain/CompoundBody.ts';

const require = createRequire(import.meta.url);
const bodies = require('phaser/src/physics/matter-js/lib/factory/Bodies.js');
const body = require('phaser/src/physics/matter-js/lib/body/Body.js');
const engineFactory = require('phaser/src/physics/matter-js/lib/core/Engine.js');
const composite = require('phaser/src/physics/matter-js/lib/body/Composite.js');
const matter = { bodies, body };

test('八级均有独立多部件刚体，一级紧凑、二级横向展开', () => {
  const signatures = new Set();
  for (const config of LEVELS) {
    assert.ok(config.parts.length >= 2 && config.parts.length <= 7);
    const compound = createCompoundBody(config, 240, 200, matter);
    assert.equal(compound.parts.length, config.parts.length + 1);
    assert.ok(Math.abs(compound.position.x - 240) < config.radius * 0.15);
    assert.ok(Math.abs(compound.position.y - 200) < config.radius * 0.15);
    const extent = getShapeHalfExtents(config);
    assert.ok(extent.x > 0 && extent.y > 0);
    signatures.add(JSON.stringify(config.parts));
  }
  assert.equal(signatures.size, 8);

  const compact = getShapeHalfExtents(LEVELS[0]);
  const wide = getShapeHalfExtents(LEVELS[1]);
  assert.ok(compact.x / compact.y < 0.9);
  assert.ok(wide.x / wide.y > 1.1);
});

test('两级复合体可在同一 Matter 世界落地、旋转和接触', () => {
  const engine = engineFactory.create();
  const floor = bodies.rectangle(240, 590, 400, 20, { isStatic: true });
  const compact = createCompoundBody(LEVELS[0], 225, 180, matter);
  const wide = createCompoundBody(LEVELS[1], 240, 100, matter);
  composite.add(engine.world, [floor, compact, wide]);
  let contacted = false;
  for (let frame = 0; frame < 360; frame += 1) {
    engineFactory.update(engine, 1000 / 60);
    contacted ||= engine.pairs.list.some((pair) =>
      [compact.id, wide.id].includes(pair.bodyA.parent.id)
      && [compact.id, wide.id].includes(pair.bodyB.parent.id));
  }
  for (const piece of [compact, wide]) {
    assert.ok(Number.isFinite(piece.position.x));
    assert.ok(Number.isFinite(piece.position.y));
    assert.ok(Number.isFinite(piece.angle));
    assert.ok(piece.position.y > 180);
    assert.ok(piece.bounds.max.y <= floor.bounds.min.y + 3);
  }
  assert.equal(contacted, true);
});

test('八级复合体在堆叠和旋转中保持稳定', () => {
  for (const config of LEVELS) {
    const engine = engineFactory.create();
    const floor = bodies.rectangle(240, 590, 420, 20, { isStatic: true });
    const left = bodies.rectangle(39, 360, 20, 460, { isStatic: true });
    const right = bodies.rectangle(441, 360, 20, 460, { isStatic: true });
    const lower = createCompoundBody(config, 240, 390, matter);
    const upper = createCompoundBody(config, 240, 235, matter);
    body.setAngularVelocity(upper, 0.025);
    composite.add(engine.world, [floor, left, right, lower, upper]);
    let contacted = false;
    for (let frame = 0; frame < 420; frame += 1) {
      engineFactory.update(engine, 1000 / 60);
      contacted ||= engine.pairs.list.some((pair) =>
        [lower.id, upper.id].includes(pair.bodyA.parent.id)
        && [lower.id, upper.id].includes(pair.bodyB.parent.id));
    }
    assert.equal(contacted, true, `第 ${config.level} 级应发生角色间接触`);
    for (const piece of [lower, upper]) {
      assert.ok(Number.isFinite(piece.position.x) && Number.isFinite(piece.position.y));
      assert.ok(Number.isFinite(piece.angle));
      assert.ok(piece.bounds.max.y <= floor.bounds.min.y + 4, `第 ${config.level} 级不应穿透底板`);
    }
    assert.ok(Math.abs(upper.angle) > 0.05, `第 ${config.level} 级应可以旋转`);
  }
});
