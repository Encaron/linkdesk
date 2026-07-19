# LinkDesk — 通用调试容器

> 一个对标 VS Code 架构、但面向硬件/数据调试的通用工作台。串口是第一个数据源，不是唯一数据源。

---

## 一、这是什么

LinkDesk 是一个**通用调试容器**。它的核心管理标签页 + 卡片 + 数据管道 + 插件运行时。所有功能——终端、工作台、地图、OLED、摄像头——全部是插件。

它不是"串口助手"——它可以是 CAN 分析仪、摄像头预览器、GPS 轨迹查看器、声卡频谱仪。串口只是出厂预装的第一个数据源插件。

对标 VS Code：VS Code 不知道你是写 Python 还是 C++，LinkDesk 不知道你接的是串口还是 CAN 总线。核心只提供容器，功能全由插件定义。

---

## 二、为什么有这个软件

**前身**是 Serial Monitor V2（WPF 串口调试工具），6300 行 C#，功能僵化——面板是硬编码的，加一个新视图要改 5 个文件。

**V3 重架构**：底盘换成 Tauri v2 + React 18 + TypeScript，不只是技术升级，而是设计哲学的根本转变——**核心不预设任何功能**。对标 VS Code 的扩展系统，但应用于硬件调试领域。

核心理念：**核心无知原则**——核心不知道软件是干什么的，只定义"怎么接"不定义"接什么"。

---

## 三、架构

### 两层容器

```
外层：标签页 + 递归分屏（VS Code 编辑器组模型）
  └── 标签页拖拽/分屏/合并，keep-alive 绝对定位平铺
内层：卡片网格（Phase 5 实现）
  └── react-grid-layout 拖拽重排，workspace.json 平铺数组

硬边界：标签页系统永不 import 卡片系统，唯一接触点 = Tab.workspaceName: string
```

### 核心（不可删，~500KB）

```
核心/
├── 标签页管理器    SplitNode 树 + 平铺渲染 + 拖拽状态机 + keep-alive
├── 卡片管理器      CardRegistry + react-grid-layout（Phase 5）
├── 数据管道        RingBuffer + emit 事件 + 数据源抽象
├── 插件加载器      扫描 plugins/ → 读 plugin.json → 动态 import() 注册
├── 设置引擎        PreferenceService + prefs.json
├── 主题引擎        ThemeEngine（JSON → CSS 变量）
├── 双语引擎        i18next（动态加载语言包）
├── 插件市场 UI     浏览/搜索/安装/卸载插件
└── 图标栏框架      渲染图标按钮（哪些图标 = 插件注册的）
```

### 插件系统（6 类接口）

| 类型 | 接口 | 举例 |
|------|------|------|
| `view` | React 组件 `{ isActive: boolean }` | 终端、工作台、OLED、地图 |
| `card` | 卡片组件 `{ cardId, value }` | Gauge、Slider、Plot（Phase 5） |
| `theme` | JSON 颜色表 | Dracula、Monokai |
| `language` | JSON 翻译表 | 日本語、한국어 |
| `protocol` | `parseLine()` 函数 | 方括号协议、NMEA、SBQ |
| `resource` | 静态文件 | 文档、示例 workspace |

**插件没有 API 白名单。** 插件和核心在同一个 WebView 里运行——代码能用的 JS 库和 Web API，插件全能用。视图插件的契约只有 `{ isActive: boolean }`，之外全是标准 React 自由发挥。

### 出厂插件

| 插件 | 类型 | 可卸载？ |
|------|------|:--:|
| 终端（terminal） | view | ✅ 可卸载 |
| 工作台（workspace） | view | ✅ 可卸载 |
| 设置（settings） | view | ❌ 核心控制面 |
| 插件市场（marketplace） | view | ❌ 核心控制面 |

### 插件开发体验

一个新视图插件 = 3 个文件：

```
plugins/my-view/
├── plugin.json    → { type: "view", name: "我的视图", entry: "index.tsx" }
├── index.tsx       → export default function({ isActive }) { return <div>...</div> }
└── sidebar.tsx     → 可选侧栏组件
```

不需要脚手架、不需要 CLI、不需要注册代码。丢进 `plugins/` 文件夹 → 图标栏自动出现 → 点击即用。

---

## 四、独特之处

### 1. 核心无知原则

核心代码里没有一行提到"串口"、"嵌入式"、"MCU"。`Tab.type` 是字符串不是枚举。`PluginManifest` 不知道未来会有什么类型的插件。对标 VS Code——VS Code 核心不知道你是 Python 开发者还是 C++ 开发者。

