/**
 * 依赖链自动装纯函数单测（E6#73o）。
 *
 * 失效方向：环守卫太松 ⇒ A→B→A 在安装期互相等（extract 撞「已存在」）才在加载期爆笼统错；
 * 缺失计算太紧 ⇒ 把 loader 已知（已装/挂起）的依赖重复下载（extract 必拒「已存在」）。
 */
import { describe, expect, it } from "vitest";
import type { PluginManifest } from "../../../core/api/types";
import { findDependencyCycle, missingDependencies } from "./dependency-install.js";

function manifestOf(requires?: string[], extensionDependencies?: string[]): PluginManifest {
  return {
    pluginId: "demo-host",
    name: "Demo Host",
    version: "1.0.0",
    ...(requires ? { requires } : {}),
    ...(extensionDependencies ? { extensionDependencies } : {}),
  } as PluginManifest;
}

describe("findDependencyCycle —— 祖先链环守卫（E6#73o D2）", () => {
  it("无环返回 null（首层依赖 / 链上新依赖）", () => {
    expect(findDependencyCycle([], "demo-b")).toBeNull();
    expect(findDependencyCycle(["demo-a", "demo-b"], "demo-c")).toBeNull();
  });

  it("二段环 A→B→A 返回全链文案", () => {
    expect(findDependencyCycle(["demo-a", "demo-b"], "demo-a")).toBe("demo-a → demo-b → demo-a");
  });

  it("自依赖（B requires B）返回 B → B", () => {
    expect(findDependencyCycle(["demo-a", "demo-b"], "demo-b")).toBe("demo-b → demo-b");
  });
});

describe("missingDependencies —— 本层缺失计算（E6#73o D4）", () => {
  it("已知（已装/挂起）与本链新装的都跳过；声明序保留", () => {
    const m = manifestOf(["demo-b", "demo-c", "demo-d"]);
    const missing = missingDependencies(m, (id) => id === "demo-c", new Set(["demo-d"]));
    expect(missing).toEqual(["demo-b"]);
  });

  it("无 requires/extensionDependencies 声明 ⇒ 空数组（调用方零动作）", () => {
    expect(missingDependencies(manifestOf(), () => false, new Set())).toEqual([]);
  });

  it("旧写法 extensionDependencies 与 requires 归一并去重（复用 getDependencyIds 单源）", () => {
    const m = manifestOf(["demo-b"], ["demo-b", "demo-c"]);
    const missing = missingDependencies(m, () => false, new Set());
    expect(missing).toEqual(["demo-b", "demo-c"]);
  });

  it("自依赖不在这里滤——交给环守卫给全链文案（职责单一）", () => {
    const m = manifestOf(["demo-host"]);
    expect(missingDependencies(m, () => false, new Set())).toEqual(["demo-host"]);
  });
});
