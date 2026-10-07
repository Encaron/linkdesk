# 02 · 命令与 API 全索引

> 本章有**两段机器生成区**（`<!-- BEGIN/END … -->` 之间）——⛔ 别手改那两段，改了会被门禁判红。
> · 刷新：`npm run manual:build`　· 校验：`npm run check`（其中 `vitest run` 跑 `src/core/commands/aiManualIndex.test.ts`）
> · 数据源：命令 = **壳命令注册表**（`src/core/commands/**` 的注册元数据，经 `getCommands()`）｜API = **`contracts/linkdesk.d.ts`**
> · 为什么生成：手抄清单必然漂移（本仓实证：`命名空间矩阵.md` 手维护、停更一个月后自称 40 个命名空间实为 45）。
> 手册是**零源码环境的 AI 唯一读物**（随包发货）——它写错一个参数，AI 就照着调错，且没有东西会叫醒。

## 一、怎么用这份索引

1. **找命令**：§二 按分类列全，`when 门控`列写明「什么条件下它才会出现」。
2. **看参数**：`参数（调用实参）`列就是**调用实参**——逐位对应 handler 形参（元数据出处 = 壳命令注册表的 `description`/`params`）。
   **两种写法等价**（`params` 的名字在执行面上真的可用——壳侧按声明顺序展开）：

   ```js
   // ① 逐位平铺：「参数（调用实参）」列怎么写就怎么传
   await linkdesk.commands.executeCommand("workbench.action.togglePanelViewVisibility", undefined,
     "panel-container-id", "serial-monitor.view");
   // ② 一个具名对象（键名照那几列的参数名）——与 ① 等价
   await linkdesk.commands.executeCommand("workbench.action.togglePanelViewVisibility", undefined,
     { containerId: "panel-container-id", viewId: "serial-monitor.view" });
   ```

   ⚠️ 只有 1 个参数的命令**不展开**——那个对象本身就是它要的实参（如 `workbench.action.toggleViewVisibility` 的 `{ viewId: "x" }`），照「参数（调用实参）」列原样传。
3. **调一条命令**（在**池窗口**的 `window.linkdesk` 上——池 = 执行真相源，见 [01-操作路径总览](01-操作路径总览.md)）：

   ```js
   await linkdesk.commands.executeCommand("core.closeTab", undefined, { tabId: "tab-1" });
   ```

   🔴 **开头那个 `undefined` 不能省**：壳侧签名是 `executeCommand(id, token, ...realArgs)`，第一位是
   `CancellationToken` 占位，池侧 preload 会剥掉它再转发（`electron/preload-pool/commands.ts:134-141`）。
   **漏了它 ⇒ 壳命令静默无效**——不报错、什么也不发生（你的参数会被当成 token 吃掉）。
   插件（池内）命令不吃这一位，但带上也无害 ⇒ **一律带上**。
4. **查插件命令**（不在 §二 表里——数量随装的插件而变）：

   ```js
   await linkdesk.commands.getCommands();   // 全量：id / title / category / when / description / params
   ```

   表里每条的 `description`/`params` 与这里返回的是同一份（元数据只做加法，进契约）。

   ⚠️ **视图态命令不在这份快照里**：插件可以把命令注册在**视图挂载时**（`mount` 里 `registerCommand`）⇒
   没开过那个视图，`getCommands()` 里就没有它。门② 在插件内 ⇒ 先 `tabs.create(pluginId)` 再读；
   门③（外面接进来的 AI）另有一条**声明面**：`describe` 的 `commandsPending` 会列出「插件清单里声明了、
   运行期还没注册」的命令，每条带 `needs`（照做的那一步，如 `先 open-tab <插件 id>`），
   且 `open-tab` 返回时命令面**已经落定**（本次新挂牌的 id 在它的 `added` 里）。

## 二、宿主命令

<!-- BEGIN COMMAND-INDEX -->

**宿主命令 97 条 / 8 个分类**——插件命令不在本表（运行时用 `getCommands()` 查）。

### 帮助（7）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `app.about` | 关于 LinkDesk | 打开（或聚焦）关于标签页，查看版本与运行环境信息 | —— | —— |
| `app.openAiManual` | AI 操作手册 | 打开（或聚焦）AI 操作手册标签页：命令面、契约 API 与按任务操作的配方 | —— | —— |
| `app.openWelcome` | 欢迎页 | 打开（或聚焦）欢迎标签页——开始、最近文件夹、帮助入口都在这里 | —— | —— |
| `app.viewLicense` | 查看许可证 | 在系统浏览器中打开许可证全文 | —— | —— |
| `update.checkForUpdates` | 检查更新… | 手动检查主软件更新（无更新与失败都会落一条通知） | —— | —— |
| `update.openReleaseNotes` | 显示发行说明 | 打开（或聚焦）发行说明标签页，查看历史版本的更新内容 | —— | —— |
| `update.openUpdateFlow` | 处理更新 | 按当前更新状态处理更新：有新版本则开始下载，已下载则重启并安装 | —— | —— |

