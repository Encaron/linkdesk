# 03-QuickPick 布局归一化

> 2026-07-29。**E3.5 #CP17-#CP22。**
> 根因：QuickPick `renderItem` 自由度过高——5 个消费者 4 个各写各的布局，视觉不统一。
> 方案：锁死 QuickPick 内部布局结构，消费者只填内容槽位（slot），不再自由渲染。

---

## 一、现状审计——5 个 QuickPick 消费者

| # | 消费者 | 文件 | `renderItem` 结构 | 布局 |
|:--:|------|------|------|:--:|
| 1 | CommandPalette | `src/components/shared/CommandPalette.tsx:48` | `.palette-item-content` > `.palette-item-row` + `.palette-item-detail` (flex) | 2 行 ✅ |
| 2 | ThemeBrowser | `src/components/ThemeBrowser.tsx:99` | 裸 `palette-item-label` + 裸 `palette-item-category` | 1 行 ❌ |
| 3 | LanguagePicker | `src/components/LanguagePicker.tsx:56` | 裸 `palette-item-label` + `palette-item-category`（×2, 手写 inline style） | 1 行 ❌ |
| 4 | DevTools picker | `src/App.tsx:883` | 裸 `palette-item-label` + 裸 `palette-item-category` | 1 行 ❌ |
| 5 | showQuickPick | `src/components/shared/QuickPick.tsx:258` | 裸 `<span>` + 可选 description `<span>` | 1 行 ❌ |

**问题：**
- CommandPalette 写了两行布局（`.palette-item-content` + row + detail）——这是"正确"的结构
- 其余 4 个只写了裸 span，没有 `.palette-item-content` 包装 → 没有第二行 → 视觉不统一
- 每个消费者手写 CSS class 名（`palette-item-label` / `palette-item-category` 等）——这是 QuickPick 内部的 class，不应由消费者知道
- 未来加消费者（如文件搜索、Git 命令）→ 又要手写一遍布局 → 归一化债务滚雪球

## 二、设计决策

### 2.1 核心思路：锁死布局，开放内容

```
旧 API（自由度过高）：
  renderItem?: (item: T) => ReactNode    // 返回什么都行，布局全靠消费者手写

新 API（填空——对标 VS Code QuickPickItem）：
  renderLabel?: (item: T) => ReactNode        // 第一行左侧（标题）
  renderCategory?: (item: T) => ReactNode     // 第一行右侧（分类/标签）
  renderDetail?: (item: T) => ReactNode       // 第二行左侧（ID/描述）
  renderDetailRight?: (item: T) => ReactNode  // 第二行右侧（快捷键/状态）
```

**QuickPick 内部锁死渲染：**

```html
<div class="palette-item">
  <div class="palette-item-content">
    <div class="palette-item-row">
      <span class="palette-item-label">
        {renderLabel?.(item) ?? getSearchText(item)}
      </span>
      {renderCategory?.(item) && (
        <span class="palette-item-category">{renderCategory(item)}</span>
      )}
    </div>
    {(renderDetail || renderDetailRight) && (
      <span class="palette-item-detail">
        <span class="palette-item-detail-id">{renderDetail?.(item)}</span>
        {renderDetailRight?.(item) && (
          <span class="palette-item-detail-right">{renderDetailRight(item)}</span>
        )}
      </span>
    )}
  </div>
  {renderItemActions && (
    <span class="palette-item-actions">{renderItemActions(item)}</span>
  )}
</div>
```

**CSS 全在 `index.css`，消费者零 CSS。**

### 2.2 迁移兼容

`renderItem` 保留但不推荐——若同时传 `renderItem` 和 slot props，slot props 优先生效。所有现有消费者迁移到 slot props。

### 2.3 不变的部分

| 项目 | 理由 |
|------|------|
| `renderItemActions` | 齿轮等操作区——已归一化在 `palette-item-actions` 位置，不改 |
| `getSearchText` | 搜索文本提取——仍用于 fuzzy 匹配 |
| Portal / input / fuzzy / 键盘导航 | 壳逻辑不动 |
| 动画（#CP01-#CP03a） | 已完成，不动 |

---

## 三、迁移清单——5 个消费者逐个切

### #CP17：QuickPick 内部锁死布局

**文件：** `QuickPick.tsx`
**内容：**
1. `QuickPickProps` 加 4 个新 prop：`renderLabel` / `renderCategory` / `renderDetail` / `renderDetailRight`
2. 内部渲染改为固定 HTML 结构（见 §2.1）
3. 兼容：`renderItem` 仍在时降级为旧行为（不改现有消费者立即生效）
4. 改 `renderItem` 的包装方式——从 `<span className="palette-item-label">` 单包改为放在 `.palette-item-content` 内

**预计：** ~30 行 TSX

### #CP18：CommandPalette 切 slot props

**文件：** `CommandPalette.tsx`
**内容：**
1. 删 `renderItem`（含 `.palette-item-content` 手写结构）
2. 改为 slot props：
   - `renderLabel={cmd => cmd.title}`
   - `renderCategory={cmd => cmd.category}`
   - `renderDetail={cmd => cmd.id}`
   - `renderDetailRight={cmd => <KeybindingPill cmd={cmd} />}`
3. `KeybindingPill` 提取为独立内联组件（原来内联在 `renderItem` 里）

**预计：** ~20 行（−15 旧 + 35 新）

