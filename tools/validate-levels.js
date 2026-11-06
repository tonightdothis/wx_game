const fs = require('fs');
const path = require('path');

const levelsDir = path.resolve(__dirname, '..', 'assets', 'resources', 'levels');
const files = fs.readdirSync(levelsDir).filter((file) => file.endsWith('.json'));
let hasError = false;

for (const file of files) {
  const fullPath = path.join(levelsDir, file);
  const level = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const counts = new Map();

  if (!Number.isInteger(level.width) || !Number.isInteger(level.height)) {
    console.error(`${file}: width/height must be integers`);
    hasError = true;
  }

  if (!Number.isInteger(level.timeLimit) || level.timeLimit <= 0) {
    console.error(`${file}: timeLimit must be positive`);
    hasError = true;
  }

  if (!Number.isInteger(level.traySize) || level.traySize < 3) {
    console.error(`${file}: traySize must be at least 3`);
    hasError = true;
  }

  for (const item of level.items || []) {
    if (!item.type) {
      console.error(`${file}: item is missing type`);
      hasError = true;
      continue;
    }

    if (item.x < 0 || item.x >= level.width || item.y < 0 || item.y >= level.height) {
      console.error(`${file}: item ${item.type} position (${item.x}, ${item.y}) is outside board`);
      hasError = true;
    }

    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }

  for (const [type, count] of counts) {
    if (count % 3 !== 0) {
      console.error(`${file}: ${type} count ${count} is not divisible by 3`);
      hasError = true;
    }
  }

  if (!hasError) {
    console.log(`${file}: ok (${level.items.length} items)`);
  }
}

process.exit(hasError ? 1 : 0);

