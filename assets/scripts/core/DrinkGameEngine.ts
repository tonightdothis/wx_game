import type { DrinkType } from './DrinkTypes';
import type { LevelConfig, LevelItemConfig } from './LevelConfig';

export interface BoardItem {
  id: string;
  type: DrinkType;
  x: number;
  y: number;
  layer: number;
  blocker?: LevelItemConfig['blocker'];
  revealed: boolean;
  removed: boolean;
}

export interface TraySlot {
  itemId: string;
  type: DrinkType;
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'failed';
export type FailReason = 'time_up' | 'tray_full' | null;

export interface MoveResult {
  accepted: boolean;
  matchedType?: DrinkType;
  removedItemIds: string[];
  status: GameStatus;
  failReason: FailReason;
}

export interface HintResult {
  itemIds: string[];
  type: DrinkType | null;
  reason: 'complete_tray_match' | 'available_group' | 'single_available' | 'none';
}

export class DrinkGameEngine {
  readonly width: number;
  readonly height: number;
  readonly traySize: number;
  readonly timeLimit: number;

  private readonly boardItems: BoardItem[];
  private readonly traySlots: TraySlot[] = [];
  private statusValue: GameStatus = 'ready';
  private failReasonValue: FailReason = null;
  private remainingTimeValue: number;
  private comboValue = 0;
  private lastMatchElapsedTime: number | null = null;
  private elapsedTimeValue = 0;
  private readonly comboWindowSeconds = 3;

  constructor(level: LevelConfig) {
    this.width = level.width;
    this.height = level.height;
    this.traySize = level.traySize;
    this.timeLimit = level.timeLimit;
    this.remainingTimeValue = level.timeLimit;
    this.boardItems = level.items.map((item, index) => ({
      id: `${level.levelId}_${index}_${item.x}_${item.y}_${item.layer ?? 0}`,
      type: item.type,
      x: item.x,
      y: item.y,
      layer: item.layer ?? 0,
      blocker: item.blocker,
      revealed: item.blocker !== 'mystery',
      removed: false
    }));
  }

  get status(): GameStatus {
    return this.statusValue;
  }

  get failReason(): FailReason {
    return this.failReasonValue;
  }

  get remainingTime(): number {
    return this.remainingTimeValue;
  }

  get combo(): number {
    return this.comboValue;
  }

  get items(): readonly BoardItem[] {
    return this.boardItems;
  }

  get tray(): readonly TraySlot[] {
    return this.traySlots;
  }

  start(): void {
    if (this.statusValue === 'ready') {
      this.statusValue = 'playing';
    }
  }

  tick(deltaSeconds: number): void {
    if (this.statusValue !== 'playing') {
      return;
    }

    this.remainingTimeValue = Math.max(0, this.remainingTimeValue - deltaSeconds);
    this.elapsedTimeValue += deltaSeconds;
    if (this.remainingTimeValue <= 0) {
      this.statusValue = 'failed';
      this.failReasonValue = 'time_up';
    }
  }

  addTime(seconds: number): void {
    if (this.statusValue === 'failed' && this.failReasonValue === 'time_up') {
      this.statusValue = 'playing';
      this.failReasonValue = null;
    }

    this.remainingTimeValue = Math.min(this.timeLimit, this.remainingTimeValue + seconds);
  }

  clearTraySlots(count: number): string[] {
    const removed = this.traySlots.splice(0, Math.min(count, this.traySlots.length));
    if (this.statusValue === 'failed' && this.failReasonValue === 'tray_full') {
      this.statusValue = 'playing';
      this.failReasonValue = null;
    }
    return removed.map((slot) => slot.itemId);
  }

  canSelect(itemId: string): boolean {
    const item = this.findItem(itemId);
    if (!item || item.removed || this.statusValue !== 'playing') {
      return false;
    }

    if (item.blocker === 'ice' || item.blocker === 'lock') {
      return false;
    }

    return this.isTopItem(item);
  }