### #CP19：ThemeBrowser 切 slot props

**文件：** `ThemeBrowser.tsx`
**内容：**
1. 删 `renderItem`
2. 改为：
   - `renderLabel={name => name}`
   - `renderCategory={name => name === originalTheme.current ? "当前" : undefined}`

**预计：** ~5 行（−8 旧 + 3 新）

### #CP20：LanguagePicker 切 slot props

**文件：** `LanguagePicker.tsx`
**内容：**
1. 删 `renderItem`（含裸 span + inline style）
2. 改为：
   - `renderLabel={code => entry?.label ?? code}`
   - `renderDetail={code => code}`（语言代码从第一行移到第二行）
   - `renderCategory={code => code === currentLang ? "当前" : undefined}`

**预计：** ~8 行（−12 旧 + 10 新）

### #CP21：DevTools picker 切 slot props

**文件：** `App.tsx`
**内容：**
1. 删 `renderItem`
2. 改为：
   - `renderLabel={target => target.kind === 'shell' ? `shell ${t("壳窗口")}` : target.id}`
   - `renderCategory={() => t("切换 DevTools")}`

**预计：** ~5 行（−7 旧 + 5 新）

### #CP22：showQuickPick 切 slot props

**文件：** `QuickPick.tsx`（`showQuickPick` 函数内）
**内容：**
1. 删内联 `renderItem`
2. 改为：
   - `renderLabel={item => item.label}`
   - `renderDetail={item => item.description}`

**预计：** ~5 行（−6 旧 + 4 新）

### 🆕 #CP23：ThemeBrowser 加 detail——显示主题类型

**文件：** `ThemeBrowser.tsx`
**背景：** 主题有 `uiTheme` 字段（"dark"/"light"/"highContrast"），已存在 `ThemeRegistry` 中，但 ThemeBrowser 只用主题名字符串，第二行空白。
**内容：**
1. `renderDetail` 通过 `ThemeRegistry.get(name)` 查找主题元数据
2. 显示 uiTheme 翻译：`"dark" → "暗色主题"` / `"light" → "浅色主题"` / `"highContrast" → "高对比度"`
3. 不传 `renderDetail` 则第二行不出现（不受影响）
4. items 类型不变（仍是 `string[]`——只在 renderDetail 回调内做查找）

**预计：** ~5 行

### 🆕 #CP24：DevTools picker 加 detail——显示目标类型

**文件：** `App.tsx`
**背景：** DevTools 选择器目前只有一行（plugin ID + 分类），第二行空白。用户需要区分不同目标类型。
**内容：**
1. 加 `renderDetail`：
   - `kind === 'shell'` → 显示 `"Electron 主窗口控制台"`
   - `kind === 'plugin'` → 显示 `"插件 WebView DevTools"`
2. 目的：让插件目标项也有第二行，视觉统一

**预计：** ~5 行

---

## 四、迁移后的效果

| 消费者 | 第一行 | 第二行 | 统一？ |
|------|------|------|:--:|
| CommandPalette | title + category pill | ID + keycap pill | ✅ |
| ThemeBrowser | theme name + "当前" | 🆕 "暗色主题" / "浅色主题" | ✅ |
| LanguagePicker | lang label | lang code | ✅ |
| DevTools picker | plugin ID | 🆕 "插件 WebView DevTools" / "主窗口控制台" | ✅ |
| showQuickPick | label | description | ✅ |

**所有消费者自动获得相同的两行布局、间距、字体、hover 态——因为结构是 QuickPick 锁死的。**

---

## 五、不改的

| 项目 | 理由 |
|------|------|
| CSS class 命名 | `palette-item-*` 命名已稳定，不改 |
| `getSearchText` | 搜索逻辑独立于渲染 |
| `onSelect` / `onHighlight` | 交互逻辑不受影响 |
| `renderItemActions` | 齿轮位已归一化 |
| 动画 | #CP01-#CP03a 已完成 |
| 快捷键显示 | #CP04-#CP07 已完成——#CP18 只改结构不改内容 |

## 六、ESLint 机械防线

`linkdesk/no-quickpick-render-item`（error 级别）

**规则：** `<QuickPick renderItem=...>` → 报错。
**绕过：** `// eslint-disable-next-line`（遇到 slot 不够用时可手写 `renderItem`，防线是提醒不是封锁）。
**注册：** `eslint-local-rules.js` + `eslint.config.js`（#CP25）

---

## 七、总计

| 任务 | 文件 | 行数 |
|------|------|:--:|
| #CP17 QuickPick 锁死布局 | QuickPick.tsx | ~30 |
| #CP18 CommandPalette 切 slot | CommandPalette.tsx | ~20 |
| #CP19 ThemeBrowser 切 slot | ThemeBrowser.tsx | ~5 |
| #CP20 LanguagePicker 切 slot | LanguagePicker.tsx | ~8 |
| #CP21 DevTools 切 slot | App.tsx | ~5 |
| #CP22 showQuickPick 切 slot | QuickPick.tsx | ~5 |
| #CP23 ThemeBrowser 加 detail | ThemeBrowser.tsx | ~5 |
| #CP24 DevTools 加 detail | App.tsx | ~5 |
| #CP25 ESLint 防线 | eslint-local-rules.js | ~40 |
| **合计** | 6 文件 | **~123 行** |
