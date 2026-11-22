# 媒体丰富度 · B 批（媒体原语）实施记录

> 实施 AI：`sess_820b0cf9-abb8-4832-9865-b99c71ab977d`（2026-11-22）
> 结论：**B 批全绿**（插件 test 77 files / 763 tests；verify 九段；lint）。只动 `Art` 与它的 CSS，⛔ 新组件。

---

## 一、逐项交付

| ID | 交付 | 说明 |
|---|---|---|
| **B1** | 多帧：`Art` 输出 1~3 帧；`data-frames` 驱动 CSS；`loading=lazy` / `draggable=false`；`onError` 只移除坏帧露底纹 | 帧绝对定位在 `overflow:hidden` 舞台内，换帧不跳布局 |
| **B2** | 生成式封面：`entryHue` 色场（三向渐变）＋30px 网格（径向遮罩）＋`marketIcon` 图标砖＋名字水印（8% 文字色）＋「分类 · LinkDesk」小字；**永远垫在帧下** | 小卡/行卡/榜行不 import `Art`（测试钉死）；无图/坏图/加载中都有设计过的底 |
| **B3** | 封面视频：第一项＝视频对象；**只有 `hero`** 输出 `<video controls preload=metadata>`（⛔ autoplay/loop；点击 stopPropagation）；卡内只给海报帧＋「含视频」badge | 详情由 C5 接同一 `mediaOf` 输出 video |
| **B4** | 删旧路：`artBG()` 函数与导出删除（插件私有 `src/ui/avatarHue.ts`）；旧 `.marketplace-store-art-icon` / `.marketplace-store-art-cover` 样式与 hero/mega/duo 图标特例删除 | grep 0 引用；`knip` 不新增未用 |
| **B5** | 测试：`mediaOf` 9 例 ＋ `Art` 9 例 ＋ reduced-motion 静态守卫（`animation:none!important`） | — |

---

## 二、实现要点（与设计的偏差/取舍）

1. **辉光不新增字面量**：生成式封面的图标砖只用 `--shadow-pop` 抬升；色相外发光**没做**——`--surface-glow` 是 hover 声明通道，把常驻外发光塞进去会让卡面一进页面就发光。按「辉光只 `--surface-glow`」优先，牺牲了设计稿里那圈很淡的外发光。
2. **图标砖圆角走 token**：设计稿 `calc(size*0.27)` 被 `radiusTokens.test` 判红（禁止 px/% 字面量）⇒ 改用 `var(--radius-2xl)`。
3. **`Art` 的变体从 `className` 改为 `variant` 枚举**：`is-hero/is-mega/is-duo/is-split/is-wall/is-detail` 仍由它产出（设计要求保留类名）；调用点三处（HeroCarousel/CardMega/CardDuo）同笔迁移。
4. **详情视频**：B 只做 hero；详情在 C5 用同一个 `mediaOf` 输出 `<video controls>`，不新建画廊。
5. **生成式封面 token 作用域**：媒体 token 定义在 `:is(.marketplace-store, .marketplace-mpd-detail)`（详情根不是 `.marketplace-store`）；⛔ `:root`。

---

## 三、门禁读数

```
插件仓 npm test         77 files / 763 tests  全绿
插件仓 npm run verify   九段全绿
插件仓 npm run lint     全绿
```

新增测试：`mediaModel.test.ts`（9）、`artMedia.test.tsx`（9）、`mediaTokens.test.ts`（4，含 reduced-motion）。
删除：`src/ui/avatarHue.ts` 的 `artBG`；`store-cards.css` / `store-home.css` 的旧图标特例。

---

## 四、留给 C

- 卡型接入（hero/mega/duo/split/wall）只调用 `Art`；⛔ 各卡再读 `screenshots/cover`。
- 详情画廊接 `mediaOf`；无图用同一个 `Art` 的 `variant="detail"`。
