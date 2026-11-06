# 杯柜清场 · 微信小游戏可运行工程

用微信开发者工具打开**本目录**（`wechatgame-run`），不要打开仓库根目录或 `build-templates`。

## 打开方式

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 菜单：项目 → 导入项目 → 选择本目录
3. AppID：`wx65ee45123be9b871`（已写入 `project.config.json`）
4. 编译类型会自动识别为「小游戏」

CLI（本机已装开发者工具时）：

```bat
"D:\微信web开发者工具\cli.bat" open --project E:\mine\game\wechatgame-run
```

## 试玩

- 点露出的杯子入槽，三同消除
- 「挪位」：先点杯子，再点同行相邻空位
- 道具：撤销 / 磁铁 / 扩槽 / 洗牌 / 冰锥
- 底部可切换关卡；「重开」重置当前关

## 重新打包

在仓库根目录：

```bash
npm run build:wechat
```

会覆盖本目录下的 `game.bundle.js`，并同步 `levels/`。

注意：`game.json` 不要写空的 `openDataContext`（微信会报错）。
