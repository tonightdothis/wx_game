import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'levels');
const dest = path.join(root, 'preview', 'levels');
await mkdir(dest, { recursive: true });
for (const f of await readdir(src)) {
  if (f.endsWith('.json')) await cp(path.join(src, f), path.join(dest, f));
}
console.log('copied levels -> preview/levels');
