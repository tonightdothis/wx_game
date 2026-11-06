# 杯柜清场 · 技术说明

## 1. 目标架构

```
┌─────────────────────────────────────────────┐
│  preview/ (HTML) 或 未来 Cocos / 微信视图层   │
└───────────────────┬─────────────────────────┘
                    │ 调用
┌───────────────────▼─────────────────────────┐
│  src/core  纯 TypeScript 规则引擎（无 DOM）   │
│  GameEngine · validate · solver · generate  │
└───────────────────┬─────────────────────────┘
                    │ 读取
┌───────────────────▼─────────────────────────┐
│  levels/*.json  关卡数据                     │
└─────────────────────────────────────────────┘
```

核心原则：**玩法逻辑不依赖 Cocos / 微信运行时**，便于 Node 自测与快速改规则。

## 2. 目录

| 路径 | 职责 |
|------|------|
| `src/core/` | 类型、饮品元数据、关卡装载、引擎、校验、贪心求解、生成器 |
| `src/preview/main.ts` | 浏览器预览入口，打包到 `preview/app.js` |
| `preview/` | 静态可玩页（html/css/js + levels 拷贝） |
| `levels/` | 关卡 JSON 源文件 |
| `tests/` | `node:test` + `tsx` |
| `docs/` | PRD / TECH |
| `scripts/` | 关卡生成与批量校验 |

## 3. 引擎要点

- **网格**：`Cell.stack` 自下而上，末元素为顶杯。
- **出杯槽**：`slot: Cup[]`，入槽后循环消除「任意同款 ≥3」。
- **历史栈**：多数写操作先 `pushHistory()`，供撤销。
- **失败判定**：槽长度达到容量且不能三消。
- **广告**：`AdService.showRewarded(placement)` 可选；缺省视为成功。

### 主要 API

```ts
const eng = new GameEngine(levelConfig, adService?)
eng.tapCup(row, col)
eng.slideCup(row, col, 'left' | 'right')
eng.useItem('undo' | 'magnet' | 'expand' | 'reshuffle' | 'ice_pick' | 'key', payload?)
eng.unlockWithAd(row, col)
eng.getState() // 深拷贝快照
```

## 4. 关卡 JSON

```json
{
  "id": "level_02",
  "name": "午后高峰柜",
  "rows": 5,
  "cols": 4,
  "slotCapacity": 7,
  "moveQuota": 18,
  "items": { "undo": 2, "magnet": 2, "expand": 1, "reshuffle": 1, "ice_pick": 4, "key": 2 },
  "grid": [[{ "stack": ["milk_tea", "coffee"], "iced": [false, true] }]],
  "meta": { "estimatedMinutes": [8, 12] }
}
```

校验：`validateLevel` 保证行列一致、总杯数与每类数量均可被 3 整除。

## 5. 测试与预览

```bash
npm install
npm test
npm run validate:levels
npm run build:preview
# 静态服务仓库根或 preview 目录，保证能请求到 levels JSON
npx serve . -p 5173
# 打开 http://localhost:5173/preview/
```

预览构建使用 `esbuild` 打包 `src/preview/main.ts` → `preview/app.js`。  
`preview/levels/` 为 `levels/` 的拷贝，避免浏览器跨目录限制。

## 6. 接 Cocos / 微信

1. 将 `src/core` 作为 npm 包或直接拷入 Cocos `assets/scripts/core`（注意 ESM 后缀或改构建）。
2. Cocos 组件只负责：加载 JSON → `new GameEngine` → 根据 `getState()` 刷节点 → 点击回调 `tapCup`。
3. 微信：实现 `AdService`；构建目标选微信小游戏；关闭或替换浏览器预览。

## 7. 非目标

本仓库**有意删除**旧 Cocos Creator 饮品消消原型（`assets/DrinkGame*`、`library/`、`build/` 等），避免噪音。若需再接入 Cocos，从干净核心重新挂视图层即可。
