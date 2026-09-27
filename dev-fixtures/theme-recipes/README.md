# 主题配方快照（测试输入，**不是真相源**——**例外一只，见下方专节**）

**除 `theme-zones/` 外**，这些 JSON 的真相源在各主题插件仓（`Encaron/linkdesk-plugin-theme-*`）。
本目录只是 `ThemeEngine` 端到端裁决所需的**冻结输入**——别在这里改配方，改了没用（上游一改就对不上）。

## 为什么会有这个目录（E6#101，L7 第 7.4 轮）

出厂的「随包种子」收敛到 **6 只基础插件**（设置 / 插件市场 / 语言 / 基础主题 / 文件树 / 编辑器）——
判据是「**断网、零插件时，用户能不能自救**」；其余（含当年**为测试造的**那些主题、串口监视器等）
改由插件市场按需安装。于是壳仓里**不再有** `theme-songti` / `theme-terminal` / `theme-pill` /
`theme-panorama` / `theme-aurora-glass` / `theme-zones` 这几只的 zip。

而 `src/core/services/ui/ThemeEngine/integration.test.ts` 的那 7 例，决的是「**真实配方 ↔ 引擎**」
这条契约（硬约束 21 的豁免情形：验证真实接线，虚构 fixture 裁决不了）——它们要的是**真实配方文本**，
不是「随包」这件事。两者的诉求在这里第一次分开，故把这 7 份配方冻成快照留在这里：
**断言一条没减，输入从「随包」变成「冻结」**。

## 🔴 例外：`theme-zones/` 是**唯一存本**（2026-09-28 起）

`theme-zones/` 这两份（`image-zones.json` / `paper-zones.json`）的上游——插件仓
`Encaron/linkdesk-plugin-theme-zones` ＋ 本地容器目录 ＋ 市场目录条目——已于 2026-09-28 随
**六只演示插件整体下架**（用户拍板）。此后**上游不存在了**：它不再是「钉在活上游上的钉子」，
而是这条数据的**唯一存本**。

⇒ 上面那句「上游一改就对不上」对它**不成立**；要改它，就是在改唯一存本，请连
`integration.test.ts` 里 `image-zones` / `paper-zones` 两条断言同笔改。

**⚠️ 也别把它当「下架残留」清掉**——它是**有意保留**的（B 案，2026-09-28 用户拍板），依据两条：

1. `integration.test.ts` 的 `image-zones` / `paper-zones` 两条端到端用例以它为输入，删了就红；
2. 它是**唯一一份用到 `background` 域的「真实完整配方」**——其余 5 只真实配方走 glass / font /
   radius / 颜色，没有一只碰 `background`。即 `background.mode: zones` 与 `glass.texture`
   这两条分支的**真实配方样本只此一份**。

分清这两条的分量：第 1 条是「删了会红」，第 2 条才是「值不值得留」。因为这两条分支的**机制覆盖**
另有合成用例守着——`tokens.test.ts:135-165` 逐条对应同样的四个 token（`surface-bg-image` /
`surface-bg-repeat` / `surface-bg-opacity` / `surface-bg-zones` ＋ `bg-image=none`），
`mix.test.ts:172-187` 另有一条走 `app.mixBackground`。所以**即便将来这份快照被删，覆盖也不归零**；
留下它换来的是「真实配方样本」这一条，代价是一个已经不代表任何在册插件的名字。

## 谁来管上游漂移

上游配方改了 → 本快照**不会**跟着变（这是有意的：快照是**钉子**，不是镜像）。
「以自己源码为输入」的等价断言该长在各主题插件仓里（L7 第 7.5 轮 `E6#102f` 已立案）——
那才是「改完立刻能验」的那一条。
⚠️ **这条对 `theme-zones/` 已不成立**（上游仓已删，没有「自己源码」可长）⇒ 它是本目录里唯一一份
**没有镜像、只能靠快照自己**的数据，见上节。
