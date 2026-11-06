import { computeStars } from './scoring.js';
import {
  buildGrid,
  cloneGrid,
  cloneInventory,
  countCups,
  defaultInventory,
  flattenTypes,
} from './level.js';
import { assertLevelValid } from './validate.js';
import type {
  ActionResult,
  AdService,
  Cup,
  DrinkType,
  GameSnapshot,
  Inventory,
  ItemType,
  LevelConfig,
  SlideDir,
} from './types.js';

interface HistoryEntry {
  grid: ReturnType<typeof cloneGrid>;
  slot: Cup[];
  slotCapacity: number;
  moveLeft: number;
  inventory: Inventory;
  cleared: number;
  status: GameSnapshot['status'];
}

const MAX_SLOT = 8;

export class GameEngine {
  private grid;
  private slot: Cup[] = [];
  private slotCapacity: number;
  private moveLeft: number;
  private inventory: Inventory;
  private cleared = 0;
  private totalCups: number;
  private step = 0;
  private status: GameSnapshot['status'] = 'playing';
  private stars: 0 | 1 | 2 | 3 = 0;
  private history: HistoryEntry[] = [];
  private itemsUsed = 0;
  private readonly levelId: string;
  private ad: AdService;

  constructor(config: LevelConfig, ad: AdService = {}) {
    assertLevelValid(config);
    this.levelId = config.id;
    this.ad = ad;
    this.grid = buildGrid(config);
    this.totalCups = countCups(this.grid);
    this.slotCapacity = Math.min(MAX_SLOT, config.slotCapacity ?? 7);
    this.moveLeft = config.moveQuota ?? 12;
    this.inventory = defaultInventory(config.items as Partial<Inventory> | undefined);
  }

  getLevelId(): string {
    return this.levelId;
  }

  getState(): GameSnapshot {
    return {
      grid: cloneGrid(this.grid),
      slot: this.slot.map((c) => ({ ...c })),
      slotCapacity: this.slotCapacity,
      moveLeft: this.moveLeft,
      inventory: cloneInventory(this.inventory),
      cleared: this.cleared,
      totalCups: this.totalCups,
      step: this.step,
      status: this.status,
      stars: this.stars,
      historyLen: this.history.length,
    };
  }

  /** 顶杯是否可被点选进入出杯槽 */
  canTap(row: number, col: number): boolean {
    if (this.status !== 'playing') return false;
    const cup = this.topCup(row, col);
    if (!cup) return false;
    if (cup.iced) return false;
    if (cup.locked) return false;
    if (this.slot.length >= this.slotCapacity) return false;
    return true;
  }

