# UI 修整阶段 · 交接单（2026-11-21）

> **用途**：棒 16 验收之后，用户开始逐条做**实机 UI 反馈**，由执行 AI 连续修。本单是这一阶段的**唯一交接入口**——接班 AI 先读本单，再读 [16-真机问题登记与验收报告.md](./16-真机问题登记与验收报告.md) §二/§六（问题总账与各轮进展）。
> **阶段定位**：⛔ **不是棒 17（发版棒）**。本阶段只做「UI/交互修正 ＋ 归一化」，**不发版、不推**；攒批归棒 17。
> **上游**：16 号档（问题总账 F1–F25）· 13 §七硬闸 · 10 号档四条范式。
> **接手入口（一句话）**：「读 `Marketplace-Store/UI修整阶段-交接单.md` 接手，做 UI 修整，不发版。」

---

## 一、当前状态（2026-11-21 实读）

### 已完成（按用户反馈轮次）

| 轮 | 内容 | 提交 |
|---|---|---|
| R1–R2（棒 16 内） | F3 openStore 补 `{pluginId}`；F11–13 横滚余量；F16 分类页 clamp；F19 作者卡定宽 | 市场仓 `70cbcd7`、`ed49e8f`；主仓 `15332846d`/`8aebf3a97` |
| R2.5 | F10 hero 箭头外置＋提示删；F15/F21 ⋯菜单换共享 ContextMenu；F17 4×select→SelectBox＋筛选打勾；F1 作者回落；F9 通知去重 | 市场仓 `ed49e8f`、`318814d` |
| R3 | F20 许可弹窗走壳 `dialog.confirmContent`（`LicensePanel` 双形态）；F5 警告聚合；F6 口径文案＋库徽标；F14 单层呈现；F25 渐变铺贴 `background-origin` | 市场仓 `fb486f0`；主仓 `dc485b0d3`（ContextMenu onSelect）、`f594a2c5f` |
| R4（全页普查） | 来源组头/源行 wrap＋地板；库行 wrap＋地板；详情容器查询（<700 隐右栏）；hint 限长 8 行 | 市场仓 `3e9df5c`、`f50484a`、`ce8938e`；文档 `ab94984b3` |

### 已发布 npm（用户授权「该上传就上传」）
`contracts 0.1.48` · `ui 0.2.66` · `plugin-sdk 0.1.97` · `plugin-docs 0.1.81` · 全部已 `release:mark` 落账。
**插件仓**：`plugin.json` 仍 **1.2.1 未 bump**（攒棒 17）；主仓壳 **0.2.58 攒批**、未推。

### 用户仍在验的三处（接班先问结果）
1. 来源页悬停条长度（现 9 行：8 条＋「…还有 N 条」）
2. 来源页组头「N 个市场源 · 同一作者多个仓库自动合并」是否单行
3. 分屏/极窄时详情页正文（现 <700 容器隐右栏）

---

## 二、四条范式（本轮立，新面照抄）

写在 `src/styles/store/store-shell.css` 头注，摘要：

1. **分栏网格给地板**：`minmax(240px, Xfr)`，⛔ 裸 `1fr`（CJK 的 min-content＝1 个字，窄了必一字一行）；
2. **窄容器用容器查询切单列**：`@container (max-width: …)`，按**容器实宽**判定（分屏组/右侧开面板同样生效，⛔ 靠窗口宽）；
3. **文本块 `min-width:0` ＋ 行数上限或单行省略**；按钮文案 `nowrap+ellipsis`、按钮 `max-width:100%`；
4. **横滚保留拖动**：只用 `::-webkit-scrollbar*` 定制 6px 圆头主题条；⛔ 删条（后面内容点不到）、⛔ 原生条、⛔ 同时设 `scrollbar-width`（Chromium 121+ 会忽略 webkit 样式）。

还有一条跨轮的：**渐变铺贴几何**——`background` 简写会把 `background-origin` 重置回 `padding-box`，半透明边框下露 1px（先例 壳 `16b05ec57`）。渐变面一律长手 `backgroundImage` ＋ `backgroundOrigin:"border-box"`。

---

## 三、逐页机械普查（每轮修完必跑，⛔ 靠记忆）

