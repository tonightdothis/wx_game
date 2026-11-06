/**
 * 微信小游戏 Canvas 入口：杯柜清场 level 可玩原型
 * 环境无 DOM，使用 wx.createCanvas + touch 命中。
 */
import { DRINKS } from '../core/drinks.js';
import { GameEngine } from '../core/engine.js';
import type { DrinkType, ItemType, LevelConfig } from '../core/types.js';

import level01 from '../../levels/level_01.json';
import level02 from '../../levels/level_02.json';
import level03 from '../../levels/level_03.json';

declare const wx: {
  createCanvas: () => any;
  getSystemInfoSync: () => { windowWidth: number; windowHeight: number; pixelRatio?: number };
  onTouchStart: (cb: (e: { touches: { clientX: number; clientY: number }[] }) => void) => void;
  onTouchEnd?: (cb: (e: unknown) => void) => void;
  showToast?: (opt: { title: string; icon?: string; duration?: number }) => void;
};

const LEVELS: Record<string, LevelConfig> = {
  level_01: level01 as LevelConfig,
  level_02: level02 as LevelConfig,
  level_03: level03 as LevelConfig,
};

const ITEM_LABELS: { id: ItemType; label: string }[] = [
  { id: 'undo', label: '撤销' },
  { id: 'magnet', label: '磁铁' },
  { id: 'expand', label: '扩槽' },
  { id: 'reshuffle', label: '洗牌' },
  { id: 'ice_pick', label: '冰锥' },
];

interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'cup' | 'empty' | 'item' | 'btn';
  row?: number;
  col?: number;
  item?: ItemType;
  action?: string;
}

let canvas: any;
let ctx: CanvasRenderingContext2D;
let W = 375;
let H = 667;
let dpr = 1;

let engine: GameEngine;
let currentId = 'level_01';
let slideMode = false;
let slideFrom: { r: number; c: number } | null = null;
let magnetArm = false;
let icePickArm = false;
let statusMsg = '点露出的杯子进入出杯槽';
let hits: HitRect[] = [];

function toast(title: string): void {
  statusMsg = title;
  if (typeof wx !== 'undefined' && wx.showToast) {
    try {
      wx.showToast({ title: title.slice(0, 14), icon: 'none', duration: 1200 });
    } catch {
      /* ignore */
    }
  }
}

function loadLevel(id: string): void {
  const cfg = LEVELS[id];
  if (!cfg) {
    toast('关卡不存在');
    return;
  }
  currentId = id;
  engine = new GameEngine(cfg, {
    showRewarded: async () => true,
  });
  slideMode = false;
  slideFrom = null;
  magnetArm = false;
  icePickArm = false;
  statusMsg = `载入「${cfg.name}」`;
  draw();
}

function layoutCell(
  cols: number,
  rows: number,
): { originX: number; originY: number; cellW: number; cellH: number; gap: number } {
  const pad = 16;
  const topHud = 110;
  const bottomBar = 200;
  const availW = W - pad * 2;
  const availH = H - topHud - bottomBar;
  const gap = 8;
  const cellW = (availW - gap * (cols - 1)) / cols;
  const cellH = Math.min(96, (availH - gap * (rows - 1)) / rows);
  const originX = pad;
  const originY = topHud;
  return { originX, originY, cellW, cellH, gap };
}

function roundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawText(
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'top',
): void {
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function draw(): void {
  hits = [];
  const st = engine.getState();
  const rows = st.grid.length;
  const cols = st.grid[0]?.length ?? 1;
  const L = layoutCell(cols, rows);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1a1423';
  ctx.fillRect(0, 0, W, H);

  // HUD
  drawText('杯柜清场', 16, 16, 22, '#fff');
  drawText(
    `消除 ${st.cleared}/${st.totalCups}  ·  槽 ${st.slot.length}/${st.slotCapacity}  ·  挪位 ${st.moveLeft}`,
    16,
    46,
    13,
    '#cbb8e8',
  );
  drawText(`步数 ${st.step}  ·  ⭐ ${st.stars}`, 16, 66, 13, '#cbb8e8');

  let banner = statusMsg;
  if (st.status === 'won') banner = `清场成功！星级 ${st.stars}`;
  else if (st.status === 'lost') banner = '槽满失败 — 试试撤销/扩槽/磁铁';
  else if (slideMode) banner = '挪位：先点杯子，再点同行相邻空位';
  else if (magnetArm) banner = '磁铁：点一个露出杯子选种类';
  else if (icePickArm) banner = '冰锥：点结冰顶杯';
  drawText(banner, 16, 86, 12, '#ffd54f');

  // Shelf
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = L.originX + c * (L.cellW + L.gap);
      const y = L.originY + r * (L.cellH + L.gap);
      const cell = st.grid[r][c];
      const top = cell.stack[cell.stack.length - 1];
      if (!top) {
        roundRect(x, y, L.cellW, L.cellH, 10, '#2a2238', '#4a3f5c');
        drawText('空', x + L.cellW / 2, y + L.cellH / 2, 14, '#8877aa', 'center', 'middle');
        hits.push({ x, y, w: L.cellW, h: L.cellH, kind: 'empty', row: r, col: c });
      } else {
        const meta = DRINKS[top.type];
        const blocked = !!(top.iced || top.locked);
        roundRect(x, y, L.cellW, L.cellH, 10, meta.color, blocked ? '#fff' : '#00000033');
        drawText(meta.emoji, x + L.cellW / 2, y + L.cellH / 2 - 10, 28, '#111', 'center', 'middle');
        const flags = `${top.iced ? '冰' : ''}${top.locked ? '锁' : ''}`;
        drawText(
          `${meta.label}${flags ? '(' + flags + ')' : ''}`,
          x + L.cellW / 2,
          y + L.cellH - 28,
          11,
          '#111',
          'center',
          'top',
        );
        drawText(`×${cell.stack.length}`, x + L.cellW / 2, y + L.cellH - 14, 10, '#333', 'center', 'top');
        hits.push({ x, y, w: L.cellW, h: L.cellH, kind: 'cup', row: r, col: c });
      }
    }
  }

  // Slot bar
  const slotY = H - 170;
  const slotPad = 16;
  const slotGap = 6;
  const slotCell = Math.min(40, (W - slotPad * 2 - slotGap * (st.slotCapacity - 1)) / st.slotCapacity);
  drawText('出杯槽', slotPad, slotY - 18, 12, '#cbb8e8');
  for (let i = 0; i < st.slotCapacity; i++) {
    const x = slotPad + i * (slotCell + slotGap);
    const cup = st.slot[i];
    roundRect(x, slotY, slotCell, slotCell, 8, cup ? DRINKS[cup.type].color : '#2a2238', '#5a4d6e');
    if (cup) {
      drawText(DRINKS[cup.type].emoji, x + slotCell / 2, slotY + slotCell / 2, 18, '#111', 'center', 'middle');
    }
  }

  // Items + controls
  const btnY = H - 110;
  const btns: { label: string; action?: string; item?: ItemType; accent?: string }[] = [
    { label: slideMode ? '挪位●' : '挪位', action: 'slide', accent: slideMode ? '#7c4dff' : undefined },
    ...ITEM_LABELS.map((it) => ({
      label: `${it.label}${st.inventory[it.id] ?? 0}`,
      item: it.id,
    })),
    { label: '重开', action: 'restart' },
    { label: '关卡', action: 'nextLevel' },
  ];

  const bGap = 6;
  const bW = (W - 32 - bGap * (btns.length - 1)) / btns.length;
  const bH = 36;
  btns.forEach((b, i) => {
    const x = 16 + i * (bW + bGap);
    const disabled =
      b.item != null && ((st.inventory[b.item] ?? 0) <= 0 || st.status !== 'playing');
    const fill = b.accent ?? (disabled ? '#3a3148' : '#3d2f5c');
    roundRect(x, btnY, bW, bH, 8, fill, '#6a5a88');
    drawText(b.label, x + bW / 2, btnY + bH / 2, 10, disabled ? '#888' : '#fff', 'center', 'middle');
    if (b.item) {
      hits.push({ x, y: btnY, w: bW, h: bH, kind: 'item', item: b.item });
    } else if (b.action) {
      hits.push({ x, y: btnY, w: bW, h: bH, kind: 'btn', action: b.action });
    }
  });

  // Level chips
  const ids = Object.keys(LEVELS);
  const chipY = H - 55;
  ids.forEach((id, i) => {
    const x = 16 + i * 110;
    const on = id === currentId;
    roundRect(x, chipY, 100, 28, 8, on ? '#5e35b1' : '#2a2238', '#6a5a88');
    drawText(LEVELS[id].name.slice(0, 8), x + 50, chipY + 14, 11, '#fff', 'center', 'middle');
    hits.push({ x, y: chipY, w: 100, h: 28, kind: 'btn', action: `level:${id}` });
  });
}

