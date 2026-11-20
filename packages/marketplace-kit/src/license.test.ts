/**
 * keygen / sign-license 单元测试（K12）——格式断言按壳 license-verify-service.ts 头注契约。
 * 🔴 硬约束 21：密钥对一律现场生成的一次性测试密钥（fixture 无密钥、真私钥不进仓）。
 * 🔴 与壳 verify 的**真实联测**在 license.shellRoundtrip.test.ts（跨域 import，tsc 域外——见该文件头注）。
 */
import { afterAll, describe, expect, it } from "vitest";
import { createPrivateKey } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keygen, parseExpSpec, signLicense } from "./license.js";

const tmpRoots: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tmpRoots.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

describe("keygen", () => {
  it("公钥 = 裸 32 字节 base64（标准字母表）；私钥文件可读回 PKCS8 且 0600", () => {
    const dir = tmpDir("kit-keygen");
    const out = join(dir, "demo-author.private.key");
    const r = keygen({ authorId: "demo-author", out });
    expect(r.privateKeyPath).toBe(out);
    const raw = Buffer.from(r.publicKey, "base64");
    expect(raw.length).toBe(32);
    expect(r.publicKey).not.toMatch(/[-_]/); // 标准字母表（base64url 才有 -_）
    expect(existsSync(out)).toBe(true);
    // 私钥文件内容可读回（PKCS8 DER base64 单行）——keygen→sign 闭环的前提
    const der = Buffer.from(readFileSync(out, "utf8").trim(), "base64");
    expect(() => createPrivateKey({ key: der, format: "der", type: "pkcs8" })).not.toThrow();
    if (process.platform !== "win32") {
      // Windows 的 mode 语义不完整，只在意非 Windows 的 0600
      expect(statSync(out).mode & 0o777).toBe(0o600);
    }
  });
});

describe("sign-license（格式契约 = 壳 license-verify-service.ts 头注）", () => {
  it("v1.<b64url(payload)>.<b64url(sig64)>：三段、签名 64 字节、payload JSON 字段与序照正典", () => {
    const dir = tmpDir("kit-sign");
    const { privateKeyPath } = keygen({ authorId: "demo-author", out: join(dir, "k.key") });
    const now = Date.parse("2026-11-20T00:00:00.000Z");
    const r = signLicense({ keyFile: privateKeyPath, pluginId: "demo-plugin", machine: "FP-123", exp: "30d" }, now);
    const parts = r.key.split(".");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("v1");
    expect(parts[1]).not.toMatch(/[+/=]/); // base64url 无 padding
    expect(parts[2]).not.toMatch(/[+/=]/);
    expect(Buffer.from(parts[2]!, "base64url").length).toBe(64);
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["exp", "machine", "pluginId"]);
    expect(payload.pluginId).toBe("demo-plugin");
    expect(payload.machine).toBe("FP-123");
    expect(r.payload.exp).toBe(Math.floor((now + 30 * 86_400_000) / 1000));
  });

  it("--exp：YYYY-MM-DD 按「当日末」到期；完整 ISO 原样；非法串报错", () => {
    const day = parseExpSpec("2027-12-31", Date.parse("2026-11-20T00:00:00.000Z"));
    expect(day).toBe(Math.floor((Date.parse("2027-12-31T00:00:00.000Z") + 86_400_000 - 1) / 1000));
    const iso = parseExpSpec("2027-06-01T12:00:00.000Z");
    expect(iso).toBe(Math.floor(Date.parse("2027-06-01T12:00:00.000Z") / 1000));
    for (const [spec, ms] of [["30d", 30 * 86_400_000], ["12w", 12 * 7 * 86_400_000], ["6m", 6 * 2_629_800_000], ["1y", 31_557_600_000]] as const) {
      expect(parseExpSpec(spec, 0)).toBe(Math.floor(ms / 1000));
    }
    expect(() => parseExpSpec("soon")).toThrow(/无法解析/);
  });

  it("缺 --plugin 报错；machine/exp 缺省时载荷只有 pluginId（永久·不绑机）", () => {
    const dir = tmpDir("kit-sign2");
    const { privateKeyPath } = keygen({ out: join(dir, "k.key") });
    expect(() => signLicense({ keyFile: privateKeyPath, pluginId: "" })).toThrow(/--plugin/);
    const r = signLicense({ keyFile: privateKeyPath, pluginId: "demo-plugin" });
    expect(r.payload).toEqual({ pluginId: "demo-plugin" });
    const payload = JSON.parse(Buffer.from(r.key.split(".")[1]!, "base64url").toString("utf8"));
    expect(Object.keys(payload)).toEqual(["pluginId"]);
  });
});
