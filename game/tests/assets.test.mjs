import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('八级角色图实际存在，均为独立的 512×512 RGBA PNG', async () => {
  const hashes = new Set();
  for (let level = 1; level <= 8; level += 1) {
    const data = await readFile(new URL(`../assets/characters/lv${level}.png`, import.meta.url));
    assert.deepEqual(data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(data.readUInt32BE(16), 512);
    assert.equal(data.readUInt32BE(20), 512);
    assert.equal(data[25], 6, `lv${level} 应为带 Alpha 的 RGBA PNG`);
    assert.ok(data.length > 10_000);
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  assert.equal(hashes.size, 8);
});