function hitTest(px: number, py: number): HitRect | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h;
  }
  return null;
}

function onCup(r: number, c: number): void {
  if (magnetArm) {
    magnetArm = false;
    const top = engine.getState().grid[r][c].stack.at(-1);
    if (!top) return;
    const res = engine.useItem('magnet', { type: top.type as DrinkType });
    toast(res.ok ? `磁铁·${DRINKS[top.type].label}` : `磁铁失败:${res.reason}`);
    draw();
    return;
  }
  if (icePickArm) {
    icePickArm = false;
    const res = engine.useItem('ice_pick', { row: r, col: c });
    toast(res.ok ? '冰锥解冻' : `失败:${res.reason}`);
    draw();
    return;
  }
  if (slideMode) {
    slideFrom = { r, c };
    toast(`起点(${r},${c})，再点相邻空位`);
    draw();
    return;
  }
  const res = engine.tapCup(r, c);
  if (!res.ok) {
    if (res.reason === 'iced') toast('冰块挡住了，用冰锥');
    else if (res.reason === 'locked') {
      void engine.unlockWithAd(r, c).then((r2) => {
        toast(r2.ok ? '已解锁' : `锁定:${r2.reason}`);
        draw();
      });
      return;
    } else toast(`失败:${res.reason}`);
  } else if (res.clearedTypes?.length) {
    toast(`消除 ${res.clearedTypes.map((t) => DRINKS[t].label).join('、')}`);
  } else {
    toast('入槽');
  }
  draw();
}

function onEmpty(r: number, c: number): void {
  if (!slideMode || !slideFrom) return;
  const { r: sr, c: sc } = slideFrom;
  if (sr !== r || Math.abs(c - sc) !== 1) {
    toast('只能滑向同行相邻空位');
    return;
  }
  const dir = c < sc ? 'left' : 'right';
  const res = engine.slideCup(sr, sc, dir);
  toast(res.ok ? `挪位 ${dir}` : `失败:${res.reason}`);
  slideFrom = null;
  draw();
}

function onItem(item: ItemType): void {
  if (item === 'magnet') {
    magnetArm = true;
    icePickArm = false;
    slideMode = false;
    toast('磁铁：点露出杯子');
    draw();
    return;
  }
  if (item === 'ice_pick') {
    icePickArm = true;
    magnetArm = false;
    slideMode = false;
    toast('冰锥：点结冰顶杯');
    draw();
    return;
  }
  if (item === 'undo' || item === 'expand' || item === 'reshuffle') {
    const res = engine.useItem(item);
    toast(res.ok ? `${item} ✓` : `失败:${res.reason}`);
    draw();
  }
}

function onBtn(action: string): void {
  if (action === 'slide') {
    slideMode = !slideMode;
    slideFrom = null;
    magnetArm = false;
    icePickArm = false;
    toast(slideMode ? '开启挪位' : '关闭挪位');
    draw();
    return;
  }
  if (action === 'restart') {
    loadLevel(currentId);
    return;
  }
  if (action === 'nextLevel') {
    const ids = Object.keys(LEVELS);
    const idx = (ids.indexOf(currentId) + 1) % ids.length;
    loadLevel(ids[idx]);
    return;
  }
  if (action.startsWith('level:')) {
    loadLevel(action.slice(6));
  }
}

function onTouch(px: number, py: number): void {
  const h = hitTest(px, py);
  if (!h) return;
  if (h.kind === 'cup' && h.row != null && h.col != null) onCup(h.row, h.col);
  else if (h.kind === 'empty' && h.row != null && h.col != null) onEmpty(h.row, h.col);
  else if (h.kind === 'item' && h.item) onItem(h.item);
  else if (h.kind === 'btn' && h.action) onBtn(h.action);
}

function boot(): void {
  const info = wx.getSystemInfoSync();
  W = info.windowWidth;
  H = info.windowHeight;
  dpr = info.pixelRatio || 1;

  canvas = wx.createCanvas();
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  wx.onTouchStart((e) => {
    const t = e.touches[0];
    if (!t) return;
    onTouch(t.clientX, t.clientY);
  });

  loadLevel('level_01');
}

boot();