### 开发人员（1）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `workbench.action.togglePluginDevTools` | 切换开发人员工具 | 打开开发者工具（先选壳窗口还是池窗口） | —— | —— |

### 文件（2）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `workbench.action.exportWorkspace` | 导出工作区 | 把当前布局与用户设置导出为工作区文件下载到本地 | —— | —— |
| `workbench.action.importWorkspace` | 导入工作区 | 从工作区文件恢复布局与用户设置 | —— | —— |

### 标签页（18）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `core.closeAllEditors` | 关闭所有编辑器 | 关闭全部分组里的所有编辑器标签页 | —— | —— |
| `core.closeAllTabs` | 关闭全部 | 关闭指定分组内的全部标签页 | `ctx`: object 必填 — { groupId: string }——要清空的分组 id | —— |
| `core.closeOtherTabs` | 关闭其他 | 关闭同分组中除指定标签页以外的全部标签页 | `ctx`: object 必填 — { tabId: string }——基准标签页 id（它的同组兄弟被关闭） | —— |
| `core.closeRightTabs` | 关闭右侧 | 关闭同分组中指定标签页右侧的全部标签页 | `ctx`: object 必填 — { tabId: string }——基准标签页 id（它右侧的兄弟被关闭） | —— |
| `core.closeTab` | 关闭 | 关闭指定标签页 | `ctx`: object 必填 — { tabId: string }——要关闭的标签页 id | —— |
| `core.duplicateTab` | 复制标签页 | 在指定标签页所在分组复制一条同内容的标签页 | `ctx`: object 必填 — { tabId: string }——要复制的标签页 id | —— |
| `core.mergeBackToMain` | 并回主窗口 | 把脱出窗口中的指定标签页并回主窗口 | `ctx`: object 必填 — { tabId: string }——要并回主窗口的标签页 id | —— |
| `core.openInNewWindow` | 在新窗口中打开 | 把指定标签页拖出为独立窗口 | `ctx`: object 必填 — { tabId: string }——要拖出的标签页 id | —— |
| `core.splitDown` | 向下分屏 | 把指定标签页所在分组上下分屏（新分组在下） | `ctx`: object 必填 — { tabId: string }——要分屏的标签页 id | —— |
| `core.splitRight` | 向右分屏 | 把指定标签页所在分组左右分屏（新分组在右） | `ctx`: object 必填 — { tabId: string }——要分屏的标签页 id | —— |
| `core.togglePin` | 固定/取消固定 | 固定或取消固定指定标签页（固定后不随批量关闭被关掉） | `ctx`: object 必填 — { tabId: string }——要固定/取消固定的标签页 id | —— |
| `workbench.action.closeActiveTab` | 关闭标签页 | 关闭当前窗口的活动标签页 | `ctx`: object 可选 — { sourceWindowId: string }——发起操作的窗口 id（多窗键盘路由用，省略 = 主窗口） | —— |
| `workbench.action.focusNthTab` | 跳转到标签页 | 聚焦同分组中的第 n 个标签页 | `ctx`: object 必填 — { n: number }——目标标签页序号（从 1 起） | —— |
| `workbench.action.nextTab` | 下一个标签页 | 聚焦同分组中的下一个标签页 | `ctx`: object 可选 — { shift: boolean }——true 则聚焦上一个，省略/false 聚焦下一个 | —— |
| `workbench.action.reopenClosedEditor` | 重新打开已关闭的编辑器 | 撤销关闭：重新打开最近关闭的标签页 | —— | —— |
| `workbench.action.resetSplitSizes` | 重置分屏比例 | 把所有分屏分支的比例恢复成均分（50/50）；未分屏时无效果 | —— | —— |
| `workbench.action.setSplitSizes` | 设置分屏比例 | 把某条分屏分支的比例设成指定值（如 [70, 30]）；未分屏或分支找不到时回 noop 与 reason | `anchorGroupId`: string 可选 — 定位分支：该分支下任一叶子组 id（与 branchIndex 二选一；同给则 branchIndex 优先）<br>`sizes`: object 必填 — [number, number]——两侧比例，两个正数（如 [70, 30]）；是二元数组，不是对象<br>`branchIndex`: number 可选 — 精确定位分支：1 起、先序计数（鼠标拖拽同款；一般用 anchorGroupId 即可） | —— |
| `workbench.action.toggleSplit` | 切换分屏 | 在当前分组上切换分屏（分屏 ↔ 合并） | —— | —— |

