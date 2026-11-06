import { GameEngine } from './engine.js';
import type { DrinkType, LevelConfig } from './types.js';

export interface SolveResult {
  solved: boolean;
  steps: number;
  taps: number;
  slides: number;
  itemsUsed: number;
  log: string[];
}

/**
 * 贪心求解：优先点选「槽内已有同款」的露出杯，其次点选数量最多的露出类型。
 * 槽压高时尝试扩槽/磁铁；卡住时用重排。适合教学关与结构友好的大关。
 */
export function solveGreedy(config: LevelConfig, maxSteps = 5000): SolveResult {
  const engine = new GameEngine(config);
  const log: string[] = [];
  let taps = 0;
  let slides = 0;
  let itemsUsed = 0;
  let steps = 0;

  while (steps < maxSteps && engine.getState().status === 'playing') {
    steps += 1;
    const state = engine.getState();

    // 1) 若槽将满且有扩槽，先扩
    if (state.slot.length >= state.slotCapacity - 1 && state.inventory.expand > 0) {
      const r = engine.useItem('expand');
      if (r.ok) {
        itemsUsed += 1;
        log.push('expand');
        continue;
      }
    }

    const exposed = engine.listExposed().filter((e) => e.tappable);
    if (exposed.length === 0) {
      // 尝试解冰 / 解锁
      const blocked = engine.listExposed();
      const iced = blocked.find((e) => e.cup.iced && state.inventory.ice_pick > 0);
      if (iced) {
        const r = engine.useItem('ice_pick', { row: iced.row, col: iced.col });
        if (r.ok) {
          itemsUsed += 1;
          log.push(`ice_pick ${iced.row},${iced.col}`);
          continue;
        }
      }
      const locked = blocked.find((e) => e.cup.locked && state.inventory.key > 0);
      if (locked) {
        const r = engine.useItem('key', { row: locked.row, col: locked.col });
        if (r.ok) {
          itemsUsed += 1;
          log.push(`key ${locked.row},${locked.col}`);
          continue;
        }
      }
      if (state.inventory.reshuffle > 0) {
        const r = engine.useItem('reshuffle');
        if (r.ok) {
          itemsUsed += 1;
          log.push('reshuffle');
          continue;
        }
      }
      // 尝试滑动腾出可点
      if (state.moveLeft > 0 && trySlide(engine, log)) {
        slides += 1;
        continue;
      }
      break;
    }

    // 槽内类型计数
    const slotCount = new Map<DrinkType, number>();
    for (const c of state.slot) slotCount.set(c.type, (slotCount.get(c.type) ?? 0) + 1);

    exposed.sort((a, b) => {
      const sa = slotCount.get(a.cup.type) ?? 0;
      const sb = slotCount.get(b.cup.type) ?? 0;
      if (sb !== sa) return sb - sa;
      // 同优先：更深的栈先清（露出后继续）
      const da = state.grid[a.row][a.col].stack.length;
      const db = state.grid[b.row][b.col].stack.length;
      return db - da;
    });

    // 若选中会把槽塞满且不能成三，尝试磁铁补全
    let chosen = exposed[0];
    const foreshadow = (slotCount.get(chosen.cup.type) ?? 0) + 1;
    if (
      state.slot.length + 1 >= state.slotCapacity &&
      foreshadow < 3 &&
      state.inventory.magnet > 0
    ) {
      // 找槽内差 1～2 就能消的类型
      for (const [t, n] of slotCount) {
        if (n > 0 && n < 3) {
          const r = engine.useItem('magnet', { type: t });
          if (r.ok) {
            itemsUsed += 1;
            log.push(`magnet ${t}`);
            continue;
          }
        }
      }
    }

    // 重新取一次状态（可能刚用了道具）
    if (engine.getState().status !== 'playing') break;
    const exposed2 = engine.listExposed().filter((e) => e.tappable);
    if (exposed2.length === 0) continue;
    // 同样排序
    const sc2 = new Map<DrinkType, number>();
    for (const c of engine.getState().slot) sc2.set(c.type, (sc2.get(c.type) ?? 0) + 1);
    exposed2.sort((a, b) => (sc2.get(b.cup.type) ?? 0) - (sc2.get(a.cup.type) ?? 0));
    chosen = exposed2[0];

    const res = engine.tapCup(chosen.row, chosen.col);
    if (!res.ok) {
      if (engine.getState().inventory.undo > 0) {
        engine.useItem('undo');
        itemsUsed += 1;
        log.push('undo');
        continue;
      }
      break;
    }
    taps += 1;
    log.push(`tap ${chosen.row},${chosen.col} ${chosen.cup.type}`);
  }

  const final = engine.getState();
  return {
    solved: final.status === 'won',
    steps,
    taps,
    slides,
    itemsUsed,
    log,
  };
}

function trySlide(engine: GameEngine, log: string[]): boolean {
  const state = engine.getState();
  for (let r = 0; r < state.grid.length; r++) {
    for (let c = 0; c < state.grid[r].length; c++) {
      const stack = state.grid[r][c].stack;
      if (stack.length === 0) continue;
      const top = stack[stack.length - 1];
      if (top.iced || top.locked) continue;
      for (const dir of ['left', 'right'] as const) {
        const res = engine.slideCup(r, c, dir);
        if (res.ok) {
          log.push(`slide ${r},${c} ${dir}`);
          return true;
        }
      }
    }
  }
  return false;
}
