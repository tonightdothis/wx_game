import type { GameSnapshot } from './types.js';

/**
 * 粗分星级：
 * - 通关即至少 1 星
 * - 出杯槽峰值压力低（终局槽占用少）+ 挪位剩余多 → 更高星
 * - 道具消耗少 → 更高星
 */
export function computeStars(snap: GameSnapshot, initialItemsUsed: number): 0 | 1 | 2 | 3 {
  if (snap.status !== 'won') return 0;

  let score = 1;
  const slotPressure = snap.slot.length / Math.max(1, snap.slotCapacity);
  if (slotPressure <= 0.35) score += 1;
  if (snap.moveLeft >= 3 && initialItemsUsed <= 2) score += 1;
  else if (initialItemsUsed === 0) score += 1;

  return Math.min(3, score) as 1 | 2 | 3;
}
