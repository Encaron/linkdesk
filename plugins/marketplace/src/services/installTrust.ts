/**
 * installTrust —— E6#71k 安装信任门（「每来源一次」）。
 *
 * 信任单位 = **来源**（sourceName，`owner/repo`），不是「这一次安装」；官方默认源恒预信任
 * （平台自策展——对映 VS Code 对 Marketplace 扩展不弹信任框）。
 * 权威设计 = [18-通知系统全账与设计定案 §五 J] + [08-信任与安全 §四.2 现行规则表]。
 *
 * **三个必须一起补的洞（§五 J.1）：**
 *   ⓐ 读失败 / 老 preload 缺 `configuration` 面 → **未知即未信任**（回落弹卡）。
 *      反向（读不到就当已信任）是**静默安装漏洞**——本模块所有读函数失败一律回空表。
 *   ⓑ **更新与安装走同一个门**——调用方 = DetailView.doVersionAction（手动：弹卡）/
 *      updateDiscovery（后台自动：**跳过 + 告知**，2026-09-10 用户拍板）。
 *   ⓒ 官方源恒信的前提（谁掌握官方仓库谁就能向全部用户零点击投代码）写进 08 §四.3 / 18 §五 J.1ⓒ，
 *      不在代码里消化——本模块只执行，不替它辩护。
 *
 * **三条随方案生效的约束（§五 J.2）：**
 *   ① 撤销入口 = `forgetSource` + 市场源弹窗「已信任的来源」列表（本仓零撤销 UI 先例，故必须自带）
 *   ② 同一 id 换来源 → **强制重问**（`installedFrom` 台账；判序上压过「已信任」——J.2②「不看信任表」）
 *   ③ http 源不可记忆（可被 MITM）→ 恒判未信任，永远逐次问
 *
 * **🔴 诚实边界（§五 J.3）：本模块不是安全机制，且只在市场 UI 层成立。**
 * `linkdesk.pluginManager.install` / `installWithProgress` 是**任何插件都能调的壳 API**，主进程零信任判定
 * ——已装插件可绕开本门从任意网址静默装。全仓零签名、零 checksum 校验。⇒ 文档与 UI 文案**不得宣称
 * 「更安全」**，只能说「少点一半的重复点击，并把唯一有信息量的决定留在它该在的位置」。
 *
 * 两个配置键都走**既有** `window.linkdesk.configuration`（零新增壳 API）；按 §五 J **不声明进
 * contributes.configuration**——不进设置 UI、不被手改（撤销走本插件自带列表 UI）。
 */

import type { CatalogEntry } from "./marketCatalog";

/** 信任表键——已信任的第三方来源名数组（`owner/repo`）。未在 plugin.json 声明（§五 J：不进设置 UI） */
export const TRUSTED_SOURCES_KEY = "marketplace.trustedSources";
/** 台账键——`pluginId → 上次成功安装该 id 时的来源名`（§五 J.2② 换来源强制重问的判据） */
export const INSTALLED_FROM_KEY = "marketplace.installedFrom";

const lk = () => window.linkdesk;

/* ═══ 纯判定（零 IO——vitest 直测） ═══ */

/** 弹卡原因——`official`/`trusted` = 不弹；其余三种 = 弹（UI 据此选文案） */
export type TrustReason = "official" | "trusted" | "first-time" | "http" | "source-changed";

export interface TrustVerdict {
  /** 是否弹信任卡 */
  prompt: boolean;
  reason: TrustReason;
  /** 点「确认安装」是否记住该来源（http 源恒 false——§五 J.2③）；不弹卡时无意义恒 false */
  remember: boolean;
}

/** http（明文）源——可被 MITM，信任不可记忆（§五 J.2③） */
export function isHttpSourceUrl(url?: string): boolean {
  return typeof url === "string" && /^http:\/\//i.test(url.trim());
}

/**
 * 纯判定——是否需要弹信任卡。
 *
 * **判序钉死：官方 → http → 换来源 → 已信任 → 首次。**
 * 「换来源」必须压过「已信任」——§五 J.2②：信任的单位是「这个来源」不是「这个 id 现在归谁」，
 * 换人发布是**新信息**，必须让用户看见。少了这一条，§四 的简化会把 §六 原本防住的抢占场景反向打开。
 *
 * `sourceName` 缺失（条目无来源信息）→ 落「首次」弹卡——**未知即未信任**（与 ⓐ 同向）。
 */
