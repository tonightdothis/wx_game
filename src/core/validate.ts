import { isDrinkType } from './drinks.js';
import type { DrinkType, LevelConfig } from './types.js';

export interface LevelValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  totalCups: number;
  typeCounts: Record<string, number>;
}

/** 关卡完整性：总数可被 3 整除、每类可被 3 整除、格子尺寸一致等 */
export function validateLevel(config: LevelConfig): LevelValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const typeCounts: Record<string, number> = {};

  if (!config.id) errors.push('missing id');
  if (!config.name) errors.push('missing name');
  if (config.rows < 1 || config.cols < 1) errors.push('rows/cols must be >= 1');
  if (!Array.isArray(config.grid)) errors.push('grid must be array');

  let totalCups = 0;
  if (Array.isArray(config.grid)) {
    if (config.grid.length !== config.rows) {
      errors.push(`grid has ${config.grid.length} rows, expected ${config.rows}`);
    }
    config.grid.forEach((row, r) => {
      if (!Array.isArray(row)) {
        errors.push(`row ${r} is not array`);
        return;
      }
      if (row.length !== config.cols) {
        errors.push(`row ${r} has ${row.length} cols, expected ${config.cols}`);
      }
      row.forEach((cell, c) => {
        if (!cell || !Array.isArray(cell.stack)) {
          errors.push(`cell[${r}][${c}] missing stack`);
          return;
        }
        if (cell.iced && cell.iced.length !== cell.stack.length) {
          errors.push(`cell[${r}][${c}] iced length mismatch`);
        }
        if (cell.locked && cell.locked.length !== cell.stack.length) {
          errors.push(`cell[${r}][${c}] locked length mismatch`);
        }
        for (const t of cell.stack) {
          if (!isDrinkType(t)) errors.push(`cell[${r}][${c}] invalid type ${t}`);
          else {
            typeCounts[t] = (typeCounts[t] ?? 0) + 1;
            totalCups += 1;
          }
        }
      });
    });
  }

  if (totalCups === 0) errors.push('level has zero cups');
  if (totalCups % 3 !== 0) errors.push(`total cups ${totalCups} not divisible by 3`);

  for (const [t, n] of Object.entries(typeCounts)) {
    if (n % 3 !== 0) errors.push(`type ${t} count ${n} not divisible by 3`);
  }

  const slot = config.slotCapacity ?? 7;
  if (slot < 5 || slot > 8) warnings.push(`slotCapacity ${slot} outside typical 5–8`);
  if (totalCups < 30) warnings.push('small level (<30 cups); long-session target is 90–120');
  if (totalCups > 150) warnings.push('very large level (>150 cups)');

  return { ok: errors.length === 0, errors, warnings, totalCups, typeCounts };
}

export function assertLevelValid(config: LevelConfig): void {
  const v = validateLevel(config);
  if (!v.ok) throw new Error(`invalid level ${config.id}: ${v.errors.join('; ')}`);
}

/** 统计类型分布是否全部 %3==0 */
export function typesDivisibleByThree(types: DrinkType[]): boolean {
  const counts: Record<string, number> = {};
  for (const t of types) counts[t] = (counts[t] ?? 0) + 1;
  return Object.values(counts).every((n) => n % 3 === 0) && types.length % 3 === 0;
}
