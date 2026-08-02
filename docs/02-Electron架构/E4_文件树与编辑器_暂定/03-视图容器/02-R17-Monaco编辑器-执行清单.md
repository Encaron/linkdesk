# R17 Monaco 编辑器——执行清单

> 2026-08-02 基于实际代码重写。串口监视器已验证 `@monaco-editor/react` + Vite Workers + 自定义语言/主题 + keep-alive。
> R17 是从已验证模式提取到独立编辑器插件 `plugins/builtin/editor/`。
>
> **设计原则：**
> - AI 友好——一个文件一件事，不藏副作用
> - 归一化——一个概念只写一处（EditorModel 是唯一文件内容源）
> - 扩展性——语言插件接口预留插槽，C/C++/Python 以后只写语言定义文件
> - 无影编码——所有读写走 EncodingService，用户无感编码切换

---

## 第 0 组：插件骨架（零行上线——先建目录结构）

> 🔥 最小可验证单元——建好目录 + plugin.json 后立即跑 `npm run check` 确认零错误。

### E4V#40a 🔧 编辑器插件目录 + plugin.json - [x]

- [ ] **新建** `plugins/builtin/editor/plugin.json` | ~40 行
- [ ] 内容：
  ```
  {
    "name": "编辑器",
    "version": "1.0.0",
    "core": true,
    "entry": "src/index.tsx",
    "viewRole": "tabOnly",
    "tabBehavior": { "singleton": false },
    "activationEvents": ["onFileOpen"],
    "contributes": {
      "commands": [
        { "id": "editor.save", "title": "保存" },
        { "id": "editor.saveAll", "title": "全部保存" },
        { "id": "editor.closeEditor", "title": "关闭编辑器" },
        { "id": "editor.closeAllEditors", "title": "关闭所有编辑器" },
        { "id": "editor.reopenClosedEditor", "title": "重新打开已关闭的编辑器" },
        { "id": "editor.compareFiles", "title": "比较文件" }
      ],
      "keybindings": [
        { "key": "Ctrl+S", "command": "editor.save" },
        { "key": "Ctrl+Shift+T", "command": "editor.reopenClosedEditor" }
      ],
      "configuration": { ... }  // 见 E4V#40j
      // 🔥 文件关联——编辑器和打开哪个文件无关，不注册 fileExtensions。
      // FileAssociationService 由 loader 在 parseContributions 阶段接线。
      "fileAssociations": [
        { "extension": "tsx", "displayName": "TypeScript React" },
        { "extension": "ts", "displayName": "TypeScript" },
        ...  // 40+ 通用扩展名
      ]
    }
  }
  ```
- [ ] **新建** `plugins/builtin/editor/src/index.tsx` | ~15 行
- [ ] 内容：`activate()` 中注册 createTab 逻辑 + 命令 handler 占位
- [ ] **新建** `plugins/builtin/editor/src/` 空目录占位：`EditorView.tsx` / `EditorModel.ts` / `language-map.ts` / `EditorTab.tsx` / `EditorStatusBar.tsx` / `EditorBreadcrumb.tsx` / `DiffEditor.tsx` / `EditorContextMenu.tsx` / `editor.css`
- [ ] **验证：** `npm run check` 零错误、`getViewPlugin("editor")` 返回有效条目

---

## 第 1 组：核心编辑器 view——打开文件能看、能改、能存

> 🔥 最小可用编辑器。这个做完，双击文件能打开、有语法高亮、Ctrl+S 保存——用户体感从"双击无反应"变成"能用"。

### E4V#40b 🔧 EditorView 组件——Monaco 包装器 - [x]

- [ ] **新建** `plugins/builtin/editor/src/EditorView.tsx` | ~60 行
- [ ] 🔥 **参考：** `plugins/user/serial-monitor/src/index.tsx` L1082-1125——`beforeMount` / `handleEditorMount` / `monacoRef.current?.layout()`
- [ ] Props：
  ```typescript
  {
    value: string
    language: string          // "typescript" | "json" | "plaintext" | ...
    filePath: string          // 决定 Monaco model URI（用于跨文件解析）
    onChange?: (value: string) => void
    onSave?: () => void
    readOnly?: boolean
    options?: MonacoEditorOptions  // 从配置项合并
  }
  ```
- [ ] `beforeMount`：注册语言映射（`registerLanguageMap`）+ 注册 LinkDesk 主题（`defineTheme("linkdesk", ...)`）
- [ ] `handleEditorMount`：存 monacoRef + 注册 Ctrl+S（`editor.addCommand(KeyMod.CtrlCmd \| KeyCode.KeyS, () => onSave?.())`）
- [ ] keep-alive：`useEffect` → isActive 时 `monacoRef.current?.layout()`
- [ ] 🔥 StrictMode 防线：`useEffect` cleanup 里 `editor.dispose()`
- [ ] 🛡️ monacoRef 走 ref 对象，不存 .current 快照
- [ ] **验证：** `<EditorView value="hello" language="typescript" />` → Monaco 渲染 → 输入文字 → onChange 触发 → Ctrl+S → onSave 触发

### E4V#40c 🔧 EditorModel——文件内容唯一真相源 - [x]

