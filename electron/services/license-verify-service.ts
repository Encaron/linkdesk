/**
 * 许可验签服务——R4-1.3（I21·正典 09 §三·补3）：Ed25519 离线验签（node:crypto，主进程唯一落点）。
 *
 * 🔴 密钥格式定义（棒 11 kit `sign-license` 照此签发——本头注是格式契约的唯一真相源）：
 *
 *     v1.<base64url(payload JSON)>.<base64url(64 字节 Ed25519 签名)>
 *
 *   - payload JSON = LicenseKeyPayload { pluginId: string, machine?: string, exp?: number(unix 秒) }
 *     ——三字段即 09 正典；多余字段忽略（向前兼容）、缺 pluginId = bad-key-format；
 *   - 签名覆盖 = payload JSON 的 UTF-8 字节（"v1." 前缀不参与签名——前缀只做版本路由）；
 *   - base64url = RFC 4648 §5（-_ 字母表，无 padding 容忍）。
 *
 * 公钥格式（作者块 authors/<id>.json 的 `publicKey` 字段，棒 11 kit `keygen` 照此导出）：
 *   - base64（标准字母表）32 字节裸 Ed25519 公钥（kit 默认导出形状）；
 *   - 或 44 字节 SPKI DER（302a300506032b6570032100 前缀）——兼容直接从 node 导出的形状。
 *
 * 裁决链（全在本函数，无网络）：解析 → 公钥还原 → verify → exp → machine 比对
 * （machine 与本机指纹比对——fingerprint 注入而非本模块自取，保纯函数可测）。
 * ⛔ 本模块不 import electron（纯 node:crypto——vitest 直测）。
 */

import { createPublicKey, verify as cryptoVerify } from "crypto";
import type { LicenseKeyPayload, LicenseVerifyFailureReason, LicenseVerifyResult } from "../../src/core/api/linkdesk-api/types";

/** Ed25519 SPKI 固定前缀（RFC 8410）——裸 32 字节公钥还原成可 verify 的 KeyObject 用 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** base64url 解码（-_ 字母表；无 padding 容忍） */
function b64urlDecode(s: string): Buffer | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, "base64");
  } catch {
    return null;
  }
}

/** 公钥还原——裸 32B / SPKI DER 双形态；解不出 = null */
function restorePublicKey(publicKey: string): ReturnType<typeof createPublicKey> | null {
  const raw = Buffer.from(publicKey, "base64"); // 非法字符会被静默跳过——长度校验兜底
  try {
    if (raw.length === 32) return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
    if (raw.length === 44) return createPublicKey({ key: raw, format: "der", type: "spki" });
    return null;
  } catch {
    return null;
  }
}

/**
 * 验签 + 裁决——09 §三·补3 五步裁决链的实现。
 * @param key 用户粘贴的许可密钥
 * @param publicKey 作者块 publicKey 字段
 * @param localFingerprint 本机指纹（`env.machineFingerprint`——主进程注入；测试传假值）
 * @param nowMs 当前时刻（unix 毫秒；默认 Date.now——测试可注入）
 */
export function verifyLicenseKey(
  key: string,
  publicKey: string,
  localFingerprint: string,
  nowMs: number = Date.now(),
): LicenseVerifyResult {
  const fail = (failureReason: LicenseVerifyFailureReason, partial?: Partial<LicenseVerifyResult>): LicenseVerifyResult =>
    ({ valid: false, failureReason, ...partial });

  // 1) 密钥解析——v1.<payload>.<sig>
  if (typeof key !== "string" || typeof publicKey !== "string" || !key || !publicKey) return fail("bad-key-format");
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return fail("bad-key-format");
  const payloadBuf = b64urlDecode(parts[1]);
  const sig = b64urlDecode(parts[2]);
  if (!payloadBuf || !sig || sig.length !== 64) return fail("bad-key-format");
  let payload: LicenseKeyPayload;
  try {
    const parsed = JSON.parse(payloadBuf.toString("utf8")) as Partial<LicenseKeyPayload>;
    if (typeof parsed?.pluginId !== "string" || !parsed.pluginId) return fail("bad-key-format");
    payload = { pluginId: parsed.pluginId, machine: parsed.machine, exp: parsed.exp };
  } catch {
    return fail("bad-key-format");
  }
  const partial = { pluginId: payload.pluginId, exp: payload.exp, machineBound: typeof payload.machine === "string" };

  // 2) 公钥还原
  const pub = restorePublicKey(publicKey);
  if (!pub) return fail("bad-public-key", partial);

  // 3) Ed25519 验签（签名覆盖 = payload 字节）
  let signatureOk: boolean;
  try {
    signatureOk = cryptoVerify(null, payloadBuf, pub, sig);
  } catch {
    return fail("bad-signature", partial);
  }
  if (!signatureOk) return fail("bad-signature", partial);

  // 4) exp 裁决（exp 存在且已过 = expired；unix 秒）
  if (typeof payload.exp === "number" && payload.exp * 1000 <= nowMs) {
    return fail("expired", partial);
  }

  // 5) 机器裁决（载荷带 machine 才比对——09「机器绑定＝机制支持、作者选」）
  if (typeof payload.machine === "string" && payload.machine !== localFingerprint) {
    return fail("machine-mismatch", partial);
  }

  return { valid: true, pluginId: payload.pluginId, exp: payload.exp, machineBound: typeof payload.machine === "string" };
}
