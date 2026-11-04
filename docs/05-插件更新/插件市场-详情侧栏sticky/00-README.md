# 05-插件更新 · 插件市场 · 详情页元数据侧栏 sticky（滚动吸顶）

> 立案：2026-11-05（用户点名：详情页右侧「标识符／作者／版本／大小／市场／来源」等元数据，滚动过程中希望保持 sticky；切到「功能」「更改日志」同样）。
> 状态：🟢 **已实施＋已发版（marketplace 1.2.0，2026-11-05）· ⏳ 待用户软件内验收**。结论先行：**能做到且很小——纯插件侧 CSS 一处两三行，零壳改动；三 tab 结构性共用一条侧栏（常驻），sticky 做一处全吃到**。
> 归属：**05-插件更新**（壳零改动；分档判据 → memory `docs-04-05-filing-rule`）。
> 参考先例：VS Code 扩展详情页 info sidebar 同为 sticky——本插件详情页布局本就对标 `extensionEditor.css`（detail-shell.css 头注自认）。

| 项 | 值 |
|:--|:--|
| 插件 | `marketplace`（源码仓 `E:\linkdesk-plugins\official\marketplace`，现 1.1.10） |
| 落点 | `src/styles/detail/detail-body.css` 的 `.marketplace-mpd-info-sidebar`（仅此一处） |
| 壳改动 | **无** |
| 状态 | ✅ 已实施＋已发版 1.2.0（2026-11-05）；⏳ 待用户验收后归档归还 |

## 一、现状（2026-11-05 读码核实）

- 滚动架构：根 `.marketplace-mpd-detail` 不滚（`overflow:hidden`），header ＋ navbar 钉顶，`.marketplace-mpd-body` 是**唯一滚动区**（`flex:1; overflow-y:auto`，`detail-body.css:8-12`）。
- body 内 `.marketplace-mpd-details-layout` = flex 行：左 `.marketplace-mpd-details-main` 承载三 tab（详情/功能/更改日志，本地 state），右 `<aside class="marketplace-mpd-info-sidebar">` **常驻、不随 tab 重建**（`DetailView.tsx:220-270`）——三 tab 共用同一条侧栏。
- 侧栏现状 `width:220px; flex:none`，**无 sticky**；flex 默认 `align-items:stretch` 把它拉到与正文等高 ⇒ **滚动时随正文一起滚走**（用户诉求的根因）。
- ⇒ 切 tab 侧栏照旧（用户的第二个诉求本来就满足；要补的只有「滚动中吸住」）。

## 二、方案（待实施）

`.marketplace-mpd-info-sidebar` 加：

```css
align-self: flex-start; /* 脱离 stretch——sticky 不动的经典坑，前提 */
position: sticky;
top: 0;                 /* 相对滚动区 .marketplace-mpd-body 吸顶；是否留白实机定 */
```

- 零壳改动、零新 API、零新配置、无新可测逻辑（纯样式）——插件仓 verify 的 lint/间距判据照过。

## 三、已知边界与兜底

- **侧栏自身超高的插件**（依赖/被依赖特别多，如 editor）：吸顶后底部够不着（sticky 经典陷阱）。兜底 = 补 `max-height` ＋ 侧栏自身 `overflow-y:auto`（VS Code 同款）。**实机看依赖多的插件表现后定要不要带**，默认先不带（侧栏通常十几行，先给最简形态）。
- top 偏移：body 自带 `padding:16px 20px`，滚动后侧栏贴滚动口上缘（padding 不跟随吸顶件）——视觉差细微，实机定 `top:0` 还是留小 offset。

## 四、待办

1. ~~实施~~ ✅ **2026-11-05 完成**（3 行 CSS 落 `detail-body.css`；实机验收项转待用户软件内过：滚动吸顶／三 tab 均吸／依赖多插件侧栏不裁底／亮暗＋`--ui-scale` 不破格）。
2. ~~发版链~~ ✅ **随 marketplace 1.2.0 同批出货**（sticky＝新增用户可见能力 ⇒ **MINOR** 非 patch；Release `v1.2.0`＋官方目录 `900432a`＋种子已刷）。
3. 收口＋用户验收后归还插件仓 `docs/`（一项一子夹），05 索引行改指针。