- [ ] **新建** `plugins/builtin/editor/src/EditorModel.ts` | ~50 行
- [ ] 内容：每个打开的文件一个 EditorModel 实例
  ```typescript
  class EditorModel {
    readonly filePath: string
    readonly language: string
    readonly encoding: string      // 从 EncodingService.detect 检测
    readonly uri: monaco.Uri
    private _value: string
    private _savedValue: string    // 上次保存的值——脏状态比较基准
    readonly onDidChangeContent: Emitter<string>
    readonly onDidSave: Emitter<void>
    getValue(): string
    setValue(v: string): void
    isDirty(): boolean             // _value !== _savedValue
    markSaved(): void              // _savedValue = _value
    // 🔥 对接 FileService
    static async load(filePath: string): Promise<EditorModel>  // readBinaryFile → detect → decode
    async save(): Promise<void>                                // encode → writeFile
  }
  ```
- [ ] 🛡️ 路径走 normalizePath
- [ ] 🛡️ 编码走 EncodingService——读写各检测一次
- [ ] **验证：** `EditorModel.load("E:/test/main.c")` → model.getValue() 返回文件内容 → model.isDirty() = false → model.setValue("new") → model.isDirty() = true

### E4V#40d 🔧 语言映射——扩展名 → Monaco language ID - [x]

- [ ] **新建** `plugins/builtin/editor/src/language-map.ts` | ~50 行（数据文件——扩展名→语言 ID 映射表）
- [ ] 🔥 **参考：** `src/languages/v3-protocol.ts`——Monarch tokenizer 模式
- [ ] 40+ 通用扩展名映射：
  ```
  ts/tsx/js/jsx/mjs/cjs → typescript/javascript
  json/jsonc → json
  html/htm → html
  css/scss/less → css
  md/mdx → markdown
  py/pyi/pyx → python
  rs → rust
  c/h → c
  cpp/hpp/cxx/hxx/cc/hh → cpp
  go → go
  java → java
  xml/xsl/xsd/svg → xml
  yaml/yml → yaml
  toml → ini
  sh/bash/zsh → shell
  sql → sql
  lua → lua
  r → r
  php → php
  rb → ruby
  pl/pm → perl
  swift → swift
  kt/kts → kotlin
  dart → dart
  diff/patch → diff
  bat/cmd → bat
  ini/cfg/conf → ini
  log → plaintext
  ```
- [ ] 未知扩展名→`"plaintext"` 兜底——不抛错
- [ ] `registerLanguageMap(monaco)` 在 beforeMount 中调——对每个语言 ID：`monaco.languages.register({ id })` + 如果 Monaco 无内置高亮则用 plaintext 兜底
- [ ] **验证：** 打开 `.tsx`→TypeScript 高亮 / `.rs`→Rust 高亮 / `.xyz`→纯文本不崩溃

### E4V#40e 🔧 主题同步——LinkDesk 主题 → Monaco defineTheme - [x]

- [ ] **新建** `plugins/builtin/editor/src/theme-sync.ts` | ~45 行
- [ ] 内容：
  ```typescript
  export function syncMonacoTheme(monaco: Monaco, isDark: boolean): void {
    const base = isDark ? "vs-dark" : "vs"
    // Monaco 内置语法 token 色——不自己配，走 inherit
    // 只设编辑器外框颜色（从 CSS 变量取）
    const style = getComputedStyle(document.body)
    const colors = {
      "editor.background": style.getPropertyValue("--editor-bg").trim() || undefined,
      "editor.foreground": style.getPropertyValue("--editor-fg").trim() || undefined,
      "editorLineNumber.foreground": style.getPropertyValue("--text-secondary").trim() || undefined,
      "editorCursor.foreground": style.getPropertyValue("--accent").trim() || undefined,
      "editor.selectionBackground": style.getPropertyValue("--selection-bg").trim() || undefined,
      "editorWidget.background": style.getPropertyValue("--panel-bg").trim() || undefined,
      "editorWidget.border": style.getPropertyValue("--border-color").trim() || undefined,
    }
    monaco.editor.defineTheme("linkdesk", { base, inherit: true, colors, rules: [] })
    monaco.editor.setTheme("linkdesk")
  }
  ```
- [ ] 🔥 `inherit: true` → Monaco 内置语法 token 色（vs-dark 暗色 / vs 亮色）全部保留——不手动配 token
- [ ] `EditorView.tsx` useEffect 订阅 `ThemeRegistry.onDidChange` → 调 `syncMonacoTheme`
- [ ] 🛡️ 所有颜色走 CSS 变量——禁止硬编码 hex
- [ ] **验证：** 切换亮色/暗色主题→编辑器背景+文字跟随。语法 token 色统一切换（Monaco 内置）。

### E4V#40f 🔧 EditorTab——文件打开/保存接线 - [x]

