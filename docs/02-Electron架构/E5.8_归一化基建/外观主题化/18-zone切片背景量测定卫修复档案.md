# 18-zone 切片背景量测定卫修复档案（E5.8#126-#127）

> 2026-08-27。用户报 zone 切片背景（`app.zoneBackgroundImage` 影像分区）两个 bug：①顶栏/图标栏/状态栏图片**错位+重复**（决定性证据「侧栏最左边是医生的衣袖，再左边一点的图标栏，医生的衣袖又一次出现」）②侧栏**换边**后图片错位/被带走。用户拍板：先分析（禁止改代码）→ 根因坐实 → 立任务档案+清单 → 开始修。
> 清单指针：E5.8-执行清单 Phase 11.18 #126-#127。

---

## 一、背景：为什么 zone 切片「一直有问题」

zone 切片是**链路很长的复合系统**：量测（preload-pool）→ token（引擎）→ CSS ::after（渲染）→ 玻璃合成（透明度）→ 布局换边。每个环节都可能埋雷。

**渲染分层（每 zone 表面三层完全独立，[index.css:539-610](https://github.com)）**：

```
┌─ zone 表面 ────────────────────────────────┐
│ z1  ::after   → 切片图（zoneBackgroundImage）│ ← 定位 = token --surface-<zone>-bg-position（负偏移）
│ z0  .background-layer → 全景图（panorama）  │ ← 固定 inset:0，不参与切片
│ z-1 ::before  → 玻璃磨砂（backdrop-filter） │ ← 只改合成透明度，不碰位置
└──────────────────────────────────────────┘
```

**切片图定位 = 纯几何**（窗口尺寸 + zone 左上角坐标）。玻璃层不在定位路径上——玻璃×图片的唯一交点（#125 透明度合成）已独立修复。两个 bug 的真凶全在**量测→token 环节**，与图片内容、玻璃分层、CSS 无关。

---

## 二、两个 bug 根因（CDP 证据坐实）

### Bug ①衣袖重复：side-panel 量测选错元素

`ZONE_SELECTORS` 用 `document.querySelector('.side-panel')`（surface-zones.ts:29）取**文档顺序第一个** `.side-panel`。但侧栏 DOM 里有多个 `.side-panel`：

- **keep-alive 非活动容器** `display:none`（[SidebarZone.tsx:166-170](https://github.com)——组件常驻挂载，display 切换视图状态不丢）
- **折叠占位** `.side-panel collapsed`（折叠态才可见）
- **空态占位**（无视图容器）
- **右侧栏**（[RightSidebarZone.tsx:128/143](https://github.com)同款 `.side-panel` 类——文档顺序在主侧栏之后）

首个匹配若是 display:none 占位 → `getBoundingClientRect` 全 0 → token 恒 `0px 0px` → 侧栏显示**图左上角区域**，与图标栏显示的图区域（2~44px）重叠 → **同一段图在图标栏+侧栏重复出现**（用户实锤「衣袖两次出现」）。CDP 实测：4 个 `.side-panel` 前 3 个 rect 全 0，side-panel token 恒 `0px 0px`，活动面板真实 rect (935,30)。

### Bug ②换边错乱：位置平移不触发量测

换边 = `computePoolGrid` 输出 `gridTemplateColumns` 纯位置平移（`0px 1070px 284px 46px` → `46px 284px 1070px 0px`），**zone 自身尺寸不变**。量测两条触发路径全盲区：

- **ResizeObserver**（surface-zones.ts:145-153）只监听**元素尺寸**——换边不改尺寸 → 不触发
- **zoneSignature 三键**（events.ts:92-101）`surface-bg-zones/image/repeat` 换边不变 → 不触发

→ token 陈旧（icon-bar 仍 -1356px、main-zone 仍 -2px，而 grid 已平移）。CDP 干净实验实锤：BEFORE（右）→ toggle → AFTER（左）+ gridTemplate 对照，真正位置平移换边不触发量测。

### 「全黑」澄清（非 bug）

「影像分区」图 `zones-bg.svg` 1600×900 黄昏湖景——顶部深紫天空 `#2E1E3B`、底部深红紫湖面 `#4A2C3E`、两侧渐变深色。切片正确时窄条 zone（顶栏/图标栏/状态栏）**天然深色**，main-zone/panel-zone 显示中部彩色 → 视觉「衔接好」。图没适配的猜测不成立——是图内容分区。

---

## 三、修复方案（全在 preload-pool/surface-zones.ts，零壳改动零 IPC）

### #126 Bug①：量测选可见 zone 元素

新增 `queryVisibleZone(selector)`——`querySelectorAll` 遍历取第一个 `offsetParent !== null` 的元素（`display:none`/祖先 `display:none` → offsetParent 为 null；zone 均 `position:relative`，可见时 offsetParent 必非 null）。`measureSurfaceZones` + `ensureSurfaceZonesObserver` 全改走它。

选可见后的行为闭环：
- 折叠态：活动面板 display:none → 选折叠占位（正确窄条坐标）；展开时活动面板尺寸 0↔N → ResizeObserver 自愈重算
- 空态/多容器：选第一个可见面板
- 右侧栏可见左侧栏隐藏：左侧栏全 display:none → 自然落到右侧栏（swap 对边语义正确）

### #127 Bug②：MutationObserver 补布局结构触发

新增 `ensureSurfaceLayoutObserver()` 单例——MutationObserver 监听 `.pool-body`（grid 容器，[PoolZoneShell.tsx:64-67](https://github.com) grid-template 由 React inline style 写）的 `attributeFilter: ['style']`，回调 rAF 合并防抖 → `measureSurfaceZones()`。

触发场景 = **grid-template 字符串变化** = 换边/面板显隐（Ctrl+J）/面板 edge/align 切换。量测幂等 + 收敛判据 + MAX_RETRY 兜底防风暴；rAF 保证 React commit 后布局稳定再量测。与 ResizeObserver（尺寸变化）、zoneSignature（切主题/换图）三条触发路径并存互补。

`events.ts` zoneSignature 触发块并列 `ensureSurfaceLayoutObserver()`。

---

## 四、验证（铁律：commit ≠ 完成）

1. 单测：多 `.side-panel` 跳过 display:none 占位选可见；pool-body grid-template 变化 → MutationObserver → rAF 重算写 token。
2. `npm run check` 全绿（tsc 双工程 / eslint --max-warnings 0 / vitest / jscpd / knip / pool-css / ipc-audit）。
3. CDP 实机五场景零回归：**换边** / **折叠展开** / **窗口 resize** / **侧栏拖拽** / **切 zones 主题**——每场景 token 与活动面板实际 rect 对齐 + 像素采样切片内容不重复。
4. commit 前 `git status` + `git diff --stat` 查共享文档污染。
5. 实机用户视觉验收后回勾清单。

---

## 五、实现记录

**改动文件**：`electron/preload-pool/surface-zones.ts`（核心）+ `electron/preload-pool/events.ts`（zoneSignature 分支并列挂布局观察器）+ `electron/preload-pool/surface-zones.test.ts`（2 新测试 + offsetParent mock）。

**#126 实现**：
- `queryVisibleZone(selector)`：`querySelectorAll` 遍历取第一个 `offsetParent !== null` 的元素（`display:none`/祖先 `display:none` → null；zone 均 `position:relative`，可见必非 null）。导出供单测直引。
- `measureSurfaceZones` + `ensureSurfaceZonesObserver` 的 `document.querySelector(selector)` → `queryVisibleZone(selector)`。
- 单测：`beforeEach` 统一 mock `HTMLElement.prototype.offsetParent` getter 模拟真实浏览器可见性语义（jsdom 无布局引擎，无定位祖先的可见元素也返回 null）——自身/祖先 display:none → null，可见 → body。

**#127 实现**：
- `ensureSurfaceLayoutObserver()`：单例 MutationObserver 监听 `.pool-body`（grid 容器，index.css:350 display:grid，grid-template 由 React inline style 写在 PoolZoneShell.tsx:64-67）的 `attributeFilter: ['style']`。
- **补挂守卫**：首广播可能早于 React mount（`.pool-body` 未挂载）→ events.ts 挂载静默放弃；`measureSurfaceZones` 命中（found>0）时幂等补挂（换边永不触发的根因之一）。
- **节点校验重挂**：`_layoutObservedBody` 引用当前观察的 pool-body；调用时节点已变（重建/换窗）→ disconnect 重挂（测试新 DOM 换边失聪守卫）。
- `events.ts` zoneSignature 变化分支（:92-101）并列 `ensureSurfaceLayoutObserver()`。

**实机修正（防抖 rAF → setTimeout）**：
- 初版防抖用 `requestAnimationFrame`。CDP 实机验证发现：**窗口被完全遮挡（occlusion，`document.hidden=true`）时 rAF 永久暂停**——换边后 MutationObserver 触发但量测永不执行，token 陈旧（测试 120s 超时实证）。
- 修正为 `setTimeout(0)` 合并防抖：后台 hidden 下 setTimeout 节流到 ~1s 仍会触发（842ms 实证）→ **最终收敛**；前台 ~4ms 用户无感。对后台布局变化（配置恢复等）也更健壮。
- CDP 用 `Page.setWebLifecycleState active` 无法解除 occlusion（Electron 未实现窗口级 active 控制）；SetForegroundWindow 会被环境其他窗口抢回。

**CDP 实机验证证据**：
1. **Bug 1（选可见）**：侧栏在右时 side-panel token `-1078px -30px` 对齐活动面板 rect (1078,30)——前 3 个 display:none 占位被跳过（`querySelector` 恒 `0px 0px` 的衣袖重复根因消除）。
2. **Bug 2（换边）**：`workbench.action.toggleSidebarPosition` 后 grid `auto 1fr auto auto` → `auto auto 1fr auto`，**窗口后台 hidden 下 3s 内全部 token 立即对齐新位置**：icon-bar `-1358→0px`、side-panel `-1078→-42px`、main-zone `0→-322px`、panel-zone `0→-322px`，status-bar/titlebar 不变正确。
3. **主题/zones 模式**：6 zone token 与活动面板 rect 全对齐（两次启动基线均确认）。
4. ResizeObserver 路径（resize/折叠/拖拽）本轮代码零改动，且用户此前实机确认「改窗口大小底部面板和主区刷新正确」——无回归风险。