  /** 列出所有露出且可操作的杯子坐标 */
  listExposed(): { row: number; col: number; cup: Cup; tappable: boolean }[] {
    const out: { row: number; col: number; cup: Cup; tappable: boolean }[] = [];
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const cup = this.topCup(r, c);
        if (cup) out.push({ row: r, col: c, cup: { ...cup }, tappable: this.canTap(r, c) });
      }
    }
    return out;
  }

  tapCup(row: number, col: number): ActionResult {
    if (this.status !== 'playing') return { ok: false, reason: 'game_over' };
    const cup = this.topCup(row, col);
    if (!cup) return { ok: false, reason: 'empty' };
    if (cup.iced) return { ok: false, reason: 'iced' };
    if (cup.locked) return { ok: false, reason: 'locked' };
    if (this.slot.length >= this.slotCapacity) return { ok: false, reason: 'slot_full' };

    this.pushHistory();
    this.grid[row][col].stack.pop();
    this.slot.push(cup);
    this.step += 1;

    const clearedTypes = this.resolveSlotMatches();
    this.shatterAdjacentIce(row, col);
    this.recheckStatus();

    return { ok: true, clearedTypes, message: clearedTypes.length ? 'matched' : 'tapped' };
  }

  /** 同行相邻空位滑动露出的杯子一格 */
  slideCup(row: number, col: number, dir: SlideDir): ActionResult {
    if (this.status !== 'playing') return { ok: false, reason: 'game_over' };
    if (this.moveLeft <= 0) return { ok: false, reason: 'no_moves' };

    const cup = this.topCup(row, col);
    if (!cup) return { ok: false, reason: 'empty' };
    if (cup.iced || cup.locked) return { ok: false, reason: 'blocked' };

    const targetCol = dir === 'left' ? col - 1 : col + 1;
    if (targetCol < 0 || targetCol >= this.grid[row].length) {
      return { ok: false, reason: 'out_of_bounds' };
    }
    // 目标格必须「可落入」：空栈，或把杯子放到目标栈顶（华容道轻量 = 移到相邻空位）
    if (this.grid[row][targetCol].stack.length > 0) {
      return { ok: false, reason: 'target_occupied' };
    }

    this.pushHistory();
    this.grid[row][col].stack.pop();
    this.grid[row][targetCol].stack.push(cup);
    this.moveLeft -= 1;
    this.step += 1;
    return { ok: true, message: 'slid' };
  }

  useItem(item: ItemType, payload?: { type?: DrinkType; row?: number; col?: number }): ActionResult {
    if (this.status !== 'playing') return { ok: false, reason: 'game_over' };
    if ((this.inventory[item] ?? 0) <= 0) return { ok: false, reason: 'no_item' };

    switch (item) {
      case 'undo':
        return this.doUndo();
      case 'magnet':
        if (!payload?.type) return { ok: false, reason: 'need_type' };
        return this.doMagnet(payload.type);
      case 'expand':
        return this.doExpand();
      case 'reshuffle':
        return this.doReshuffle();
      case 'ice_pick':
        if (payload?.row === undefined || payload?.col === undefined) {
          return { ok: false, reason: 'need_cell' };
        }
        return this.doIcePick(payload.row, payload.col);
      case 'key':
        if (payload?.row === undefined || payload?.col === undefined) {
          return { ok: false, reason: 'need_cell' };
        }
        return this.doKey(payload.row, payload.col);
      default:
        return { ok: false, reason: 'unknown_item' };
    }
  }

  /** 广告占位：看完激励视频解锁锁定顶杯 */
  async unlockWithAd(row: number, col: number): Promise<ActionResult> {
    if (this.status !== 'playing') return { ok: false, reason: 'game_over' };
    const cup = this.topCup(row, col);
    if (!cup?.locked) return { ok: false, reason: 'not_locked' };
    const ok = this.ad.showRewarded ? await this.ad.showRewarded('unlock_cup') : true;
    if (!ok) return { ok: false, reason: 'ad_skipped' };
    this.pushHistory();
    cup.locked = false;
    this.step += 1;
    return { ok: true, message: 'unlocked_by_ad' };
  }

  isWon(): boolean {
    return this.status === 'won';
  }

  isLost(): boolean {
    return this.status === 'lost';
  }

  // --- internals ---

  private topCup(row: number, col: number): Cup | undefined {
    if (row < 0 || row >= this.grid.length) return undefined;
    if (col < 0 || col >= this.grid[row].length) return undefined;
    const stack = this.grid[row][col].stack;
    return stack[stack.length - 1];
  }

  private pushHistory(): void {
    this.history.push({
      grid: cloneGrid(this.grid),
      slot: this.slot.map((c) => ({ ...c })),
      slotCapacity: this.slotCapacity,
      moveLeft: this.moveLeft,
      inventory: cloneInventory(this.inventory),
      cleared: this.cleared,
      status: this.status,
    });
    if (this.history.length > 40) this.history.shift();
  }

  private resolveSlotMatches(): DrinkType[] {
    const cleared: DrinkType[] = [];
    // 反复消除直到没有「任意 3 个相同」
    let changed = true;
    while (changed) {
      changed = false;
      const counts = new Map<DrinkType, number>();
      for (const c of this.slot) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
      for (const [type, n] of counts) {
        if (n >= 3) {
          let remove = 3;
          const next: Cup[] = [];
          for (const c of this.slot) {
            if (c.type === type && remove > 0) {
              remove -= 1;
              continue;
            }
            next.push(c);
          }
          this.slot = next;
          this.cleared += 3;
          cleared.push(type);
          changed = true;
          break;
        }
      }
    }
    return cleared;
  }

  /** 相邻消除震碎：当某格刚被取走杯子后，检查四邻顶杯冰块 */
  private shatterAdjacentIce(row: number, col: number): void {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dr, dc] of dirs) {
      const cup = this.topCup(row + dr, col + dc);
      if (cup?.iced) cup.iced = false;
    }
  }

  private recheckStatus(): void {
    const leftOnShelf = countCups(this.grid);
    if (leftOnShelf === 0 && this.slot.length === 0) {
      this.status = 'won';
      this.stars = computeStars(this.getState(), this.itemsUsed);
      return;
    }
    if (this.slot.length >= this.slotCapacity) {
      // 槽满且当前无法三消（resolve 后仍满）→ 失败；若还能点其他？槽满就不能再 tap
      const canMatch = this.slotCanMatch();
      if (!canMatch) {
        this.status = 'lost';
        this.stars = 0;
      }
    }
  }

  private slotCanMatch(): boolean {
    const counts = new Map<DrinkType, number>();
    for (const c of this.slot) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    for (const n of counts.values()) if (n >= 3) return true;
    return false;
  }

  private consumeItem(item: ItemType): void {
    this.inventory[item] -= 1;
    this.itemsUsed += 1;
  }

  private doUndo(): ActionResult {
    if (this.history.length === 0) return { ok: false, reason: 'no_history' };
    this.consumeItem('undo');
    const prev = this.history.pop()!;
    this.grid = prev.grid;
    this.slot = prev.slot;
    this.slotCapacity = prev.slotCapacity;
    this.moveLeft = prev.moveLeft;
    this.inventory = prev.inventory;
    // 撤销不恢复被消耗的 undo 次数以外的 inventory——上面已整份还原，再扣 undo
    // 上面还原了含 undo 的 inventory，需要保证 undo 已减 1：
    // 实际上 pushHistory 在 consume 之前，所以 prev.inventory 仍有旧 undo 数；
    // consume 已在当前 inventory 上减，但我们覆盖了 inventory。修正：
    this.inventory = prev.inventory;
    if (this.inventory.undo > 0) this.inventory.undo -= 1;
    else this.inventory.undo = 0;
    this.cleared = prev.cleared;
    this.status = prev.status;
    this.step += 1;
    return { ok: true, message: 'undone' };
  }

  private doMagnet(type: DrinkType): ActionResult {
    this.pushHistory();
    this.consumeItem('magnet');
    let taken = 0;
    // 反复扫描露出顶杯，最多抽 2 个同类型进槽（同一格可连抽）
    while (taken < 2 && this.slot.length < this.slotCapacity) {
      let got = false;
      outer: for (let r = 0; r < this.grid.length; r++) {
        for (let c = 0; c < this.grid[r].length; c++) {
          const cup = this.topCup(r, c);
          if (!cup || cup.type !== type) continue;
          if (cup.iced || cup.locked) continue;
          this.grid[r][c].stack.pop();
          this.slot.push(cup);
          taken += 1;
          got = true;
          break outer;
        }
      }
      if (!got) break;
    }
    if (taken === 0) {
      // 回滚道具消耗：用 history
      const prev = this.history.pop()!;
      this.grid = prev.grid;
      this.slot = prev.slot;
      this.slotCapacity = prev.slotCapacity;
      this.moveLeft = prev.moveLeft;
      this.inventory = prev.inventory;
      this.cleared = prev.cleared;
      this.status = prev.status;
      return { ok: false, reason: 'no_target' };
    }
    const clearedTypes = this.resolveSlotMatches();
    this.step += 1;
    this.recheckStatus();
    return { ok: true, clearedTypes, message: `magnet_${taken}` };
  }

  private doExpand(): ActionResult {
    if (this.slotCapacity >= MAX_SLOT) return { ok: false, reason: 'max_slot' };
    this.pushHistory();
    this.consumeItem('expand');
    this.slotCapacity += 1;
    this.step += 1;
    // 扩槽可能让失败局面复活
    if (this.status === 'lost') this.status = 'playing';
    this.recheckStatus();
    return { ok: true, message: 'expanded' };
  }

  private doReshuffle(): ActionResult {
    this.pushHistory();
    this.consumeItem('reshuffle');
    // 打乱所有未锁定、未结冰的杯子位置（在栈位之间重排类型，保留 iced/locked 杯子不动）
    const movable: Cup[] = [];
    const anchors: { r: number; c: number; i: number; cup: Cup }[] = [];
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        this.grid[r][c].stack.forEach((cup, i) => {
          if (cup.iced || cup.locked) anchors.push({ r, c, i, cup });
          else movable.push(cup);
        });
      }
    }
    // Fisher-Yates
    for (let i = movable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [movable[i], movable[j]] = [movable[j], movable[i]];
    }
    let mi = 0;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const stack = this.grid[r][c].stack;
        for (let i = 0; i < stack.length; i++) {
          if (stack[i].iced || stack[i].locked) continue;
          stack[i] = movable[mi++];
        }
      }
    }
    this.step += 1;
    return { ok: true, message: 'reshuffled' };
  }

  private doIcePick(row: number, col: number): ActionResult {
    const cup = this.topCup(row, col);
    if (!cup?.iced) return { ok: false, reason: 'not_iced' };
    this.pushHistory();
    this.consumeItem('ice_pick');
    cup.iced = false;
    this.step += 1;
    return { ok: true, message: 'ice_cleared' };
  }

  private doKey(row: number, col: number): ActionResult {
    const cup = this.topCup(row, col);
    if (!cup?.locked) return { ok: false, reason: 'not_locked' };
    this.pushHistory();
    this.consumeItem('key');
    cup.locked = false;
    this.step += 1;
    return { ok: true, message: 'unlocked' };
  }
}

/** 导出类型计数，便于测试 */
export function remainingTypeCounts(engine: GameEngine): Record<string, number> {
  const snap = engine.getState();
  const counts: Record<string, number> = {};
  for (const t of flattenTypes(snap.grid)) counts[t] = (counts[t] ?? 0) + 1;
  for (const c of snap.slot) counts[c.type] = (counts[c.type] ?? 0) + 1;
  return counts;
}