```js
// 在池文档执行；把当前页容器压到 300px，扫「叶子文字宽 < 2.2 字」= 会竖排的
(function(){var p=document.querySelector(".marketplace-store-page")||document.querySelector(".marketplace-mpd-details-layout");
if(!p)return "no page";p.style.width="300px";
var bad=[];p.querySelectorAll("*").forEach(function(e){if(!e.textContent.trim()||e.children.length)return;
var cs=getComputedStyle(e);if(cs.display==="none"||cs.visibility==="hidden")return;
var r=e.getBoundingClientRect(),fs=parseFloat(cs.fontSize)||14;
if(r.width>0&&r.width<fs*2.2)bad.push((String(e.className)||e.tagName).slice(0,30)+"|"+e.textContent.trim().slice(0,8)+"|w="+Math.round(r.width)+"|ws="+cs.whiteSpace)});
p.style.width="";return JSON.stringify({n:bad.length,list:bad.slice(0,12)})})()
```
**判读**：`ws=nowrap` 的短标签（排序/免费/数字）可接受；**`ws=normal` 且宽 <2.2 字 = 必须修**。四页（首页/分类/库/来源/详情）都要扫。

---

## 四、本地真机环境（现成，⛔ 别删）

| 件 | 位置/命令 |
|---|---|
| 隔离实例 | `electron . --remote-debugging-port=9391 --user-data-dir="C:\Users\fengy\AppData\Local\Temp\linkdesk-accept" --proxy-server=127.0.0.1:7890 --proxy-bypass-list="127.0.0.1;localhost"`（需 `env -u ELECTRON_RUN_AS_NODE`） |
| Vite | `LINKDESK_USER_PLUGINS_HOME="C:/Users/fengy/AppData/Local/Temp/linkdesk-accept/plugins" npm run dev` |
| 目录供数 | `node "$LOCALAPPDATA/Temp/linkdesk-fixture/intercept.mjs"`（CDP Fetch 拦截，自动发现 pool target） |
| fixture | `%LOCALAPPDATA%\Temp\linkdesk-fixture`（4 源＋作者块＋500 条目＋坏源） |
| 截图 | `bash "$LOCALAPPDATA/Temp/linkdesk-fixture/shot.sh" <名>` → `shots/` |
| 测试密钥对 | `%LOCALAPPDATA%\Temp\linkdesk-keys`（⛔ 不进仓） |

**换产物三连（F8 血泪）**：部署新 `dist` 后 → ① **重启 Vite**（transform 缓存会让旧 bundle 继续跑）→ ② `dev:driver call Network.clearBrowserCache --doc pool` → ③ `reload`。少一步就出现「改了没生效」。
**CSS 文件被截断过**（还原/sed 写坏）→ Vite 会缓存**空样式**（表现为标签栏裸成 block）→ `touch` 该文件再 reload。

---

## 五、待办与边界

### 待用户确认/待办
- 用户对三处（见 §一）的验收结果；
- **F25 圆角白边**：已按「渐变铺贴几何」修，待用户实机确认；
- 加源弹窗：**经用户裁决保留**（机制在壳已核，⛔ 别再迁）；
- 其它用户新报的问题：登记 16 号档 §二，按四条范式修，**每轮四页普查**。

### ⛔ 边界（用户明示 + 纪律）
1. **右键菜单的玻璃外观一律不动**（已按 git 历史还原到用户调好的版本）；机制可加；
2. 能用共享组件的**必须**用共享组件（橱窗判据）；自绘只限市场本体 UI 且必须过四条范式；
3. **不发版、不推**；npm 包按用户授权可发/发就走到端；
4. 不动正式环境（`%APPDATA%\linkdesk`）；隔离实例/主题插件为只读复制；
5. 不改 `TEMP\linkdesk-fixture` 以外的用户资产；⛔ 不碰 `E:\_testfiles`；
6. 每笔提交：市场仓 `verify`＋`vitest` 全绿；主仓动 `src/` 走 `npm run check`；类别前缀；
7. 与另一条外来轴（错误态与降级脸 UI 化）**别交叉**：它动 `src/pool/shared/fallback/`＋ErrorBoundary，动前需与调度台握手。

### 已明确「不做/不做主」
- 棒 17 发版（三轴走到端）→ 调度台排；
- 错误态与降级脸设计轴 → 另一会话（用户直派，暂停中）。

---

## 六、给接班 AI 的第一小时

1. 读本单 → 16 号档 §二/§六 → 市场仓 `git log --oneline -6`；
2. 起环境（§四），跑一次四页普查（§三）确认基线；
3. 问用户三处验收结果（§一）；按反馈继续修；
4. 每轮：改→build→部署→重启 Vite→清缓存→reload→普查→截图→`verify`/`vitest`→单独一笔→更新 16 号档 §六。
