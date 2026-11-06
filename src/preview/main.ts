import { DRINKS } from '../core/drinks.js';
import { GameEngine } from '../core/engine.js';
import type { LevelConfig } from '../core/types.js';

let engine: GameEngine;
let currentId = 'level_01';
let slideMode = false;
let slideFrom: { r: number; c: number } | null = null;
let magnetArm = false;

const shelfEl = () => document.getElementById('shelf')!;
const slotEl = () => document.getElementById('slot')!;
const hudEl = () => document.getElementById('hud')!;
const statusEl = () => document.getElementById('status')!;
const logEl = () => document.getElementById('log')!;

function log(msg: string): void {
  const line = document.createElement('div');
  line.textContent = msg;
  logEl().prepend(line);
}

async function fetchLevel(id: string): Promise<LevelConfig> {
  const urls = [`./levels/${id}.json`, `../levels/${id}.json`, `/levels/${id}.json`];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (res.ok) return (await res.json()) as LevelConfig;
    } catch {
      /* next */
    }
  }
  throw new Error(`cannot load level ${id}`);
}

function render(): void {
  const st = engine.getState();
  hudEl().innerHTML = [
    `<span>消除 ${st.cleared}/${st.totalCups}</span>`,
    `<span>槽 ${st.slot.length}/${st.slotCapacity}</span>`,
    `<span>挪位 ${st.moveLeft}</span>`,
    `<span>步数 ${st.step}</span>`,
    `<span>⭐ ${st.stars}</span>`,
  ].join('');

  if (st.status === 'won') statusEl().textContent = `清场成功！星级 ${st.stars}`;
  else if (st.status === 'lost') statusEl().textContent = '槽满失败 — 试试撤销 / 扩槽 / 磁铁';
  else if (slideMode) statusEl().textContent = '挪位模式：点杯子，再点同行相邻空位';
  else if (magnetArm) statusEl().textContent = '磁铁：点击一个露出杯子选择种类';
  else statusEl().textContent = '点露出的杯子进入出杯槽；三同消除';

  const shelf = shelfEl();
  shelf.innerHTML = '';
  shelf.style.gridTemplateColumns = `repeat(${st.grid[0]?.length ?? 1}, minmax(72px, 1fr))`;

  st.grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      const box = document.createElement('button');
      box.type = 'button';
      box.className = 'cell';
      const top = cell.stack[cell.stack.length - 1];
      if (!top) {
        box.classList.add('empty');
        box.textContent = '空';
        box.onclick = () => onEmpty(r, c);
      } else {
        const meta = DRINKS[top.type];
        box.style.background = meta.color;
        const flags = `${top.iced ? '🧊' : ''}${top.locked ? '🔒' : ''}`;
        box.innerHTML = `<div class="emoji">${meta.emoji}</div><div class="label">${meta.label}${flags}</div><div class="depth">×${cell.stack.length}</div>`;
        if (top.iced || top.locked) box.classList.add('blocked');
        box.onclick = () => onCup(r, c);
      }
      shelf.appendChild(box);
    });
  });

  const slot = slotEl();
  slot.innerHTML = '';
  for (let i = 0; i < st.slotCapacity; i++) {
    const s = document.createElement('div');
    s.className = 'slot-cell';
    const cup = st.slot[i];
    if (cup) {
      const meta = DRINKS[cup.type];
      s.style.background = meta.color;
      s.textContent = meta.emoji;
      s.title = meta.label;
    }
    slot.appendChild(s);
  }

  document.querySelectorAll<HTMLButtonElement>('#items button[data-item]').forEach((btn) => {
    const item = btn.dataset.item as keyof typeof st.inventory;
    const count = st.inventory[item] ?? 0;
    btn.disabled = count <= 0 || st.status !== 'playing';
    const label = btn.getAttribute('data-label') ?? item;
    btn.textContent = `${label} (${count})`;
  });
}

function onCup(r: number, c: number): void {
  if (magnetArm) {
    magnetArm = false;
    const top = engine.getState().grid[r][c].stack.at(-1);
    if (!top) return;
    const res = engine.useItem('magnet', { type: top.type });
    log(res.ok ? `磁铁抽取 ${DRINKS[top.type].label}` : `磁铁失败: ${res.reason}`);
    render();
    return;
  }

  if (slideMode) {
    slideFrom = { r, c };
    log(`挪位起点 (${r},${c})，再点相邻空位`);
    return;
  }

  const res = engine.tapCup(r, c);
  if (!res.ok) {
    if (res.reason === 'iced') {
      const r2 = engine.useItem('ice_pick', { row: r, col: c });
      log(r2.ok ? '冰锥解冻' : '冰块挡住了（需要冰锥）');
    } else if (res.reason === 'locked') {
      void engine.unlockWithAd(r, c).then((r2) => {
        log(r2.ok ? '广告占位解锁' : `锁定: ${r2.reason}`);
        render();
      });
      return;
    } else {
      log(`失败: ${res.reason}`);
    }
  } else if (res.clearedTypes?.length) {
    log(`消除 ${res.clearedTypes.map((t) => DRINKS[t].label).join('、')}`);
  } else {
    log('入槽');
  }
  render();
}

function onEmpty(r: number, c: number): void {
  if (!slideMode || !slideFrom) return;
  const { r: sr, c: sc } = slideFrom;
  if (sr !== r || Math.abs(c - sc) !== 1) {
    log('只能滑向同行相邻空位');
    return;
  }
  const dir = c < sc ? 'left' : 'right';
  const res = engine.slideCup(sr, sc, dir);
  log(res.ok ? `挪位 ${dir}` : `挪位失败: ${res.reason}`);
  slideFrom = null;
  render();
}

async function loadLevel(id: string): Promise<void> {
  currentId = id;
  const cfg = await fetchLevel(id);
  engine = new GameEngine(cfg, {
    showRewarded: async () => {
      log('[广告占位] 视为已观看');
      return true;
    },
  });
  slideMode = false;
  slideFrom = null;
  magnetArm = false;
  log(`载入「${cfg.name}」`);
  render();
}

function boot(): void {
  document.getElementById('btn-restart')!.onclick = () => void loadLevel(currentId);
  document.getElementById('btn-slide')!.onclick = () => {
    slideMode = !slideMode;
    slideFrom = null;
    magnetArm = false;
    log(slideMode ? '开启挪位模式' : '关闭挪位模式');
    render();
  };
  document.getElementById('level-select')!.onchange = (e) => {
    void loadLevel((e.target as HTMLSelectElement).value);
  };
  document.getElementById('items')!.onclick = (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-item]') as HTMLButtonElement | null;
    if (!btn) return;
    const item = btn.dataset.item!;
    if (item === 'magnet') {
      magnetArm = true;
      slideMode = false;
      log('磁铁已举起：点击露出杯子选择种类');
      render();
      return;
    }
    if (item === 'undo' || item === 'expand' || item === 'reshuffle') {
      const res = engine.useItem(item);
      log(res.ok ? `${btn.getAttribute('data-label')} ✓` : `失败: ${res.reason}`);
      render();
    }
  };
  void loadLevel('level_01');
}

boot();
