/**
 * 确认策略矩阵单测——**逐行对照 spec §四**（改矩阵必须同笔改本文件与原型 `view-logic`）。
 * 纯函数：零 mock、零 I/O。
 */

import { describe, expect, it } from "vitest";
import type { PluginInstallRequest, PluginSourceIdentity } from "../../../api/linkdesk-api/types";
import { decideOne, isRemoteSource, OFFICIAL_SOURCE_ID, sameSourceIdentity } from "./policy";
import type { PolicyContext, RequestFacts } from "./types";

const SOURCE_OFFICIAL: PluginSourceIdentity = {
  id: OFFICIAL_SOURCE_ID,
  url: "https://github.com/Encaron/linkdesk-marketplace",
  repo: "Encaron/linkdesk-marketplace",
  publisher: "Encaron",
};

const SOURCE_THIRD: PluginSourceIdentity = {
  id: "example-source",
  url: "https://example.dev/source",
  repo: "example/market",
  publisher: "example",
};

function req(over: Partial<PluginInstallRequest> = {}): PluginInstallRequest {
  return {
    mode: "update",
    pluginId: "demo-plugin",
    version: "2.0.0",
    downloadUrl: "https://example.dev/pkg.zip",
    sha256: "a".repeat(64),
    source: SOURCE_THIRD,
    display: { name: "Demo" },
    ...over,
  };
}

function ctx(over: {
  facts?: Partial<RequestFacts>;
  silentOfficial?: boolean;
  silentTrustedSources?: boolean;
  trusted?: string[];
} = {}): PolicyContext {
  const facts: RequestFacts = {
    installedVersion: "1.0.0",
    knownSource: SOURCE_THIRD,
    ...over.facts,
  };
  return {
    policy: {
      silentOfficial: over.silentOfficial ?? true,
      silentTrustedSources: over.silentTrustedSources ?? false,
    },
    isTrusted: (id) => id === OFFICIAL_SOURCE_ID || (over.trusted ?? []).includes(id),
    labelOf: (s) => s.id,
    facts: () => facts,
  };
}

