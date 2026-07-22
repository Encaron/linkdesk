# Phase 5 承前启后

> Phase 4→5 断层分析 + Phase 5→6 承接链。合并自两份过渡分析文档。
> 新 AI 接手：先读这份，理解"Phase 5 为什么存在"和"Phase 5 为 Phase 6 铺了什么路"。

---

# 前半：Phase 4→5 断层分析

> Phase 4 的代码在 Phase 5 需要调整的 8 个断层点。每一点标注根因和后果——迁移步骤已执行完毕，保留根因作为历史依据。

---

## 1. 全局配置对象 → 插件各自声明配置

**根因：** Phase 4 没有配置系统。所有设置塞进一个大 JSON 对象 `PreferenceService.preferences`——因为那时候只有终端有设置，「设置 = 终端的设置」。

**后果：** Phase 6 卡片有设置、Phase 7 OLED 有设置——全塞进全局对象 = V2.3→V2.5 重演：每次新功能都要改全局配置结构体。

**解决：** Phase 5 建 ConfigurationService + ConfigurationApplier。插件在 `plugin.json` 声明设置项，Settings Editor 自动渲染。

---

## 2. 终端设置用 React Context → ConfigurationService

**根因：** Phase 4 终端设置通过 `<TerminalPrefsContext.Provider>` 传递——前提是"设置只有终端有，只走 React Context"。

**后果：** 非 React 组件（协议解析器、数据源）读不到任何配置。已删除 TerminalPrefsContext.ts，终端直接走 `useConfiguration()`。

---

## 3. 终端侧栏手写表单 → Settings Editor 自动生成

**根因：** Phase 4 `TerminalSidebar.tsx` 是手写的——85 行 `<Toggle>/<Select>/<FormRow>`。那时候只有一个插件有设置，手写最快。

**后果：** Phase 6 卡片插件需要自己的设置界面 → 如果继续手写，每个插件都要写一个自己的设置表单。设置项藏在代码里不是数据，AI 不可能知道有哪些。

**解决：** Phase 5 建 Settings Editor——通用表单引擎，读 `plugin.json` 的 `contributes.configuration` 自动生成。

---

## 4. 命令面板硬编码数组 → CommandRegistry

**根因：** Phase 4 CommandPalette 是终端视图内的组件，命令列表是 TerminalView 里的硬编码数组——因为终端是唯一的实体插件。

**后果：** 其他插件（工作台"新卡片"、阅读器"打开预览"）的命令无法出现在命令面板。

**解决：** Phase 5 建 CommandRegistry——插件在 `plugin.json` 声明命令，CommandPalette 从 Registry 动态读取。

---

## 5. 右键菜单硬编码组件 → MenuService 动态生成

**根因：** Phase 4 终端右键菜单是 `<ReceiveContextMenu>` 组件——四个按钮写死在 JSX 里。

**后果：** 其他标签页右键没反应——没人给它们写菜单组件。

**解决：** Phase 5 建通用 `<ContextMenu>` 组件 + MenuRegistry——插件声明菜单项，右键自动出现。

---

## 6. 串口状态用 React Context → CoreEvents 事件总线

**根因：** Phase 4 串口状态通过 `<SerialContext.Provider>` 传递——纯 React 方案。

**后果：** 非 React 插件（协议解析器、数据源）用不了 `useSerialContext()`。

**解决：** Phase 5 建 CoreEvents + Emitter 事件总线。两者共存——SerialContext 继续服务 React 组件，CoreEvents 服务非 React 消费者。

---

## 7. 快捷发送存在全局配置 → 插件私有存储

**根因：** Phase 4 快捷发送存在 `PreferenceService.quickSends`——"终端的配置 = 全局配置"。

**后果：** 未来 10 个插件都有私有数据时，全局 Prefs 会变乱。

**解决：** Phase 5 建 PluginStateService——每个插件独立 key-value 存储。

---

