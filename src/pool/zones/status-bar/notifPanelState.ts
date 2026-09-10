/**
 * 通知面板三态状态机——E6#73a（18 档 §五 A「视觉两态，语义三态」）。
 *
 * **视觉上只有两个样子**（展开 / 收起），但**语义上有三个态**——差别只在「自动弹出被不被压制」：
 *
 * | 语义态 | 视觉 | 自动弹出 | 进入条件 |
 * |:--|:--|:--|:--|
 * | `idle` | 收起 | 允许 | 初始态；池重建 / 重启后回到这里 |
 * | `open` | 展开 | 已在展开，无所谓 | 点铃铛、用户点击发起安装、或收到唤醒 |
 * | `minimized` | 收起 | **被压制** | **只有**点「最小化」或按 Esc 才进来 |
 *
 * **为什么 `minimized` ≠ `idle`**（18 档 §五 A，用户 R5-4 原话「并不是我点击最小化之后
 * 它就永远最小化了」）：`idle` 是「我还没管它，有事你叫我」，`minimized` 是「**我知道它在跑，
 * 这会儿别吵我，出结果再叫我**」。两者视觉一样，**认账时机不一样**（关的时候记水位 vs 没管过）。
 *
 * 🔴 **`minimized` 对壳侧 `autoOpen` 是「同值」的，这是定案不是遗漏**（E6#73b 收口）：
 * 「最小化」**在行为上没有任何静音权力**——它只做两件事：把面板收起来、记已读水位；
 * **所有能唤醒的事件都会把它弹回来**（18 档 §五 A 第 4 行「IDLE / MINIMIZED → 收到唤醒」，
 * §五 B 计数表「第 1 个装完前先按了最小化 → 1 次（第 1 条终态唤回）」）。
 * ⇒ 壳侧 `autoOpen` **不得**带 `!isNotifMinimized()`：加了等于终态唤不回，
 * R5-5「哪怕是失败还是成功，有限的状态他就应该冒出来」当场失效。
 * 真要「攒着不冒」是**新规格**，须用户拍板（§五 B 尾「诚实告知」），不在本档。
 *
 * 🔴 **单一表示**：三态**必须是同一个状态值**（就是本模块的 `NotifPanelState`），
 * **不许落成 `isNotifPanelOpen` + `isNotifMinimized` 两个独立布尔**——两个布尔能拼出
 * 「既非展开、也非最小化」的第四种非法组合，且没有一行持有它的完整生命周期。
 * **迁移只经本模块的 `notifPanelTransition` 一个入口**——任何调用方不得绕过它直接改状态。
 *
 * ## 七条迁移（§五 A 全表，**多一条都不许有**）
 *
 * | # | From → To | 事件 | 认账（标已读） |
 * |:--|:--|:--|:--|
 * | 1 | IDLE → OPEN | `bell`（点铃铛） | ✅ |
 * | 2 | IDLE → OPEN | `wake`（用户点击发起安装——白名单①） | ❌ |
 * | 3 | MINIMIZED → OPEN | `bell` ← 用户亲口锚点 R3-5 | ✅ |
 * | 4 | IDLE / MINIMIZED → OPEN | `wake`（收到唤醒） | ❌（用户还没看） |
 * | 5 | OPEN → MINIMIZED | `minimize`（点面板内「最小化」） | ✅（关时就认账） |
 * | 6 | OPEN → MINIMIZED | `minimize`（按 Esc，语义 = 最小化不是关闭） | ✅ |
 * | 7 | 任意 → IDLE | 池进程崩溃重建 / 应用重启 | —— |
 *
 * ⚠️ **第 7 行没有事件类型，这是有意的**：池崩溃重建 = 整个渲染进程重来 = React 树全新挂载
 * ⇒ `useState` 初值即 `idle`，**复位是结构性成立的，不需要一个 `reset` 事件**（加了也是无人调用的
 * 死代码）。73l 要复位的**不是这个池侧状态值**，而是**壳侧那份镜像**——见下。
 *
 * ✅ **壳侧镜像的崩溃复位已落地（E6#73l）**：`StatusBarZone` 挂载那一帧就播一次当前状态
 * （`emitNotif("notif:panel", …)` **不跳过首帧**）。池崩 ⇒ 新池挂载 ⇒ 播的是初值 `idle`
 * ⇒ 卡住的镜像被拉回。**这不是第 8 条迁移**：本表一行未加，播的是池侧当前真值，属同步不属迁移。
 *
 * 反向约束（§五 A「明确不存在的行为」，写成测试防回退）：
 * - ❌ **OPEN 时点铃铛不产生迁移**——表里没有 `OPEN →(铃铛)→ …` 这一条。铃铛是**进**面板的入口，
 *   出面板的唯一动作是「最小化」（用户 R3-1 抱怨的正是「所有按钮都在管关掉」，再加一条反向的
 *   铃铛开关就是把它加回来）。⇒ 已展开时点铃铛 = **空操作**，状态不变、不认账。
 * - ❌ 点面板外面关闭、最小化 = 永久静音、新条目重弹 / 重排 / 装完自动收起——均不存在
 *   （点外面不关的收口在 E6#73b；后三条由本模块「无迁移即无动作」天然保证）。
 */

