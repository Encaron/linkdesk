# Phase 7c — 主题/语言引擎

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7c 展开。
> **设计细节直接引用旧 P6c——内容已完整，只是 Phase 归属变了。**
>
> 完整设计见：**[旧 Phase 6 设计](../phase6_编辑能力/V3-Phase6-设计.md)** §2.1（退路系统）, §2.5（主题贡献格式）, §2.6（语言贡献格式）, §2.7（主题浏览器 UI）

---

## 一、旧 P6→新 P7 的变化

| | 旧 P6c | 新 P7c |
|------|------|------|
| Phase 位置 | 编辑能力第三层 | 多 WebView 之后的第三个消费者 |
| 底座 | 单 WebView | 多 WebView——每个主题/语言插件可跑在自己 WebView |
| ThemeEngine | P3 已有 | 不变——消费已有引擎 |
| i18next | P2 已有 | 不变——消费已有引擎 |
| 退路系统 | 设计已就绪 | 不变——直接照搬 |

---

## 二、任务清单（从旧 P6c 直接迁移）

| # | 任务 | 旧编号 | 设计文档位置 |
|:--:|------|:--:|------|
| 1 | 主题系统插件化——ThemeRegistry + contributes.themes + 出厂 Dark/Light 迁移 + 三层退路 | P6c #16 | 旧 §2.1 + §2.5 |
| 2 | 语言系统插件化——LanguageRegistry + contributes.languages + 出厂 en/zh 迁移 + 两层退路 | P6c #17 | 旧 §2.1 + §2.6 |
| 3 | 主题浏览器 UI——Ctrl+K Ctrl+T，搜索/预览/即时切换 | P6c #18 | 旧 §2.7 |
| 4 | 产品图标主题（Product Icon Theme） | P6c #28 | — |
| 5 | 插件资源访问 API（getResourceUri） | P6c #25 | 旧 §2.10 |

### 退路系统（不变——直接照搬 VS Code）

**主题三层退路：**
```
第 1 层：settings.json → app.theme
第 2 层：theme-dark / theme-light 插件（出厂预装，可卸载）
第 3 层：index.css :root CSS 变量（永远存在）
```

**语言两层退路：**
```
第 1 层：lang-zh / lang-en 语言插件
第 2 层：t("终端") → key 本身就是中文原文（i18next parseMissingKeyHandler）
```

---

## 三、新增注意事项

### 3.1 多 WebView 下的主题

- 主题切换时，壳 WebView 收到 `onDidChangeTheme` 事件
- 壳通过 IPC 广播给所有插件 WebView：`ipc.emit("theme:changed", { themeId, variables })`
- 插件 WebView 收到后 → `document.documentElement.setAttribute("data-theme", themeId)`
- **CSS 变量仍然生效**——每个 WebView 有自己的 `:root`，壳广播的变量值被写入各 WebView 的 `<style>` 标签

### 3.2 退路验证

```
卸载 theme-dark 插件 → 壳检测不到主题 → 回退到 index.css :root
卸载 lang-zh 插件 → t("终端") 返回 "终端"（key = 中文原文）
```

---

## 四、相关文档

- [旧 Phase 6 设计 §2.1, §2.5-2.7, §2.10](../phase6_编辑能力/V3-Phase6-设计.md) — 主题/语言引擎详细设计
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 主题切换的 IPC 广播机制
