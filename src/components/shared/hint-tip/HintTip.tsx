/**
 * HintTip——轻提示条（04「悬停提示系统」件 1；用户 2026-09-27 拍板：名称 `HintTip`）。
 *
 * ── 它是什么 ──
 * 软件里今天"悬停出来的小方框"是 **Chromium 原生 tooltip**（HTML `title` 属性白送）：外观
 * （底色/边框/圆角/字体/字号/延迟/位置）全由系统决定，**CSS 碰不到**，因此它不跟壳的主题、
 * 三档玻璃模糊、全局字号缩放、`--ui-scale`——一条都不跟。本件把它换成壳自己的轻提示条，
 * 并**自动带出快捷键**（复用右键菜单那份「命令 → 快捷键」解析，与菜单同源）。
 *
 * ── 本组件是「糖」，不是实现 ──
 * 真正的实现是池内单例渲染器 `HintTipRenderer.tsx`（全局委托 + 位置/翻面/夹紧 + 状态机）。
 * 本组件**只把 props 转成属性**（`cloneElement`）——刻意如此：
 *   ① **零 DOM 结构侵入**（不包 `<span class="ldk-hint-card-host">` 那样的宿主层）——
 *      包层会改 flex item 身份、`>` 直接子选择器、`:nth-child`，"按钮的兄弟节点"假设全错位；
 *   ② 单例渲染器 ⇒ 一处状态机、一处样式、一处翻面逻辑，不会出现 N 份 `useState`；
 *   ③ 插件不需要 import 壳任何东西（属性式铁律）——本组件只是给写 TSX 的人一个不用记属性名的写法。
 *
 * ── 与 `HintCard` 的分工（两件同族不同物，`ldk-hint-*` 命名空间下并列）──
 * `HintCard` 管「说明卡」：有标题/注脚/长文案/玻璃/300px 定宽，看一眼就走。
 * `HintTip` 管「轻提示条」：一行/紧凑/跟手/零结构侵入。
 * ⛔ 本件**不替代** `HintCard`（别把多行长说明塞进条里，那是卡的活）。
 *
 * ── 保底 ──
 * 既无 `label` 又无 `command` ⇒ 原样返回 children（⛔ 不产出任何属性、不出空壳——照 HintCard 保底④）。
 * 提示是**纯增强**：渲染器若未挂载（脱出窗/门禁外场景）⇒ 只是"没有提示"，绝不阻断交互。
 *
 * 用法（复合内容/写 TSX 时）；绝大多数场景直接用属性更省——见设计详案 §四·4.1。
 */
import { cloneElement, isValidElement } from "react";
import type { TipPlacement } from "./placement";
import { HINT_ATTR, HINT_COMMAND_ATTR, HINT_DELAY_ATTR, HINT_PLACEMENT_ATTR } from "./hintAttrs";

export interface HintTipProps {
  /** 提示主文案（给 `command` 时本项可省——渲染器取命令 title 当文案） */
  label?: string;
  /** 命令 id——自动补文案与快捷键（与右键菜单同源） */
  command?: string;
  /** 首选方位（缺省 `top`；贴不下自动翻面） */
  placement?: TipPlacement;
  /** 意图延时覆盖（ms）——揭示「被截断的字」传 `0` */
  openDelayMs?: number;
  /** 锚元素（**唯一子代**——属性挂到它身上，DOM 结构零变化） */
  children: React.ReactElement<Record<string, unknown>>;
}

function HintTip({ label, command, placement, openDelayMs, children }: HintTipProps) {
  const hasAnything = (label != null && label !== "") || command != null;
  if (!hasAnything) return children; // 保底：无内容 ⇒ 原样返回，零属性零空壳
  if (!isValidElement(children)) return children; // 防御：非元素子代（不该发生）——不抛，静默降级

  // 只写有值的属性——`data-hint=""` 会让渲染器判空后不出条（语义上等价，但空属性进 DOM 是噪声）
  const attrs: Record<string, string> = {};
  if (label != null && label !== "") attrs[HINT_ATTR] = label;
  if (command != null) attrs[HINT_COMMAND_ATTR] = command;
  if (placement != null) attrs[HINT_PLACEMENT_ATTR] = placement;
  if (openDelayMs != null) attrs[HINT_DELAY_ATTR] = String(openDelayMs);

  return cloneElement(children, attrs);
}

export default HintTip;