/** 面板语义三态——**唯一状态表示**（视觉两态由 `state === "open"` 一处分叉） */
export type NotifPanelState = "idle" | "open" | "minimized";

/** 触发迁移的事件——**只有这三类**（第 7 行无事件，见文件头注） */
export type NotifPanelEvent =
  | { type: "bell" } // 点状态栏铃铛
  | { type: "wake" } // 收到唤醒（白名单条目诞生；白名单表达式归 E6#73b）
  | { type: "minimize" }; // 点面板内「最小化」/ 按 Esc（Esc 的接线归 E6#73b）

/** 一次迁移的结果——下一个状态 + 本次是否「认账」 */
export interface NotifPanelTransition {
  state: NotifPanelState;
  /**
   * 本次迁移是否把**当时已存在的全部条目**标记为已读。
   *
   * 点铃铛开（用户正在看）与最小化关（关时就认账）为 `true`；收到唤醒开为 `false`
   * （§五 B：用户还没看，不该替他把红点清掉）。
   *
   * ⚠️ **最小化必须认账，这是「最小化」真正生效的机械前提**（不是优化）：不认账则未读立刻非零
   * → 壳侧 `autoOpen` 马上为真 → 面板自己弹回来，最小化 100% 失效。
   */
  markSeen: boolean;
}

/**
 * **唯一迁移入口**——纯函数，全表见文件头注。`prev` 状态 + 一个事件 → 下一个状态 + 认账旗标。
 * E6#73b：`minimize` 这条路径由面板的 Esc 接线驱动——Esc 的语义是**最小化**不是关闭（§五 A 第 6 行），
 * 且 Esc 受「只关最上层浮层」约束（`overlayLayer.ts`），故它仍走本入口、不绕过。
 *
 * 无迁移时（如已展开再点铃铛）返回**原状态 + `markSeen:false`**——调用方照常走同一条路，
 * 不需要自己先判「这个事件在当前状态下有没有意义」。
 */
export function notifPanelTransition(
  prev: NotifPanelState,
  event: NotifPanelEvent,
): NotifPanelTransition {
  switch (event.type) {
    // 第 5、6 行：OPEN → MINIMIZED（唯二的**关闭**路径；两行同一个事件——Esc 的接线在 73b）
    case "minimize":
      return prev === "open"
        ? { state: "minimized", markSeen: true }
        : { state: prev, markSeen: false };

    // 第 1、3、4 行：IDLE / MINIMIZED → OPEN。已展开时**无迁移**（表里没有 OPEN→铃铛 这条）
    case "bell":
      return prev === "open"
        ? { state: "open", markSeen: false }
        : { state: "open", markSeen: true };

    // 第 2、4 行：IDLE / MINIMIZED → OPEN，**不认账**（唤醒不是用户在看）
    case "wake":
      return { state: "open", markSeen: false };
  }
}

/** 面板当前是否视觉展开——池侧渲染分支的唯一出口（`state === "open"` 只在这里分叉一次） */
export function isPanelExpanded(state: NotifPanelState): boolean {
  return state === "open";
}