export function decideTrust(input: {
  /** 合并注入的官方标记（marketCatalog.mergeCatalogs——与 UI 徽标同源，不在此重判 URL 形态） */
  official?: boolean;
  /** 合并注入的来源 URL（判 http 明文源用） */
  sourceUrl?: string;
  /** 合并注入的来源名（`owner/repo`）——信任表的键 */
  sourceName?: string;
  /** 已信任来源表 */
  trusted: readonly string[];
  /** `pluginId → 上次安装来源` 台账 */
  installedFrom: Readonly<Record<string, string>>;
  pluginId: string;
}): TrustVerdict {
  if (input.official) return { prompt: false, reason: "official", remember: false };
  if (isHttpSourceUrl(input.sourceUrl)) return { prompt: true, reason: "http", remember: false };
  const name = input.sourceName;
  const prev = input.installedFrom[input.pluginId];
  if (name && prev && prev !== name) return { prompt: true, reason: "source-changed", remember: true };
  if (name && input.trusted.includes(name)) return { prompt: false, reason: "trusted", remember: false };
  return { prompt: true, reason: "first-time", remember: true };
}

/* ═══ 写串行化 ═══
 * 信任表 / 台账都是「读—改—写」。四次点击可能交错（连装多个 / 撤销与安装同时）→ 不加锁会丢写。
 * 单条 Promise 链把所有写串行——本模块写量极低（点一次写一次），链长可忽略。 */

let _writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = _writeChain.then(fn, fn);
  _writeChain = next.catch(() => undefined); // 链自身吞错——调用方仍从 next 收到 rejection
  return next;
}

/* ═══ 读（ⓐ 失败一律回空表——未知即未信任） ═══ */

/** 读信任表——读失败 / 缺 configuration 面 / 形状不对 → **空表**（回落弹卡） */
export async function readTrustedSources(): Promise<string[]> {
  try {
    const raw = await lk()?.configuration?.get<unknown>(TRUSTED_SOURCES_KEY);
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && !!x) : [];
  } catch {
    return [];
  }
}

/** 读台账——同款守卫，失败 → 空表 */
export async function readInstalledFrom(): Promise<Record<string, string>> {
  try {
    const raw = await lk()?.configuration?.get<unknown>(INSTALLED_FROM_KEY);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k && typeof v === "string" && v) out[k] = v; // 空 id 不是插件——与信任表同款「脏项一律不认」
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 安装 / 更新前的门判定——读信任表 + 台账 → decideTrust。
 * 调用方据 `prompt` 决定是否弹卡；`remember` 决定点确认后是否写信任表。
 */
export async function trustDecisionFor(
  entry: Pick<CatalogEntry, "id" | "official" | "sourceUrl" | "sourceName">,
): Promise<TrustVerdict> {
  const [trusted, installedFrom] = await Promise.all([readTrustedSources(), readInstalledFrom()]);
  return decideTrust({
    official: entry.official,
    sourceUrl: entry.sourceUrl,
    sourceName: entry.sourceName,
    trusted,
    installedFrom,
    pluginId: entry.id,
  });
}

/* ═══ 写 ═══ */

/**
 * 记住来源——点「确认安装」即写。
 * §五 J.2⑥：**安装随后失败不回滚该信任**（信任对象是「来源」不是「这一次安装」）——语义显式，非默认。
 * http 源由调用方据 verdict.remember 自行跳过，本函数不做二次守卫（信任表里本来就不该有 http 源）。
 */
export function rememberSource(sourceName?: string): Promise<void> {
  const name = sourceName?.trim();
  if (!name) return Promise.resolve();
  return serialized(async () => {
    const cur = await readTrustedSources();
    if (cur.includes(name)) return;
    await lk()?.configuration?.set(TRUSTED_SOURCES_KEY, [...cur, name]);
  });
}

/** 撤销信任——移除后下次同源安装重新询问（§五 J.2①）。不在表内 = no-op 零写 */
export function forgetSource(sourceName: string): Promise<void> {
  const name = sourceName?.trim();
  if (!name) return Promise.resolve();
  return serialized(async () => {
    const cur = await readTrustedSources();
    const next = cur.filter((n) => n !== name);
    if (next.length === cur.length) return;
    await lk()?.configuration?.set(TRUSTED_SOURCES_KEY, next);
  });
}

/** 记台账——安装/更新**成功后**写（失败不写，否则「换来源」判据被未落地的安装污染） */
export function rememberInstalledFrom(pluginId: string, sourceName?: string): Promise<void> {
  const name = sourceName?.trim();
  if (!pluginId || !name) return Promise.resolve();
  return serialized(async () => {
    const map = await readInstalledFrom();
    if (map[pluginId] === name) return;
    await lk()?.configuration?.set(INSTALLED_FROM_KEY, { ...map, [pluginId]: name });
  });
}
