# UI 合规——裸 hex 颜色

> 2026-08-06。E5 收尾 UI/UX 审计 P1。
> 位于 E5 收尾 → `05-收尾/UI合规/`

---

## 一、问题

4 处硬编码 hex 颜色——对应的 CSS 变量已定义但组件未引用。违反硬约束 #1："所有颜色走 CSS 变量"。

---

## 二、清单

| 文件 | 行 | 裸 hex | 修复为 |
|------|----|------|------|
| `PluginDetailView.css` | 172 | `color: #4caf50` | `var(--status-connected)` |
| `OutputPanel.css` | 114 | `color: #cca700` | `var(--warning)` |
| `OutputPanel.css` | 118 | `color: #f14c4c` | `var(--error)` |
| `IconBar.css` | 80 | `outline: 2px solid #CCA700` | `var(--warning)` |

全部 4 处 token 已存在——`--status-connected`（绿色）、`--warning`（黄色）、`--error`（红色）在 `index.css` 中已定义，主题覆盖也已接入。

---

## 三、修复

```css
/* PluginDetailView.css:172 */
/* 改前：color: #4caf50; */
color: var(--status-connected);

/* OutputPanel.css:114 */
/* 改前：color: #cca700; */
color: var(--warning);

/* OutputPanel.css:118 */
/* 改前：color: #f14c4c; */
color: var(--error);

/* IconBar.css:80 */
/* 改前：outline: 2px solid #CCA700; */
outline: 2px solid var(--warning);
```

4 行，5 分钟。零风险。

---

## 四、验证

```bash
# 确保 src/ 下 CSS 文件中不再有裸 hex
grep -rE '#[0-9a-fA-F]{3,6}' src/**/*.css --include="*.css" | grep -v index.css
```

`index.css` 中的 CSS 变量定义（`:root` 块）允许 hex——其他 CSS 文件全部走 `var(--xxx)`。

---

## 五、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/components/views/PluginDetailView.css:172` | `#4caf50` → `var(--status-connected)` |
| `src/components/views/OutputPanel.css:114` | `#cca700` → `var(--warning)` |
| `src/components/views/OutputPanel.css:118` | `#f14c4c` → `var(--error)` |
| `src/components/IconBar.css:80` | `#CCA700` → `var(--warning)` |

**改动量：** 4 行。

参考 memory：[[ui-ux-audit-todos]]

---
