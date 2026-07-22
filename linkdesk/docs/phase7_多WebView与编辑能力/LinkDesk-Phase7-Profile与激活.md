# Phase 7d — Profile 与激活

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7d 展开（前半——Profile + 激活 + 齿轮菜单 + 输出面板 + 终端会话持久化）。

---

## 一、Profile 系统——插件集合的声明式管理

**来源：** Phase 4 设计文档 §8.5。Phase 4 已留好接口：

```typescript
// 当前 Phase 4：全量加载
pluginLoader.scanAll()

// 未来：按 Profile 过滤
pluginLoader.scanAll({ filter: profile.plugins })
```

**做什么：** 一个 `.linkdesk/profiles/<name>.json` 文件定义"这个场景用哪些插件 + 什么设置 + 什么主题 + 哪个 workspace"。切换 Profile = 一键切换整个软件环境。

```json
// STM32.code-profile（对标 VS Code Profile）
{
  "name": "STM32 PID 调参",
  "icon": "chip",
  "plugins": ["terminal", "protocol-bracket", "card-gauge", "card-slider"],
  "settings": {
    "app.theme": "Dark",
    "terminal.baudRate": 115200
  },
  "workspace": "pid_tuning"
}
```

**切换 Profile 时自动：**
- 禁用不在列表中的插件 → 图标栏图标消失
- 启用列表中的插件 → 图标栏图标出现
- 应用 settings → 主题、语言、串口默认值全换
- 打开对应 workspace → 布局就位

**Phase 5 已有的原材料：**
- ConfigurationService + scope → Profile 的 settings 覆盖
- CommandRegistry → "切换 Profile…" 命令
- ContextKeyService → `"profile": "STM32"` 作为 context key，插件菜单可 `when: "profile == 'STM32'"`
- ProfileService 自建 `.linkdesk/profiles/` 存储（不是 PluginStateService——Profile 是全局快照，不属于单个插件）

**交互：** Ctrl+Shift+P → "切换 Profile…" → QuickPick 列出所有 profile。

### 🔴 Profile 切换五维验证

最容易出"半完成态"的操作。Profile 切换不是改一个变量——是批量执行六个操作（enablePlugins / disablePlugins / applySettings / switchTheme / switchLanguage / openWorkspace）。六个操作任何一个失败都不能静默——必须 toast 报告哪个操作失败了、当前是什么状态。对标 VS Code：Profile 切换失败时回退到切换前的状态。

| # | 维度 | 验证方法 | 失败后果 |
|:--:|------|------|------|
| 1 | 插件加载列表 | `PluginStateService.getAll()` → 检查 enabled/disabled 集合 | Profile A 的插件在 Profile B 仍然活跃——"幽灵插件" |
| 2 | settings 值 | `ConfigurationService.inspect(key)` → 检查 effectiveValue | 波特率/主题仍是上一个 Profile 的值——"配置残留"bug |
| 3 | 主题 CSS 变量 | `getComputedStyle(document.body).getPropertyValue('--bg')` | UI 颜色半新半旧——最显眼的 bug |
| 4 | 语言 | `i18next.language` + UI 文字实际显示 | 菜单中文、设置英文——碎片化体验 |
| 5 | 布局（标签页+工作区） | 检查 tabs[] + activeGroupId + workspace root | 上一个 Profile 的标签页残留，或 workspace 没切换 |

---

## 二、activationEvents——按需激活（和 Profile 联动）

**这是 Profile 的另一半。** Profile 决定了哪些插件"属于这个场景"。activationEvents 决定了属于这个场景的插件"什么时候真正加载代码"。

**VS Code 对标：** `package.json` 的 `activationEvents` 字段。

```json
{
  "name": "CAD 查看器",
  "activationEvents": [
    "onCommand:cad.importDxf",
    "onFileOpen:.dxf",
    "onFileOpen:.stl"
  ]
}
```

**结合 Profile 的完整流程：**

```
用户切换到 "STM32 PID" Profile
  → Profile 声明 plugins: [terminal, protocol-bracket, card-gauge, card-slider, cad]
  → 只有这 5 个插件参与加载

加载阶段：
  terminal → activationEvents 为空 → 启动时 import()
  protocol-bracket → 同上 → 启动时 import()
  card-gauge → 同上 → 启动时 import()
  card-slider → 同上 → 启动时 import()
  cad → activationEvents: ["onFileOpen:.dxf"] → 只注册 manifest，不 import()
       → 用户双击 .dxf → FileAssociationService 匹配到 cad → 首次 import() → 注册到 Registry
       → 之后每次打开 .dxf → 已加载，直接执行
```

**实现：**

