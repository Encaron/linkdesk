/**
 * 当前档位的读取面（主进程）——**策略真源 = `userData/settings.json` 的 `ai.policy.mode`**。
 *
 * 规格：`01-设计/01` §五（状态与事件）＋ `01-设计/02` §五（fail-closed）
 *
 * 🔴 三条读数纪律：
 *   ① **键缺席 ⇒ 默认 `auto`**（D1；首次安装/从未改过的常态，不是故障）；
 *   ② **文件损坏 / 值非法 ⇒ `ask`**（最保守的可执行档）——⛔ 不许退回 `auto`/`full`，
 *      那等于「把配置写坏就能提权」；
 *   ③ **每次判定现读**（小文件，~KB 级）——不做内存缓存：缓存陈旧面正是「刚降档、AI 仍在旧档执行」
 *      这类事故的温床。`effectiveAt` 记读数时刻（账本「以执行时点那次为准」）。
 *
 * ⚠️ 只认 **user scope**（`userData/settings.json`）。工作区级 `.linkdesk/settings.json` 不参与——
 *    否则「换个项目打开」就能改 AI 权限，绕过用户设置。
 *
 * ⛔ 写侧不在这里：档位**写**只能由壳侧 `aiPolicy.setMode`（`userOnly`）与提权框 handler 完成，
 *    主进程只读（批准权属于用户，不属任何渲染体，见 02 §四/§七）。
 */

import * as fs from "node:fs";
import { DEFAULT_POLICY_MODE, FALLBACK_POLICY_MODE, isPolicyMode, type PolicyMode } from "./modes.js";

/** 配置键——字面量只许出现在本文件与 `src/App/config/aiBridge.ts`（门禁 P5） */
const POLICY_MODE_KEY = "ai.policy.mode";

export interface PolicySnapshot {
  mode: PolicyMode;
  /** 配置读不到 / 损坏 / 值非法 ⇒ 已按 `FALLBACK_POLICY_MODE` 处理（账本可据此标 degraded） */
  degraded: boolean;
  /** 读数时刻（ms）——执行时点那次为准 */
  effectiveAt: number;
}

/** 由 settings.json 的**原文**求档位（纯函数，单测直接打） */
export function policyModeFromSettings(raw: string | null): PolicySnapshot {
  const now = Date.now();
  if (raw === null) {
    // 文件不存在 = 首次启动 / 从未写过设置——默认档，不是故障
    return { mode: DEFAULT_POLICY_MODE, degraded: false, effectiveAt: now };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { mode: FALLBACK_POLICY_MODE, degraded: true, effectiveAt: now };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { mode: FALLBACK_POLICY_MODE, degraded: true, effectiveAt: now };
  }
  const value = (parsed as Record<string, unknown>)[POLICY_MODE_KEY];
  if (value === undefined) return { mode: DEFAULT_POLICY_MODE, degraded: false, effectiveAt: now };
  if (!isPolicyMode(value)) return { mode: FALLBACK_POLICY_MODE, degraded: true, effectiveAt: now };
  return { mode: value, degraded: false, effectiveAt: now };
}

/** 读一次文件（`null` = 文件不存在；读不动按损坏处理） */
export function policyModeFromFile(filePath: string): PolicySnapshot {
  let raw: string | null;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return policyModeFromSettings(null);
    const now = Date.now();
    return { mode: FALLBACK_POLICY_MODE, degraded: true, effectiveAt: now };
  }
  return policyModeFromSettings(raw);
}

/** 设置文件路径（`initAiBridge` 启动时定；未定 ⇒ 默认档） */
let settingsFile: string | null = null;

/** 启动接线（`electron/services/aiBridge/index.ts` 的 `initAiBridge`）——⛔ 不供业务代码调用 */
export function setPolicySettingsFile(filePath: string | null): void {
  settingsFile = filePath;
}

/**
 * AI 通道是否开着（`ai.mcp.enabled` / `ai.cli.enabled` 任一 true）——徽标显示条件。
 * 读不动 = false（没门可管；隐藏徽标比显示一个不知道状态的锁安全）。
 */
export function getChannelsEnabled(): boolean {
  if (!settingsFile) return false;
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
    return s["ai.mcp.enabled"] === true || s["ai.cli.enabled"] === true;
  } catch {
    return false;
  }
}

/** 当前策略快照（每次现读） */
export function getPolicySnapshot(): PolicySnapshot {
  if (!settingsFile) return policyModeFromSettings(null);
  return policyModeFromFile(settingsFile);
}
