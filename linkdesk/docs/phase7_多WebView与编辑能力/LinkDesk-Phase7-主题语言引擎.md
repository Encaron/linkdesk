# Phase 7c — 主题/语言引擎

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7c 展开。
> **性质：** 让主题和语言成为一等公民插件类型。消费 Phase 3 ThemeEngine + Phase 2 i18next。

---

## 一、退路系统——主题和语言的默认值从哪来（照抄 VS Code）

### 1.1 主题三层退路

**先看 VS Code 怎么做。** `workbenchThemeService.ts`：

```typescript
// 硬编码的默认主题扩展 ID——如果用户的设置指向一个不存在的主题，fallback 到这里
const defaultThemeExtensionId = 'vscode-theme-defaults';

// 按 base UI theme 映射到具体主题 ID
case ThemeTypeSelector.VS_DARK:
    return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
case ThemeTypeSelector.VS:
    return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
```

`extensions/theme-defaults/package.json`：
```json
{
  "name": "theme-defaults",
  "publisher": "vscode",
  "contributes": {
    "themes": [
      { "id": "Dark+",         "uiTheme": "vs-dark",  "path": "./themes/dark_plus.json" },
      { "id": "Light+",        "uiTheme": "vs",       "path": "./themes/light_plus.json" },
      { "id": "Dark Modern",   "uiTheme": "vs-dark",  "path": "./themes/dark_modern.json" },
      { "id": "Light Modern",  "uiTheme": "vs",       "path": "./themes/light_modern.json" }
    ]
  }
}
```

`colorThemeData.ts` 最后的硬兜底——如果连 theme-defaults 扩展都加载失败：
```typescript
const defaultThemeColors: { [baseTheme: string]: ITextMateThemingRule[] } = {
    'light': [
        { scope: 'token.info-token',  settings: { foreground: '#316bcd' } },
        { scope: 'token.warn-token',  settings: { foreground: '#cd9731' } },
    ],
    'dark': [ /* ... */ ]
};
```

**VS Code 的三层退路：**
```
第 1 层：用户设置的 theme（settings.json 的 "workbench.colorTheme"）
第 2 层：theme-defaults 扩展的内置主题（Dark+ / Light+ 等 10 个）
第 3 层：defaultThemeColors 硬编码颜色值（代码里的 fallback 对象）
```

**LinkDesk 对应实现（直接照抄这个模式）：**

| 层 | VS Code | LinkDesk |
|------|------|------|
| 第 1 层 | `settings.json` → `workbench.colorTheme` | `settings.json` → `app.theme` |
| 第 2 层 | `theme-defaults` 扩展（10 个内置主题，可卸载）| `plugins/theme-dark/` + `plugins/theme-light/`（出厂预装，可卸载） |
| 第 3 层 | `defaultThemeColors` 硬编码对象 | `index.css` `:root` 的 CSS 变量值 |

```
#2 对应 VS Code 的 theme-defaults 扩展：
  plugins/theme-dark/plugin.json → { "contributes": { "themes": [{ "id": "dark", "uiTheme": "dark", "path": "dark.json" }] } }
  plugins/theme-light/plugin.json → 同上 light
  生命周期：出厂预装，可卸载。卸载后回退到第 3 层。

#3 对应 VS Code 的 defaultThemeColors：
  index.css :root { --bg: #1e1e1e; --fg: #cccccc; ... }
  永远存在。不依赖任何插件或 JSON 文件。
```

### 1.2 语言两层退路

| 层 | VS Code | LinkDesk |
|------|------|------|
| 第 1 层 | 语言包扩展的 NLS 翻译表 | `plugins/lang-en/` + `plugins/lang-zh/` 语言插件 |
| 第 2 层 | `localize(key, message)` 的 `message` 参数 = 英文原文 | `t(key)` → 如果 key 不在翻译表里 → 返回 key 本身（key = 中文原文）|

```
#2 对应 VS Code 的 localize() fallback：
  i18next.init({
    fallbackLng: false,  // 不用 i18next 的 fallback 链——自己做
    parseMissingKeyHandler: (key) => key  // t("终端") → "终端"（key 本身就是中文原文）
  })

  外加 ~30 个壳级关键 key 的显式英文兜底（对标 VS Code 的 _defaultMessages）：
  resources: { en: { translation: { "终端": "Terminal", "设置": "Settings", ... } } }

  VS Code 的做法：localize('sayHello', 'Hello {0}', name) → 'Hello' 就是 fallback
  我们的做法：t('终端') → zh.json 有 → '终端'，zh.json 没有 → 返回 key '终端'
  差异只是：VS Code 用英文原文做 key，我们用中文原文做 key。fallback 机制完全相同。
```

---

## 二、主题贡献格式 + 旧格式兼容（照抄 VS Code）

**VS Code 源码——`themeExtensionPoints.ts`：**
```typescript
ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
    extensionPoint: 'themes',
    jsonSchema: {
        properties: {
            id: { type: 'string' },        // "Id of the color theme as used in the user settings."
            label: { type: 'string' },      // "Label of the color theme as shown in the UI."
            uiTheme: { enum: ['vs', 'vs-dark', 'hc-black', 'hc-light'] },
            path: { type: 'string' }        // "Path of the tmTheme file, relative to the extension folder"
        },
        required: ['path', 'uiTheme']
    }
});
```

