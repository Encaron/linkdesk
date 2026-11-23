/**
 * 策略快照组装单测（`app:getAiPolicy` 的数据面）。
 *
 * 钉四件：矩阵是 4×4 且与 `decide` 同源；风险表含「修改权限设置（user-only）」；四档选项齐全；
 * 通道开关读数（`ai.mcp.enabled` / `ai.cli.enabled`）如实反映配置。
 */

import { afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAiPolicyState, buildMatrix } from "../state.js";
import { setPolicySettingsFile } from "../policyState.js";
import { decide } from "../decide.js";
import { POLICY_MODES } from "../modes.js";

const dirs: string[] = [];

function withSettings(json: Record<string, unknown> | null): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ld-state-"));
  dirs.push(dir);
  const file = path.join(dir, "settings.json");
  if (json) fs.writeFileSync(file, JSON.stringify(json), "utf8");
  setPolicySettingsFile(file);
}

afterEach(() => {
  setPolicySettingsFile(null);
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("buildMatrix", () => {
  it("四档 × 四级，且与 decide 逐格一致（⛔ 不二次实现判定）", () => {
    const matrix = buildMatrix();
    for (const mode of POLICY_MODES) {
      for (const risk of ["R0", "R1", "R2", "R3"] as const) {
        expect(matrix[mode][risk]).toBe(decide(mode, risk));
      }
    }
  });
});

describe("buildAiPolicyState", () => {
  it("四档选项齐全、带 i18n key（label/description 是中文原文，不是终稿译文）", () => {
    withSettings(null);
    const state = buildAiPolicyState();
    expect(state.options.map((o) => o.value)).toEqual([...POLICY_MODES]);
    for (const o of state.options) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.description.length).toBeGreaterThan(0);
    }
  });

  it("档位默认 auto；键缺失不降级", () => {
    withSettings({});
    const state = buildAiPolicyState();
    expect(state.mode).toBe("auto");
    expect(state.degraded).toBe(false);
  });

  it("配置损坏 ⇒ ask ＋ degraded", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ld-state-bad-"));
    dirs.push(dir);
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, "{ broken", "utf8");
    setPolicySettingsFile(file);
    const state = buildAiPolicyState();
    expect(state.mode).toBe("ask");
    expect(state.degraded).toBe(true);
  });

  it("风险表含「修改权限设置」行：永远 deny（AI 连请求入口都没有）", () => {
    withSettings({});
    const state = buildAiPolicyState();
    const row = state.riskTable.find((r) => r.id === "(user-only)");
    expect(row).toMatchObject({ decision: "deny", risk: "R3" });
    expect(row?.what).toContain("修改权限设置");
  });

  it("风险表的 decision 随档位变（full 下装更新不再是 ask）", () => {
    withSettings({ "ai.policy.mode": "full" });
    const full = buildAiPolicyState().riskTable.find((r) => r.id === "update.openUpdateFlow");
    withSettings({ "ai.policy.mode": "auto" });
    const auto = buildAiPolicyState().riskTable.find((r) => r.id === "update.openUpdateFlow");
    expect(auto?.decision).toBe("ask");
    expect(full?.decision).toBe("allow");
  });

  it("通道开关：两个都关 ⇒ false；任一开 ⇒ true", () => {
    withSettings({ "ai.mcp.enabled": false, "ai.cli.enabled": false });
    expect(buildAiPolicyState().channelsEnabled).toBe(false);
    withSettings({ "ai.cli.enabled": true });
    expect(buildAiPolicyState().channelsEnabled).toBe(true);
  });

  it("read 档风险表：R1 及以上的展示行全 deny，R0 放行", () => {
    withSettings({ "ai.policy.mode": "read" });
    const rows = buildAiPolicyState().riskTable;
    expect(rows.find((r) => r.id === "describe")?.decision).toBe("allow");
    expect(rows.find((r) => r.id === "openTab")?.decision).toBe("deny");
    expect(rows.find((r) => r.id === "install")?.decision).toBe("deny");
  });
});
