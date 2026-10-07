# 06 · CDP 坑表（开发期实机操作）

> **什么时候读**：你要用 Chrome DevTools Protocol 驱动 LinkDesk 界面（改完 UI/CSS/交互后的实机验收、复现 bug）
> —— 这是**视觉/手势唯一允许的兜底通道**，但它有一批「看起来对、其实没生效」的坑。
> **本章只讲坑与正解**；driver 的用法、判据、门禁射程在仓内 [`scripts/dev/README.md`](https://github.com/Encaron/linkdesk/blob/electron/scripts/dev/README.md)（入库、进 git）。
>
> 🔴 **总原则**：能调命令就别派发鼠标事件（[04 章](04-手势隐藏规则.md)）；能读 DOM/契约就别截图猜。

## 一、连接与实例（先活下来）

| 症状 | 原因 | 正解 |
|:--|:--|:--|
| 连不上 / 没有可连目标 | 实例没带调试参数启动 | `LinkDesk.exe --remote-debugging-port=9222`（安装版同样有效；dev 模式的 `electron:dev` 自带 9222） |
| 用 8 字符 targetId 连不上 | WS 端点要**完整** targetId | `ws://127.0.0.1:9222/devtools/page/<完整 targetId>` |
| 读到的状态不是你以为的那一半 | **壳与池是两个独立 page target** | 明确你要读哪一份文档（壳 = 布局/通知/主题；池 = 插件视图）；**同一时刻只连一个 target** |
| 端口被占 | 上一只实例没退干净 | 先 `taskkill` 占端口的进程再起 |
| 启动即黑屏 | 环境变量污染（继承成 Node 模式） | 启动前 `unset ELECTRON_RUN_AS_NODE` |
| 🔴 「我隔离了」但真实配置被改了 | `APPDATA=<别处>` **隔离不了** Windows 上的 Electron profile（走 `SHGetKnownFolderPath`，不读该环境变量） | **唯一真隔离 = `--user-data-dir=<临时目录>`**。判据别靠猜：起完 `ls` 那个目录——**空的就说明没隔离** |
| 现场被覆写、再也复查不了 | 用真 profile 起的实例，退出时把自己的标签页状态**覆写**进 `localStorage` 的 `v3_layout` | **顺序固定**：先**只读**地把 profile 现场导出备份（连 `localStorage` 全部键一起），**再**起任何实例；必须起实例核现场时**一律一次性 `--user-data-dir`** |
| 想事后定损 | — | 在真 profile 的 `Local Storage/leveldb` 里 `grep -ac v3_layout <最新>.log`：**0 = 该次退出没重写布局键**，非 0 才是真覆写 |

## 二、触发交互（最大的坑区）

| 症状 | 原因 | 正解 |
|:--|:--|:--|
| 🔴 点了没反应（React 按钮/菜单项全失灵） | **CDP `Input.dispatchMouseEvent` 的左键 press/release 不触发 React `onClick`/`onMouseDown`**（右键 contextmenu 反而正常） | React 点击用 `el.click()` 或 `dispatchEvent(new MouseEvent("click",{bubbles:true}))`；触发 `onMouseDown` 用 `dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))`；**只有右键开菜单**才用 `Input.dispatchMouseEvent {button:'right'}` |
| 受控输入（slider / input）改不动 | React 受控组件只认**原型 setter + 原生事件** | `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'0.57')` → 再 `dispatchEvent(new Event('input',{bubbles:true}))` |
| 下拉（SelectBox）打不开 | 它开在 **`mousedown`** 而不是 `click` | 两个都发、顺序固定：`mousedown` → `click` |
| 下拉选中项**恒返回空**（误判成「没打开」） | 菜单是 **portal**，挂在包装元素**外面** | 用**全局**选择器 `.selectbox-dropdown .selectbox-item`；判开合也看 `.selectbox-dropdown` 在不在 |
| 上一轮还开着的下拉，这一轮「点开」变成关闭 | 它是 **toggle** | 写 `ensureOpen()`：已开就不点 |
| 菜单刚还开着，下一次 evaluate 里却 `items: []` | 菜单在**两次 evaluate 之间会自动关** | 开菜单与选选项**写在同一个 `Runtime.evaluate` 里**（如需等待，在同一段内 `sleep`） |
| `:hover` 面读不到变化（悬停样式像坏了） | `CSS.forcePseudoState` 对**深层既有节点只改 `matches()`、不改计算值**（自造探针却灵 ⇒ 机制没坏，是不传播） | **用真鼠标**：`Input.dispatchMouseEvent {type:'mouseMoved'}` 挪到元素中心（driver 的默认 `--mode mouse`） |
| 零差异，怀疑选择器 | `querySelector` 只取**第 1 个**命中，而第 1 个可能是特殊变体（例：`.active` 的按钮本就该不变色，且它自己的规则更靠后压掉 hover 规则） | 先数命中个数、再看是不是特殊变体（`driver` 会打印「命中 N 个」告警） |
| 拖拽 / 跨窗释放行为诡异 | 合成事件**不带 `screenX`** ⇒ 窗口屏幕原点推出错 ⇒ 「窗外」判定与跨窗命测全错 | 别重演手势——用命令替身（[04 章](04-手势隐藏规则.md) 总表） |

## 三、读界面（读 DOM / 读契约，不读截图）

| 症状 | 原因 | 正解 |
|:--|:--|:--|
| 「代码生效了吗」判不准 | **`?t=` 版本章不是新鲜度判据**——Vite 只在模块被 HMR 失效后才挂章，**刚加载的页面一个章都没有** | 用 **`performance.timeOrigin`（该文档加载时刻）vs 磁盘 mtime**；**壳/池分开判**（两份文档、两个 HMR 图）；无任何可比对 ⇒ 判 `no-evidence`，⛔ 不算过 |
| 🔴 命令报「读不到」，但表达式里明明有节点 | **ASI 陷阱**：表达式里 `return` 后换行 ⇒ 自动分号 ⇒ **静默返回 `undefined`**(语法合法，字符串自测查不出) | 页面表达式一律写成 **`(function () { return (BODY); })()`** |
| 注入的桩没被调用（计数 0） | **裸路径 import ≠ 应用加载的模块实例**（Vite 的 `?t=` 版本查询使两份实例并存） | 从运行时资源表取**应用的真实 URL** 再 import：`performance.getEntriesByType("resource")` → 找到 `/plugins/x/src/a.ts` 那一条 → `import(/* @vite-ignore */ url)`（同目录各模块 `?t=` 可能不同，逐个取） |
| 读到的「谁挡住了控件」 | — | `document.elementFromPoint(x, y)`（比截图猜快得多） |
| 主题/玻璃等生效值 | — | `getComputedStyle(document.documentElement).getPropertyValue('--css-变量')` |

## 四、打桩与环境（打不动的那些）

| 症状 | 原因 | 正解 |
|:--|:--|:--|
| 🔴 把 `window.linkdesk.configuration.get` 换成桩，**赋值静默失败**（不抛错） | **contextBridge 冻结**：描述符 `writable:false, configurable:false` | 打桩这条路作废 ⇒ **走真实配置 + 事后还原**：`await c.set(key, undefined)` 删覆盖；还原后用 `inspectConfiguration(key)` 读 `userValue`（缺失 = 从没写过）。⚠️ 别用「赋值回去再比对」判可写性——同值赋值恒成功，是假证据 |
| 桩数据没生效，界面显示真实数据 | 有 `configuration.onChange` 自动重拉的模块**抢在注入前**拉了一遍 | **先注入 IO，再改配置** |
| `await` 型 evaluate 全超时 / 性能数字离谱 | **窗口后台节流**：`visibility:hidden` ⇒ 定时器被节流到 1s（同步 evaluate 不受影响） | 先解除：`Page.setWebLifecycleState {state:'active'}` ＋ `Page.bringToFront` ＋ `Emulation.setFocusEmulationEnabled {enabled:true}`（`Emulation.setPageVisibilityOverride` 在老 Electron 上不存在） |
| 改了插件源码，界面还是旧的 | 插件视图有模块级 `_lazyCache`——**已加载的实例不会自己换** | `Page.reload`；判据**别用版本号**，用「模块图里有没有新文件 ＋ DOM 里有没有新节点」；i18n 注册在**壳侧** ⇒ 壳池都要刷 |
| reload 之后插件视图全没了（只剩欢迎页） | 隔离 profile **不恢复工作区**，硬 reload ⇒ 视图未挂载（**插件 CSS 只在挂载时注入**） | 先试 driver `open-view <pluginId>` 用图标栏开回来；**图标栏里没有的只能人工开** |
| Vite 挂了但页面还在 | 已加载文档的 CSSOM 仍可读，采集仍成立 | 重载任何文档**之前**先把 Vite 起回来（`curl localhost:1420` 返 `000` = 死了） |

## 五、副作用纪律（驱动 = 真实执行）

- 驱动走的是**真实 React/IPC 链路**（不绕过业务逻辑：关闭确认、keep-alive 面板内存保留照常执行）——
  所以它会**留痕**：改配置、切主题、开串口。**测完还原，或问用户**（还原与否由用户定）。
- **别在你正在用的实例上做**（硬 reload 会打断手上的活）——起隔离实例（§一）。
- 已知的**放大现象**（不是自动化的错）：全屏 overlay 类层（如颜色选择器的遮罩）会拦截背景控件的命中测试，
  CDP 下会先撞到它；先关掉那层再点，别把它记成「自动化失灵」。

## 六、别再一次写一次性脚本

上面这些坑**都已固化成库**：`npm run dev:driver`（`reload` / `handshake` / `snapshot` / `sections` / `layout` /
`open` / `open-view` / `collapse` / `menu` / `hover` / `states` / `decouple` / `selftest` / `eval` / `call` / `wait` / `activate`），
三层结构 = `lib/cdp.mjs`（传输）· `lib/linkdesk-driver.mjs`（语义）· `driver.mjs`（CLI），**零第三方依赖**。
用法与判据：仓内 [`scripts/dev/README.md`](https://github.com/Encaron/linkdesk/blob/electron/scripts/dev/README.md)。