### 编辑器（1）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `workbench.action.openWith` | 打开方式… | 为指定文件（uri）或文件类型（ext）选择打开方式——面板居中弹出；右键入口传 anchor 则就近弹出 | `request`: object 必填 — OpenWithRequest——{ uri?; name?; ext?; anchor? }，uri 与 ext 至少给一个（类型见 @linkdesk/contracts） | —— |

### 视图（30）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `core.openSettings` | 设置 | 打开设置页（已有设置标签页/悬浮面板则聚焦它，不重复开） | `ctx`: object 可选 — { pluginId: string; scrollTo: string }——pluginId 定位到该插件的设置分组，scrollTo 滚动到指定设置项 | —— |
| `view.zoomIn` | 放大 | 放大界面（窗口缩放级别 +1，上限 8） | —— | —— |
| `view.zoomOut` | 缩小 | 缩小界面（窗口缩放级别 -1，下限 -8） | —— | —— |
| `view.zoomReset` | 重置缩放 | 把界面缩放恢复为 100% | —— | —— |
| `workbench.action.alignPanelCenter` | 面板居中对齐 | 把面板内容居中对齐（已是该对齐则无动作） | —— | —— |
| `workbench.action.alignPanelJustify` | 面板两端对齐 | 把面板内容两端对齐（已是该对齐则无动作） | —— | —— |
| `workbench.action.alignPanelLeft` | 面板左对齐 | 把面板内容左对齐（已是该对齐则无动作） | —— | —— |
| `workbench.action.alignPanelRight` | 面板右对齐 | 把面板内容右对齐（已是该对齐则无动作） | —— | —— |
| `workbench.action.getFloatingPanelBounds` | 读取悬浮面板位置与大小 | 返回悬浮面板当前几何（含 viewId/pluginId/最大化态）；无面板时返回 null | —— | —— |
| `workbench.action.getLayout` | 读取布局 | 读当前布局：窗口容器尺寸 ＋ 侧栏（显隐／宽／贴边／边界）＋ 面板（显隐／激活视图／高宽／贴边／对齐／边界）。⛔ 分屏比例不在此重复报——tabs 操作里每个分组的 root.sizes 就是它 | —— | —— |
| `workbench.action.listViews` | 列出容器与视图 | 列出全部容器与其中的视图（各自归属哪个插件、可见／折叠态）。这是注册面（有哪些）；「此刻屏幕上开着哪些」看 workbench.action.getLayout | —— | —— |
| `workbench.action.positionPanelBottom` | 面板移到底部 | 把底部面板停靠到窗口底部（已在该侧则无动作） | —— | —— |
| `workbench.action.positionPanelLeft` | 面板移到左侧 | 把底部面板停靠到窗口左侧（已在该侧则无动作） | —— | —— |
| `workbench.action.positionPanelRight` | 面板移到右侧 | 把底部面板停靠到窗口右侧（已在该侧则无动作） | —— | —— |
| `workbench.action.positionPanelTop` | 面板移到顶部 | 把底部面板停靠到窗口顶部（已在该侧则无动作） | —— | —— |
| `workbench.action.resetContainerPosition` | 重置位置 | 把指定视图容器重置回默认位置 | `ctx`: object 必填 — { containerId: string }——目标容器 id | —— |
| `workbench.action.resetFloatingPanelBounds` | 重置悬浮面板位置与大小 | 把悬浮面板恢复成默认居中大卡（等价于从未拖拽/调高过） | —— | —— |
| `workbench.action.resetPanelSize` | 重置面板尺寸 | 把面板尺寸恢复成默认值（横带高 220px / 竖条宽 300px） | —— | —— |
| `workbench.action.resetSidebarWidth` | 重置侧栏宽度 | 把主侧栏宽度恢复成默认值（280px） | —— | —— |
| `workbench.action.revealFloatingPanel` | 在悬浮面板中打开 | 把指定视图作为悬浮面板打开（已开同名面板则关闭） | `viewId`: string 必填 — 目标视图 id<br>`pluginId`: string 可选 — 声明该视图的插件 id——同名 viewId 并存时用于消歧，省略 = 按 viewId 裸扫声明 | —— |
| `workbench.action.setFloatingPanelBounds` | 设置悬浮面板位置与大小 | 精确设定悬浮面板的顶边/左边/宽/高（px，省略的字段保持现值；越界值按拖拽同一套边界钳制） | `top`: number 可选 — 顶边距窗口顶部的像素值<br>`left`: number 可选 — 左边距窗口左侧的像素值<br>`width`: number 可选 — 面板宽度（px，上限 = 窗口宽 - 12）<br>`height`: number 可选 — 面板高度（px，下限 300 / 上限 = 窗口高 - 80） | —— |
| `workbench.action.setPanelSize` | 设置面板尺寸 | 精确设定底部面板尺寸（px）——按面板当前停靠边自动走宽轴或高轴；越界值按拖拽同一套边界钳制 | `size`: number 必填 — 面板尺寸（px；横带 = 高，竖条 = 宽） | —— |
| `workbench.action.setSidebarWidth` | 设置侧栏宽度 | 精确设定主侧栏宽度（px）——越界值按拖拽同一套边界钳制（170–600） | `width`: number 必填 — 侧栏宽度（px，钳到 170–600） | —— |
| `workbench.action.showCommands` | 命令面板 | 打开命令面板，搜索并运行任意命令 | —— | —— |
| `workbench.action.toggleContainerCollapse` | 折叠 | 折叠/展开指定视图容器 | `ctx`: object 必填 — { containerId: string }——目标容器 id | —— |
| `workbench.action.togglePanel` | 切换底部面板可见性 | 显示/隐藏底部面板 | —— | —— |
| `workbench.action.togglePanelViewVisibility` | 切换面板视图可见性 | 显示/隐藏底部面板中的指定视图 | `containerId`: string 必填 — 视图所在容器 id<br>`viewId`: string 必填 — 目标视图 id | —— |
| `workbench.action.toggleSidebarPosition` | 切换侧栏位置 | 把主侧栏换到对侧（左 ↔ 右） | —— | —— |
| `workbench.action.toggleSidebarVisibility` | 切换侧栏可见性 | 显示/隐藏主侧栏 | —— | —— |
| `workbench.action.toggleViewVisibility` | 切换视图可见性 | 显示/隐藏指定视图 | `ctx`: object 必填 — { viewId: string; containerId?: string }——目标视图 id，containerId 用于同 viewId 消歧 | —— |

