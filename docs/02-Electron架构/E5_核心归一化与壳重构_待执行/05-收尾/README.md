# E5 收尾

> 2026-08-06。E5 78 任务基本完成。本文档索引 E5 之后需要处理的项目。
> 每项有独立专题文档。执行追踪见 [`E5-收尾执行清单.md`](E5-收尾执行清单.md)。
> 质量审计见 [`00-质量审计-计划符合度.md`](00-质量审计-计划符合度.md)——治本率 55%，改进方向 5 条。28 任务，5 层 8 轮，从 E5#87 起。

---

## Bug修复/（3 篇）

| 文档 | 简介 | 改动量 |
|:--|:--|:--:|
| [预览标签页替换致同ID双标签页](Bug修复/预览标签页替换致同ID双标签页.md) | 单击预览→Ctrl+Click 替换→双击原文件→同 ID 双标签页 | ~2 行 |
| [右键菜单遮挡与定位](Bug修复/右键菜单遮挡与定位.md) | 分割线遮挡菜单（层叠上下文）+ 视口定位不准（预估尺寸） | ~40 行 |
| [生产环境路径审计](Bug修复/生产环境路径审计.md) | loadFile 路径错误🔴 + icon 缺失🟡 + plugin-view.html 入口缺失🔴（休眠） | ~5 行 + 配置 |

## 功能补全/（5 篇）

| 文档 | 简介 | 改动量 |
|:--|:--|:--:|
| [文件树原生剪贴板与拖出](功能补全/文件树原生剪贴板与拖出.md) | Ctrl+C 文件→桌面粘贴 + 拖出桌面——Electron 原生 API | ~50 行 |
| [i18n 第二轮——插件层与主题](功能补全/i18n第二轮-插件层与主题.md) | plugin.json ~100+ 处 + EditorTab + FileTreeContextMenu + 主题 JSON | ~180 处 |
| [未知文件类型零反馈](功能补全/未知文件类型零反馈.md) | 双击 .key 无编辑器→零提示。加 toast | ~4 行 |
| [App 启动集成测试](功能补全/App启动集成测试.md) | initAll() 7 步异步——mock 依赖验证退化逻辑 | ~180 行 |
| [插件开发测试环境](功能补全/插件开发测试环境.md) | `npm run dev:plugin <id>`——轻量插件开发壳 | ~30 行 |

## UI合规/（4 篇）

| 文档 | 简介 | 改动量 |
|:--|:--|:--:|
| [裸 hex 颜色](UI合规/裸hex颜色.md) | 4 处 hex→CSS 变量（token 已存在） | 4 行 |
| [Emoji 图标 Lucide 化](UI合规/Emoji图标Lucide化.md) | ~12 处 emoji→Lucide + PluginIcon 重构 + 语言按钮设计 | ~12 处 + 重构 |
| [z-index 分层](UI合规/zindex分层.md) | ~10 处裸数字→`var(--z-*)` token + token 重排 | ~12 行 + 重排 |
| [间距与动画](UI合规/间距与动画.md) | 4px 节奏修正 + 动画 ≤300ms | ~10-20 处 |

## 架构债/（10 篇）

| 文档 | 简介 | 改动量 |
|:--|:--|:--:|
| [IPC 监听器引用计数模式](架构债/IPC监听器引用计数模式.md) | `_initialized` boolean→`_refCount` 引用计数 | ~20 行 |
| [壳硬编码 PluginId 清理](架构债/壳硬编码PluginId清理.md) | MainContent.tsx 2 处多 WebView 残余 | ~4 行注释 |
| [`window.linkdesk` 类型安全](架构债/window.linkdesk类型安全.md) | global.d.ts + ~20 处 `(window as any)` → `window.linkdesk` | ~30 行 + ~20 处 |
| [静默吞错审计](架构债/静默吞错审计.md) | `.catch(() => {})` 残留——补日志 | ~15min |
| [v3 遗留与硬编码残余](架构债/v3遗留与硬编码残余.md) | `v3_` localStorage + `localhost:1420` + 魔数 | ~50 行 |
| [已知架构局限](架构债/已知架构局限.md) | 单进程风险、插件安全、Bus Factor——非 bug，已知权衡 | — |
| [ESLint 覆盖审计](架构债/ESLint覆盖审计.md) | 文件范围 + 9 规则——缺口：i18n 中文检测、CSS hex | 1 行已修 |
| [OverlayPortal 通用悬浮层](架构债/OverlayPortal通用悬浮层.md) | 治本——所有 overlay 统一 portal 到 body | ~5 处 |
| [工程化工具链补全](架构债/工程化工具链补全.md) | `npm run fix` + pre-commit hook + unhandled rejection + 生产就绪清单 | ~15min |
| [记忆文件归档](架构债/记忆文件归档.md) | 127 个 memory → active/archive 分家 | ~30min 整理 |

---

## 建议执行顺序

1. 🔴 **Bug修复/生产环境路径审计 Bug 1** — 打包后白屏，阻断级
2. 🔴 **架构债/静默吞错 + window.linkdesk 类型安全 + 裸hex** — < 1h，消信息黑洞 + 类型安全
3. 🔴 **架构债/工程化工具链补全** — pre-commit hook + unhandled rejection
4. 🟡 **Bug修复/右键菜单 + 预览标签页** — 用户可感知
5. 🟡 **功能补全/未知文件零反馈 + App 集成测试**
6. 🟡 **架构债/OverlayPortal** — 治本替代逐个修
7. 🟢 **UI合规/ 四项** — z-index + Emoji + 间距 + 动画
8. 🟢 **功能补全/文件树剪贴板 + i18n 第二轮**
9. 🔮 **架构债/ 其余** — 不紧急

---
