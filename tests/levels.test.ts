import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLevel } from '../src/core/validate.js';
import { solveGreedy } from '../src/core/solver.js';
import { makeTutorialLevel, generateLevel } from '../src/core/generate.js';
import type { LevelConfig } from '../src/core/types.js';

const levelsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'levels');

describe('levels integrity', () => {
  it('all JSON levels pass validateLevel', async () => {
    const files = (await readdir(levelsDir)).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= 3, 'need at least 3 levels');
    for (const f of files) {
      const cfg = JSON.parse(await readFile(path.join(levelsDir, f), 'utf8')) as LevelConfig;
      const v = validateLevel(cfg);
      assert.equal(v.ok, true, `${f}: ${v.errors.join('; ')}`);
      assert.equal(v.totalCups % 3, 0);
      for (const n of Object.values(v.typeCounts)) assert.equal(n % 3, 0);
    }
  });

  it('tutorial is greedily solvable', () => {
    const result = solveGreedy(makeTutorialLevel(), 200);
    assert.equal(result.solved, true, `log tail: ${result.log.slice(-10).join(' | ')}`);
  });

  it('generated friendly mid level is greedily solvable', () => {
    // 构造「每格三同」友好大关，保证贪心可解
    const types = ['milk_tea', 'coffee', 'latte', 'juice', 'smoothie', 'soda'] as const;
    const grid = [];
    let ti = 0;
    for (let r = 0; r < 4; r++) {
      const row = [];
      for (let c = 0; c < 4; c++) {
        const t = types[ti % types.length];
        ti += 1;
        row.push({ stack: [t, t, t] });
      }
      grid.push(row);
    }
    // 16 cells * 3 = 48 cups
    const cfg: LevelConfig = {
      id: 'friendly_mid',
      name: 'friendly',
      rows: 4,
      cols: 4,
      slotCapacity: 7,
      moveQuota: 10,
      items: { undo: 1, magnet: 1, expand: 1, reshuffle: 1, ice_pick: 0, key: 0 },
      grid,
    };
    const v = validateLevel(cfg);
    assert.equal(v.ok, true, v.errors.join('; '));
    const result = solveGreedy(cfg, 1000);
    assert.equal(result.solved, true, `steps=${result.steps} log=${result.log.slice(-15).join('|')}`);
  });

  it('generateLevel output is valid and ~90–120 cups for big configs', () => {
    const lv = generateLevel({
      id: 'gen',
      name: 'gen',
      rows: 5,
      cols: 4,
      totalCups: 96,
      stackMax: 5,
      seed: 7,
    });
    const v = validateLevel(lv);
    assert.equal(v.ok, true, v.errors.join('; '));
    assert.equal(v.totalCups, 96);
  });
});