- [ ] **新建** `plugins/builtin/editor/src/EditorTab.tsx` | ~80 行
- [ ] 通过 TabActionsContext 获取 `tab.payload.filePath`
- [ ] mount 时：`EditorModel.load(filePath)` → 得到 model
- [ ] 渲染：`<EditorView value={model.getValue()} language={model.language} filePath={model.filePath} onChange={model.setValue} onSave={handleSave} />`
- [ ] `handleSave`：`model.save()` → 标签栏 ● 消失 → toast 失败时弹错误
- [ ] 脏状态：`model.isDirty()` → TabBar 标签名前显示 ●
- [ ] Ctrl+S 快捷键：在 EditorView 内置（Monaco `addCommand`）——已在 E4V#40b 接线
- [ ] 🔥 只读文件检测：FileService 获取只读属性→`readOnly: true`
- [ ] 🛡️ 保存失败→toast 报错（文件只读/权限不足/磁盘满）——不静默吞错
- [ ] **验证：** 双击 .tsx → 编辑器标签页打开 → 编辑 → ● 出现 → Ctrl+S → ● 消失 → 关闭标签页 → 重新打开 → 内容已保存

### E4V#40g 🧪 R17 第一段验证——端到端 - [x]

- [ ] 双击 `.tsx` → Monaco 编辑器打开、TypeScript 语法高亮
- [ ] 编辑文字→标签栏出现 ● → Ctrl+S → ● 消失
- [ ] 双击 `.json` → JSON 语法高亮
- [ ] 双击 `.c` → C 语法高亮
- [ ] GBK 编码 `.c` 文件→不乱码
- [ ] 切换亮色/暗色主题→编辑器跟随
- [ ] `npm run check` 零错误

**R17 第 1 组完工后状态：** 双击文件→编辑器打开→语法高亮→编辑→保存。对标 VS Code 基本编辑体验。~345 行。

---

## 第 2 组：TypeScript 智能提示——跨文件跳转、补全、悬停

> 🔥 Monaco 内置 TypeScript worker。只需：创建影子 model + 设 compilerOptions。

### E4V#40h 🔧 TypeScript 跨文件解析——影子 model - [x]

- [ ] **文件：** `plugins/builtin/editor/src/ts-intelligence.ts` | ~50 行
- [ ] 内容：
  ```typescript
  export async function setupTypeScriptEnv(monaco: Monaco, workspaceRoots: string[]): Promise<void> {
    // 1. TS compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: ScriptTarget.ESNext,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.NodeJs,
      jsx: JsxEmit.ReactJSX,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      strict: true,
    })
    // 2. 扫描工作区——创建所有 .ts/.tsx 文件的影子 model
    //    只在首次打开 TS 文件时触发，不阻塞编辑器渲染
    //    递归 scanDir → 每个文件创建 monaco.editor.createModel(content, lang, uri) 但不挂到编辑器
    //    TypeScript worker 自动解析 import 关系
  }
  ```
- [ ] 影子 model 不渲染——TypeScript worker 在后台解析依赖
- [ ] 🔥 扫描限流：首次打开 TS 文件时触发，最多 500 文件，大项目不卡
- [ ] **验证：** 打开 `a.ts`（import 了 `b.ts` 的导出）→ Ctrl+Click 跳转到 `b.ts` 的定义

### E4V#40i 🔧 TypeScript 诊断 + 快捷修复 - [x]

- [ ] **文件：** 同 `ts-intelligence.ts` | ~15 行
- [ ] Monaco 自带 TypeScript 诊断（红色波浪线）——只需打开：
  ```typescript
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })
  ```
- [ ] 🔥 快捷修复（灯泡）——Monaco 自带，Ctrl+. 触发。零代码。
- [ ] **验证：** 写 `const x: number = "hello"` → 红色波浪线 → Ctrl+. → 弹出修复建议

### E4V#40i2 🔧 编辑器导航桥——F12 / Ctrl+Click → 壳标签页 - [x]

> 🔥 漏项补充。Standalone Monaco 的 F12/Ctrl+Click 只弹 peek 窗，不会开壳标签页。
>
> **架构决策：** 尝试了 `monaco-vscode-api` 的 `initialize()` + `IEditorService.openEditor()`，
> 但它和 standalone Monaco 的 action 系统冲突——`initialize()` 替换整个服务层后
> `editor.action.revealDefinition` 消失，Ctrl+Click 失效。
> **最终方案：** 保留 `@monaco-editor/react`，手动 TS worker + `tabActions.createTab()` + `onMouseDown` 拦截 Ctrl+Click。
> 不用 monaco-vscode-api，等第 6 组全量迁移 monaco-languageclient 时再统一接线。

- [x] **E4V#40i2a** — 新建 `navigation-bridge.ts` | ~10 行 ✅
  - export `fileUriToPath(uri: string): string`——`file:///` URI → 文件系统路径
  - 🛡️ 纯工具函数，无副作用
  - **验证：** `npx tsc --noEmit` 零错误、文件可 import

- [x] **E4V#40i2b** — 修改 `EditorView.tsx` F12/Ctrl+Click 接线 | ~25 行改 ✅
  - `goToDefinitionAt(pos)`：调 TS worker → 同文件 `revealPositionInCenter` / 跨文件 `tabActions.createTab("editor", { filePath, label, pinned: false })`
  - F12：`editor.addAction` 绑定 `monaco.KeyCode.F12`
  - Ctrl+Click：`editor.onMouseDown` 拦截 Ctrl+鼠标事件→调 `goToDefinitionAt`
  - 🔥 `gotoLocation.alternativeDefinitionCommand` 未生效——换 `onMouseDown`
  - **验证：** tsc 零错误 / ESLint 零错误 / vitest 260/270

