import type { DrinkType, LevelConfig, LevelGridCell } from './types.js';
import { ALL_DRINK_TYPES } from './drinks.js';

export interface GenerateOptions {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** 总杯数，须被 3 整除，默认 rows*cols*stackAvg 估算 */
  totalCups: number;
  stackMax?: number;
  drinkTypes?: DrinkType[];
  slotCapacity?: number;
  moveQuota?: number;
  seed?: number;
  icedCount?: number;
  lockedCount?: number;
  description?: string;
  estimatedMinutes?: [number, number];
}

/** 可复现的简单 LCG */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * 生成「类型计数均 %3==0」的大关。
 * 布局策略：先生成多重集合，再按列填充栈，保证可被完整性校验通过。
 * 教学友好布局：同类型尽量成段，降低无解概率。
 */
export function generateLevel(opts: GenerateOptions): LevelConfig {
  if (opts.totalCups % 3 !== 0) throw new Error('totalCups must be % 3 == 0');
  const types = opts.drinkTypes ?? ALL_DRINK_TYPES.slice(0, 6);
  const rng = makeRng(opts.seed ?? 1);
  const stackMax = opts.stackMax ?? 4;

  // 分配每种 3 的倍数
  const counts = new Map<DrinkType, number>();
  let left = opts.totalCups;
  for (let i = 0; i < types.length; i++) {
    const remainingTypes = types.length - i;
    let share =
      i === types.length - 1
        ? left
        : Math.floor(left / remainingTypes / 3) * 3;
    if (share < 3 && left >= 3) share = 3;
    share = Math.min(share, left);
    share = Math.floor(share / 3) * 3;
    counts.set(types[i], share);
    left -= share;
  }
  // 剩余补到第一种
  if (left > 0) {
    const t0 = types[0];
    counts.set(t0, (counts.get(t0) ?? 0) + left);
    // 若仍不能被 3 整除，从总量角度已保证 total%3==0，但单项可能偏移——修正：
    for (const t of types) {
      const n = counts.get(t) ?? 0;
      const rem = n % 3;
      if (rem !== 0) {
        counts.set(t, n - rem);
        const t1 = types[(types.indexOf(t) + 1) % types.length];
        counts.set(t1, (counts.get(t1) ?? 0) + rem);
      }
    }
  }

  // 最终再校正：确保总和与每类 %3
  let bag: DrinkType[] = [];
  for (const t of types) {
    let n = Math.floor((counts.get(t) ?? 0) / 3) * 3;
    counts.set(t, n);
    for (let i = 0; i < n; i++) bag.push(t);
  }
  // 若不足 totalCups，按 3 个一组加
  while (bag.length + 3 <= opts.totalCups) {
    const t = types[Math.floor(rng() * types.length)];
    bag.push(t, t, t);
    counts.set(t, (counts.get(t) ?? 0) + 3);
  }

  // 轻度打乱但保持段：按类型块 shuffle
  const blocks: DrinkType[][] = [];
  for (const t of types) {
    const n = counts.get(t) ?? 0;
    for (let i = 0; i < n; i += 3) blocks.push([t, t, t]);
  }
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  bag = blocks.flat();

  const cells = opts.rows * opts.cols;
  const base = Math.floor(bag.length / cells);
  const extra = bag.length % cells;
  if (base > stackMax) {
    throw new Error(`need stackMax >= ${base}, got ${stackMax}`);
  }

  const heights: number[] = [];
  for (let i = 0; i < cells; i++) heights.push(base + (i < extra ? 1 : 0));

  const grid: LevelGridCell[][] = [];
  let idx = 0;
  let cellIndex = 0;
  for (let r = 0; r < opts.rows; r++) {
    const row: LevelGridCell[] = [];
    for (let c = 0; c < opts.cols; c++) {
      const h = heights[cellIndex++];
      const stack = bag.slice(idx, idx + h);
      idx += h;
      row.push({ stack });
    }
    grid.push(row);
  }

  // 放置冰块 / 锁定在部分非底层顶杯
  let icedLeft = opts.icedCount ?? 0;
  let lockedLeft = opts.lockedCount ?? 0;
  const positions: { r: number; c: number; i: number }[] = [];
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const stack = grid[r][c].stack;
      for (let i = 0; i < stack.length; i++) {
        if (i === stack.length - 1 || i > 0) positions.push({ r, c, i });
      }
    }
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  for (const p of positions) {
    if (icedLeft <= 0 && lockedLeft <= 0) break;
    const cell = grid[p.r][p.c];
    if (!cell.iced) cell.iced = cell.stack.map(() => false);
    if (!cell.locked) cell.locked = cell.stack.map(() => false);
    if (icedLeft > 0 && !cell.locked![p.i]) {
      cell.iced![p.i] = true;
      icedLeft -= 1;
      continue;
    }
    if (lockedLeft > 0 && !cell.iced![p.i]) {
      cell.locked![p.i] = true;
      lockedLeft -= 1;
    }
  }

  return {
    id: opts.id,
    name: opts.name,
    rows: opts.rows,
    cols: opts.cols,
    slotCapacity: opts.slotCapacity ?? 7,
    moveQuota: opts.moveQuota ?? 15,
    items: {
      undo: 2,
      magnet: 2,
      expand: 1,
      reshuffle: 1,
      ice_pick: Math.max(1, opts.icedCount ?? 0),
      key: Math.max(0, opts.lockedCount ?? 0),
    },
    grid,
    meta: {
      estimatedMinutes: opts.estimatedMinutes ?? [8, 12],
      description: opts.description,
    },
  };
}

/** 极简可解教学关：单层、类型成组 */
export function makeTutorialLevel(): LevelConfig {
  const pattern: DrinkType[] = [
    'milk_tea',
    'milk_tea',
    'milk_tea',
    'coffee',
    'coffee',
    'coffee',
    'latte',
    'latte',
    'latte',
    'juice',
    'juice',
    'juice',
    'matcha',
    'matcha',
    'matcha',
    'soda',
    'soda',
    'soda',
  ];
  // 2 行 x 3 列，每格栈高 3 → 18 cups
  const grid: LevelGridCell[][] = [
    [
      { stack: pattern.slice(0, 3) },
      { stack: pattern.slice(3, 6) },
      { stack: pattern.slice(6, 9) },
    ],
    [
      { stack: pattern.slice(9, 12) },
      { stack: pattern.slice(12, 15) },
      { stack: pattern.slice(15, 18) },
    ],
  ];
  return {
    id: 'level_01',
    name: '新手柜 · 开业第一天',
    rows: 2,
    cols: 3,
    slotCapacity: 7,
    moveQuota: 8,
    items: { undo: 1, magnet: 1, expand: 1, reshuffle: 0, ice_pick: 0, key: 0 },
    grid,
    meta: {
      estimatedMinutes: [3, 5],
      description: '教学关：每格三同，点选即可清场。',
    },
  };
}
