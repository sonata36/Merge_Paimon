import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS, drawDropLevel, getLevelConfig } from '../src/config/LevelCatalog.ts';
import { MergeResolver } from '../src/domain/MergeResolver.ts';
import { DROP_GRACE_MS, GameSession, OVER_LINE_MS } from '../src/domain/GameSession.ts';

test('八级配置的编号、颜色和半径均可区分', () => {
  assert.deepEqual(LEVELS.map((item) => item.level), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(LEVELS.map((item) => item.fill)).size, 8);
  assert.equal(new Set(LEVELS.map((item) => item.radius)).size, 8);
  assert.equal(getLevelConfig(8).textureKey, 'level-8');
});

test('随机区间严格三等分，直接投放只得到 1～3 级', () => {
  const values = [0, 1 / 3 - 1e-9, 1 / 3, 2 / 3 - 1e-9, 2 / 3, 0.999999999];
  assert.deepEqual(values.map((value) => drawDropLevel(() => value)), [1, 1, 2, 2, 3, 3]);
});

test('同级合成覆盖 1+1 到 7+7；异级和 8+8 均不合成', () => {
  for (let level = 1; level <= 7; level += 1) {
    const resolver = new MergeResolver();
    assert.equal(resolver.queue({ id: 1, level }, { id: 2, level }), true);
    assert.deepEqual(resolver.drain(), [{ firstId: 1, secondId: 2, targetLevel: level + 1 }]);
  }
  const resolver = new MergeResolver();
  assert.equal(resolver.queue({ id: 1, level: 1 }, { id: 2, level: 2 }), false);
  assert.equal(resolver.queue({ id: 3, level: 8 }, { id: 4, level: 8 }), false);
  assert.deepEqual(resolver.drain(), []);
});

test('连续接触时同一枚角色只能进入一个合成计划', () => {
  const resolver = new MergeResolver();
  const a = { id: 1, level: 1 };
  const b = { id: 2, level: 1 };
  const c = { id: 3, level: 1 };
  const d = { id: 4, level: 1 };
  assert.equal(resolver.queue(a, b), true);
  assert.equal(resolver.queue(b, a), false);
  assert.equal(resolver.queue(a, c), false);
  assert.equal(resolver.queue(c, d), true);
  const plans = resolver.drain();
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map((plan) => [plan.firstId, plan.secondId]), [[1, 2], [3, 4]]);
  for (const plan of plans) resolver.complete(plan);
});

test('只按目标等级一次性计分', () => {
  const session = new GameSession();
  assert.equal(session.score, 0);
  session.awardMerge(2);
  assert.equal(session.score, 4);
  session.awardMerge(8);
  assert.equal(session.score, 260);
});

test('新投放角色先宽限 2 秒，再连续越线 3 秒才失败', () => {
  assert.equal(DROP_GRACE_MS, 2_000);
  assert.equal(OVER_LINE_MS, 3_000);
  const session = new GameSession();
  assert.equal(session.observePiece(1, true, 0, 0), false);
  assert.equal(session.observePiece(1, true, 0, 1_999), false);
  assert.equal(session.observePiece(1, true, 0, 2_000), false);
  assert.equal(session.observePiece(1, true, 0, 4_999), false);
  assert.equal(session.isEnded, false);
  assert.equal(session.observePiece(1, true, 0, 5_000), true);
  assert.equal(session.isEnded, true);
  assert.equal(session.observePiece(1, true, 0, 5_001), false);
});

test('回到线下会清零连续计时；合成角色无新投放宽限', () => {
  const session = new GameSession();
  assert.equal(session.observePiece(1, true, 0, 2_000), false);
  assert.equal(session.observePiece(1, true, 0, 4_000), false);
  assert.equal(session.observePiece(1, false, 0, 4_001), false);
  assert.equal(session.observePiece(1, true, 0, 4_002), false);
  assert.equal(session.observePiece(1, true, 0, 7_001), false);
  assert.equal(session.isEnded, false);
  assert.equal(session.observePiece(1, true, 0, 7_002), true);

  const mergedSession = new GameSession();
  assert.equal(mergedSession.observePiece(2, true, null, 0), false);
  assert.equal(mergedSession.observePiece(2, true, null, 2_999), false);
  assert.equal(mergedSession.observePiece(2, true, null, 3_000), true);
});

test('移除角色和重新开始清空越线计时、分数与结束状态', () => {
  const session = new GameSession();
  session.awardMerge(2);
  session.observePiece(1, true, null, 0);
  session.forgetPiece(1);
  assert.equal(session.observePiece(1, true, null, 3_000), false);
  assert.equal(session.observePiece(1, true, null, 6_000), true);
  session.awardMerge(2);
  assert.equal(session.score, 4);
  session.reset();
  assert.equal(session.score, 0);
  assert.equal(session.isEnded, false);
  assert.equal(session.observePiece(1, true, null, 6_001), false);
});
