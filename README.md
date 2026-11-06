# 饮品消消 Cocos Creator 原型

这是按 Cocos Creator 3.x 风格搭建的饮品消消项目骨架。

## 当前内容
- 8x8 饮品棋盘核心逻辑
- 7 格托盘
- 3 个同款自动消除
- 倒计时、胜利、失败判断
- 关卡 JSON 配置
- Cocos 原型组件 `DrinkGameRoot`
- 关卡合法性校验脚本

## 在 Cocos Creator 中打开
1. 打开 Cocos Creator。
2. 选择“打开其他项目”。
3. 选择当前目录 `E:\mine\game`。
4. 新建一个 2D 场景。
5. 在场景里创建一个空节点，挂载 `DrinkGameRoot` 组件。
6. 保存场景并运行预览。

如果当前目录被 Cocos 识别为普通文件夹，可以先用 Cocos Creator 新建一个空 2D 项目，再把本目录里的 `assets`、`package.json`、`tsconfig.json` 合入新项目。

后续可以在编辑器里逐步替换饮品方块为正式 Sprite 资源。

## 校验关卡

```bash
node tools/validate-levels.js
```
