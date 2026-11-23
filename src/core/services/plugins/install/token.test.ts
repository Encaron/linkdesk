/**
 * 一次性令牌单测——D2 的机械保证：绑定逐字段、一次性、60s 过期、核销即删。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { __resetInstallTokensForTests, __tokenCountForTests, consumeToken, issueToken, pruneTokens } from "./token";
import { TOKEN_TTL_MS, type TokenBinding } from "./types";

const BINDING: TokenBinding = {
  pluginId: "demo-plugin",
  version: "2.0.0",
  sourceUrl: "https://example.dev/pkg.zip",
  sha256: "a".repeat(64),
};

beforeEach(() => {
  __resetInstallTokensForTests();
});

describe("consumeToken", () => {
  it("签发后可核销一次", () => {
    const t = issueToken(BINDING, 1_000);
    expect(consumeToken(t.token, BINDING, 1_000)).toBe("ok");
  });

  it("核销即删——第二次同 nonce 是 no-token（不是 used）", () => {
    const t = issueToken(BINDING, 1_000);
    expect(consumeToken(t.token, BINDING, 1_000)).toBe("ok");
    expect(consumeToken(t.token, BINDING, 1_000)).toBe("no-token");
    expect(__tokenCountForTests()).toBe(0);
  });

  it("没给令牌 → no-token（对外唯一词）", () => {
    expect(consumeToken(undefined, BINDING, 1_000)).toBe("no-token");
    expect(consumeToken("", BINDING, 1_000)).toBe("no-token");
  });

  it("过期 → expired，并从表里清掉", () => {
    const t = issueToken(BINDING, 1_000);
    expect(consumeToken(t.token, BINDING, 1_000 + TOKEN_TTL_MS + 1)).toBe("expired");
    expect(__tokenCountForTests()).toBe(0);
  });

  it("边界：到期当拍已失效（expiresAt 是开区间上界，`now >= expiresAt` 即过期）", () => {
    const t = issueToken(BINDING, 1_000);
    expect(consumeToken(t.token, BINDING, 1_000 + TOKEN_TTL_MS)).toBe("expired");
  });

  it.each<[string, Partial<TokenBinding>]>([
    ["pluginId", { pluginId: "other-plugin" }],
    ["version", { version: "2.0.1" }],
    ["sourceUrl", { sourceUrl: "https://evil.dev/pkg.zip" }],
    ["sha256", { sha256: "b".repeat(64) }],
    ["sha256 缺失←有值", { sha256: undefined }],
  ])("绑定字段不符（%s）→ mismatch，令牌不被消耗", (_label, patch) => {
    const t = issueToken(BINDING, 1_000);
    expect(consumeToken(t.token, { ...BINDING, ...patch }, 1_000)).toBe("mismatch");
    // 不消耗：正确绑定仍能用（防止「试探一次就把票废掉」）
    expect(consumeToken(t.token, BINDING, 1_000)).toBe("ok");
  });

  it("sha256 双向：签发时无、核销时有 → mismatch", () => {
    const t = issueToken({ ...BINDING, sha256: undefined }, 1_000);
    expect(consumeToken(t.token, { ...BINDING, sha256: "c".repeat(64) }, 1_000)).toBe("mismatch");
  });
});

describe("pruneTokens", () => {
  it("清理过期条目，保留有效条目", () => {
    issueToken(BINDING, 1_000);
    issueToken({ ...BINDING, pluginId: "b" }, 1_000 + TOKEN_TTL_MS + 10);
    pruneTokens(1_000 + TOKEN_TTL_MS + 10);
    expect(__tokenCountForTests()).toBe(1);
  });

  it("issue 时自动清理——表不会无限涨", () => {
    issueToken(BINDING, 1_000);
    issueToken({ ...BINDING, pluginId: "b" }, 1_000 + TOKEN_TTL_MS + 10);
    expect(__tokenCountForTests()).toBe(1);
  });
});

describe("nonce", () => {
  it("两次签发不同 nonce", () => {
    const a = issueToken(BINDING, 1_000);
    const b = issueToken(BINDING, 1_000);
    expect(a.token).not.toBe(b.token);
  });
});
