import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'wechatgame-run');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'levels'), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src/wechat/main.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  target: ['es2018'],
  outfile: join(outDir, 'game.bundle.js'),
  sourcemap: true,
  logLevel: 'info',
  loader: { '.json': 'json' },
});

cpSync(join(root, 'levels'), join(outDir, 'levels'), { recursive: true });

// Ensure game.js / game.json / project.config.json exist (idempotent)
const gameJs = join(outDir, 'game.js');
if (!existsSync(gameJs)) {
  writeFileSync(gameJs, "require('./game.bundle.js');\n");
}

const gameJsonPath = join(outDir, 'game.json');
const gameJson = JSON.parse(readFileSync(gameJsonPath, 'utf8'));
if ('openDataContext' in gameJson && !gameJson.openDataContext) {
  delete gameJson.openDataContext;
  writeFileSync(gameJsonPath, JSON.stringify(gameJson, null, 2) + '\n');
}

console.log('wechat build ok →', outDir);
