# 官方主题

LinkDesk 出厂自带的主题——**亮色 + 暗色**两套基础色板。

## 这是什么

一只**纯数据插件**：没有一行界面代码，只有一张色板文件。它跟其他主题插件没有任何特殊之处——如果连出厂默认配色都是可拆可换的，那才是真的「万物皆插件」。

- 插件 ID：`theme-defaults`
- 系统类型：亮色 / 暗色（同一文件里两个 colorway）
- 色板：Light · Dark
- 出厂自带（`core: true`）——**不显示卸载按钮**（防误删的纯 UI 旗标，不是行为特权）

## 结构

```
plugin.json               声明（contributes.themes）
themes/defaults.json      色板（Light + Dark 两个 colorway）
```
