/**
 * 许可验签服务单测——R4-1.3（I21·正典 09 §三·补3）：Ed25519 离线验签（node:crypto）。
 * 判据（详案 R4-批1-壳.md）：验签离线可用；无效签名拒；exp 过期拒；机器不符拒。
 * 测试密钥对 = generateKeyPairSync('ed25519') 现生成（零外部依赖）。
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "crypto";
import { verifyLicenseKey } from "./license-verify-service";
import { composeFingerprint } from "./machine-fingerprint";

// —— 测试密钥对与签名工具（kit sign-license 的测试替身，照 license-verify-service 头注格式契约）——

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
/** 裸 32 字节公钥 base64（kit keygen 默认导出形状） */
const PUBLIC_KEY_RAW = Buffer.from(
  publicKey.export({ format: "der", type: "spki" } as NodeJS.Buffer).subarray(-32),
).toString("base64");
/** SPKI DER 全量 base64（兼容形态） */
const PUBLIC_KEY_SPKI = Buffer.from(publicKey.export({ format: "der", type: "spki" } as NodeJS.Buffer)).toString("base64");

/** b64url（无 padding）——与验签端同一字母表 */
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 按 v1.<payload>.<sig> 契约拼密钥（sig 覆盖 payload UTF-8 字节） */
function makeKey(payload: object, priv = privateKey, tamper = false): string {
  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf8");
  let sig = cryptoSign(null, payloadBuf, priv);
  if (tamper) sig = Buffer.from(sig);
  const payloadOut = tamper
    ? Buffer.from(JSON.stringify({ ...payload, pluginId: "tampered" }), "utf8")
    : payloadBuf;
  return `v1.${b64url(payloadOut)}.${b64url(sig)}`;
}

const FP = "a1b2c3d4e5f60718";
const NOW = 1763606400000; // 2026-11-20 固定锚

describe("verifyLicenseKey（R4-1.3 五步裁决链）", () => {
  it("合法密钥（无 machine 无 exp）＝ valid + pluginId 回带", () => {
    const r = verifyLicenseKey(makeKey({ pluginId: "paid-plugin" }), PUBLIC_KEY_RAW, FP, NOW);
    expect(r.valid).toBe(true);
    expect(r.pluginId).toBe("paid-plugin");
    expect(r.machineBound).toBe(false);
    expect(r.failureReason).toBeUndefined();
  });

  it("SPKI 形态公钥同样过（44 字节兼容路径）", () => {
    const r = verifyLicenseKey(makeKey({ pluginId: "paid-plugin" }), PUBLIC_KEY_SPKI, FP, NOW);
    expect(r.valid).toBe(true);
  });

  it("payload 被篡改（签名对不上）＝ bad-signature", () => {
    const r = verifyLicenseKey(makeKey({ pluginId: "paid-plugin" }, privateKey, true), PUBLIC_KEY_RAW, FP, NOW);
    expect(r.valid).toBe(false);
    expect(r.failureReason).toBe("bad-signature");
  });

  it("公钥不是签发者 ＝ bad-signature", () => {
    const other = generateKeyPairSync("ed25519");
    const otherPub = Buffer.from(other.publicKey.export({ format: "der", type: "spki" } as NodeJS.Buffer).subarray(-32)).toString("base64");
    const r = verifyLicenseKey(makeKey({ pluginId: "paid-plugin" }), otherPub, FP, NOW);
    expect(r.valid).toBe(false);
    expect(r.failureReason).toBe("bad-signature");
  });

  it("exp 已过 ＝ expired；exp 未到 ＝ valid", () => {
    const past = verifyLicenseKey(makeKey({ pluginId: "p", exp: 1577836800 }), PUBLIC_KEY_RAW, FP, NOW);
    expect(past).toMatchObject({ valid: false, failureReason: "expired" });
    const future = verifyLicenseKey(makeKey({ pluginId: "p", exp: 4070880000 }), PUBLIC_KEY_RAW, FP, NOW);
    expect(future.valid).toBe(true);
  });

  it("machine 不符 ＝ machine-mismatch；machine＝本机指纹 ＝ valid", () => {
    const mismatch = verifyLicenseKey(makeKey({ pluginId: "p", machine: "deadbeefdeadbeef" }), PUBLIC_KEY_RAW, FP, NOW);
    expect(mismatch).toMatchObject({ valid: false, failureReason: "machine-mismatch", machineBound: true });
    const match = verifyLicenseKey(makeKey({ pluginId: "p", machine: FP }), PUBLIC_KEY_RAW, FP, NOW);
    expect(match.valid).toBe(true);
    expect(match.machineBound).toBe(true);
  });

  it("形状坏（前缀错/段数错/payload 非 JSON/缺 pluginId）＝ bad-key-format", () => {
    expect(verifyLicenseKey("v2.abc.def", PUBLIC_KEY_RAW, FP, NOW).failureReason).toBe("bad-key-format");
    expect(verifyLicenseKey("v1.abc", PUBLIC_KEY_RAW, FP, NOW).failureReason).toBe("bad-key-format");
    expect(verifyLicenseKey(`v1.${b64url(Buffer.from("not json"))}.${b64url(Buffer.alloc(64, 1))}`, PUBLIC_KEY_RAW, FP, NOW).failureReason).toBe("bad-key-format");
    expect(verifyLicenseKey(`v1.${b64url(Buffer.from(JSON.stringify({ machine: "x" })))}.${b64url(Buffer.alloc(64, 1))}`, PUBLIC_KEY_RAW, FP, NOW).failureReason).toBe("bad-key-format");
  });

  it("公钥坏（垃圾/长度不对）＝ bad-public-key", () => {
    const key = makeKey({ pluginId: "p" });
    expect(verifyLicenseKey(key, "not-a-key!!", FP, NOW).failureReason).toBe("bad-public-key");
    expect(verifyLicenseKey(key, Buffer.alloc(31).toString("base64"), FP, NOW).failureReason).toBe("bad-public-key");
  });
});

describe("composeFingerprint（机器指纹组合纯函数）", () => {
  it("sha256(guid::board) 前 16 位——同输入恒同值、16 位 hex", () => {
    const a = composeFingerprint("guid-1", "board-1");
    const b = composeFingerprint("guid-1", "board-1");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    // 任一输入变化 → 指纹变（绑定语义）
    expect(composeFingerprint("guid-2", "board-1")).not.toBe(a);
    expect(composeFingerprint("guid-1", "board-2")).not.toBe(a);
    // 空 board（读取失败兜底）仍产出稳定值
    expect(composeFingerprint("guid-1", "")).toMatch(/^[0-9a-f]{16}$/);
  });
});