**LinkDesk 对应格式（字段完全对标）：**
```json
{
  "name": "Dracula",
  "contributes": {
    "themes": [
      {
        "id": "dracula",
        "label": "Dracula",
        "uiTheme": "dark",
        "path": "dracula.json"
      }
    ]
  }
}
```

**和 VS Code 的差异（有意为之）：**
- VS Code `uiTheme` 的值：`vs` / `vs-dark` / `hc-black` / `hc-light`
- LinkDesk `uiTheme` 的值：`dark` / `light` / `highContrast`（简化，不对标 VS Code 的四个值——我们没有 textmate token 渲染，不需要区分 `vs` 和 `vs-dark` 的微妙差异）
- VS Code `path` 指向 `.tmTheme` 或 `.json`（TextMate 格式），LinkDesk 指向 CSS 变量 JSON
- VS Code `id` 用于 settings.json 的 `workbench.colorTheme`，LinkDesk `id` 用于 `settings.json` 的 `app.theme`

**兼容逻辑：**
```
loader 检测主题：
  有 contributes.themes → 新格式注册
  有旧 file 字段 → 升级为 contributes.themes 等价注册（id = pluginId, uiTheme = 从 JSON 推断, path = file）
  都没有 → 不注册

出厂主题 Dark/Light → 改为 contributes.themes 格式。可卸载。
卸载后 → VS Code 的 defaultThemeColors → 我们的 index.css :root。
```

---

## 三、语言贡献格式 + 旧格式兼容（照抄 VS Code）

VS Code 语言包是包含翻译数据的普通扩展——走 NLS bundle 机制，没有专门的 `contributes.languages` 用于翻译。

LinkDesk 的做法（更简单——i18next 直接能用）：
```json
{
  "name": "日本語",
  "contributes": {
    "languages": [
      {
        "id": "ja",
        "label": "日本語",
        "path": "ja.json"
      }
    ]
  }
}
```

和主题完全对称。兼容逻辑：`contributes.languages` 优先，`file` 旧字段兼容。出厂预装 en/zh，可卸载。卸载后 `t("终端")` → key 本身 "终端" 作为显示（i18next `parseMissingKeyHandler`）。

---

## 四、主题浏览器 UI

**为什么在 Phase 7：** 主题变成插件后，用户需要有地方浏览/搜索/预览/切换。

```
Ctrl+K Ctrl+T → 主题选择器弹出
  ├── 搜索框（模糊搜索所有已安装主题）
  ├── 主题列表（名称 + 色板预览色块）
  └── 键盘上下键选择 → Enter 确认 → 即时切换
```

对标 VS Code 的 `Preferences: Color Theme`。已有基础：Phase 2 的 CommandPalette 交互模式（模糊搜索 + 键盘导航）。

**非 UI 但要有的事：** 有了 ContextKeyService（Phase 5），切主题时发射 `onDidChangeTheme` 事件。IconBar / 状态栏 / 欢迎页自动刷新——不需要手动通知。
```

---

## 五、插件资源访问 API（getResourceUri）

**为什么在 Phase 7：** P2 优先级，~20 行。插件引用自己目录下的静态资源（图片、HTML），需要标准 API 而不是手拼路径。

```typescript
// plugin.json 里声明的资源：
{
  "contributes": {
    "resources": [
      { "path": "manual.html", "label": "用户手册" },
      { "path": "icon.png" }
    ]
  }
}

// 插件代码里读：
const url = ResourceService.getResourceUri(pluginId, "manual.html")
// → "asset://plugins/doc-reader/manual.html" 或等价 blob URL
```

---

## 六、任务清单

| # | 任务 | 说明 |
|:--:|------|------|
| 1 | 主题系统插件化——ThemeRegistry + contributes.themes + 出厂 Dark/Light 迁移 + 三层退路 | 引擎升级 |
| 2 | 语言系统插件化——LanguageRegistry + contributes.languages + 出厂 en/zh 迁移 + 两层退路 | 引擎升级 |
| 3 | 主题浏览器 UI——Ctrl+K Ctrl+T，搜索/预览/即时切换 | UI 完善 |
| 4 | 产品图标主题（Product Icon Theme，消费 ThemeRegistry） | 新贡献类型 |
| 5 | 插件资源访问 API（getResourceUri——ResourcesService） | 新 API |

---

## 七、多 WebView 注意事项

### 主题切换

- 主题切换时，壳 WebView 收到 `onDidChangeTheme` 事件
- 壳通过 IPC 广播给所有插件 WebView：`ipc.emit("theme:changed", { themeId, variables })`
- 插件 WebView 收到后 → `document.documentElement.setAttribute("data-theme", themeId)`
- **CSS 变量仍然生效**——每个 WebView 有自己的 `:root`，壳广播的变量值被写入各 WebView 的 `<style>` 标签

### 退路验证

```
卸载 theme-dark 插件 → 壳检测不到主题 → 回退到 index.css :root
卸载 lang-zh 插件 → t("终端") 返回 "终端"（key = 中文原文）
```

---

## 八、相关文档

- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 主题切换的 IPC 广播机制