  selectItem(itemId: string): MoveResult {
    const emptyResult: MoveResult = {
      accepted: false,
      removedItemIds: [],
      status: this.statusValue,
      failReason: this.failReasonValue
    };

    if (!this.canSelect(itemId)) {
      return emptyResult;
    }

    const item = this.findItem(itemId);
    if (!item) {
      return emptyResult;
    }

    if (item.blocker === 'bubble') {
      item.blocker = undefined;
      return {
        accepted: true,
        removedItemIds: [],
        status: this.statusValue,
        failReason: this.failReasonValue
      };
    }

    if (item.blocker === 'mystery') {
      item.blocker = undefined;
      item.revealed = true;
      return {
        accepted: true,
        removedItemIds: [],
        status: this.statusValue,
        failReason: this.failReasonValue
      };
    }

    item.removed = true;
    this.traySlots.push({ itemId: item.id, type: item.type });

    const match = this.resolveTrayMatch();
    this.resolveWinOrFail();

    return {
      accepted: true,
      matchedType: match.matchedType,
      removedItemIds: match.removedTrayItemIds.length > 0 ? match.removedTrayItemIds : [item.id],
      status: this.statusValue,
      failReason: this.failReasonValue
    };
  }

  useHint(): HintResult {
    const selectable = this.boardItems.filter((item) => this.canSelect(item.id));

    if (selectable.length === 0) {
      return { itemIds: [], type: null, reason: 'none' };
    }

    const trayCounts = new Map<DrinkType, number>();
    for (const slot of this.traySlots) {
      trayCounts.set(slot.type, (trayCounts.get(slot.type) ?? 0) + 1);
    }

    const trayCandidates = [...trayCounts.entries()]
      .filter(([, count]) => count > 0 && count < 3)
      .sort((a, b) => b[1] - a[1]);

    for (const [type, count] of trayCandidates) {
      const needed = 3 - count;
      const matches = selectable.filter((item) => item.type === type).slice(0, needed);
      if (matches.length === needed) {
        return {
          itemIds: matches.map((item) => item.id),
          type,
          reason: 'complete_tray_match'
        };
      }
    }

    const byType = new Map<DrinkType, BoardItem[]>();

    for (const item of selectable) {
      const group = byType.get(item.type) ?? [];
      group.push(item);
      byType.set(item.type, group);
      if (group.length >= 3) {
        return {
          itemIds: group.slice(0, 3).map((candidate) => candidate.id),
          type: item.type,
          reason: 'available_group'
        };
      }
    }

    return {
      itemIds: [selectable[0].id],
      type: selectable[0].type,
      reason: 'single_available'
    };
  }

  shuffle(): void {
    const active = this.boardItems.filter((item) => !item.removed);
    const positions = active.map((item) => ({ x: item.x, y: item.y }));

    for (let i = positions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    active.forEach((item, index) => {
      item.x = positions[index].x;
      item.y = positions[index].y;
    });
  }

  private resolveTrayMatch(): { matchedType?: DrinkType; removedTrayItemIds: string[] } {
    const byType = new Map<DrinkType, number[]>();

    this.traySlots.forEach((slot, index) => {
      const indexes = byType.get(slot.type) ?? [];
      indexes.push(index);
      byType.set(slot.type, indexes);
    });

    for (const [type, indexes] of byType) {
      if (indexes.length >= 3) {
        const selectedIndexes = indexes.slice(0, 3);
        const removedIds = selectedIndexes.map((index) => this.traySlots[index].itemId);
        for (const index of [...selectedIndexes].sort((a, b) => b - a)) {
          this.traySlots.splice(index, 1);
        }
        this.comboValue = this.resolveNextComboValue();
        this.lastMatchElapsedTime = this.elapsedTimeValue;
        this.remainingTimeValue = Math.min(this.timeLimit, this.remainingTimeValue + 1);
        return { matchedType: type, removedTrayItemIds: removedIds };
      }
    }

    return { removedTrayItemIds: [] };
  }

  private resolveNextComboValue(): number {
    if (this.lastMatchElapsedTime === null) {
      return 1;
    }

    const secondsSinceLastMatch = this.elapsedTimeValue - this.lastMatchElapsedTime;
    return secondsSinceLastMatch <= this.comboWindowSeconds ? this.comboValue + 1 : 1;
  }

  private resolveWinOrFail(): void {
    if (this.boardItems.every((item) => item.removed)) {
      this.statusValue = 'won';
      this.failReasonValue = null;
      return;
    }

    if (this.traySlots.length >= this.traySize) {
      this.statusValue = 'failed';
      this.failReasonValue = 'tray_full';
    }
  }

  private findItem(itemId: string): BoardItem | undefined {
    return this.boardItems.find((item) => item.id === itemId);
  }

  private isTopItem(item: BoardItem): boolean {
    return !this.boardItems.some(
      (other) =>
        !other.removed &&
        other.x === item.x &&
        other.y === item.y &&
        other.layer > item.layer
    );
  }
}
