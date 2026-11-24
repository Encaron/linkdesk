/**
 * 信任清单单测（2026-11-24 实机回归）——**首装卡上的「以后此来源不再询问」必须真的记住**。
 *
 * 实机路径：首装时该来源还没装过任何插件 ⇒ 来源账本里没有它。旧实现直接抛「未知来源」，
 * 用户勾了等于没勾。现在允许先记 id，等账本学到来源后清单自然显示。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const known: Array<{ sourceId: string; url: string; repo?: string; publisher?: string; pluginIds: string[]; lastSeenAt: string }> = [];

vi.mock("../../configuration/ConfigurationService", () => ({
  getConfigurationValue: (k: string) => store.get(k),
  setConfigurationValue: async (k: string, v: unknown) => {
    store.set(k, v);
  },
}));

vi.mock("./ledger", () => ({
  listKnownSources: async () => known.slice(),
}));

vi.mock("../../../../i18n", () => ({ default: { t: (k: string) => k } }));

import { POLICY_KEYS, isSourceTrusted, listSourceTrust, trustSource, untrustSource } from "./trust";

beforeEach(() => {
  store.clear();
  known.length = 0;
});

describe("trustSource —— 账本里还没有的来源（首装场景）", () => {
  it("不抛错，并且 id 真的进了配置（否则「勾了等于没勾」）", async () => {
    await trustSource({ sourceId: "lab", url: "https://lab.dev/marketplace.json", publisher: "Lab" });
    expect(store.get(POLICY_KEYS.trustedSources)).toEqual(["lab"]);
    expect(isSourceTrusted("lab")).toBe(true);
  });

  it("账本学到该来源后，清单里能显示它且 trusted=true", async () => {
    await trustSource({ sourceId: "lab", url: "https://lab.dev/marketplace.json" });
    known.push({
      sourceId: "lab",
      url: "https://lab.dev/marketplace.json",
      pluginIds: ["fixture-alpha"],
      lastSeenAt: "2026-11-24T00:00:00.000Z",
    });
    const rows = await listSourceTrust();
    expect(rows.find((r) => r.sourceId === "lab")?.trusted).toBe(true);
  });

  it("官方恒信任且不进数组（不重复写）", async () => {
    await trustSource({ sourceId: "official", url: "https://x/marketplace.json" });
    expect(store.get(POLICY_KEYS.trustedSources)).toBeUndefined();
    expect(isSourceTrusted("official")).toBe(true);
  });

  it("撤销后回到未信任，且官方撤销无效", async () => {
    await trustSource({ sourceId: "lab", url: "https://lab.dev/marketplace.json" });
    await untrustSource("lab");
    expect(isSourceTrusted("lab")).toBe(false);
    await untrustSource("official");
    expect(isSourceTrusted("official")).toBe(true);
  });
});
