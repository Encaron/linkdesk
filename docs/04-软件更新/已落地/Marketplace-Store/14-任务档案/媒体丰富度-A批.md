# 媒体丰富度 · A 批（契约与地基）实施记录

> 实施 AI：`sess_820b0cf9-abb8-4832-9865-b99c71ab977d`（2026-11-22）
> 任务源：[18-媒体丰富度-实施任务清单.md](../18-媒体丰富度-实施任务清单.md) · 设计：[17-媒体丰富度设计.md](../17-媒体丰富度设计.md)
> 结论：**A 批全绿**（插件 test/verify/lint ＋ kit/SDK 对账 ＋ 壳侧类型检查）。本批**不改视觉**；B 批起才动 `Art`/卡型。

---

## 一、逐项交付

| ID | 交付 | 文件 | 验收读数 |
|---|---|---|---|
| **A1** | 选帧纯函数 `mediaOf()`＋`MEDIA_MAX_FRAMES` | `src/views/store/cards/mediaModel.ts`（新）· `src/__tests__/mediaModel.test.ts`（新） | 9 例全绿：仅视频 / 视频无海报 / 只有 cover / 5 静帧→3 / 全空→generated / 去重 / 相对 URL / http 明文 / 坏对象 |
| **A2** | 目录 schema 补 `cover`；校验器补媒体语义（绝对 https / 视频首位 / 至多 1 段 / 缺海报警告） | `packages/plugin-sdk/schemas/marketplace.schema.json`（真源）→ 同步 `packages/marketplace-kit/schemas/` 与 `linkdesk-marketplace/schemas/`（三份字节相等）· `packages/marketplace-kit/src/validate.ts` · `src/services/marketCatalog/{types,parse}.ts` | kit `validate.test.ts` 18 例全绿（含「文件:字段 → 期望 → 示例」四类）；SDK schema 对账 23 例全绿 |
| **A3** | 媒体 token 四件 | `src/styles/store/store-cards.css`（`.marketplace-store` 作用域内） | `mediaTokens.test.ts` 3 例全绿：单源定义 / `aspect-ratio` 必引用 token / 网格是尺寸容器 |
| **A4** | 壳 CSP 审计（预期零改动） | 只读审计，未改壳 | `grep -rn "Content-Security-Policy\|img-src\|media-src" electron src index.html` → **0 命中**；壳未配置 CSP ⇒ 外链 https 图/视频不受额外限制，**零壳改动**。真机 mp4 播放留 F4 实测 |
| **A5** | 改造前基线 | `scratch/media-baseline/`（gitignored，路径登记不塞 git） | 1440×900：首页 / 主题分类页 / 详情 / 作者页 / 作者店；300×900：首页 / 主题。见 §三 |
| **A6** | 旧目录兼容回归 | `src/__tests__/marketCatalogV2.test.ts` | 新增 3 例：`cover` 进白名单 / 非 https 原值保留＋`screenshot-url-invalid` 警告 / 旧目录零媒体字段原样可读零警告 |
| **A7** | 容器查询地基 | `src/styles/store/store-browse.css` | `.marketplace-store-grid { container-type: inline-size }` ＋ 子项 `min-width: 0`；新卡按**栅格实宽**降档（分屏/侧栏/作者店同规） |
| **A8** | 交互/可达性守卫 | `src/__tests__/cardInteraction.test.tsx`（新） | 6 例全绿：三卡型点「安装」只触发 `onAct` 不冒泡开详情；整卡 `tabindex=0`＋Enter 开详情；卡内无 `<video>` |

---

## 二、实施中发现并同笔修正的契约缺口

1. **设计稿说「`cover` 已存在」——实读不存在**：`CatalogEntry` / SDK `CatalogPluginEntry` / schema 都没有条目级 `cover`（只有 `CollectionDecl.cover`）。本轮按 A1/A2 要求补成条目级可选字段：
   - 运行时白名单（`parse.ts`）与市场类型（`types.ts`）已接；
   - 三份 schema 同步（SDK 真源 → kit → 官方目录仓）；
   - 插件仓对 SDK **已装版本**的对账腿改为「schema 键必须全被白名单接住；白名单超前只许 `FORWARD_FIELDS = {cover}`」——SDK 下一次发版带上 `cover` 后该豁免自动空转（⛔ 永久豁免）。
