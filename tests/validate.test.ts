import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel, typesDivisibleByThree } from '../src/core/validate.js';
import type { LevelConfig } from '../src/core/types.js';

describe('validateLevel', () => {
  it('rejects counts not divisible by 3', () => {
    const cfg: LevelConfig = {
      id: 'bad',
      name: 'bad',
      rows: 1,
      cols: 1,
      grid: [[{ stack: ['milk_tea', 'milk_tea'] }]],
    };
    const v = validateLevel(cfg);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes('divisible')));
  });

  it('typesDivisibleByThree helper', () => {
    assert.equal(typesDivisibleByThree(['a' as never]), false);
    assert.equal(typesDivisibleByThree(['milk_tea', 'milk_tea', 'milk_tea']), true);
  });
});
