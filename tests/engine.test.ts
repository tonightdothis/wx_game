import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/core/engine.js';
import { makeTutorialLevel } from '../src/core/generate.js';
import type { LevelConfig } from '../src/core/types.js';

function tinyLevel(): LevelConfig {
  return {
    id: 'tiny',
    name: 'tiny',
    rows: 1,
    cols: 3,
    slotCapacity: 7,
    moveQuota: 5,
    items: { undo: 1, magnet: 1, expand: 1, reshuffle: 1, ice_pick: 1, key: 1 },
    grid: [
      [
        { stack: ['milk_tea', 'coffee', 'coffee', 'coffee'] },
        { stack: ['milk_tea'] },
        { stack: ['milk_tea'] },
      ],
    ],
  };
}

describe('GameEngine core rules', () => {
  it('matches three same drinks in slot', () => {
    const eng = new GameEngine(tinyLevel());
    // tops: coffee, milk_tea, milk_tea
    assert.equal(eng.tapCup(0, 1).ok, true);
    assert.equal(eng.tapCup(0, 2).ok, true);
    assert.equal(eng.tapCup(0, 0).ok, true); // coffee
    assert.equal(eng.tapCup(0, 0).ok, true); // coffee
    assert.equal(eng.tapCup(0, 0).ok, true); // coffee → clear 3 coffee
    assert.equal(eng.getState().cleared, 3);
    assert.equal(eng.tapCup(0, 0).ok, true); // milk_tea → clear 3 milk_tea
    assert.equal(eng.getState().cleared, 6);
    assert.equal(eng.isWon(), true);
  });

  it('fails when slot is full and no match', () => {
    const lose: LevelConfig = {
      id: 'lose',
      name: 'lose',
      rows: 1,
      cols: 3,
      slotCapacity: 3,
      moveQuota: 0,
      items: { undo: 0, magnet: 0, expand: 0, reshuffle: 0, ice_pick: 0, key: 0 },
      grid: [
        [
          { stack: ['coffee', 'coffee', 'coffee'] },
          { stack: ['latte', 'latte', 'latte'] },
          { stack: ['juice', 'juice', 'juice'] },
        ],
      ],
    };
    const eng = new GameEngine(lose);
    assert.equal(eng.tapCup(0, 0).ok, true);
    assert.equal(eng.tapCup(0, 1).ok, true);
    assert.equal(eng.tapCup(0, 2).ok, true);
    assert.equal(eng.isLost(), true);
    assert.equal(eng.tapCup(0, 0).ok, false);
  });

  it('blocks tapping iced or locked top cups', () => {
    const cfg: LevelConfig = {
      id: 'block',
      name: 'block',
      rows: 1,
      cols: 2,
      slotCapacity: 7,
      items: { undo: 0, magnet: 0, expand: 0, reshuffle: 0, ice_pick: 1, key: 1 },
      grid: [
        [
          {
            stack: ['milk_tea', 'milk_tea', 'milk_tea'],
            iced: [false, false, true],
          },
          {
            stack: ['coffee', 'coffee', 'coffee'],
            locked: [false, false, true],
          },
        ],
      ],
    };
    const eng = new GameEngine(cfg);
    assert.equal(eng.canTap(0, 0), false);
    const r0 = eng.tapCup(0, 0);
    assert.equal(r0.ok, false);
    if (!r0.ok) assert.equal(r0.reason, 'iced');
    const r1 = eng.tapCup(0, 1);
    assert.equal(r1.ok, false);
    if (!r1.ok) assert.equal(r1.reason, 'locked');
    assert.equal(eng.useItem('ice_pick', { row: 0, col: 0 }).ok, true);
    assert.equal(eng.canTap(0, 0), true);
    assert.equal(eng.useItem('key', { row: 0, col: 1 }).ok, true);
    assert.equal(eng.canTap(0, 1), true);
  });

  it('lists only exposed top cups', () => {
    const eng = new GameEngine(tinyLevel());
    const tops = eng.listExposed();
    assert.equal(tops.length, 3);
    assert.equal(tops.find((t) => t.col === 0)?.cup.type, 'coffee');
  });

  it('slides exposed cup into adjacent empty cell', () => {
    const cfg: LevelConfig = {
      id: 'slide',
      name: 'slide',
      rows: 1,
      cols: 3,
      moveQuota: 2,
      grid: [
        [
          { stack: ['milk_tea', 'milk_tea', 'milk_tea'] },
          { stack: [] },
          { stack: ['coffee', 'coffee', 'coffee'] },
        ],
      ],
    };
    const eng = new GameEngine(cfg);
    assert.equal(eng.slideCup(0, 0, 'right').ok, true);
    const st = eng.getState();
    assert.equal(st.grid[0][0].stack.length, 2);
    assert.equal(st.grid[0][1].stack[0].type, 'milk_tea');
    assert.equal(st.moveLeft, 1);
    assert.equal(eng.slideCup(0, 2, 'left').ok, false);
  });

  it('expand / magnet / undo items work', () => {
    const base: LevelConfig = {
      id: 'items',
      name: 'items',
      rows: 1,
      cols: 3,
      slotCapacity: 7,
      items: { undo: 1, magnet: 1, expand: 1, reshuffle: 0, ice_pick: 0, key: 0 },
      grid: [
        [
          { stack: ['coffee', 'coffee', 'coffee'] },
          { stack: ['latte', 'latte', 'latte'] },
          { stack: ['juice', 'juice', 'juice'] },
        ],
      ],
    };
    const eng = new GameEngine(base);
    eng.tapCup(0, 0); // coffee in slot
    const mag = eng.useItem('magnet', { type: 'coffee' });
    assert.equal(mag.ok, true);
    // 槽内 1 + 磁铁最多再抽 2 → 三消
    assert.ok(eng.getState().cleared >= 3);

    const beforeInv = eng.getState().inventory.undo;
    assert.equal(eng.useItem('undo').ok, true);
    assert.equal(eng.getState().inventory.undo, beforeInv - 1);

    const eng3 = new GameEngine({ ...base, slotCapacity: 3 });
    assert.equal(eng3.useItem('expand').ok, true);
    assert.equal(eng3.getState().slotCapacity, 4);
  });

  it('tutorial level can be cleared by tapping group tops', () => {
    const eng = new GameEngine(makeTutorialLevel());
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        for (let k = 0; k < 3; k++) {
          const res = eng.tapCup(r, c);
          assert.equal(res.ok, true, !res.ok ? res.reason : '');
        }
      }
    }
    assert.equal(eng.isWon(), true);
    assert.ok(eng.getState().stars >= 1);
  });
});
