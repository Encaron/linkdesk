# 悬停卡点击右移被裁（HintCard 已开卡时点击丢夹紧位）

> 立案：2026-11-05（用户实机发现：插件市场详情页「兼容性」悬停卡，点一下弹窗右移、右缘被软件边缘裁掉）。状态：📋 **已拍板立案 · 待实施**（2026-11-05 用户选 B＝04 独立小案；修复随壳 0.2.53 攒批）。
> 一句话：悬停说明卡**开着时**点一下锚标，卡跳回**未夹紧的估算位**（右移）→ 右缘被裁；根因 = `placeAndOpen` 重置 pos 而 `useLayoutEffect`（依赖 `[open, placement]`）在 `open` 已 true 时**不重跑**，没人再把卡拉回来。

## 一、现象（用户原话）

> 「鼠标瞄上去一会会就弹出一个弹窗，显示这个兼容性是怎么怎么样的……我鼠标点一下，这整个弹窗会往右移一点，导致右边这一部分被软件边缘裁掉了。理论上瞄上去之后它显示的东西不管我点不点都是那样显示在原位的。」

复现面 = 插件市场详情页右侧「兼容性」组的状态卡（共享件 HintCard，锚 = 状态角标「正常／兼容／…」）；侧栏贴视口右缘时必现（任何消费 HintCard 的位置只要锚在右缘同理）。

## 二、根因（2026-11-05 读码锁定：壳仓 `src/components/shared/hint-card/HintCard.tsx`）

出卡两步：

1. `placeAndOpen()`（:103-107）：量锚矩形 → 放**未夹紧估算位**（`left = 锚左缘`）→ 开卡；
2. `useLayoutEffect`（:121-128，**依赖数组只有 `[open, placement]`**）：量卡实际宽高 → `computeCardPosition` 做**视口夹紧**（`left` 夹到 `viewport.width − 卡宽 − 8px`）——悬停时看到的正确位置来自这一步。

**点击路径**：host 挂 `onClick={placeAndOpen}`（:153，触屏/键盘可达性留的路径）→ `setPos(未夹紧位)` ＋ `setOpen(true)`——但卡本来就开着，`open` 没变化 ⇒ **useLayoutEffect 不重跑** ⇒ 没人再夹回来 ⇒ 卡停在估算位（比夹紧位靠右）⇒ 右缘被裁。`onFocus`（:151，Tab 聚焦）同一条路径同样可触发。

点「兼容性」label（host 外）按代码是**收卡**不是移卡（pointerdown 外 → 关）——用户感知的「点 label 也右移」待实机复现时一并核（多半点到了角标附近，或收卡后 400ms 重开的中间态）；不影响本修。

## 三、修法（一行 ＋ 一枚单测）

- `useLayoutEffect` 依赖数组 `[open, placement]` → `[open, placement, pos]`：点击设了新 pos ⇒ 效果重跑 ⇒ 重新翻面＋夹紧；算出同值时 React 原地 bail-out，无死循环。（等价替代：`placeAndOpen` 里 `open` 已 true 则不重置 pos——二选一，实施时按测试好写的那边定。）
- 单测钉死：**已开卡时再触发 placeAndOpen（click／focus），卡保持夹紧位**（`HintCard.test.tsx` 加一例）。
- CompatStatus（市场插件）与一切调用方**零改动**——修在共享件内部。

## 四、送达轴（为什么是 04、为什么必须软件更新）

- `@linkdesk/ui` 在插件构建里是 **external**（E6#123 UI 集中供给，`packages/plugin-sdk/src/vite-config.ts:74-77`）：组件代码**不进插件包**，运行时由**壳池 vendor 单实例**供给（import-map）。
- ⇒ 修复只随**壳发版**送达；一发版**所有插件同时吃到**（官方／第三方／已装／未来，零插件重发）。壳当前攒批 0.2.53，本修随批。
- `@linkdesk/ui` npm bump（0.2.56→0.2.57）＝**包轴对齐**（未来插件构建的类型／语义），不是送达轴；发版照常 ＋ `release:mark` 基线。
- 壳 runtime 自身不渲染 HintCard（HintTip／KeybindingHint 仅注释提及、不 import）⇒ bug 暴露面全在消费 HintCard 的插件（现唯 marketplace CompatStatus）；file-tree InlineInput 那次记 04 是因为壳 runtime 自己也消费——两案同归 04 但机理不同，分档判据已细化（memory `docs-04-05-filing-rule`）。

## 五、待办

1. 实施：修 ＋ 单测 → `npm run check` 全绿。
2. dev 实机：市场详情页兼容卡——悬停出卡（夹紧位）→ 点击角标／Tab 聚焦 → 卡**原位不动**；窗口拉窄贴右缘再验一轮；「兼容性」label 点击行为顺带核并记录。
3. `@linkdesk/ui` 发 npm（0.2.57）＋ `release:mark` 基线；⛔ 插件轴零重发。
4. 随壳 0.2.53 攒批出货 → 本夹 `git mv` 进 [已落地/](../../00-README.md) ＋ 池表划销。
