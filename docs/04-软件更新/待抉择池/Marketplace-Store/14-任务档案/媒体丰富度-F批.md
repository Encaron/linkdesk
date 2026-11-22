# 媒体丰富度 · F 批（验收与回归）实施记录

> 实施 AI：`sess_820b0cf9-abb8-4832-9865-b99c71ab977d`（2026-11-22）
> 结论：**F 批本地全绿**（壳 `npm run check` EXIT 0 · 插件 test/verify/lint 全绿 · 目录 schema 通过 · 作者文档三腿通过）。
> 未推送、未发版；D3 图片与目录内容待用户批准推送后对真机生效。

---

## 一、F1–F3 门禁

| 腿 | 命令 | 读数 |
|---|---|---|
| F1 插件 | `cd official/marketplace && npm run verify && npm test && npm run lint` | **78 files / 772 tests**；verify 九段；lint 全绿 |
| F2 目录 | `node scripts/vendor-check.mjs validate-file marketplace.json`（官方目录仓） | **0 错误 / 0 警告**（根级含 `collections`） |
| F3 壳 | `npm run check` | **EXIT 0**：282 files / 3846 tests；R1–R8＋G1 全绿；`plugin-docs` 已重生成；`plugin-agents` 已同步 |

---

## 二、F4 真机四页（1440×900）

采集方式：隔离宿主（Vite `1422` ＋ Electron `--user-data-dir=$TEMP/linkdesk-media --remote-debugging-port=9395`）；官方目录经 **CDP Fetch** 注入本地 `linkdesk-marketplace/marketplace.json`（含 `collections[]` 与主题媒体），不改插件代码、不推送。

| 页 | 截图 | 读数 |
|---|---|---|
| 首页 hero | `scratch/media-baseline/f4-home-1440.png` | 4 张 slide；满幅媒体＋左 scrim；无图走生成式封面；视频仅 hero 输出 `<video controls>` |
| THEMES 图墙 | `scratch/media-baseline/f4-themes-1440.png` | 9 张 wall 卡；3:2 封面＋46px 脚区；hover 动作层可安装/购买 |
| 编辑精选 split | `scratch/media-baseline/f4-split-1440.png` | 整行 270；左文右图；媒体内嵌 12px；无满幅/无 scrim |
| 详情 | `scratch/media-baseline/f4-detail-1440.png` | 无图用同一个 Art 生成式 stage；有图/视频走同一 `mediaOf`（≤3 帧） |

**与 HTML6 对照**：结构/比例/交互按 17 §十二 的 5 条允许差异核对——token 化、真实数据、卡片壳、平台渲染、视频有无；⛔ 未发现第二套按钮/角标/模糊/辉光。设计稿里的 picsum 占位与「状态陈列」展板不进产品。

---

## 三、F5 300px

- 读数（THEMES）：`document.documentElement.scrollWidth === clientWidth === 300`；wall 卡 9 张仍挂载；卡名高度 19px（**单行**，不是一字一行）；商店 rail 高 69px（横向条）。
- 截图 `scratch/media-baseline/f5-themes-300.png` 仍显示「插件市场」侧栏——**壳的窄窗布局把侧栏放前台**，不是插件横向溢出；插件的容器查询/单行省略读数已满足 F5 判据。
- `@container` 规则：hero 900/620/420/320 四档；wall 栅格 `minmax(min(212px,100%),1fr)`；split 700 一刀切单列；grid 700 单列（既有）。

---

## 四、F6 性能

- 帧上限 `MEDIA_MAX_FRAMES = 3`（单测钉住）；`loading=lazy`、`draggable=false`（Art 单测）。
- 视频 `preload=metadata`、`controls`、⛔ `autoplay`/`loop`（Art 单测）。
- 帧/视频绝对定位，换帧不跳布局；坏图只拆该帧，生成式底纹兜底。
- `npm run knip` 随壳 check 通过；旧 `artBG` 已删（grep 0 引用）。

---

## 五、F7 文档与台账

- 分批复核：`14-任务档案/媒体丰富度-{A,B,C,D}批.md`。
- 真机台账：`16-真机问题登记与验收报告.md` §七（门禁读数 / 四页 / F8 防线 / 待用户项）。
- AI 操作面：`19-媒体策展AI手册.md`（三步换槽位/换图/换价；命令 `marketplace.getState` / `refreshCatalog` / `openCategory` / `openPlugin`；CLI `validate` / `media:resolve`）。
- 作者面双语：`docs/03-插件制造/23-…` ＋ `docs/03-plugin-authoring/23-…`（三腿全绿）；`packages/plugin-docs/docs/**` 已 `docs:build` 重生成。

---

## 六、F8 历史 bug 回归

见 16 号档 §七·3 的逐条表；本轮可机械复核的读数：

- **点击冒泡**：`cardInteraction.test.tsx` 覆盖 grid/mega/duo/wall —— 点动作只触发 `onAct`，不触发 `onOpen`。
- **hover 改几何**：`mediaNormalization.test.ts` 静态守卫——wall/split 的 `:hover` 只许 `transform/opacity/pointer-events`；CardWall 无 setState（滚动位不丢）。
- **状态位**：新卡只读 `statusOfCard` / `actionOfCard`；无第二套角标/价格。
- **菜单层级**：未新增浮层；MoreMenu 共享件。
- **图片白块/跳布局**：Art 单测（坏图拆帧＋生成式底纹）。
- **视频自动播/抢焦点**：Art 单测（autoplay/loop=false；卡内无 video）。
- **旧目录崩溃**：A6 三例（cover 白名单 / 非 https 原样＋警告 / 零媒体字段原样可读）。
- **300px**：F5 读数。

---

## 七、F9 版本与 CHANGELOG

- 市场插件：`plugin.json` / `package.json` **1.2.1 / 1.2.0 → 1.3.0**；`CHANGELOG.md` 新增 `## v1.3.0（2026-11-22）`。
- `AGENTS.md` 由 `sync-plugin-agents` 重生成（版本行 1.3.0）。
- ⛔ 未发版/未推送；`@linkdesk/plugin-sdk` / `@linkdesk/marketplace-kit` 的 npm 版本未动（本轮明确不发版；`cover` 的前向对账已用 `FORWARD_FIELDS` 版本感知）。

---

## 八、回执

- 总调度台 `sess_f471a6eb-…`：**本次会话不存在**（`proto.sessionNotFound`，只试一次未重试）；回执改在本档与用户会话给出。
- 未自建会话；未与修 bug 会话交叉改同一文件（壳 `src/`/`electron/` 零改动）。
