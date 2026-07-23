# 插件 — 文件树与 Monaco 编辑器

> 2026-07-24。**P8 架构完工后，第一批消费者插件。** 不占用 P 编号——纯插件实现。

---

## 定位

| | |
|---|---|
| 类型 | **消费者插件**——使用 P6-P8 建的架构能力 |
| 前提 | P7d（侧栏扩展位）+ P8a（多 WebView）+ P7c（FileService）全部就绪 |
| 涉及架构改动 | **零。** 只写 `plugin.json` + React 组件 |

## 包含

| 插件 | 内容 | 依赖的架构能力 |
|---|---|---|
| **文件树** | 侧栏常驻面板——树形目录浏览、点击打开文件 | P7d 侧栏扩展位 + P7c FileService |
| **Monaco 编辑器** | 标签页内容——代码编辑、语法高亮、IntelliSense | P8a 独立 WebContentsView（Monaco 重型，需要独立进程） |

## 为什么它们不是架构

- 文件树：调 `window.linkdesk.filesystem.readdir()` → 渲染 `<Tree>` → 用户点文件 → 打开编辑器标签页。**壳不知道文件树的存在。**
- Monaco：`import * as monaco from 'monaco-editor'` → React 组件 → 渲染到自己的 WebContentsView。**壳不知道 Monaco 的存在。**

跟终端插件一样：壳只看到"有个标签页，里面是插件 X 的 WebContentsView"。壳不关心这个插件是终端、是编辑器、还是地图。

## 设计文档

| 文件树 | 来源 |
|---|---|
| 功能设计 | 原 P7 7b 的文件树部分 → `../phase7_多WebView与编辑能力/` |
| 侧栏坑位 | P7d 新设计 → `../P7_底层加固与侧栏扩展_暂定/` |

| Monaco | 来源 |
|---|---|
| 功能设计 | 原 P7 7b 的编辑器部分 → `../phase7_多WebView与编辑能力/` |
| 进程隔离 | P8a 提供 → `../P8_多WebView与壳收尾_暂定/` |

---

> **← 依赖：** `../P8_多WebView与壳收尾_暂定/`（架构完工后才做）
> **同级别插件：** `../插件_工作台与OLED_暂定/`
