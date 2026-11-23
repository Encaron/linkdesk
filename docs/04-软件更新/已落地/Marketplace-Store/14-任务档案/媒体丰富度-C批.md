# 媒体丰富度 · C 批（卡型接入）实施记录

> 实施 AI：`sess_820b0cf9-abb8-4832-9865-b99c71ab977d`（2026-11-22）
> 结论：**C 批全绿**（插件 test 78 files / 771 tests；verify 九段；lint）。真机截图见 §四。
> 纪律：卡型只排版；媒体只走 `Art`；动作/状态/菜单只走共享件（`actionOfCard` / `ActionButton` / `statusOfCard` / `CornerTag` / `menuOfCard` / `MoreMenu`）。

---

## 一、逐项交付

| ID | 交付 | 文件 |
|---|---|---|
| **C1** | hero 满幅 2:1（`--media-hero`）＋左侧 scrim（`pointer-events:none`）＋文案压图＋视频 controls；容器 <900/620/420/320 四档降档（scrim 改自下而上、文案整宽压底） | `styles/store/store-home.css`（重写 hero 块）· `HeroCarousel.tsx`（结构不变，`Art variant="hero"`） |
| **C2** | mega 封面 200px＋hover 2~3 帧轮播；hover 条改**半透明玻璃**（`color-mix(--bg-card 72%)`＋`--surface-blur`，模糊压在封面上的图）；脚区/动作/角标不动 | `store-cards.css`（`.cm-band`） |
| **C3** | duo 回归两枚一排（既有 `Strip variant="duo"` 50%）；新增 `CardDuo split`（整行 270、`1fr 1fr`、媒体内嵌 12px、**无满幅/无 scrim**）；合集 `layout:"split"` 渲染为纵向整行列表 | `CardDuo.tsx` · `CollectionRenderer.tsx` · `store-cards.css` · `collectionLayout.ts` |
| **C4** | `CardWall` 主题图墙卡：封面 3:2（`--media-card`）＋脚区（名/分类/下载/单角标）＋hover 快捷层（作者/状态价格/安装购买/更多）；三注册点＝分类页（THEMES）、合集渲染器、搜索页（经 OrderedCards） | 新 `cards/variants/CardWall.tsx` · `OrderedCards.tsx` · `CategoryView.tsx` · `CollectionRenderer.tsx` · `store-cards.css` · `store-browse.css` · `store-shell.css`（`--surface-scale:1.05`） |
| **C5** | 详情画廊接 `mediaOf`（与卡片/hero 同一份选帧）；视频项＝`<video controls preload=metadata>`＋海报；无图用**同一个 Art** 生成式 stage（⛔ 第二套画廊/线框） | `useDetailPackage.ts` · `DetailOverviewTab.tsx` · `DetailView.tsx`（import 同一份 store-cards.css）· `detail-body.css` |
| **C6** | 小卡/行卡/榜行无媒体回归断言（不 import Art、不读 screenshots/cover） | `artMedia.test.tsx` |
| **C7** | 轮播唯一机制静态守卫：卡文件无 `setInterval/setTimeout`；2/3 帧 keyframes 只在 store-cards.css 各一次；卡型不各自 import `mediaOf` | 新 `mediaNormalization.test.ts` |
| **C8** | 作者首页 layout 映射支持 `split/wall`：`authors.ts` 解析、`AuthorSectionDecl` 类型、SDK/kit schema enum（`small/mega/duo/split/wall`）、合集 enum 补 `mega/small/split/wall` | `authors.ts` · `marketCatalog/types.ts` · `parse.ts` · `collectionLayout.ts` · `packages/{plugin-sdk,marketplace-kit}` 类型/schema |
| **C9** | 新卡归一化审计：CardWall 只 import 共享件；视图层只有 `mediaModel/cardParts` 读 `screenshots/cover`；新卡住 `cards/variants/` 不平铺 | `mediaNormalization.test.ts` |

---

## 二、真机核对（1440×900，隔离实例）

采集方式：新起一套隔离宿主（Vite `1422` ＋ Electron `--user-data-dir=$TEMP/linkdesk-media --remote-debugging-port=9395`），把 `dev --real` 产物装进该 profile；截图落 `scratch/media-baseline/`（gitignored）。

| 页面 | 截图 | 读数 |
|---|---|---|
| 首页 | `home-c-1440.png` | 主题专区 9 张 mega 卡全部有**生成式封面**（色场/网格/图标砖/水印/分类字）；无 hero 是因官方目录 `collections=0`（D1 补） |
| 主题分类页 | `themes-c-1440.png` | **9 张 wall 卡**（4 列）；封面 3:2＋脚区；无横向溢出 |
| wall hover | `wall-hover-c.png` | 作者「LinkDesk」/ 免费角标 / 安装 / ⋯ 全在 hover 层；动作钮不跳详情 |
| mega hover | `mega-hover-c.png` | hover 条半透明玻璃，封面的图标/水印透出且被模糊；脚区与角标不动 |
| 详情（无图） | `detail-c-1440.png` | 同一个 Art 生成式 stage（560×373）替代旧「无线框」空档；不是第二套画廊 |
| 300px | `themes-c-300.png` | `scrollWidth === clientWidth === 300`；卡名高度 19px（单行）；9 张 wall 卡仍挂载 |

> ⚠️ 窄窗 300px 下壳的「插件市场」侧栏占满可视区，商店 tab 在 DOM 内但不在前台；横向溢出读数仍为 0。F5 会用「tab 前台 + 300px」再核一遍。

---

## 三、契约扩展（C8）

合集 `layout` 与作者板块 `layout` 的封闭枚举统一为：

- 合集：`banner | strip | duo | grid | mega | small | split | wall`
- 作者板块：`small | mega | duo | split | wall`

三份 schema（SDK 真源 → kit → 官方目录仓）字节相等；`authors.schema.json` 由 SDK `$defs` 机械派生同笔更新（kitReconcile 深比较绿）。

---

## 四、门禁读数

```
插件仓 npm test         78 files / 771 tests  全绿
插件仓 npm run verify   九段全绿
插件仓 npm run lint     全绿（WARN 档照旧）
kit reconcile           12/12（schema 三份字节相等 + authors 派生 + 类型键集）
kit validate            18/18
SDK schema              23/23
```

- 视图层 grep：`screenshots|cover` 仅剩 `cards/mediaModel.ts` 与 `cards/cardParts.tsx`（C9 测试钉死）。
- 卡文件 grep：无 `setInterval/setTimeout`（轮播只有 CSS）。
- 本轮**未改壳**；临时 dev 宿主配置（`dist-electron` 端口 1422）已还原为 1420，进程已停。

---

## 五、留给 D/F

- **D1**：官方目录补 `collections[]`（banner / 主题 mega / 装机必备 strip / 编辑精选 split / order）——补完 hero 才有真机画面可核（C1 结构已就绪）。
- **D3**：`theme-defaults` / `theme-aurora-glass` / `theme-panorama`（整窗主视觉）补 `screenshots` + `cover`。
- **F4/F5**：同视口四页截图与 HTML6 并排；300px 在「tab 前台」下复测。
- **F8**：历史 bug 回归（hover 几何/300px/冒泡/滚动位/状态位/菜单层级）按本批静态守卫 + 真机逐条过。