### 首选项（32）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `aiBridge.cliInstall` | 查看安装说明 | 打开 CLI 安装说明对话框（linkdeskctl 怎么装、PATH 怎么配） | —— | —— |
| `aiBridge.copyCliLine` | 复制这句话 | 复制一段可直接贴给终端型 AI 的话（含 linkdeskctl --help 指引）到剪贴板 | —— | —— |
| `aiBridge.copyMcpConfig` | 复制 MCP 配置 | 复制 MCP 客户端配置片段到剪贴板（与 linkdeskctl mcp config --for 同一生成器，逐字一致） | —— | —— |
| `aiBridge.mcpDetails` | 打开通道详情 | 打开通道详情对话框（连接地址、凭据存放位置、连不上的原因对照） | —— | —— |
| `aiBridge.openLog` | 查看日志 | 打开操作日志对话框（谁在何时调了什么、结果如何；被拒的调用也在账上） | —— | —— |
| `aiBridge.openScopeList` | 查看完整操作清单 | 打开完整操作清单对话框（每条白名单能力一条，写明怎么调；条数 = 白名单条数） | —— | —— |
| `aiBridge.openSensitiveManager` | 管理敏感能力细分 | 打开敏感能力细分说明（首版粒度 = 总开关＋白名单整组，装/卸插件每次确认） | —— | —— |
| `aiBridge.regenerateToken` | 重新生成凭据 | 重新生成 AI 接入凭据（旧凭据立即失效；明文不显示，客户端重读 ai-bridge.token 接上） | —— | —— |
| `aiBridge.scopeSummary` | 开放范围明细 | 开放范围只读明细（只读数据源：读/做两栏从白名单 kind 派生，与 linkdeskctl --help 同源） | —— | —— |
| `aiBridge.statusAuditLog` | 操作日志状态 | 操作日志落盘开关状态（只读数据源，跟随 ai.auditLog.enabled 配置值） | —— | —— |
| `aiBridge.statusCli` | CLI 通道状态 | CLI 通道实时状态（只读数据源：CLI 与 MCP 共用同一个内核监听，状态同源） | —— | —— |
| `aiBridge.statusDebug` | 调试端口状态 | CDP 调试端口实况（只读数据源：argv 是唯一真相，与命令行实况一致不猜） | —— | —— |
| `aiBridge.statusMcp` | MCP 通道状态 | MCP 通道实时状态（只读数据源：返回「运行中 · 地址」等状态文本，供设置页状态行取用） | —— | —— |
| `core.resetSettingsToBuiltin` | 回退内置设置页 | 把设置槽的激活套回退到内置设置页（= 声明 factoryRole:"settings" 的注册序首声明）并落盘，重启保持——第三方设置页崩了/打不开时的逃生舱；已经是内置套时如实报 noop，⛔ 不假装切了一次 | —— | —— |
| `storage.cacheDirStatus` | 缓存目录 | 当前生效的缓存目录路径（只读数据源，供设置页状态行取用） | —— | —— |
| `storage.openCacheDir` | 打开缓存目录 | 在系统资源管理器中打开当前生效的缓存目录（目录不存在时先建再开） | —— | —— |
| `theme.pick` | 选择主题 | 打开主题选择器切换当前主题 | `ctx`: object 可选 — { pluginId: string }——只列该插件提供的主题，省略 = 列全部主题 | —— |
| `theme.resetAppearance` | 复位外观覆盖… | 把外观模式复位为跟随主题，并清掉全部外观覆盖 | —— | —— |
| `theme.resetMix` | 复位为整体配方… | 把混搭（分区外观）的各来源复位为跟随主题，保持自定义模式 | —— | —— |
| `workbench.action.clearConfiguration` | 清除配置项覆盖 | 删掉一个配置键的用户覆盖（user scope）——回到该键的默认值，是 workbench.action.setConfiguration 的反动作；同样按声明面校验（未声明／ai.* 禁写／显示槽一律拒），回执带清掉前后的值与本次顺带… | `key`: string 必填 — 配置键，如 app.glassBlur（键名清单：workbench.action.listConfigurations） | —— |
| `workbench.action.copySettingAsJson` | 复制为 JSON | 把指定设置项的当前值以 JSON 复制到剪贴板 | `ctx`: object 必填 — { settingKey: string }——目标设置项 id | —— |
| `workbench.action.copySettingId` | 复制设置 ID | 把指定设置项的 id 复制到剪贴板 | `ctx`: object 必填 — { settingKey: string }——目标设置项 id | —— |
| `workbench.action.copySettingName` | 复制设置名称 | 把指定设置项的显示名称复制到剪贴板（当前界面语言） | `ctx`: object 必填 — { settingKey: string }——目标设置项 id | `settingHasTitle` |
| `workbench.action.followTheme` | 跟随主题 | 取消指定设置项的用户覆盖，让它重新跟随当前主题 | `ctx`: object 必填 — { settingKey: string }——目标设置项 id | `settingFollowTheme` |
| `workbench.action.getConfiguration` | 读取配置项 | 读一个配置键的值与来源分层（schema 默认／用户／工作区／生效值 ＋ declared 判定）——⛔ 不用去翻 settings.json；键名清单看 workbench.action.listConfigurations | `key`: string 必填 — 配置键，如 app.theme（键名清单：workbench.action.listConfigurations） | —— |
| `workbench.action.listConfigurations` | 列出全部配置项 | 列出全部已注册配置键（按插件分组：类型／默认／枚举／说明 ＋ 该键**有没有被用户改过**：userValue／overridden）——不知道键名时先读这个，再去 workbench.action.getConfiguration 取分… | —— | —— |
| `workbench.action.listOverrides` | 列出被改过的配置项 | 只列**有用户覆盖（user scope）或工作区覆盖**的配置键及其值——无覆盖的键不进结果，空表 = 谁都没被改过。问「哪些键被改过／我上一笔动了什么」用这一条，⛔ 不必逐键 getConfiguration、也不必拉全量 listC… | —— | —— |
| `workbench.action.openAppearanceStorage` | 打开存储位置 | 在系统资源管理器中打开外观存储目录（背景图存放处） | `ctx`: object 必填 — { settingKey: string }——目标设置项 id（仅 app.backgroundImage / app.zoneBackgroundImage 会出现本命令） | `settingKey == 'app.backgroundImage' \|\| settingKey == 'app.zoneBackgroundImage'` |
| `workbench.action.openKeybindingsSettings` | 打开键盘快捷方式 | 打开键盘快捷方式设置页 | —— | —— |
| `workbench.action.resetSetting` | 重置此设置 | 把指定设置项重置为默认值（先弹确认框） | `ctx`: object 必填 — { settingKey: string }——目标设置项 id | `settingResetsToDefault \|\| (settingModified && !settingFollowTheme)` |
| `workbench.action.selectLanguage` | 选择语言 | 打开语言选择器切换界面语言 | —— | —— |
| `workbench.action.setConfiguration` | 写入配置项 | 写一个配置键的用户值（user scope）——先按声明面校验（键是否声明／类型／枚举／上下界／是否显示槽／是否 ai.* 禁写），写完当场回读，回执带写入前后值。⛔ 它不替你想「该写什么值」：键名与默认值看 workbench.acti… | `ctx`: object 必填 — { key: string; value: unknown }——value 按该键声明类型给（字符串/数字/布尔/数组/对象直接给，⛔ 不必包成对象）；也可逐位写成 ("键名", 值) | —— |