```typescript
// loader 改动（~40 行）
async function scanAll(filter?: string[]) {
  const manifests = globPluginManifests()  // 轻量：只读 plugin.json，不 import 代码
  const filtered = filter ? manifests.filter(m => filter.includes(m.id)) : manifests

  for (const manifest of filtered) {
    registerManifest(manifest)  // 注册到各 Registry（空壳：知道有这个插件，还没代码）

    if (!manifest.activationEvents || manifest.activationEvents.length === 0) {
      await loadPlugin(manifest)  // 无激活事件 → 立即 import 代码
    }
    // 有激活事件 → 等着，触发时才 import
  }
}

// 触发激活
async function activateForEvent(event: string) {
  const plugins = getPluginsWithActivationEvent(event)
  for (const p of plugins) {
    if (!isLoaded(p.id)) await loadPlugin(p)
  }
}
```

**多 WebView 下的变化：**

```
单 WebView（旧）：
  activationEvents 触发 → import() 插件 JS → 注册组件 → React render

多 WebView（新）：
  activationEvents 触发 → 创建插件 WebView → 加载 JS → React render
  → 更彻底——不仅代码不 import，连 WebView 都不创建
```

**Phase 5 已有的触发源：**
- FileAssociationService（Phase 7b 建）→ `onFileOpen:.dxf` 的触发源
- CommandRegistry → `onCommand:xxx` 的触发源——命令首次被调用时激活插件
- CoreEvents → `onDidChangePortState` 等可作为激活事件

---

## 三、extensionDependencies——插件依赖声明

**对标 VS Code：** `package.json` 的 `extensionDependencies`。

```json
{
  "name": "CAD 查看器",
  "extensionDependencies": ["file-tree"]
}
```

loader 检查：file-tree 没安装/被禁用 → CAD 不加载 → toast "CAD 需要文件树插件"。~40 行。

---

## 四、齿轮菜单完善——从简化版到 context key 驱动

Phase 4 的齿轮菜单是简化版（硬编码的"启用/禁用/卸载"三个按钮）。Phase 5 建了 ContextKeyService + MenuService。Phase 7 做完整版：

```
插件市场 → 齿轮菜单：
  ├── 启用 / 禁用         → 已有
  ├── 卸载               → 已有
  ├── 配置 [插件名]...    → 跳到 Settings Editor 的对应分组
  ├── 查看日志            → 打开 Output 面板的对应频道
  └── 重新安装            → 已有

齿轮菜单内容 = MenuService.getMenuItems(MenuId.ExtensionGear, context)
  → 不是硬编码列表，是菜单注册表驱动
```

---

## 五、输出面板 UI

**为什么在 Phase 7：** Phase 5 的盲区 10 建了 `LogChannel` 数据通道（`appendLine / show`），但查看器 UI 没做。文件树 + 输出面板 = VS Code 底部面板的两大标配。

```
输出面板 UI：
  ├── 频道选择器（下拉框："终端" / "协议-SBQ" / "CAD" / "通用"）
  ├── 日志列表（等宽字体、按 source 着色、自动滚动）
  └── 清空 / 导出按钮
```

对标 VS Code 的 Output 面板。Phase 5 建了管道，Phase 7 建水龙头。

---

## 六、终端会话持久化

Phase 5.5c 的会话数据存在内存（`useTerminalSessions` 模块级单例）。Phase 7 写 `.linkdesk/sessions.json`（消费 FileService）。

```
软件关闭 → 最后一次 sessions 快照写入 sessions.json
软件启动 → loadSessionsFromDisk() → 恢复到内存
文件树双击 .linkdesk/sessions.json → 打开编辑器
```

---

## 七、任务清单

| # | 任务 | 说明 |
|:--:|------|------|
| 1 | Profile 系统——ProfileService + loadProfile / switchProfile + 五维验证 | 新系统 |
| 2 | activationEvents——onCommand / onFileOpen / onPortOpen 按需激活 | loader 升级 |
| 3 | extensionDependencies——加载前检查缺失依赖 | loader 升级 |
| 4 | 齿轮菜单完整版——context key 驱动，Profile 切换时菜单联动 | UI 完善 |
| 5 | 输出面板 UI——LogChannel 消费端，Profile 切换时频道变化 | 新视图 |
| 6 | 终端会话持久化——`.sessions.json` 文件 + 启动恢复 | 数据持久化 |

---

## 八、多 WebView 注意事项

### Profile 切换流程

```
切 Profile →
  1. 禁用不在 Profile 中的插件 → 销毁对应 WebView
  2. 启用在 Profile 中的插件 → 创建对应 WebView
  3. 应用 settings → IPC 广播给所有活跃的插件 WebView
  4. 切换主题 → IPC 广播 theme:changed
  5. 切换语言 → IPC 广播 lang:changed
  6. 打开 workspace → WorkspaceService.openFolder

六个操作任何一个失败 → toast 报告哪个操作失败了
对标 VS Code：失败时回退到切换前的状态
```

---

## 九、相关文档

- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — Profile 切换时的 WebView 批量创建/销毁
- [LinkDesk-Phase7-壳完善与抛光.md](./LinkDesk-Phase7-壳完善与抛光.md) — 7d 后半（通知/标题栏/模糊搜索/兼容）
- [LinkDesk-Phase6-基础设施缺口.md](../phase6_底层加固/LinkDesk-Phase6-基础设施缺口.md) — FileService（会话持久化消费）