- [x] **E4V#40i2c** — 验证导航桥——端到端 F12 / Ctrl+Click ✅
  - 同文件 F12 → 光标跳转到定义位置（不新建标签页） ✅
  - 跨文件 F12 → 蹦出目标文件标签页、标签名正确 ✅
  - 切回再 F12 → 聚焦已有标签页（不新建） ✅
  - Ctrl+Click → 同 F12 行为 ✅
  - 先手动打开目标文件再 F12 → 聚焦已有（不蹦第二个） ✅
  - `npm run check` 零错误 ✅

**R17 第 2 组完工后状态：** TypeScript/JavaScript 文件——跨文件补全+跳转定义+导航桥接线壳标签页+类型错误红色波浪线+快捷修复。对标 VS Code 写 TS 的 80% 体验。~105 行。

---

## 第 3 组：编辑器镶边——状态栏 + 面包屑 + 右键菜单

> 🔥 让编辑器不是"文本区"，而是"编辑器"。这些是 UI 壳——不碰 Monaco API。

### E4V#40j 🔧 EditorStatusBar——状态栏 - [x]

- [ ] **新建** `plugins/builtin/editor/src/EditorStatusBar.tsx` | ~50 行
- [ ] 从 Monaco 读：行号、列号、选中字符数
- [ ] 从 EditorModel 读：编码（UTF-8 / GBK）、语言模式（TypeScript / C / ...）
- [ ] 从 Monaco options 读：缩进方式（空格/Tab）、缩进大小、行尾符（CRLF/LF）
- [ ] 布局对标 VS Code 状态栏：`行 1, 列 1  |  空格: 2  |  UTF-8  |  CRLF  |  TypeScript`
- [ ] 每一项可点击——点击编码可切换（以后做），R17 先显示
- [ ] 🛡️ 所有颜色走 CSS 变量，所有文字走 t()
- [ ] **验证：** 打开文件→状态栏显示行:列、编码、语言模式

### E4V#40k 🔧 EditorBreadcrumb——面包屑 - [x]

- [ ] **新建** `plugins/builtin/editor/src/EditorBreadcrumb.tsx` | ~40 行
- [ ] 显示当前文件在工作区中的路径（相对路径）
- [ ] 对标 VS Code 面包屑：`工作区 > src > core > FileService.ts`
- [ ] 每段可点击——以后可扩展为目录级导航，R17 先显示
- [ ] 🛡️ 单根工作区：相对路径；多根：显示根名/路径
- [ ] **验证：** 打开文件→标签栏下方显示面包屑路径

### E4V#40l 🔧 EditorContextMenu——编辑器右键菜单 - [x]

- [ ] **新建** `plugins/builtin/editor/src/EditorContextMenu.tsx` | ~30 行
- [ ] 注册 `MenuId.EditorContext`：
  - `1_navigate` 组：跳转到定义、查看定义、查找所有引用、跳转到符号…
  - `2_edit` 组：剪切、复制、粘贴
  - `3_save` 组：保存、另存为…
- [ ] Monaco 编辑器区域右键 → 显示此菜单
- [ ] 🔥 Monaco 自带右键菜单（Cut/Copy/Paste/Select All）→ 保留 Monac 原生菜单，在上面加我们的组
- [ ] **验证：** 右键编辑器→菜单弹出→跳转到定义可用

**R17 第 3 组完工后状态：** 编辑器有状态栏、面包屑、右键菜单。对标 VS Code 编辑器 chrom。~120 行。

---

## 第 4 组：编辑器高级功能——Diff + 热退出 + 自动保存

### E4V#40m 🔧 Diff 编辑器——compareFiles 命令 - [x]

- [ ] **新建** `plugins/builtin/editor/src/DiffEditor.tsx` | ~40 行
- [ ] `monaco.editor.createDiffEditor(container, { ... })` ——Monaco 原生 API
- [ ] 两个文件路径→`FileService.readFile` 读两端→传给 DiffEditor
- [ ] "比较文件"命令——右键文件树→"选择以进行比较"→右键另一个文件→"与已选项比较"
- [ ] 标签页中显示并排对比
- [ ] 🔥 DiffEditor 复用 LinkDesk 主题（`syncMonacoTheme`）
- [ ] **验证：** 选中 a.txt → 右键"选择以进行比较" → 右键 b.txt → "与已选项比较" → 并排 Diff

### E4V#40n 🔧 热退出恢复——Hot Exit - [x]

- [ ] **文件：** `plugins/builtin/editor/src/hot-exit.ts` + `EditorTab.tsx` | ~50 行
- [ ] 备份：脏文件内容写 `PluginStateService("editor", "dirtyBackups")` → `{ [filePath]: { value, encoding, timestamp } }`
- [ ] 恢复：编辑器插件激活时扫描备份→恢复脏标签页→状态栏显示"未保存的更改已恢复"
- [ ] 清理：用户保存后删除对应的备份条目
- [ ] 🔥 监听窗口关闭事件——`window.addEventListener("beforeunload", ...)` → 写备份
- [ ] 🛡️ 持久化走 PluginStateService——禁止 localStorage
- [ ] **验证：** 编辑文件 → 不保存 → 退出 LinkDesk → 重新打开 → 文件恢复、显示 ● 、内容为未保存版本

