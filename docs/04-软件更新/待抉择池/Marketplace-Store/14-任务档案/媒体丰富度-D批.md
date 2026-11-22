# 媒体丰富度 · D 批（目录声明与内容）实施记录

> 实施 AI：`sess_820b0cf9-abb8-4832-9865-b99c71ab977d`（2026-11-22）
> 结论：**D 批本地全绿**（目录 schema 通过、作者文档三腿通过、media:resolve 可用、插件 test/verify/lint 绿）。
> ⚠️ D3 的图片与 JSON 只落**本地仓**——按启动词「⛔ 不推送」，URL 要等用户批准推送后才对真机可达。

---

## 一、逐项交付

| ID | 交付 | 落点 |
|---|---|---|
| **D1** | 官方 `collections[]`：hero banner / 主题 mega / 装机必备 strip / 编辑精选 split / order | `linkdesk-marketplace/marketplace.json` |
| **D1·补** | `HomeView` 删掉「主题专区」硬渲染——改由 `official-themes` 合集声明；顺序：hero → 作者 → 主题 mega → 装机必备 → 编辑精选 → 热门 → 分类 | `official/marketplace/src/views/store/home/HomeView.tsx` |
| **D2** | 作者文档补媒体契约（双语）：`screenshots` / `cover` / 视频规则 / 绝对 URL / 稳定路径 / 两条自检命令 | `docs/03-插件制造/23-市场目录与作者主页.md` · `docs/03-plugin-authoring/23-marketplace-catalog-and-author-store.md` |
| **D3** | 三套官方主题补图：`theme-defaults`（浅/深两套色阶）、`theme-aurora-glass`、`theme-panorama`（整窗主视觉）；各 3 帧＋cover（cover 复用首帧 URL） | 各主题仓 `marketplace.json` · 官方目录条目 · 新 `linkdesk-marketplace/media/<theme>/*.jpg`（1.2MB） |
| **D4** | 编辑器演示视频（可选） | **未做**——没有作者提供的 mp4；⛔ 不自造视频 |
| **D5** | `marketplace-kit media:resolve <marketplace.json> [id] [--json]`：打印 kind/frames/video；坏输入非零退出 | `packages/marketplace-kit/src/mediaResolve.ts` · `cli.ts` · `index.ts` · `mediaResolve.test.ts`（5 例） |

---

## 二、D1 声明内容（改槽位只改 JSON）

```json
"collections": [
  { "id": "official-hero", "title": "官方精选", "layout": "banner",
    "items": ["editor", "theme-panorama", "serial-monitor", "theme-aurora-glass"], "order": 1 },
  { "id": "official-themes", "title": "主题专区", "hint": "一套配方换一个心情", "layout": "mega",
    "more": { "label": "全部主题", "target": "category:themes" },
    "items": ["theme-defaults", "theme-aurora-glass", …], "order": 2 },
  { "id": "official-must-have", "title": "装机必备", "layout": "strip",
    "items": ["editor", "file-tree", "pdf-reader", …], "order": 3 },
  { "id": "official-editor-picks", "title": "编辑精选", "layout": "split",
    "items": ["editor", "serial-monitor"], "order": 4 }
]
```

- `Hero` 读 banner 合集（items 前 5 张）；
- `CollectionRenderer` 按 layout 分发 mega/split/strip；
- 换 hero/mega/小卡/duo/split/wall 的成员 = 改 `items`；刷新即见，⛔ 不发版。

---

## 三、D3 媒体（本地）

| 主题 | cover / 3 帧 | 来源 |
|---|---|---|
| `theme-defaults` | `media/theme-defaults/shot-1..3.jpg` | 隔离实例实拍：浅色首页 / 浅色详情 / 深色首页 |
| `theme-aurora-glass` | `shot-1.jpg`（首页）/ `shot-2.jpg`（详情）/ 主题仓 `resources/cover.svg` | 实拍＋作者原有场景封面 |
| `theme-panorama` | `shot-1.jpg`（首页）/ `shot-2.jpg`（详情）/ 主题仓 `resources/sailor-moon.jpg` | 实拍＋整窗主视觉原图 |

- URL 形态：`https://raw.githubusercontent.com/Encaron/linkdesk-marketplace/HEAD/media/<theme>/shot-N.jpg`（稳定分支，⛔ 版本 tag）。
- 图片已转 JPEG q88（1600×1000；总 1.2MB），**未进插件包**（住目录仓 `media/`，⛔ `resources/`）。
- 官方目录三条 entry 与各主题仓 `marketplace.json` 已同笔写 `cover` + `screenshots`；`vendor-check validate-file` 通过。
- `media:resolve` 读数：三条均 `kind=image frames=3`，exit 0。

---

## 四、门禁读数

```
插件仓 npm test          78 files / 771 tests  全绿
插件仓 npm run verify    九段全绿
插件仓 npm run lint      全绿
kit mediaResolve.test    5/5
kit validate.test        18/18
官方目录 vendor-check    0 错误 / 0 警告（根级键含 collections）
author-docs-symbols      52 篇零内部坐标
author-docs-links        585 条全过（20 条报备外链）
author-docs-bilingual    中英 26/26 对齐
check-doc-links          882 个 md 无断链
```

---

## 五、留给 E/F

- **E**：JSON-only 操作手册（换槽位/换图/换价三步，含 `media:resolve`）；错误模板已由 A2/E2 落。
- **F4**：真机要用**本地目录源**（推送前 URL 不可达）——可把 `linkdesk-marketplace` 起本地 HTTP 服务并加为源，或等用户批准推送后用 GitHub raw。
- **F5**：300px 在「tab 前台」下复测（C 批只读到 `scrollWidth===300`）。
