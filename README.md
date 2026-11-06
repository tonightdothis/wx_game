# 杯柜清场（Cup Shelf Clear）

微信小游戏向的**长局整理消除**原型：多层货架点选三同、轻量挪位、道具解困，一局约 8–15 分钟。

> 产品一句话：在杂乱饮品柜里，通过点选三同消除、轻量挪位（华容道感）、道具解困，把整柜清空。

## 快速开始

```bash
npm install
npm test                 # 核心规则 + 关卡完整性 + 求解自测
npm run validate:levels  # 校验 levels/*.json
npm run build:preview    # 打包浏览器预览到 preview/app.js
```

### 打开预览

构建后需能让浏览器读到关卡 JSON（已复制到 `preview/levels/`）：

```bash
npx --yes serve . -p 5173
```

浏览器打开：<http://localhost:5173/preview/>

也可直接用任意静态服务器指向仓库根目录，再进入 `/preview/`。

## 目录

```
docs/PRD.md          产品文档
docs/TECH.md         架构说明
src/core/            纯 TS 规则引擎（不依赖 Cocos）
src/preview/         预览入口源码
preview/             可玩静态页
levels/              大关 JSON（≥3）
tests/               node:test 自测
scripts/             生成 / 校验关卡
```

## 玩法摘要

- 只可点**露出的顶杯**进入出杯槽（默认 7 格）
- 槽内任意 3 个相同消除
- 同行相邻空位可**滑动**顶杯（每局有限次数）
- 道具：撤销、磁铁、扩槽、重排、冰锥、钥匙
- 冰块 / 锁定为障碍；广告解锁为接口占位

详情见 [docs/PRD.md](./docs/PRD.md)。

## 接 Cocos / 微信

当前交付刻意保持**核心与视图分离**，旧 Cocos 原型已清空。后续：

1. 用 Cocos Creator 新建微信小游戏工程
2. 接入 `src/core` 作为逻辑层
3. 把 `AdService` 换成微信激励视频 API

见 [docs/TECH.md](./docs/TECH.md)。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm test` | 运行自测 |
| `npm run build:preview` | 构建预览 JS，并同步 levels 到 preview |
| `npm run validate:levels` | 校验关卡 |
| `npm run typecheck` | TypeScript 检查 |

## License

Private — `tonightdothis/wx_game`