### 2. 绝对定位平铺（keep-alive）

所有标签页内容**平级渲染**，通过 CSS `display` 切换显隐，不做条件渲染。跨组移动标签页 → 只改 CSS 位置 → React 树不变 → CM6/Monaco 编辑器状态不丢。

这是 5 次尝试（isConnected → 模块缓存 → portal ×3 → 绝对定位）才找到的解。对标 VS Code 编辑器组模型。

### 3. 递归分屏（SplitNode 树）

对标 VS Code 自由布局——支持 3-pane、2×2、左上下+右单等任意嵌套。数据模型 `SplitNode = leaf | branch(direction, [child, child], sizes)`，纯 CSS flexbox 递归渲染，零外部依赖。

### 4. 预览模式（Preview Editor）

对标 VS Code——每个编辑器组只有一个预览标签页（斜体）。单击侧栏→预览打开，点别的会替换。双击→固定，不再替换。可以定点后开第二个形成双屏对比。

### 5. 数据管道绑定模型

`cardId` 和 `sourceId` 分离——卡片不认数据源，数据源不认卡片。同一个 `cardId`（如 "temp"）绑不同 `sourceId`（COM3 vs COM4）→ 各自显示不同设备的温度。卡片晋升为独立标签页 → 自动继承 sourceId。

### 6. 插件市场 = 侧栏，不切主区

对标 VS Code Extensions 面板——点 🧩 → 侧栏切为插件列表，主区保持当前标签页不变。点某插件 → 主区新标签页打开详情。侧栏和编辑器完全解耦。

### 7. 图标栏拖拽 + 底部固定

对标 VS Code Activity Bar——顶部图标可拖拽换位，设置齿轮固定在左下角。window 级 mousemove + portal 半透明拖影跟随鼠标。

### 8. 全 CSS 变量 + 零硬编码 hex

21 个 CSS 自定义属性覆盖所有颜色。切主题 = 改 `data-theme` 一个属性。所有 UI 文字走 `t()` 国际化函数，零硬编码中文。

---

## 五、技术栈

| 层 | 技术 |
|------|------|
| 桌面框架 | Tauri v2（Rust 后端 + WebView2 前端） |
| 前端 | React 18 + TypeScript |
| 接收区 | CodeMirror 6（只读，三色行装饰系统） |
| 发送栏 | Monaco Editor（语法高亮） |
| 串口 | Rust `serialport` + tokio 异步 |
| 打包 | Vite + import.meta.glob 插件独立打包 |
| 图标 | @vscode/codicons + 自绘 SVG/PNG |
| 持久化 | Tauri fs API（文件系统）+ localStorage（浏览器 dev fallback） |

---

## 六、未来能做到的事

### Phase 5：卡片架构（即将开工）

- 卡片网格（react-grid-layout 拖拽重排）
- 仪表盘组件：Gauge、Slider、Plot、KeyPad、Switch
- `[cardId, field1, field2, ...]` → CardRegistry O(1) 路由
- unknown cardId → 自动创建通用卡片
- workspace.json 读写 + 多 workspace 切换
- V2 旧协议兼容翻译层

### Phase 6+：数据源插件

- 串口、CAN、TCP、摄像头、声卡、文件回放 → 统一 `DatasourcePlugin` 接口
- 每个标签页绑定独立数据源
- Binary 协议通过 WASM 实现
- 数据源面板（对标 VS Code 底部面板）

### AI 工作流（远期）

- AI 扫描 MCU 固件 → 发现 `[chip_temp, %f]`、`[pid_p, %f]`
- → 自动生成 workspace.json（Gauge 卡 + Slider 卡）
- → 自动生成 Profile（插件列表 + 设置 + 工作区）
- → 用户一键切换整个调试环境
- 纯文本、可版本管理、AI 可生成

### 其他

- **Git 插件**：插件市场可安装，独立调 Rust 命令执行 git，不依赖终端
- **插件社区**：在线搜索/安装/评分/评论（需服务端）
- **Profile 切换**：一键切换全套插件+主题+设置+workspace（对标 VS Code Profile）
- **个人中心**：账户同步设置（图标栏底部位置已预留）
- **iframe 沙箱**：第三方插件进程隔离（接口已留好，不需要改架构）

---

## 七、当前状态

- Phase 1-4 ✅ 全部完成（33 commits，46 bugs 修复，VS Code UX 对标）
- Phase 5 🔜 卡片架构可开工
- 分支：`phase4-plugin-system`
- 109 个单元测试全过
- 品牌：LinkDesk · 图标：NodeDesk 六边形三节点 · 色调：#0078D4
