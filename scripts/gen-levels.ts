import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLevel, makeTutorialLevel } from '../src/core/generate.js';
import { validateLevel } from '../src/core/validate.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'levels');
await mkdir(dir, { recursive: true });

const levels = [
  makeTutorialLevel(),
  generateLevel({
    id: 'level_02',
    name: '午后高峰柜',
    rows: 5,
    cols: 4,
    totalCups: 96,
    stackMax: 5,
    seed: 42,
    icedCount: 4,
    lockedCount: 2,
    moveQuota: 18,
    estimatedMinutes: [8, 12],
    description: '标准长局：约 96 杯，含少量冰块与锁定。',
  }),
  generateLevel({
    id: 'level_03',
    name: '深夜清场挑战',
    rows: 6,
    cols: 5,
    totalCups: 120,
    stackMax: 5,
    seed: 99,
    icedCount: 8,
    lockedCount: 4,
    moveQuota: 22,
    drinkTypes: [
      'milk_tea',
      'coffee',
      'latte',
      'juice',
      'smoothie',
      'soda',
      'matcha',
      'cocoa',
    ],
    estimatedMinutes: [12, 15],
    description: '高压长局：120 杯，障碍更多，道具配额更紧。',
  }),
];

// level_03 items tweak: fewer keys relative — generator already sets
for (const lv of levels) {
  const v = validateLevel(lv);
  if (!v.ok) throw new Error(`${lv.id}: ${v.errors.join('; ')}`);
  const out = path.join(dir, `${lv.id}.json`);
  await writeFile(out, JSON.stringify(lv, null, 2) + '\n', 'utf8');
  console.log('wrote', out, 'cups=', v.totalCups);
}