2. **publish 会静默抹掉作者手改的目录元数据**：`upsertCatalogEntry` 的回落链只保 icon/marketIcon/description/category/categories/minAppVersion；作者在 `marketplace.json` 里补的 `screenshots` / `cover` / `pricing` / `license` / `repository` / `authorId` 下一次发版会被抹掉（与「换图换价只改 JSON」直接冲突）。已扩回落链并加 SDK 单测（`marketplace-schema.test.ts`「媒体/价格保全」）。
3. **「整窗主视觉」的准确 id 已确认**（17 §八 遗留问题 1）：实机主题条目 `id/标识符 = theme-panorama`，显示名「整窗主视觉」。D3 直接按此 id 补图。
4. **官方目录 `collections[] = 0` 已在实机确认**：首页没有 hero 槽（基线图可见直接从「作者」开始）。D1 必须先补 `collections[]`，否则「改声明换 hero/mega」没有数据源。
5. **相对 URL 的处置口径**：运行时**保留原值 + 记声明警告**（旧目录可读），渲染层 `mediaOf` 丢弃并兜生成式封面；发布校验器**判 error**（作者当场可改）。三层各司其职，⛔ 静默吞。

---

## 三、A5 基线（改造前）

- 采集实例：本机隔离实例 `linkdesk-accept`（CDP `127.0.0.1:9391`，dev 轨道 `localhost:1420`）。
- 采集方式：`scratch/_media-baseline.mjs`（一次性 CDP 脚本；`Emulation.setDeviceMetricsOverride` 设 1440×900 / 300×900，`Page.captureScreenshot`）。
- 图片路径（**scratch/ 已 gitignore**，不提交）：

| 文件 | 页面 | 读数 |
|---|---|---|
| `scratch/media-baseline/home-1440.png` | 首页 | 无 hero（collections=0）；作者区 → 主题专区（**图标＋纯色渐变**）→ 热门下载 |
| `scratch/media-baseline/themes-1440.png` | 主题分类页 | 23 卡通用网格；**每卡只有图标**、无封面 |
| `scratch/media-baseline/detail-1440.png` | 详情 | `theme-panorama`；**无截图画廊**（作者未声明） |
| `scratch/media-baseline/authors-1440.png` | 作者页 | 4 位作者 / 19 件 |
| `scratch/media-baseline/author-store-1440.png` | 作者店 | 官方店入口 + 店卡 |
| `scratch/media-baseline/home-300.png` / `themes-300.png` | 300px 普查 | 无横向溢出；文字未出现一字一行 |

> 与 17 §十二 的允许差异一致：基线里 hero 缺失是**数据缺（collections=0）**，不是展示层坏；D1 补声明后 F4 才有 hero 可对比。

---

## 四、门禁读数（2026-11-22）

```
插件仓 npm test         76 files / 753 tests  全绿
插件仓 npm run verify   九段全绿（lint 严格腿 / 跨插件 / 字典 / 声明 / 图标形态 / 覆盖 / SVG / 自有字典 / 配置项）
插件仓 npm run lint     全绿（WARN 档照旧）
kit  validate.test      18/18
kit  kitReconcile.test  7/7（schema 三份字节相等 + 类型键集对账）
SDK  marketplace-schema 23/23（含 publish 保全新例）
tsc -p packages/marketplace-kit --noEmit 零错误
```

- 壳侧业务代码**零改动**（本轮只改 `packages/plugin-sdk`、`packages/marketplace-kit` 两个工具包与插件仓/目录仓）。
- 新增自有字典键已补 `i18n/zh.json` / `i18n/en.json`（verify 黄灯不再包含本轮文案）。
- 未发版、未推送、未建会话（按启动词）。

---

## 五、留给后续批次的前置

- **SDK 下一次发版**（不在本轮）：`cover` 进已发布 schema 后，插件仓 `FORWARD_FIELDS` 豁免自动失效；本轮不推 npm。
- **D1**：官方目录补 `collections[]`（banner / 主题 mega / 装机必备 strip / 编辑精选 split / order）。
- **D3**：补图 id 已定——`theme-defaults`、`theme-aurora-glass`、`theme-panorama`（整窗主视觉）。