### （未分类）（6）

| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |
|:--|:--|:--|:--|:--|
| `app.aboutCopy` | About: Copy | 把关于页的全部字段以 key: value 多行文本复制到剪贴板 | —— | `false` |
| `quickpick.show` | QuickPick | 弹出选择列表让用户选一项，并把选中项返回给调用方（取消返回 undefined） | `options`: object 必填 — { title?: string; items: { label: string; description?: string }[] }——候选列表与浮层标题 | `false` |
| `update.releaseNotesDismissBanner` | Release Notes: Dismiss Banner | 收掉发行说明横幅（只关横幅，不记已读版本） | —— | `false` |
| `update.releaseNotesRefresh` | Release Notes: Refresh | 绕过 24 小时缓存重新拉取发行说明列表（保持当前所选版本） | —— | `false` |
| `update.releaseNotesRetry` | Release Notes: Retry | 重新加载当前所选版本的发行说明 | —— | `false` |
| `update.releaseNotesSelect` | Release Notes: Select Version | 把发行说明正文切换到指定版本 | `version`: string 必填 — 版本号（不带 v 前缀，如 0.2.21） | `false` |

<!-- END COMMAND-INDEX -->

## 三、API 面

<!-- BEGIN API-INDEX -->

**16 个域接口 → 47 个命名空间 / 260 个方法**；调用一律 `window.linkdesk.<命名空间>.<方法>`。