describe("decideOne —— spec §四 确认矩阵", () => {
  it("① 首装（未装）→ ask(first-install)", () => {
    const d = decideOne(req({ mode: "install" }), ctx({ facts: { installedVersion: null, knownSource: null } }));
    expect(d).toEqual({ kind: "ask", reason: "first-install" });
  });

  it("① 重装（已装 + mode=install）→ 仍 ask(first-install)", () => {
    expect(decideOne(req({ mode: "install" }), ctx())).toEqual({ kind: "ask", reason: "first-install" });
  });

  it("① update 但未装 → 按首装问", () => {
    const d = decideOne(req(), ctx({ facts: { installedVersion: null, knownSource: null } }));
    expect(d).toEqual({ kind: "ask", reason: "first-install" });
  });

  it("② 同版本 → rejected(invalid / same-version)", () => {
    const d = decideOne(req({ version: "1.0.0" }), ctx());
    expect(d).toEqual({ kind: "rejected", reason: "invalid", message: "same-version" });
  });

  it("③ 降级未放行 → rejected(invalid / older-not-allowed)", () => {
    const d = decideOne(req({ version: "0.9.0" }), ctx());
    expect(d).toEqual({ kind: "rejected", reason: "invalid", message: "older-not-allowed" });
  });

  it("④ 降级已放行 → ask(downgrade)，带旧身份", () => {
    const d = decideOne(req({ version: "0.9.0", allowOlder: true }), ctx());
    expect(d).toEqual({ kind: "ask", reason: "downgrade", previous: SOURCE_THIRD });
  });

  it("⑤ 来源 URL 变更 → ask(source-changed)，不受开关豁免", () => {
    const next = { ...SOURCE_THIRD, url: "https://evil.dev/source" };
    const d = decideOne(req({ source: next }), ctx({ silentOfficial: true, silentTrustedSources: true, trusted: ["example-source"] }));
    expect(d).toMatchObject({ kind: "ask", reason: "source-changed" });
    expect(d).toMatchObject({ previous: SOURCE_THIRD });
  });

  it("⑤ 发布者变更 → ask(source-changed)", () => {
    const next = { ...SOURCE_THIRD, publisher: "someone-else" };
    expect(decideOne(req({ source: next }), ctx())).toMatchObject({ kind: "ask", reason: "source-changed" });
  });

  it("⑥ 官方同源 + silentOfficial 开 → silent", () => {
    const c = ctx({ facts: { installedVersion: "1.0.0", knownSource: SOURCE_OFFICIAL }, silentOfficial: true });
    expect(decideOne(req({ source: SOURCE_OFFICIAL }), c)).toEqual({ kind: "silent" });
  });

  it("⑥ 官方同源 + silentOfficial 关 → ask(official-source)（信任清单不参与判定）", () => {
    const c = ctx({ facts: { installedVersion: "1.0.0", knownSource: SOURCE_OFFICIAL }, silentOfficial: false });
    expect(decideOne(req({ source: SOURCE_OFFICIAL }), c)).toEqual({ kind: "ask", reason: "official-source" });
  });

  it("⑦ 第三方已信任 + silentTrustedSources 开 → silent", () => {
    const c = ctx({ silentTrustedSources: true, trusted: ["example-source"] });
    expect(decideOne(req(), c)).toEqual({ kind: "silent" });
  });

  it("⑦ 第三方已信任但开关关 → ask(untrusted-source)", () => {
    const c = ctx({ silentTrustedSources: false, trusted: ["example-source"] });
    expect(decideOne(req(), c)).toEqual({ kind: "ask", reason: "untrusted-source" });
  });

  it("⑦ 第三方未信任 + 开关开 → 仍 ask(untrusted-source)", () => {
    const c = ctx({ silentTrustedSources: true, trusted: [] });
    expect(decideOne(req(), c)).toEqual({ kind: "ask", reason: "untrusted-source" });
  });

  it("正交铁律：官方 fixed 信任 ≠ 免问——只认 silentOfficial", () => {
    // 官方恒 isTrusted（trust.ts），但 silentOfficial=false 时必须问
    const c = ctx({
      facts: { installedVersion: "1.0.0", knownSource: SOURCE_OFFICIAL },
      silentOfficial: false,
      silentTrustedSources: true,
    });
    expect(c.isTrusted(OFFICIAL_SOURCE_ID)).toBe(true);
    expect(decideOne(req({ source: SOURCE_OFFICIAL }), c)).toMatchObject({ kind: "ask", reason: "official-source" });
  });
});

describe("isRemoteSource —— D2 安装门判据", () => {
  it("http/https 判远程", () => {
    expect(isRemoteSource("http://x.dev/a.zip")).toBe(true);
    expect(isRemoteSource("HTTPS://X.DEV/a.zip")).toBe(true);
  });

  it("本地路径放行（文件夹安装 / .linkdesk-plugin 包）", () => {
    expect(isRemoteSource("C:\\Users\\me\\demo-plugin")).toBe(false);
    expect(isRemoteSource("/home/me/demo.linkdesk-plugin")).toBe(false);
    expect(isRemoteSource("\\\\nas\\share\\demo")).toBe(false);
  });
});

describe("sameSourceIdentity", () => {
  it("null 恒不同", () => {
    expect(sameSourceIdentity(null, SOURCE_THIRD)).toBe(false);
  });

  it("url/repo/publisher 全同 = 同源（id 不参与）", () => {
    expect(sameSourceIdentity(SOURCE_THIRD, { ...SOURCE_THIRD, id: "renamed" })).toBe(true);
  });

  it("缺失可选字段按空串比（undefined 与缺省等价）", () => {
    const a: PluginSourceIdentity = { id: "s", url: "https://a.dev" };
    const b: PluginSourceIdentity = { id: "s", url: "https://a.dev", repo: undefined };
    expect(sameSourceIdentity(a, b)).toBe(true);
  });
});
