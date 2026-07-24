# E3d — Profile 与激活

> 2026-07-24。从旧 P7d 拆分——Profile 决定"谁参与游戏"，activationEvents 决定"什么时候加载"。
> **性质：** 纯 TS/React，框架无关。Profile 切换后插件集合/设置/主题/布局全部替换。
> **依赖：** E3a（多 WebView——activationEvents 触发时创建 WebContentsView）+ **E3b（主题引擎——Profile 切换后应用主题）+ E3c（语言引擎——Profile 切换后应用语言）**
>
> Profile 切换时五维验证的第 3 维（主题 CSS 变量）和第 4 维（语言）依赖 E3b/E3c 的跨进程广播能力——必须先运行 E3a→E3b+E3c→再 E3d。**这是硬依赖，不是建议。**

---

## 一、Profile 系统——插件集合的声明式管理

一个 `.linkdesk/profiles/<name>.json` 定义 "这个场景用哪些插件 + 什么设置 + 什么主题 + 哪个 workspace"。

```json
{
  "name": "STM32 PID 调参",
  "icon": "chip",
  "plugins": ["terminal", "protocol-bracket", "card-gauge", "card-slider"],
  "settings": { "app.theme": "Dark", "terminal.baudRate": 115200 },
  "workspace": "pid_tuning"
}
```

**切换 Profile 时自动：**
- 禁用不在列表中的插件 → 图标栏图标消失
- 启用列表中的插件 → 图标栏图标出现
- 应用 settings → 主题、语言、串口默认值全换
- 打开对应 workspace → 布局就位

**交互：** Ctrl+Shift+P → "切换 Profile…" → QuickPick 列出所有 profile。

### 🔴 五维验证

| # | 维度 | 验证方法 | 失败后果 |
|:--:|------|------|------|
| 1 | 插件加载列表 | `PluginStateService.getAll()` | "幽灵插件"——禁用后仍在运行 |
| 2 | settings 值 | `ConfigurationService.inspect(key)` | 波特率/主题仍是上一个 Profile 的值 |
| 3 | 主题 CSS 变量 | `getComputedStyle(body).getPropertyValue('--bg')` | UI 颜色半新半旧 |
| 4 | 语言 | `i18next.language` + UI 文字实际显示 | 碎片化体验 |
| 5 | 布局（标签页+工作区） | 检查 tabs[] + activeGroupId + workspace root | 标签页残留 |

**对标 VS Code：** Profile 切换失败时回退到切换前的状态——不是静默，必须 toast 报告哪个操作失败了。

---

## 二、activationEvents——按需激活

```json
{
  "name": "CAD 查看器",
  "activationEvents": ["onCommand:cad.importDxf", "onFileOpen:.dxf"]
}
```

**完整流程：**
```
用户切换到 "STM32 PID" Profile
  → Profile 声明 plugins: [terminal, card-gauge, cad, ...]

加载阶段：
  terminal → activationEvents 为空 → 启动时 import()
  card-gauge → 同上 → 启动时 import()
  cad → activationEvents: ["onFileOpen:.dxf"] → 只注册 manifest，不 import()
       → 用户双击 .dxf → 首次 import() → 注册到 Registry

多 WebView 下：
  activationEvents 触发 → 创建插件 WebContentsView → 加载 JS → React render
```

**全部 activationEvent 触发源：**

| 事件 | 触发时机 | 例子 |
|------|------|------|
| `*` | 启动时立即加载 | 欢迎页、设置页 |
| `onCommand:<commandId>` | 用户执行命令（命令面板/快捷键/右键菜单） | `onCommand:cad.importDxf` |
| `onFileOpen:<extension>` | 用户双击/打开文件 | `onFileOpen:.dxf` |
| `onPortOpen` | 串口连接建立 | 卡片插件只在有数据时才需要 |
| `onLanguage:<langId>` | 🆕 打开特定语言的文件 | `onLanguage:cpp` → 激活 C++ Language Server |
| `onView:<viewId>` | 🆕 用户展开特定视图容器 | `onView:explorer` → 激活文件树自定义扩展 |

不声明 `activationEvents` = 等同于 `"*"` = 启动时立即加载。

---

## 三、extensionDependencies

```json
{ "extensionDependencies": ["file-tree"] }
```

loader 检查：file-tree 没安装/被禁用 → 不加载 → toast "需要文件树插件"。

---

## 四、任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 43 | ProfileService——loadProfile / switchProfile + 五维验证 | ~150 | 切 Profile → 五维全过，失败回退+toast |
| 44 | activationEvents——`*` / onCommand / onFileOpen / onPortOpen / onLanguage / onView 触发 | ~60 | cad.dxf → 只注册不加载 → 双击才激活 |
| 45 | extensionDependencies——加载前检查缺失依赖 | ~40 | 缺 file-tree → toast 提示 |
| **合计** | | **~230 行** | |

---

## 五、验证标准

```
切 Profile → 五维验证全过
  插件列表正确 → 不该在的插件图标消失
  settings 正确 → 主题/语言/串口默认值全换
  布局正确 → 对应 workspace 打开

activationEvents → 按需激活
  声明 onFileOpen:.dxf 的插件 → 没开 .dxf 时不激活（Chrome DevTools 无其进程）
  打开 .dxf → 进程出现

extensionDependencies → 缺依赖时 toast + 不激活
```

---

> **← E3 索引：** `00-README.md`
> **→ 下一份：** `05-E3e-通知系统.md`
