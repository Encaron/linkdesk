# 悬浮面板演示

一只「多声明一块，菜单里就多一项」的演示插件。

## 这是什么

它本身没什么功能——价值全在 `plugin.json` 里多出来的那一块：

```json
"floatingPanel": { "viewId": "floating-panel-demo" }
```

声明之后，**标签页右键菜单里就自动多出「在悬浮面板中打开」**。核心不认识这只插件，它只是读声明——谁来声明都一样。

- 插件 ID：`floating-panel-demo`
- 入口形态：标签页型视图（`entry` + `appearsIn.tabBar`）
- 额外验证：与设置插件的浮层互为替代——证明同一个位置可以换不同提供方
- 演示插件，**可以安全卸载**

## 结构

```
src/index.tsx                           入口
src/views/FloatingPanelDemoView.tsx     被浮起来的那块视图
plugin.json                             声明（appearsIn.tabBar + contributes.floatingPanel）
```
