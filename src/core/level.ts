import { isDrinkType } from './drinks.js';
import type { Cell, Cup, DrinkType, Inventory, LevelConfig } from './types.js';

let cupSeq = 0;

export function resetCupIdSeq(seed = 0): void {
  cupSeq = seed;
}

export function nextCupId(prefix = 'c'): string {
  cupSeq += 1;
  return `${prefix}${cupSeq}`;
}

export function defaultInventory(
  partial?: Partial<Inventory>,
): Inventory {
  return {
    undo: partial?.undo ?? 1,
    magnet: partial?.magnet ?? 1,
    expand: partial?.expand ?? 1,
    reshuffle: partial?.reshuffle ?? 1,
    ice_pick: partial?.ice_pick ?? 1,
    key: partial?.key ?? 0,
  };
}

export function buildGrid(config: LevelConfig): Cell[][] {
  if (config.grid.length !== config.rows) {
    throw new Error(`level ${config.id}: grid rows ${config.grid.length} != rows ${config.rows}`);
  }
  return config.grid.map((row, r) => {
    if (row.length !== config.cols) {
      throw new Error(`level ${config.id}: row ${r} cols ${row.length} != cols ${config.cols}`);
    }
    return row.map((cell) => {
      const iced = cell.iced ?? [];
      const locked = cell.locked ?? [];
      const stack: Cup[] = cell.stack.map((type, i) => {
        if (!isDrinkType(type)) throw new Error(`invalid drink type: ${type}`);
        return {
          id: nextCupId(config.id),
          type,
          iced: iced[i] === true,
          locked: locked[i] === true,
        };
      });
      return { stack };
    });
  });
}

export function countCups(grid: Cell[][]): number {
  let n = 0;
  for (const row of grid) for (const cell of row) n += cell.stack.length;
  return n;
}

export function flattenTypes(grid: Cell[][]): DrinkType[] {
  const out: DrinkType[] = [];
  for (const row of grid) for (const cell of row) for (const c of cell.stack) out.push(c.type);
  return out;
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) =>
    row.map((cell) => ({
      stack: cell.stack.map((c) => ({ ...c })),
    })),
  );
}

export function cloneInventory(inv: Inventory): Inventory {
  return { ...inv };
}