### E4V#40o 🔧 自动保存 + 脏状态 - [x]

- [ ] **文件：** `EditorTab.tsx` | ~25 行
- [ ] `files.autoSave` 配置消费：
  - `"off"`（默认）——手动 Ctrl+S
  - `"afterDelay"`——1 秒空闲后自动保存（debounce 1000ms）
  - `"onFocusChange"`——切换标签页时自动保存（标签栏的 `onBeforeCloseTab` 回调）
- [ ] 脏标记 ●：`EditorModel.isDirty()` → TabBar 标签名显示 ●
- [ ] 🛡️ autoSave guard：`if (!monacoRef.current \|\| editor.getModel()?.isDisposed()) return;`
- [ ] **验证：** 编辑文字→标签栏 ● 出现。设 `"files.autoSave": "afterDelay"`→1 秒后 ● 自动消失

### E4V#40p 🔧 多标签页——Ctrl+Shift+T 恢复已关闭 - [❌ 放弃]

- [ ] **文件：** `plugins/builtin/editor/src/index.tsx` | ~15 行
- [ ] `closedTabStack`：`Array<{ filePath, label, encoding }>`——最近 20 个关闭的编辑器标签页
- [ ] 关闭编辑器标签页时 push 到栈
- [ ] Ctrl+Shift+T：pop 栈顶 → `createTab("editor", { filePath, label })`
- [ ] 🔥 清理：`files.autoSave === "off"` 且内容有未保存更改→恢复带脏标记
- [ ] **验证：** 打开 a.txt + b.txt → 关闭 b.txt → Ctrl+Shift+T → b.txt 恢复

**R17 第 4 组完工后状态：** Diff 比较、热退出恢复（退出不丢未保存内容）、自动保存。Ctrl+Shift+T 放弃——关闭标签页栈是壳的职责，不应在编辑器插件里管。~105 行。
>
> ⚠️ **Bug R17-5：TS re-analysis `applyEdits("x")` 尾随字符。** `EditorView.tsx` 用两次分开的 `applyEdits`（插入"x"→删除"x"）各自触发 `onDidChangeContent`，中间态 `handleChange` 收到含"x"的内容。修复：`pushEditOperations` 批量操作+空格替代"x"。见 `83301f0`。

---

## 第 5 组：编辑器配置项——用户可调

### E4V#40q 🔧 编辑器配置项——plugin.json 声明 + 接线 - [x]

- [ ] **文件：** `plugin.json` configuration.properties | ~60 行
- [ ] 20 项核心配置：
  ```
  editor.fontSize:         14           // 字号
  editor.fontFamily:       "Consolas"   // 字体
  editor.fontWeight:       "normal"     // 字重
  editor.lineHeight:       0            // 行高（0=自动）
  editor.tabSize:          4            // Tab 大小
  editor.insertSpaces:     true         // Tab 键插入空格
  editor.detectIndentation: true        // 自动检测缩进
  editor.wordWrap:         "off"        // 自动换行
  editor.lineNumbers:      "on"         // 行号
  editor.minimap.enabled:  true         // Minimap
  editor.renderWhitespace: "selection"  // 空白符显示
  editor.cursorStyle:      "line"       // 光标样式
  editor.cursorBlinking:   "blink"      // 光标闪烁
  editor.mouseWheelZoom:   true         // 🔥 Ctrl+滚轮缩放字号
  editor.smoothScrolling:  true         // 平滑滚动
  editor.autoClosingBrackets: "always"  // 自动闭合括号
  editor.bracketPairColorization: true  // 括号对着色
  editor.guides.indentation: true       // 缩进引导线
  editor.linkedEditing:    true         // 同步重命名
  editor.occurrencesHighlight: true     // 选中词高亮
  editor.selectionHighlight: true       // 选区背景
  editor.parameterHints.enabled: true   // 参数提示
  editor.quickSuggestions: true         // 快速建议
  editor.suggest.showWords: true        // 补全显示单词
  editor.suggest.showSnippets: true     // 补全显示代码片段
  ```
- [ ] 接线——`EditorTab.tsx` mount 时读 `ConfigurationService` → 合并到 Monaco options
- [ ] `onDidChange` 订阅→`editor.updateOptions()`——运行时即时生效
- [ ] 🔥 `editor.mouseWheelZoom` 是 Monaco 内建选项——设为 true 即可 Ctrl+滚轮缩放
- [ ] **验证：** 改 settings.json `"editor.fontSize": 20`→编辑器字号即时变大。`"editor.mouseWheelZoom": true`→Ctrl+滚轮缩放

**R17 第 5 组完工后状态：** 25 项编辑器配置可通过 settings.json 调整、即时生效。~70 行。

---

## 第 6 组：monaco-languageclient 全量迁移——治本

