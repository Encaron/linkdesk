/**
 * K12 判据联测——「sign-license 产物被壳 licenses.verify 验过（与棒 2 联测）」的真实实现：
 * kit keygen → kit sign-license → **壳 verifyLicenseKey**（electron/services/license-verify-service.ts，
 * 主进程验签唯一落点）裁决链（解析→公钥还原→verify→exp→machine）全过。
 *
 * ⚠️ 本文件 import 壳侧模块（electron/**）——跨域是有意为之（联测判据），但因此被 kit tsconfig
 *   exclude（rootDir 域外），typecheck 由根 vitest 编译兜住；⛔ 别把这条 import 改回 kit 内复刻
 *   （那就是验签逻辑第二份实现）。
 * 🔴 硬约束 21：密钥对全部现场生成（一次性测试密钥），fixture 无密钥。
 */
import { afterAll, describe, expect, it } from "vitest";
import { createPublicKey } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyLicenseKey } from "../../../electron/services/license-verify-service.js";
import { keygen, signLicense } from "./license.js";

/** 与壳 license-verify-service.ts 同一 SPKI 前缀——44 字节 SPKI 形态公钥的兼容腿用 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const tmpRoots: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tmpRoots.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const FINGERPRINT = "demo-machine-fingerprint";

describe("K12 ↔ 棒 2 联测：kit 产物 × 壳 verifyLicenseKey", () => {
  const setup = (): { publicKey: string; sign: ReturnType<typeof signLicense> } => {
    const dir = tmpDir("kit-roundtrip");
    const { privateKeyPath, publicKey } = keygen({ authorId: "demo-author", out: join(dir, "k.key") });
    return { publicKey, sign: signLicense({ keyFile: privateKeyPath, pluginId: "demo-plugin" }, NOW) };
  };

  it("永久·不绑机的密钥 → 壳裁决 valid:true", () => {
    const { publicKey, sign } = setup();
    const verdict = verifyLicenseKey(sign.key, publicKey, FINGERPRINT, NOW);
    expect(verdict.valid).toBe(true);
    if (verdict.valid) {
      expect(verdict.pluginId).toBe("demo-plugin");
      expect(verdict.machineBound).toBe(false);
    }
  });

  it("绑机器 + 30d 的密钥 → 本机指纹命中 valid:true（machineBound:true）", () => {
    const dir = tmpDir("kit-roundtrip-machine");
    const { privateKeyPath, publicKey } = keygen({ out: join(dir, "k.key") });
    const sign = signLicense({ keyFile: privateKeyPath, pluginId: "demo-plugin", machine: FINGERPRINT, exp: "30d" }, NOW);
    const verdict = verifyLicenseKey(sign.key, publicKey, FINGERPRINT, NOW);
    expect(verdict.valid).toBe(true);
    if (verdict.valid) expect(verdict.machineBound).toBe(true);
  });

  it("换一台机器 → machine-mismatch；过 exp → expired（壳裁决链逐级命中）", () => {
    const dir = tmpDir("kit-roundtrip-neg");
    const { privateKeyPath, publicKey } = keygen({ out: join(dir, "k.key") });
    const sign = signLicense({ keyFile: privateKeyPath, pluginId: "demo-plugin", machine: FINGERPRINT, exp: "1d" }, NOW);
    expect(verifyLicenseKey(sign.key, publicKey, "another-machine", NOW)).toMatchObject({ valid: false, failureReason: "machine-mismatch" });
    const expired = verifyLicenseKey(sign.key, publicKey, FINGERPRINT, NOW + 2 * 86_400_000);
    expect(expired).toMatchObject({ valid: false, failureReason: "expired" });
  });

  it("篡改 payload / 换公钥 → bad-signature；公钥不是 32/44 字节 → bad-public-key", () => {
    const { publicKey, sign } = setup();
    const forged = "v1." + Buffer.from(JSON.stringify({ pluginId: "other-plugin" }), "utf8").toString("base64url") + "." + sign.key.split(".")[2];
    expect(verifyLicenseKey(forged, publicKey, FINGERPRINT, NOW)).toMatchObject({ valid: false, failureReason: "bad-signature" });
    const { publicKey: otherPub } = setup();
    expect(verifyLicenseKey(sign.key, otherPub, FINGERPRINT, NOW)).toMatchObject({ valid: false, failureReason: "bad-signature" });
    expect(verifyLicenseKey(sign.key, "ZGVtbw==", FINGERPRINT, NOW)).toMatchObject({ valid: false, failureReason: "bad-public-key" });
  });

  it("公钥 44 字节 SPKI DER 形态同样被壳接受（兼容直接从 node 导出的形状——壳头注第二形态）", () => {
    const { publicKey, sign } = setup();
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, "base64")]).toString("base64");
    expect(Buffer.from(spki, "base64").length).toBe(44);
    const verdict = verifyLicenseKey(sign.key, spki, FINGERPRINT, NOW);
    expect(verdict.valid).toBe(true);
    // 顺手钉住 createPublicKey 的还原路径（壳 restorePublicKey 的 44B 分支）
    expect(() => createPublicKey({ key: Buffer.from(spki, "base64"), format: "der", type: "spki" })).not.toThrow();
  });
});
