/**
 * plugin-tree-recovery 单测——E6#73j（G8 后半）。
 *
 * 被测判据只有一条：「目录在不在」决定 `.bak` 是**复原**还是**清理**。
 *   - 目录缺失 = 进程死在 commit 的两次 rename 之间 → 复原（宁旧勿丢，盲删会吃掉旧版唯一副本）
 *   - 目录在位 = 提交成功、收尾没删掉 → 清理
 * mock electron（app.getPath('userData') → 真实临时目录，同 plugin-download/bundled-install 模式）。
 * fixture 全虚构 id（硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// 被测模块只用得到 `app.getPath("userData")` 一个面——mock **只伪造这一个**。
// 不照抄 plugin-download.test 那份带 isPackaged/getAppPath 的完整壳（伪造用不到的 API =
// 给读者一个假依赖，也让两份 mock 长成一模一样的克隆）。
const electronMock = vi.hoisted(() => {
  const paths = { userData: "" };
  const app = { getPath: (key: string) => (key === "userData" ? paths.userData : "") };
  return { app, paths };
});
vi.mock("electron", () => electronMock);

import { recoverInterruptedUpdates } from "./plugin-tree-recovery.js";

describe("E6#73j G8：启动复原被中断的更新替换", () => {
  let userData: string;
  let pluginsRoot: string;

  beforeEach(async () => {
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-tree-recovery-"));
    electronMock.paths.userData = userData;
    pluginsRoot = path.join(userData, "plugins");
    await fs.mkdir(pluginsRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(userData, { recursive: true, force: true });
  });

  /** 造一个「插件目录」——含 plugin.json 便于断言内容 */
  const mkPlugin = async (dir: string, version: string) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify({ version }));
  };

  it("目录缺失 + 有 .bak → 复原（回滚到旧版，不丢插件）", async () => {
    await mkPlugin(path.join(pluginsRoot, "demo-a.bak"), "1.0.0");

    const restored = await recoverInterruptedUpdates();

    expect(restored).toEqual(["demo-a"]);
    const raw = await fs.readFile(path.join(pluginsRoot, "demo-a", "plugin.json"), "utf8");
    expect(JSON.parse(raw).version).toBe("1.0.0");
    await expect(fs.readdir(path.join(pluginsRoot, "demo-a.bak"))).rejects.toThrow();
  });

  it("目录在位 + 有 .bak → 清理遗留（新版保留，备份不堆积）", async () => {
    await mkPlugin(path.join(pluginsRoot, "demo-b"), "2.0.0");
    await mkPlugin(path.join(pluginsRoot, "demo-b.bak"), "1.0.0");

    const restored = await recoverInterruptedUpdates();

    expect(restored).toEqual([]);
    const raw = await fs.readFile(path.join(pluginsRoot, "demo-b", "plugin.json"), "utf8");
    expect(JSON.parse(raw).version).toBe("2.0.0"); // 在位的新版**不被旧备份覆盖**
    expect((await fs.readdir(pluginsRoot)).sort()).toEqual(["demo-b"]);
  });

  it("无 .bak → 一切不动（正常启动零副作用）", async () => {
    await mkPlugin(path.join(pluginsRoot, "demo-c"), "1.0.0");

    const restored = await recoverInterruptedUpdates();

    expect(restored).toEqual([]);
    expect((await fs.readdir(pluginsRoot)).sort()).toEqual(["demo-c"]);
  });

  it("插件根不存在 → 返回空、不抛（首次启动 / 目录尚未创建）", async () => {
    await fs.rm(pluginsRoot, { recursive: true, force: true });
    await expect(recoverInterruptedUpdates()).resolves.toEqual([]);
  });

  it("裸 .bak（无插件名前缀）不认领——不是本机制的产物，不动它", async () => {
    await mkPlugin(path.join(pluginsRoot, ".bak"), "1.0.0");
    await expect(recoverInterruptedUpdates()).resolves.toEqual([]);
    expect((await fs.readdir(pluginsRoot)).sort()).toEqual([".bak"]);
  });
});
