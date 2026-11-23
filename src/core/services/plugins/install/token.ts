/**
 * 一次性确认令牌——签发与核销（D2 的机械落点）。
 *
 * 形态：内存 Map，key = nonce。**一表一 owner**（本文件），⛔ 不落盘、⛔ 不过 IPC、⛔ 不给池。
 * 一次性：`consumeToken` 命中即删（同一 nonce 第二次调用 = `no-token`，不是 `used`——
 * 表里查不到就是查不到，别让调用方以为「还能再用一次」）。
 *
 * 绑定：`pluginId + version + sourceUrl + sha256` 逐字段全同才算命中（见 `TokenBinding` 的注释）。
 * 过期：60s（`TOKEN_TTL_MS`），`issue` 时顺带清理过期条目——表不会长命，也不会无限涨。
 *
 * ⚠️ 诚实边界：这是**进程内**的门，防的是「壳内忘了走确认就执行」与「市场漏了确认 API」，
 * 不是密码学意义上的授权（同一进程内的代码总能绕过内存表）。真正的对抗面在 P2 权限系统。
 */

import type { PluginInstallRequest } from "../../../api/linkdesk-api/types";
import { TOKEN_TTL_MS, type InstallConfirmationToken, type TokenBinding, type TokenVerdict } from "./types";

/**
 * 请求 → 绑定面的**唯一映射**（签发方与核销方共用；⛔ 两处各写一遍字段列表）。
 * `sourceUrl` 绑**实际下载地址**（比 `source.url` 更紧：换包必换地址）；`sha256` 再钉内容。
 */
export function bindingOfRequest(req: PluginInstallRequest): TokenBinding {
  return {
    pluginId: req.pluginId,
    version: req.version,
    sourceUrl: req.downloadUrl,
    sha256: req.sha256,
  };
}

/** 签发过的令牌（token → 记录）；核销即删 */
const _tokens = new Map<string, InstallConfirmationToken>();
let _seq = 0;

/** nonce——Chromium 渲染进程有 Web Crypto；缺面时退到时间戳＋自增（仍需唯一，不要求密码学强度） */
function mintNonce(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `tok-${Date.now().toString(36)}-${++_seq}`;
}

/** 清掉过期/已核销的残留（幂等；`issue` 时自动调） */
export function pruneTokens(now: number = Date.now()): void {
  for (const [key, rec] of _tokens) {
    if (rec.used || rec.expiresAt <= now) _tokens.delete(key);
  }
}

/**
 * 签发——**唯一入口**：只允许 confirm-service 在「用户确认之后」调。
 * @param now 注入时钟（单测用；生产不传）
 */
export function issueToken(binding: TokenBinding, now: number = Date.now()): InstallConfirmationToken {
  pruneTokens(now);
  const rec: InstallConfirmationToken = {
    pluginId: binding.pluginId,
    version: binding.version,
    sourceUrl: binding.sourceUrl,
    sha256: binding.sha256,
    token: mintNonce(),
    expiresAt: now + TOKEN_TTL_MS,
    used: false,
  };
  _tokens.set(rec.token, rec);
  return rec;
}

/**
 * 核销——执行端口的**第一行**。命中即删，返回 `ok`；任何不符一律拒绝并如实回因：
 *   `no-token`（没给 / 查不到——**对外只认这一个词**，spec §3.2）
 *   `expired`（超 60s）/ `mismatch`（绑定字段变了 = 换了一版/一个源）/ `used`（账面异常）
 */
export function consumeToken(token: string | undefined, binding: TokenBinding, now: number = Date.now()): TokenVerdict {
  if (!token) return "no-token";
  const rec = _tokens.get(token);
  if (!rec) return "no-token";
  if (rec.used) {
    _tokens.delete(token);
    return "used";
  }
  if (rec.expiresAt <= now) {
    _tokens.delete(token);
    return "expired";
  }
  if (
    rec.pluginId !== binding.pluginId ||
    rec.version !== binding.version ||
    rec.sourceUrl !== binding.sourceUrl ||
    (rec.sha256 ?? "") !== (binding.sha256 ?? "")
  ) {
    return "mismatch";
  }
  rec.used = true;
  _tokens.delete(token);
  return "ok";
}

/** 单测：清表 */
export function __resetInstallTokensForTests(): void {
  _tokens.clear();
  _seq = 0;
}

/** 单测：表大小（验证「核销即删」与「过期清理」） */
export function __tokenCountForTests(): number {
  return _tokens.size;
}
