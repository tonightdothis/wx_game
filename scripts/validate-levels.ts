import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLevel } from '../src/core/validate.js';
import type { LevelConfig } from '../src/core/types.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'levels');

const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
let failed = 0;
for (const f of files) {
  const raw = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as LevelConfig;
  const v = validateLevel(raw);
  const flag = v.ok ? 'OK' : 'FAIL';
  console.log(`[${flag}] ${f} cups=${v.totalCups} types=${JSON.stringify(v.typeCounts)}`);
  if (v.warnings.length) console.log('  warnings:', v.warnings.join('; '));
  if (!v.ok) {
    failed += 1;
    console.log('  errors:', v.errors.join('; '));
  }
}
if (failed) {
  console.error(`\n${failed} level(s) invalid`);
  process.exit(1);
}
console.log(`\nAll ${files.length} levels valid.`);