| 命名空间 | 域接口 | 方法数 | 方法 | 一句话 |
|:--|:--|:--:|:--|:--|
| `app` | AppAPI | 1 | `getVersion` | The app namespace — read-only product identity. The only runtime source of the version number = main-process app.getVer… |
| `appearance` | AppearanceAPI | 2 | `importImage` `revealStorage` | appearance assets — locally picked images are copied into managed storage (controlled source — user-chosen paths cannot… |
| `bridge` ⚠️ | ShellAPI | 4 | `onRequest` `respond` `broadcast` `notifyConfigChanged` | Shell↔plugin communication relay — shell preload only |
| `clipboard` | DataAPI | 3 | `readText` `writeText` `writeFileList` | Clipboard — read/write the system clipboard |
| `commands` | CommandsAPI | 5 | `execute` `executeCommand` `registerCommand` `unregisterCommands` `getCommands` | Commands — modeled after VS Code vscode.commands |
| `config` | CommandsAPI | 15 | （`@deprecated` 别名 → `configuration`，方法面同上） | @deprecated — backward-compatibility alias; use configuration in new code |
| `configuration` | CommandsAPI | 15 | `get` `set` `getSchema` `onChange` `getConfigurationContributions` `inspectConfiguration` `getUserSettings` `onDidChangeConfiguration` `onPluginLifecycleChange` `consumeSettingsGroup` `onRequestSettingsGroup` `consumeScrollToSetting` `onRequestScrollToSetting` `consumeOpenKeybindings` `onRequestOpenKeybindings` | Configuration — the new name — modeled after VS Code vscode.workspace.getConfiguration |
| `contextKey` | UiAPI | 1 | `set` | ContextKey — plugins SET state for the shell's when clauses to read |
| `decorations` | EditorAPI | 4 | `registerProvider` `unregisterProvider` `getDecoration` `onDidChange` | file decorations — a local in-pool registry (zero IPC). Shape modeled after contract §3.24 |
| `dialog` | UiAPI | 5 | `confirm` `alert` `open` `openFile` `confirmContent` | Dialogs — confirm/alert/file selection |
| `dialogHost` | UiAPI | 5 | `onShow` `current` `pending` `confirm` `cancel` | Dialog dumb-render subscription — consumed by the pool's DialogHost (the shell preload has no such surface). Named dial… |
| `encoding` | WorkspaceAPI | 4 | `detect` `decode` `encode` `isBinary` | encoding detection/conversion (main-process EncodingService) |
| `env` | WorkspaceAPI | 1 | `get` | Environment info — modeled after VS Code ExtensionContext |
| `events` | DataAPI | 4 | `on` `emit` `heartbeat`° `notifyTheme`° | Generic event subscribe + publish — the inter-plugin data pipeline. channel is a free-form string; payloads are typed p… |
| `factorySlots` | FactorySlotsAPI | 4 | `listRoles` `list` `getActive` `setActive` | —— |
| `fileAssociation` | EditorAPI | 4 | `getPluginFor` `listHandlersFor` `setDefault` `setDefaultBulk` | file associations — extension→plugin ID (answered directly by the main-process FileAssociationService). |
| `filesystem` | WorkspaceAPI | 12 | `readTextFile` `writeTextFile` `exists` `createDir` `copy` `rename` `remove` `listDir` `readBinaryFile` `writeBinaryFile` `watch` `readdir`° | Filesystem — plugin read/write (path validation is performed by the main process) |
| `floatingPanelHost` | UiAPI | 4 | `onShow` `action` `registerBoundsHost` `getBounds` | (type B): floating panel dumb-render subscription — consumed by the pool's FloatingPanelHost (the shell preload has no … |
| `getFilePath` | ShellAPI | 0 | （顶层函数）`getFilePath: (file: File) => string;` | Get the paths of files dragged in from the OS — injected on both ends |
| `hotExit` ⚠️ | ShellAPI | 3 | `save` `load` `clear` | Hot exit staging — persists unsaved editor content to disk (). `?`: pool-side only (the shell preload does not inject i… |
| `keybindings` | KeybindingsAPI | 13 | `getKeybindings` `getConflicts` `registerKeybinding` `saveUserKeybindings` `removeKeybindingForCommand` `resetKeybindingToDefault` `clearKeybindingForCommand` `findKeybindingForCommand` `setKeybindingCaptureActive` `keyboardEventToKeyString` `onChange` `syncToMainProcess`° `onForwardedEvent`° | —— |
| `langDef` | EditorAPI | 1 | `get` | langDef — language definition registry (answered directly by the main process). Returns only serializable fields (monar… |
| `language` | AppearanceAPI | 5 | `getCurrent` `getAvailable` `set` `getInitial` `onChange` | —— |
| `lsp` | EditorAPI | 4 | `spawn` `write` `dispose` `onData` | LSP bridge — autocompletion/F12/diagnostics/rename |
| `menu` | UiAPI | 2 | `registerItems` `getItems` | Menus — declarative read/write for plugins |
| `notifications` | UiAPI | 3 | `show` `list` `subscribe` | Notifications — plugins raise notifications ( the only notification surface is the bell-wide notification panel; the bo… |
| `p2p` | DataAPI | 2 | `send` `on` | p2p targeted inter-plugin push — same pattern as bridge.broadcast (fire-and-forget) |
| `panel` | PanelAPI | 3 | `reveal` `revealFloating` `setFloatingBounds` | —— |
| `path` | WorkspaceAPI | 6 | `appDataDir`° `normalize` `join` `basename` `dirname` `extname` | Path utilities — injected on both shell/pool ends (in-pool plugins such as editor/file-tree consume normalize/join etc.… |
| `pluginManager` | PluginsAPI | 13 | `list` `enable` `disable` `uninstall` `install` `installWithProgress`° `reinstall` `getDisabled` `getUninstalled` `isDisabled` `update`° `checkUpdates`° `notifyManifestChanged`° | Plugin management — bridges IpcBridgeHandler → loader functions. Pool-authoritative (consumed by marketplace plugins), … |
| `pluginState` | DataAPI | 3 | `get` `set` `onChange` | plugin persistent storage — centralized cache + file persistence |
| `plugins` | PluginsAPI | 14 | `resolvePath` `resolveEntry`° `getCompatibility`° `listDirs`° `listAll`° `listDisabledDirs`° `readManifest`° `readAllManifests`° `packageDownload`° `packageExtract`° `packageCancel`° `packageUpdateCheck`° `packageStageUpdate`° `packageCommitUpdate`° | Plugin discovery — injected on both ends: resolvePath exists identically on both; the read surface (listDirs/listAll/re… |
| `pool` | ShellAPI | 32 | `pushLayout` `onReady` `toggleDevTools` `onSidebarAction` `onTabAction` `onTabBarRects` `onDragPosition` `pushAdsorbHint` `onAdsorbIndex` `pushQuickPick` `onQuickPickAction` `pushDialog` `onDialogAction` `pushFloatingPanel` `onFloatingPanelAction` `onMemoryPressure` `createWindow` `closeWindow` `onWindowClosed` `onWindowBoundsChanged` `getLayout` `onLayout` `ready` `sidebarAction` `tabAction` `tabBarRects` `dragPosition` `onAdsorbHint` `adsorbIndex` `registerBeforeClose` `unregisterBeforeClose` `beforeClose` | Pool control — shell preload: pushes layout + registers pool→shell action callbacks; pool preload: receives layout + se… |
| `protocol` | EditorAPI | 3 | `listProtocols` `getActiveProtocolId` `setActiveProtocolId` | protocol — protocol registry (answered directly by the main process). parseLine/detect are stripped before returning (J… |
| `quickPick` | UiAPI | 1 | `show` | plugin quickPick picker — local bridge inside the pool (zero IPC, rendered by QuickPickHost). A settle of null → undefi… |
| `quickPickHost` | UiAPI | 6 | `registerHost` `onShow` `select` `highlight` `close` `itemAction` | QuickPick host rendering bridge — consumed by the pool's QuickPickHost (the shell preload has no such surface) |
| `search` | WorkspaceAPI | 1 | `searchFiles` | file search — full-text search/replace (executed via IPC in the shell/main process) |
| `serial` | DataAPI | 11 | `listPorts` `getStatus` `openPort` `closePort` `sendData` `sendText` `setDtr` `setRts` `onData` `onStats` `onSystem` | Serial — read/write/listen, modeled after VS Code SerialPort API |
| `settings` | SettingsAPI | 3 | `list` `getActive` `setActive` | —— |
| `shell` | ShellAPI | 7 | `showItemInFolder` `openInTerminal` `pluginLocation` `openPluginFolder` `startDrag` `relaunch`° `openExternal` | Shell-level commands — revealInOS / openInTerminal / startDrag / relaunch, injected on both ends |
| `storage` ⚠️ | StorageAPI | 2 | `revealCache` `cacheDir` | —— |
| `tabs` | TabsAPI | 9 | `create` `openOrFocus` `focus` `close` `focusBySourceId` `updateLabelBySourceId` `closeBySourceId` `onDidChangeActiveTab` `list` | —— |
| `theme` | AppearanceAPI | 11 | `getCurrent` `getAvailable` `apply` `listRecipes` `getActive` `getEffectiveTokens` `setRecipe` `setColorway` `resetAppearance` `resetMix` `getBaselineSeeds` | —— |
| `update` | UpdateAPI | 1 | `getState` | The update namespace — read-only update state (for "About"-type plugins to read the host version/update state). |
| `viewContainer` | EditorAPI | 4 | `getViewContainer` `getViews` `getView` `registerView` | viewContainer — real IPC query/update (asks the shell-side registry). The DTO contains only serializable public fields |
| `window` | ShellAPI | 11 | `minimize` `maximize` `unmaximize` `close` `setZoom` `toggleDevTools` `isMaximized` `onMaximizeChange` `setAlwaysOnTop` `isAlwaysOnTop` `onAlwaysOnTopChange` | Window control — TitleBar button mapping, injected on both ends (11 methods on one channel, shared module electron/wind… |
| `workspace` | WorkspaceAPI | 8 | `getFolders` `getActive` `setActive` `openFolder` `addFolder` `removeFolder` `onDidChangeFolders` `onDidChangeActiveWorkspace` | Workspace — injected by the pool preload (the shell side uses WorkspaceService directly). Pool-authoritative namespace … |

⚠️ = 契约里的**可选命名空间**（只在一侧 preload 注入）：`bridge` `hotExit` `storage`——用前先判存在，另一侧是 `undefined`。
° = 契约标 `?` 的成员：只在一侧 preload 注入（几乎都是壳侧独有）。**插件跑在池侧** ⇒ 调用前先判存在。

<!-- END API-INDEX -->

## 四、这两张表与既有清单的关系（⛔ 别拉第三份）

| 表 | 数据源 | 与别处的关系 |
|:--|:--|:--|
| §二 宿主命令 | 壳命令注册表（`getCommands()`） | 运行时的同一份：表里没有的宿主命令 = 今天真的没有 |
| §三 API 面 | `contracts/linkdesk.d.ts` | 与 `@linkdesk/plugin-sdk` README 的速查表**同源同规**（那份由 `scripts/generate-api-cheatsheet.mjs` 生成）；两处各存一份只因**载体不同**（本手册随安装包发货，npm README 不随包） |

⚠️ 本节两张表都**不包含**：插件自己注册的命令（运行时才知道），以及 CLI/MCP 通道——
那是**软件外**的入口（接入方式见手册第 07 章）。