> 🔥 **提前激活。** 原计划 R17 只留 LSP 桥框架（E4V#40t "R17 不启用"），
> 现提前做全量迁移。原因：E4V#40i2 的手动 TS worker 方案是治标（只覆盖 TS/JS），
> monaco-languageclient 的 `IEditorService.openEditor()` 覆盖才是治本——所有语言通用。
>
> **架构决策：** 换掉 `@monaco-editor/react`，用 `MonacoVscodeApiWrapper.start()` 全局初始化
> VS Code 服务层 + `EditorApp` 创建编辑器。`ViewsConfig.openEditorFunc` 接壳标签页。
> $type: "extended" + EditorService——拿到 TextMate 语法高亮 + 主题 + IEditorService 覆盖。
>
> **影响：** 做完后 E4V#40i2 的手动 `addAction` + `onMouseDown` 代码可删除。
> E4V#40r（语言插件贡献点）和 E4V#40s（语言注册表接线）仍保留，等语言插件体系时再做。

### E4V#40t 🔧 monaco-languageclient 全量迁移——替代 @monaco-editor/react - [x]

- [x] **E4V#40t1** — 新建 `monaco-init.ts`——全局一次性初始化 | ~25 行
  - import `MonacoVscodeApiWrapper`, `MonacoVscodeApiConfig` from `monaco-languageclient/vscodeApiWrapper`
  - import `configureDefaultWorkerFactory` from `monaco-languageclient/workerFactory`
  - export `async function initMonacoEnv(openEditorFunc: OpenEditor): Promise<void>`
  - 配置：`$type: "extended"`, `viewsConfig: { $type: "EditorService", openEditorFunc }`, `monacoWorkerFactory: configureDefaultWorkerFactory`
  - 🔥 模块级 `_ready` guard——多次调用只初始化一次
  - 🛡️ `openEditorFunc` 回调：`uri.fsPath` → `tabActions.createTab()`
  - **验证：** `npx tsc --noEmit` 零错误、`MonacoVscodeApiWrapper` 可实例化

- [x] **E4V#40t2** — 重写 `EditorView.tsx`——用 `EditorApp` 替代 `<Editor>` | ~50 行改
  - 去掉 `import Editor from "@monaco-editor/react"`（彻底告别 @monaco-editor/react）
  - import `EditorApp`, `EditorAppConfig` from `monaco-languageclient/editorApp`
  - mount `useEffect` 内：
    1. 等 `initMonacoEnv()` resolve
    2. `new EditorApp({ codeResources: { main: { text: value, uri: filePath } }, editorOptions, readOnly })`
    3. `await editorApp.start(containerRef.current!)`
    4. 注册 `onTextChanged` → `onChange`
    5. cleanup：`editorApp.dispose()`
  - keep-alive：`useEffect` 监听 `isActive` → `editorApp.layout()`
  - 🔥 不保留 `beforeMount` / `onMount` 回调——EditorApp 自己处理 workers、语言、主题
  - **验证：** 双击 .ts → Monaco 编辑器正常渲染、语法高亮、Ctrl+S 保存。`npm run check` 零错误

- [x] **E4V#40t3** — 接线 `openEditorFunc` → 壳标签页 | ~10 行
  - `initMonacoEnv()` 的 `openEditorFunc` 回调内：`modelRef.object.textEditorModel.uri.fsPath` → `tabActions.createTab("editor", { filePath, label, pinned: false })`
  - 去掉 `EditorView.tsx` 中 E4V#40i2 的手动代码：`addAction` / `onMouseDown` / `goToDefinitionAt`
  - 🛡️ 同文件跳转由 EditorApp 自带的 `revealDefinition` 处理（不需手动判断）
  - **验证：** tsc + eslint + vitest 零错误

- [x] **E4V#40t4** — 清理 `navigation-bridge.ts` | ~5 行
  - 删掉 `fileUriToPath`——不再需要，`openEditorFunc` 直接用 `uri.fsPath`
  - 或保留为纯工具函数（给其他地方用）
  - **验证：** grep `fileUriToPath` 确认无残留引用

- [x] **E4V#40t5** — 端到端验证 | 0 行
  - 双击 .ts → Monaco 编辑器渲染、TypeScript 高亮 ✅
  - F12 同文件 → 光标跳转（不新建标签页） ✅
  - F12 跨文件 → 蹦目标文件标签页、标签名正确 ✅
  - Ctrl+Click → 同 F12 ✅
  - 切回再 F12 → 聚焦已有标签页 ✅
  - 主题切换 → 编辑器跟随 ✅
  - `npm run check` 零错误 ✅

- [x] **E4V#40t6** 🔧 归一化验证——ViewsService 方案否决 | ~55 行改（已回退）
  > 🔥 尝试了 ViewsService 模式——workbench command 不认 standalone editor（monaco.editor.create()）。
  > 要全量用 workbench editor 意味着在壳里嵌一个迷你 VS Code——破坏"通用容器"架构。
  > **最终结论：** EditorService + 手动 handler 是 standalone Monaco 的正确归一化路径，
  > 不是 V2.6 临时方案。壳管标签页，插件管编辑器——不混合。
  - [x] 尝试 ViewsService → 跨文件 F12 失效 → 回退 EditorService ✅
  - [x] 手动 handler 标注为"standalone 正确归一化路径"——不是治标 ✅

### E4V#40r 🔧 语言插件贡献点——contributes.languages 扩展 - [ ]

