/**
 * stringList 控件的前置计算——「锁定行 / 可编辑行」切分（纯函数，零 React）。
 * E6#87d：自 renderControl.tsx 逐字搬出（原件是 uiHint:"stringList" 分支内的内联块）。
 *
 * E6#30c（03-添加市场源-mockup.html ① 行内形态——设计唯一源）：字符串数组（URL 源列表）编辑器。
 * default 数组 = locked 固定行（官方源「内置」徽标 + 锁——不可删、不入 onChange 值、永不落盘，
 * 读时由 getSourceUrls 恒前置去重）；effective 值（含 default）减 locked 后 = 作者源（可删）。
 * 存盘只写作者源数组（onChange 收 StringListEditor 的 value = 已滤 locked 的剩余）。UI 文案走 t()。
 * 🔒 身份规则（E6#30c）：locked/editable 相减与行内判重用同一把钥匙 urlSourceKey（@linkdesk/ui
 *   共享纯函数——github 源归 owner/repo、分支无关，市场弹窗加源同此规则，两扇门收敛）。官方源
 *   「其他形态」（仓库主页/HEAD 直链）在此一并滤除：不显示为可删作者行、行内直添即报重复——
 *   官方凭任何入口都落不了盘；历史污染残留随下次存盘自动清理（渲染即滤，不落盘）。urlSourceKey
 *   非 github 输入返 null → 回精确比较（无身份的串不受影响），渲染器本身保持零插件域依赖。
 *   文案 = 宿主中性（2026-09-08）：placeholder/消息只留通用措辞（粘贴 URL/格式/已在列表），不写
 *   marketplace 专属句子（作者仓库/示例 URL）——该 property 的专属引导由 marketplace 自己 plugin.json
 *   的 description 承担（SettingRow 已渲染在编辑器上方）。本函数对任何 uiHint:"stringList" 配置通用。
 */

import { urlSourceKey } from "@linkdesk/ui";
import type { ConfigProperty } from "../types";

/** 锁定行（default 声明）+ 可编辑行（effective 值滤掉锁定身份后的剩余） */
export function splitStringList(
  prop: ConfigProperty,
  value: unknown,
): { locked: string[]; editable: string[] } {
  const locked = Array.isArray(prop.default)
    ? prop.default.filter((s): s is string => typeof s === "string")
    : [];
  const base = Array.isArray(value)
    ? (value as unknown[])
    : Array.isArray(prop.default)
      ? (prop.default as unknown[])
      : [];
  const lockedKeys = new Set<string>();
  for (const s of locked) {
    const k = urlSourceKey(s);
    if (k !== null) lockedKeys.add(k);
  }
  const editable = base.filter((s): s is string => {
    if (typeof s !== "string") return false;
    if (locked.includes(s)) return false; // default 精确形态恒锁
    const k = urlSourceKey(s);
    return k === null || !lockedKeys.has(k); // 官方其他形态（仓库主页/HEAD）按身份滤除
  });
  return { locked, editable };
}
