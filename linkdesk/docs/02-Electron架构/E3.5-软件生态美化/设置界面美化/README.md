# 设置界面美化 — E3.5 生态美化

> 2026-07-28。E3.5 并行轨道第二个专题。

## 架构

```
┌─ Tab Bar ───────────────────────────────────────────────────┐
│ [设置]  [快捷键]                                             │
├─ Search ────────────────────────────────────────────────────┤
│ 🔍 [搜索设置.................................................] [JSON] │
├─ Left Nav (200px) ───┬─ Right Form (flex: 1) ──────────────┤
│                      │                                       │
│  通用           (5)  │  通用                                 │
│  串口监视器     (2)  │  ─────────────────────                │
│  主题           (3)  │  app.theme     [Dark v]  ⚙           │
│                      │  配色主题                             │
│                      │  ─────────────────────                │
│                      │  app.language  [zh v]    ⚙           │
│                      │  界面语言                             │
└──────────────────────┴──────────────────────────────────────┘
```

## 文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `plugins/settings/plugin.json` | 16 | 插件声明——`factoryRole: "settings"`、`singleton: true` |
| `plugins/settings/src/index.tsx` | 7 | 入口——`export { default } from "@src/components/views/SettingsView"` |
| `src/components/views/SettingsView.tsx` | 470 | **主组件**——搜索 + 左导航 + 右表单 + JSON 弹窗 + SettingRow |
| `src/components/views/SettingsView.css` | 339 | 全部样式 |
| `src/components/views/KeybindingSettingsView.tsx` | 308 | 快捷键子页（独立组件） |
| `src/components/views/KeybindingSettingsView.css` | 263 | 快捷键样式 |
| `src/core/ConfigurationRegistry.ts` | 227 | 配置注册表类型定义 |
| `src/core/ConfigurationService.ts` | 284 | 三层值解析 + 持久化 |

## 整改方向

参见：
- [01-全量审计.md](./01-全量审计.md) — 问题清单
- [02-最终方案.md](./02-最终方案.md) — 执行计划

## 整体预览

👉 **[preview-两级导航.html](./preview-两级导航.html)** — 浏览器打开，右上角切换暗色/浅色主题。核心变化：两级导航树 + section 独立显示 + 修改蓝线 + 快捷键 tab。