- [x] **E4V#40r1** — `plugin.schema.json` 加 `contributes.languages` | ~10 行
  - `languages` 数组：`{ id, extensions, aliases, monarch?, lsp?: { command, args } }`
  - **验证：** schema 校验通过

- [x] **E4V#40r2** — `src/core/types.ts` 加 `LanguageContribution` 类型 | ~5 行
  - **验证：** tsc 零错误

### E4V#40s 🔧 LSP 桥接线——child_process → MonacoLanguageClient - [ ]

> 🔥 pyright 已安装（`npm install -D pyright`）。测试语言 = Python。
> 做完后 C/C++/Rust 只需换 spawn 命令即可。

- [x] **E4V#40s1** — main process IPC handler：`lsp:spawn` → `child_process.spawn` | ~20 行
  - `electron/ipc/lsp-handlers.ts`：`spawn` 创建进程，stdin/stdout 桥 IPC
  - `electron/main.ts`：注册 handler

- [x] **E4V#40s2** — render 端 `lsp-bridge.ts`：启动 LSP 客户端 | ~25 行
  - `startLspClient(languageId, serverCommand)` → `MonacoLanguageClient` 连接
  - stdin/stdout 通过 IPC 代理到主进程

- [x] **E4V#40s3** — EditorView `goToDefinitionAt` 归一化——语言分派 + LSP 直调 | ~20 行改
  - `getDefinitionAt(model, pos, monaco)`：按 `languageId` 分派
    - TS/JS → `getTypeScriptWorker().getDefinitionAtPosition()`
    - 其他 → 从 `lsp-bridge` 取 `MonacoLanguageClient` → `sendRequest('textDocument/definition', ...)`
  - LSP 响应解析：`{ uri, range: { start: { line, character } } }` → filePath + position
  - 🔥 不写死 TS worker——语言分派可扩展

- [x] **E4V#40s4** — 端到端验证 Python F12 | 0 行 ✅

- [x] **E4V#40s5** 🔧 语言插件归一化——LanguageRegistry + 自动启动 | ~30 行
  > 🔥 消灭 EditorView 里 `.py` 硬编码。建 LanguageRegistry 大厅桌——
  > plugin.json 声明 langDefs → loader 自动注册 → EditorView 自动启动 LSP。
  > 新增语言只需写 plugin.json，零改编辑器代码。
  - [ ] **E4V#40s5a** — 新建 `src/core/LanguageRegistry.ts` | ~20 行
    - `registerLangDef(pluginId, langDef)` ——和 FileAssociationService 同模式
    - `getLangDef(extension): LangDefContribution | undefined`
    - 🔥 大厅桌子——核心只知道"有人注册了语言"，不知道语言是什么
  - [ ] **E4V#40s5b** — `loader.ts` parseContributions 接线 | ~5 行
    - 遍历 `langDefs` → `LanguageRegistry.registerLangDef(pluginId, def)`
  - [ ] **E4V#40s5c** — `EditorView.tsx` 查表替代硬编码 | ~5 行改
    - 删 `filePath.endsWith(".py")`
    - 改：`const ext = extension(filePath)` → `const langDef = getLangDef(ext)` → 有 lsp 就 `startLspClient`
  - 🛡️ 归一化——和 FileAssociationService 同模式，不新增新概念
  - **验证：** tsc+eslint+vitest 零错误 / Python F12 仍正常 / 无硬编码

- [x] **E4V#40s6** ✅ Python 插件拆分

- [x] **E4V#40s7** ✅ 编辑器注册表——巩固地基（不用时序运气） | ~20 行改
  > 🔥 当前 `pendingReveal` 是 fire-and-forget——editor 未就绪时 token 丢失。
  > 治本：`navigation-bridge.ts` 维护 `Map<filePath, editor>` 注册表。
  > F12 handler 直接 `getRegisteredEditor(targetPath)` → 存在就 `setPosition` + `reveal`。
  > 不存在才 `setPendingReveal`（editor create 时自动 consume）。
  > 删除 isActive effect 里的 reveal 逻辑——init effect 已覆盖全部。
  - [ ] `navigation-bridge.ts`：加 `registerEditor`/`unregisterEditor`/`getRegisteredEditor`
  - [ ] EditorView init：`editor.create()` 后 `registerEditor(filePath, editor)`
  - [ ] EditorView dispose：`unregisterEditor(filePath)`
  - [ ] `goToDefinitionAt`：先查 `getRegisteredEditor(targetPath)` → 在就 reveal，不在才 `setPendingReveal`
  - 🛡️ 模块级 registry——不经过 React 生命周期，无竞态
  - **验证：** tsc+eslint+vitest / 所有 F12 场景（新建/已有/同文件）

**R17 第 6 组完工后状态：** monaco-languageclient + LSP 桥 + 语言插件体系（声明式）+ 编辑器注册表。~190 行。

---

## 第 7 组：编辑器装饰 + 200 快捷键映射

### E4V#40u 🔧 编辑器装饰——选中词高亮 + 缩进引导线 - [x]

