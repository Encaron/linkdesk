/**
 * 档位读数单测——fail-closed 的三条纪律（`01-设计/02` §五）。
 *
 * | 输入 | 期望 |
 * |:--|:--|
 * | settings.json 不存在 | `auto`（默认档，不是故障） |
 * | 键缺席 | `auto` |
 * | 文件损坏 / 值非法 | `ask`（⛔ 不许退回 auto/full——写坏配置不能变成提权） |
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { policyModeFromFile, policyModeFromSettings } from "../policyState.js";

describe("从 settings 原文求档位（纯函数）", () => {
  it("文件不存在（null）⇒ 默认 auto，不算降级", () => {
    expect(policyModeFromSettings(null)).toMatchObject({ mode: "auto", degraded: false });
  });

  it("键缺席 ⇒ 默认 auto", () => {
    expect(policyModeFromSettings("{}")).toMatchObject({ mode: "auto", degraded: false });
    expect(policyModeFromSettings('{"app.language":"zh"}')).toMatchObject({ mode: "auto", degraded: false });
  });

  it("四档原值原样读出", () => {
    for (const mode of ["read", "ask", "auto", "full"]) {
      expect(policyModeFromSettings(JSON.stringify({ "ai.policy.mode": mode }))).toMatchObject({
        mode,
        degraded: false,
      });
    }
  });

  it("🔴 文件损坏 ⇒ ask（fail-closed），并标 degraded", () => {
    for (const raw of ["not json", "{", "[]", "null", '"auto"']) {
      expect(policyModeFromSettings(raw), raw).toMatchObject({ mode: "ask", degraded: true });
    }
  });

  it("🔴 值非法 ⇒ ask（⛔ 不按 auto/full 放行）", () => {
    for (const value of ["FULL", "everything", 1, true, null, {}]) {
      expect(policyModeFromSettings(JSON.stringify({ "ai.policy.mode": value })), String(value)).toMatchObject({
        mode: "ask",
        degraded: true,
      });
    }
  });

  it("读数带 effectiveAt（账本「以执行时点那次为准」）", () => {
    const snap = policyModeFromSettings("{}");
    expect(Number.isFinite(snap.effectiveAt)).toBe(true);
    expect(snap.effectiveAt).toBeGreaterThan(0);
  });
});

describe("从文件读取（真实 IO 两态）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ld-policy-"));

  it("文件不存在 ⇒ 默认 auto（首次启动常态）", () => {
    expect(policyModeFromFile(path.join(dir, "missing.json"))).toMatchObject({ mode: "auto", degraded: false });
  });

  it("文件损坏 ⇒ ask", () => {
    const file = path.join(dir, "broken.json");
    fs.writeFileSync(file, "{ oops", "utf8");
    expect(policyModeFromFile(file)).toMatchObject({ mode: "ask", degraded: true });
  });

  it("正常文件 ⇒ 读出档位", () => {
    const file = path.join(dir, "ok.json");
    fs.writeFileSync(file, JSON.stringify({ "ai.policy.mode": "full" }), "utf8");
    expect(policyModeFromFile(file)).toMatchObject({ mode: "full", degraded: false });
  });
});