## 8. plugin.json 格式平铺 → 加 contributes 段

**根因：** Phase 4 的 `plugin.json` 是平铺字段（`entry`/`sidebar`/`statusBar`/`tabBehavior`）——不需要命令、配置、菜单。

**后果：** Phase 5 新增的 Registry 需要从 `plugin.json` 读数据，新增字段可能和原有字段冲突。

**解决：** 原有字段不动，新增 `contributes` 段（对标 VS Code `package.json` 的 `contributes`）。两条线互不干扰。loader 原有检测逻辑不动，新加 `parseContributions()`。

---

# 后半：Phase 5→6 承接链

> Phase 5 建基础设施，Phase 6 在基础设施上写功能。每一对承接关系说清楚"Phase 5 建了什么、Phase 6 消费什么"。

---

## 核心原则

- **Phase 6 不新增 Registry 类型。** 全消费 Phase 5 的模式——套用到主题/语言/文件/Profile/编辑器这些新领域。框架零改动。
- **Phase 6 的本质 = 编辑能力。** 文件树 + 文件操作 + 文本编辑 + 主题/语言引擎。三层（6a 基础 → 6b 体验 → 6c 引擎+壳）递进。

---

## 承接关系表

| Phase 5 已建 | Phase 6 消费 |
|:--|:--|
| ConfigurationService + scope | WorkspaceService（文件夹管理）→ scope 的上下文来源；ProfileService（settings 覆盖） |
| CoreEvents + Emitter | + `onDidChangeFileSystem`、+ `onDidChangeWorkspaceFolders`、+ `onDidChangeProfile` |
| CommandRegistry | FileAssociationService（文件→命令映射）；`workbench.action.reopenClosedTab` 等新命令 |
| KeybindingRegistry | `Ctrl+Shift+T` → reopenClosedTab；拖入文件 → 开对应插件 |
| MenuService + MenuId | + `MenuId.FileContext`；"打开方式…"子菜单 |
| ContextKeyService | "activeWorkspace" / "fileTreeHasSelection" / "profile" 等新 context key |
| LogChannel | 输出面板 UI（查看器） |
| ThemeEngine（Phase 3） | ThemeRegistry + ThemeBrowser UI；出厂 Dark/Light → `contributes.themes` |
| i18next（Phase 2） | LanguageRegistry；出厂 en/zh → `contributes.languages` |
| loader + viewRegistry（Phase 4） | loader 升级：+ `parseContributions(themes/languages/fileAssociations/resources)`；+ activationEvents；+ extensionDependencies |
| Monaco Editor（Phase 2） | JSON 编辑器标签页 |
| Tauri window API | 标题栏暗色化 + 系统菜单 + ☰ 汉堡菜单 |

---

## 5h→5.5→6 链路

```
5h（运行时动态加载）→ 5.5（三栏交互对标 + viewRole）→ Phase 6（零框架改动）

Phase 6 三层递进：
  6a（文件树基础闭环 7 项）→ 6b（编辑体验闭环 8 项）→ 6c（引擎+壳 13 项）
```

路线图唯一权威：[开发管理/V3开发计划.md](../开发管理/V3开发计划.md)。

Phase 6 完整设计：[phase6_底层加固/](../phase6_底层加固/)
Phase 7 完整设计：[phase7_多WebView与编辑能力/](../phase7_多WebView与编辑能力/)

---

## 相关文档

- [V3-Phase5-设计.md](V3-Phase5-设计.md) — Phase 5 主设计文档
- [V3-Phase5-归一化设计决策.md](V3-Phase5-归一化设计决策.md) — ConfigurationApplier + PluginLifecycle 归一化
- [V3-Phase5g-类型系统去硬编码-核心决策.md](V3-Phase5g-类型系统去硬编码-核心决策.md) — TabType = string 的决策依据
- [V3-Phase5-最终验收报告.md](V3-Phase5-最终验收报告.md) — Phase 5 验收
