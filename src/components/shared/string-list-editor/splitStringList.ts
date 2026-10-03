/**
 * stringList 控件的前置计算——「锁定行 / 可编辑行」切分（纯函数，零 React 零宿主耦合）。
 * E6#87d 自设置仓 `renderControl/stringList.ts` 平移（判据 A：消费宿主 `uiHint:"stringList"`
 * 声明的计算住共享层，任何声明者与渲染者都取得到）。
 *
 * E6#30c：default 数组 = locked 固定行（官方源「内置」徽标 + 锁——不可删、不入 onChange 值、
 * 永不落盘，读时由消费方恒前置去重）；effective 值（含 default）减 locked 后 = 作者源（可删）。
 * 身份规则（E6#30c）：相减与行内判重用同一把钥匙 urlSourceKey——github 源归 owner/repo、分支
 * 无关；官方源的「其他形态」（仓库主页/HEAD 直链）在此一并滤除。urlSourceKey 非 github 输入
 * 返 null → 回精确比较。本函数对任何 uiHint:"stringList" 配置通用，零插件域依赖。
 *
 * 入参只读 `prop.default` 一个字段 ⇒ 形参收窄为结构类型 `{ default?: unknown }`，
 * 消费方 ConfigProperty 直接传得进（LSP 兼容），共享层不引插件类型。
 */

import { urlSourceKey } from "./urlSourceKey";

/** 锁定行（default 声明）+ 可编辑行（effective 值滤掉锁定身份后的剩余） */
export function splitStringList(
  prop: { default?: unknown },
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
