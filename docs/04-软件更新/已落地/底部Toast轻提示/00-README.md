# 底部 Toast 轻提示 · 任务档案

> 🔴 **状态：立案＋契约定稿（2026-11-19）——⛔ 未动工。**
> **任务一句话**：给 LinkDesk 恢复**底部/右下角临时轻提示（Toast）**这一层 UI，并定义它与**铃铛通知面板**的分工。
> **归属**：**壳仓能力**（preload 面／通知服务／类型／命名空间矩阵）——⛔ 不属于插件，⛔ 不并入任何插件仓任务。
> **独立立项**（2026-11-19 用户明确）：本任务与 [Marketplace-Store](../Marketplace-Store/00-README.md) **互相独立**——那边只是**首个消费者**（「检查完成·发现 3 个更新」），不是本任务的归属方。
> **🔴 改判记录**：本能力曾在 2026-10-01 由用户指令整笔删除（见 §一），2026-11-19 用户**本人授权恢复**并明确「历史是螺旋式上升的，需求会变」——本档以**新三条约束**（同 store／不同名／不同角落）承接，而不是回滚旧形态。

## 档案表

| 文档 | 状态 | 回答什么 |
|---|---|---|
| 本页（00-README） | ✅ 立案·改判记录 | 为什么做、与 E6#72 的关系、分工总则 |
| [01-API与组件契约.md](01-API与组件契约.md) | ✅ 定稿 | 命名、API 正表、降级规则、组件解剖、位置、归一化约束 |
| [02-边界清单.md](02-边界清单.md) | ✅ 定稿 | B1–B37 逐条判据（文本/动作/路由/队列/交互/位置/生命周期/禁令） |
| [04-任务清单.md](04-任务清单.md) | ✅ 定稿 | 落点判定、T1–T17 文件与函数、D1–D6 文档、Q1–Q6 测试门禁、实施顺序 |
| [05-设计图-Toast.html](05-设计图-Toast.html) | 🎨 **设计图（可交互）** | 照 Slider 稿绘图法：分工对照／API／解剖／四种严重级／文本三道坎／队列／位置／无障碍／禁令／验收 |

## 一、为什么存在

查证结论：**这类提示今天在软件里不存在**。

| 证据 | 内容 |
|---|---|
| `docs/02-Electron架构/插件生态与发布/E6-执行清单.md:871` | **E6#72a**「右下窄小卡**端到端整删**（池 ToastHost／壳推流桥／主进程三通道／类型面全清）」⇒ `window.linkdesk.toast` **undefined** |
| `src/App/bridges.ts:4` | 「E6#72：Toast 哑桥整删（右下窄卡链路移除，通知归一＝铃铛宽面板）」 |
| `src/core/api/linkdesk-api/ui.ts:17` | 「the bottom-right narrow-card path was **removed wholesale**」 |
| `docs/02-Electron架构/归一化基建/契约生成/命名空间矩阵.md:87` | 逐名对账后**删除死面 `toast`** |

E6#72 收官 2026-09-10（软件 0.1.26→0.1.27），唯一通知面＝**铃铛宽面板**。
`docs/02-Electron架构/E3.5-软件生态美化/Toast通知美化/` 是**旧设计档案**，已被 E6#72 取代。

## 二、分工判据（先定这个，再谈实现）

| 场景 | 走哪个面 | 理由 |
|---|---|---|
| 轻反馈：复制成功 / 检查完成 / 已刷新 / 已停用 | **Toast**（3s 自动消失） | 用户不需要回看，也不需要动作 |
| 需要保留：错误诊断 / 需要决策 / 带按钮 | **铃铛面板**（`persistent` + actions） | 会被忽略的提示等于没说 |
| **进度** | **铃铛面板**（progress notification：`update(msg,pct)` / `finish`） | ⛔ Toast 不承载进度条——两套进度必然不一致 |
| 后台任务完成 | 面板一条 ＋ Toast 一条（同 `taskKey`） | Toast 说「完成了」，面板留「以后还能查」 |

**一句话**：**Toast 是"路过"，面板是"留存"。** 同一事件允许两面都出现，但必须共用一个 `taskKey` 且只播报一次。

## 三、与 E6#72 的关系（不是回滚）

E6#72 删的是「**右下窄卡作为唯一通知面**」——当时的问题是错误与决策类通知也被塞进 3 秒就消失的窄卡里。
本任务**不恢复那个语义**：Toast 只承接**轻反馈**，一切需要留存/决策/进度的仍归面板。判据见 §二。

## 四、边界（每条都要落到实现）

1. **自动消失**：缺省 3s（`ttl` 可调）；hover 暂停计时。
2. **堆叠上限 3 条**：超出时最旧先退场；⛔ 无限堆叠遮挡内容。
3. **同 key 合并**：`key` 相同 → 更新文案/severity，不新增节点。
4. **位置**：右下角，避让状态栏与面板；跟随宿主窗口，⛔ 相对屏幕定位。
5. **不抢焦点**：出现不改变焦点与滚动位置；只有带 `actions` 时按钮可 Tab 到。
6. **无障碍**：`role="status"` + `aria-live="polite"`；错误用 `role="alert"`；`prefers-reduced-motion` 下不做位移动画。
7. **无持久态**：`persistent` 是面板字段，Toast 要么自动走、要么被同 key 顶掉。
8. **壳层统一**：所有插件共用同一条通道；⛔ 插件自绘底部提示。

## 五、API 草案（壳层）

```ts
// window.linkdesk.toasts
show(opts: {
  key?: string;                 // 去重键：同 key 更新而非新增
  message: string;
  severity?: "info" | "success" | "warning" | "error";
  actions?: { id: string; title: string }[];   // 可选，最多 1 个
  ttl?: number;                 // ms，缺省 3000
}): Promise<ToastHandle>;       // handle.dismiss()
```

- **命名**：新增 `toasts`；⛔ 不复用已删的 `toast` 旧名（避免与死面混淆）。
- **类型面**：`linkdesk-api/types.ts` 增 `ToastHandle` / `ToastOptions`；`ui.ts` 增 surface；preload 同步暴露。
- **门禁**：`scripts/check-namespace-matrix.mjs` 同步（否则契约对账失败）。
- **服务落点**：`core/services/ui/NotificationService` 旁新增 toast store（独立于面板 store，共用 severity 枚举与 i18n）。

## 六、消费方

| 消费方 | 场景 | 状态 |
|---|---|---|
| [Marketplace-Store](../Marketplace-Store/00-README.md) | 「检查完成 · 发现 3 个可用更新」「已刷新」「已停用」 | **首个消费者**（其 00 涉及面 #11） |
| 插件权限系统（池内） | 被拒时「需要开启某某权限」轻提示 | 待联动（见其 00） |
| 壳自身 | 文件已删除、内存压力等现有 `pushToast` 调用 | 迁移候选：轻反馈改走 Toast，留存类留面板 |

## 七、验收

- [ ] `window.linkdesk.toasts.show({key,message})` 任意插件可调；连发 5 条同 key → 只有 1 条节点。
- [ ] 连发 4 条不同 key → 最多 3 条可见，最旧先退。
- [ ] hover 暂停 ttl；移开后继续倒计时。
- [ ] 带 action 的 Toast 可键盘 Tab 到按钮并按 Enter 触发。
- [ ] 面板与 Toast 同 key 时屏幕阅读器只播报一次。
- [ ] `check-namespace-matrix` 绿灯；`npm run check` 全绿。