- [ ] **文件：** `EditorView.tsx` | ~15 行
- [ ] Monaco 选项已覆盖（第 5 组配置项）：
  - `occurrencesHighlight`——选中单词所有出现处淡蓝方块
  - `selectionHighlight`——和选中相同的文本淡色背景
  - `bracketPairColorization`——彩色括号对
  - `guides.indentation`——缩进竖线
  - `renderWhitespace: "selection"`——选中时显示空格/Tab
- [ ] 🔥 这些全是被配置项开关的 Monaco 内建功能——零新代码
- [ ] **验证：** 选中一个单词→所有相同单词高亮。括号对彩色显示。

### E4V#40v 🔧 编辑器操作快捷键——200+ 自带 + 映射表 - [x]

- [ ] **文件：** `plugin.json` keybindings | ~30 行
- [ ] Monaco 内置 200+ editor action——Ctrl+Z 撤销、Ctrl+/ 注释、Alt+↑↓ 移动行…全自带
- [ ] 我们只需注册与 LinkDesk KeybindingRegistry 的关键词映射：
  ```
  Ctrl+Z → 被 Monaco 拦截（自带）
  Ctrl+/ → 被 Monaco 拦截（自带）
  Ctrl+F → 被 Monaco 拦截（自带搜索框）
  Ctrl+H → 被 Monaco 拦截（自带替换框）
  Ctrl+G → 被 Monaco 拦截（自带跳转行）
  Ctrl+D → 被 Monaco 拦截（自带选下一个匹配）
  F12    → "editor.action.revealDefinition"     // 跳转到定义
  Ctrl+F12 → "editor.action.goToImplementation"  // 跳转到实现
  Shift+F12 → "editor.action.referenceSearch.trigger"  // 查找引用
  Ctrl+. → "editor.action.quickFix"              // 快捷修复
  Ctrl+Shift+O → "editor.action.goToSymbol"     // 跳转到文件内符号
  ```
- [ ] 🔥 这些快捷键在 Monaco 内部已经生效——F12 跳转定义、Ctrl+D 多光标。只需在 plugin.json 声明让 KeybindingRegistry 知道。
- [ ] **验证：** 打开 .tsx → Ctrl+/ → 注释/取消注释。F12 → 跳转到定义。Ctrl+D → 多光标选择。Ctrl+G → 输入行号跳转。

**R17 第 7 组完工后状态：** 200+ Monaco 内置操作快捷键全生效。编辑体验对标 VS Code。~45 行。

---

## 🔴 致命 Bug 预测（从隐性 bug 经验提取）

| Bug | 症状 | 预防 |
|:--|:--|:--|
| monacoRef/dirtyRef stale ref | EditorView 里多路径读 ref→快照过期 | 所有读写归一到一个 useImperativeHandle handle |
| autoSave + keep-alive + 标签切换竞态 | onFocusChange 自动保存时 editor 已 disposed | guard 检查 `!editor.getModel()?.isDisposed()` |
| theme sync 时机 | 主题切换时 Monaco 还没 mount → defineTheme 无效 | `syncMonacoTheme` 在 beforeMount 和 onDidChange 都调用 |
| 编码保存 GBK→UTF-8 | GBK 文件保存后变 UTF-8 | 引入 iconv-lite + `EncodingService.encode` 扩展（见 E4V#40w） |
| 影子 model 内存泄漏 | TS 跨文件解析创建了大量 model 不释放 | 限制 ≤500 文件 + 编辑器关闭时 dispose 对应影子 model |

### E4V#40w 🟡 GBK 编码保存修复（已知 Bug 2 治本） - [ ]

- [ ] `EncodingService.encode()` 引入 iconv-lite——支持 GBK/UTF-16 编码
- [ ] 不属于 R17 编辑器专属，但编辑器是唯一消费方——顺手修
- [ ] **验证：** 打开 GBK 文件→不乱码。修改后保存→仍为 GBK 编码。

---

## 总览

| 组 | 内容 | 任务 | 行数 |
|:--|:--|:--:|:--:|
| 0 | 插件骨架——目录+plugin.json+index | E4V#40a | ~55 |
| 1 | 核心编辑器——View+Model+语言+主题+Tab | E4V#40b–40g | ~345 |
| 2 | TypeScript 智能提示——跨文件解析 + 导航桥 | E4V#40h–40i2 | ~95 |
| 3 | 编辑器镶边——状态栏+面包屑+右键 | E4V#40j–40l | ~120 |
| 4 | 高级功能——Diff+热退出+自动保存+多标签页 | E4V#40m–40p | ~130 |
| 5 | 配置项——25 项编辑器配置 | E4V#40q | ~70 |
| 6 | monaco-languageclient 全量 + LSP 桥 + 语言插件 | E4V#40t–t6 + 40r–40s + s5–s6 | ~200 |
| 7 | 装饰+快捷键映射 | E4V#40u–40v | ~45 |
| 🔴 | GBK 编码保存 | E4V#40w | ~10 |
| **合计** | | **26 任务** | **~1010 行** |

> 对标原 E4V#40a–E4V#42d（10 任务 ~330 行）→ 现 22 任务 ~920 行。
> 行数增加 3 倍——但体感从"文本区"变成"类 VS Code 编辑器"。
> 其中 ~500 行是 Monaco 自带能力的配置/接线——不是新逻辑。
