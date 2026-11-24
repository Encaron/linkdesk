/**
 * 计划句柄表单测——`prepareInstall` → `commitInstall` 两跳的凭据语义（D1′）。
 * 关键三条：一次性、短 TTL、按请求指纹绑定（commit 用句柄里的原请求重新签票）。
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { PluginConfirmPlan, PluginInstallRequest } from "../../../api/linkdesk-api/types";
import {
  __planHandleCountForTests,
  __resetPlanHandlesForTests,
  dropPlanHandle,
  getPlanHandle,
  PLAN_HANDLE_TTL_MS,
  putPlanHandle,
  prunePlanHandles,
  takePlanHandle,
} from "./plan-handles";

const REQ: PluginInstallRequest = {
  mode: "install",
  pluginId: "demo-plugin",
  version: "1.0.0",
  downloadUrl: "https://example.dev/demo.zip",
  sha256: "a".repeat(64),
  source: { id: "official", url: "https://example.dev/marketplace.json" },
  display: { name: "Demo" },
};

const PLAN: PluginConfirmPlan = {
  ask: [{ request: REQ, reason: "first-install" }],
  silent: [],
  groups: [],
  rejected: [],
  totals: { total: 1, ask: 1, silent: 0 },
};

beforeEach(() => {
  __resetPlanHandlesForTests();
});

describe("putPlanHandle / takePlanHandle", () => {
  it("签发后可取用一次，第二次 = undefined（一次性）", () => {
    const h = putPlanHandle("install", [REQ], PLAN, 1_000);
    expect(takePlanHandle(h.planId, 1_000)?.plan).toEqual(PLAN);
    expect(takePlanHandle(h.planId, 1_000)).toBeUndefined();
    expect(__planHandleCountForTests()).toBe(0);
  });

  it("get 不消耗；drop 后取不到", () => {
    const h = putPlanHandle("install", [REQ], PLAN, 1_000);
    expect(getPlanHandle(h.planId)).toBeDefined();
    dropPlanHandle(h.planId);
    expect(takePlanHandle(h.planId, 1_000)).toBeUndefined();
  });

  it("过期 ⇒ 取不到（并顺手从表里清掉）", () => {
    const h = putPlanHandle("batch", [REQ], PLAN, 1_000);
    expect(takePlanHandle(h.planId, 1_000 + PLAN_HANDLE_TTL_MS)).toBeUndefined();
    expect(__planHandleCountForTests()).toBe(0);
  });

  it("边界：到期前一刻仍可取", () => {
    const h = putPlanHandle("install", [REQ], PLAN, 1_000);
    expect(takePlanHandle(h.planId, 1_000 + PLAN_HANDLE_TTL_MS - 1)).toBeDefined();
  });

  it("句柄带 kind 与原始请求（commit 按它签票，⛔ 调用方另传）", () => {
    const h = putPlanHandle("batch", [REQ, { ...REQ, pluginId: "demo-two" }], PLAN, 1_000);
    const got = takePlanHandle(h.planId, 1_000)!;
    expect(got.kind).toBe("batch");
    expect(got.requests.map((r) => r.pluginId)).toEqual(["demo-plugin", "demo-two"]);
  });

  it("未知 planId ⇒ undefined（commit 统一回 unknown-plan）", () => {
    expect(takePlanHandle("plan-does-not-exist", 1_000)).toBeUndefined();
  });
});

describe("prunePlanHandles", () => {
  it("清过期、留有效", () => {
    putPlanHandle("install", [REQ], PLAN, 1_000);
    putPlanHandle("install", [REQ], PLAN, 1_000 + PLAN_HANDLE_TTL_MS + 5);
    prunePlanHandles(1_000 + PLAN_HANDLE_TTL_MS + 5);
    expect(__planHandleCountForTests()).toBe(1);
  });

  it("签发时自动清理——表不会无限涨", () => {
    putPlanHandle("install", [REQ], PLAN, 1_000);
    putPlanHandle("install", [REQ], PLAN, 1_000 + PLAN_HANDLE_TTL_MS + 5);
    expect(__planHandleCountForTests()).toBe(1);
  });
});
