/** 饮品种类（占位主题） */
export type DrinkType =
  | 'milk_tea'
  | 'coffee'
  | 'latte'
  | 'juice'
  | 'smoothie'
  | 'soda'
  | 'matcha'
  | 'cocoa';

export type ItemType =
  | 'undo'
  | 'magnet'
  | 'expand'
  | 'reshuffle'
  | 'ice_pick'
  | 'key';

export type SlideDir = 'left' | 'right';

export interface Cup {
  id: string;
  type: DrinkType;
  /** 冰块：需冰锥或相邻三消震碎 */
  iced?: boolean;
  /** 锁定：需钥匙（或广告占位解锁） */
  locked?: boolean;
}

export interface Cell {
  /** 自下而上；末尾为顶杯（露出） */
  stack: Cup[];
}

export interface LevelGridCell {
  /** 自下而上的饮品类型列表 */
  stack: DrinkType[];
  /** 与 stack 等长的可选冰块标记 */
  iced?: boolean[];
  /** 与 stack 等长的可选锁定标记 */
  locked?: boolean[];
}

export interface LevelConfig {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** 出杯槽容量，默认 7，道具可扩到上限 8 */
  slotCapacity?: number;
  /** 轻量挪位次数配额 */
  moveQuota?: number;
  /** 初始道具次数 */
  items?: Partial<Record<ItemType, number>>;
  grid: LevelGridCell[][];
  meta?: {
    estimatedMinutes?: [number, number];
    description?: string;
  };
}

export interface Inventory {
  undo: number;
  magnet: number;
  expand: number;
  reshuffle: number;
  ice_pick: number;
  key: number;
}

export interface GameSnapshot {
  grid: Cell[][];
  slot: Cup[];
  slotCapacity: number;
  moveLeft: number;
  inventory: Inventory;
  cleared: number;
  totalCups: number;
  step: number;
  status: 'playing' | 'won' | 'lost';
  stars: 0 | 1 | 2 | 3;
  historyLen: number;
}

export type ActionOk = {
  ok: true;
  clearedTypes?: DrinkType[];
  message?: string;
};

export type ActionFail = {
  ok: false;
  reason: string;
};

export type ActionResult = ActionOk | ActionFail;

/** 广告位占位接口（微信激励视频等） */
export interface AdService {
  /** 返回 true 表示用户看完；开发期可直接返回 true */
  showRewarded?(placement: string): Promise<boolean>;
}
