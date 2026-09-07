/**
 * bundled-install 首启自动装集成单测——E6#15c（1.3-2 P-段A）boot 机制钉子。
 *
 * mock electron（app.getPath/getAppPath/isPackaged——filesystem-guard 同款 vi.hoisted 模式）；
 * bundledPluginsDir（dev 分支 = getAppPath()/bundled-plugins）与 userPluginsDir（userData/plugins）指向
 * 真实临时目录，zip 真建真解压。逐场景验证 boot 模块独有的编排（共享单包决策 installBundleCandidate
 * 已由其自身测试对拍）：
 *   1. 无账本 + 无已装 → 平铺单根全自动装；发货源 zip 保留（永久备份）
 *   2. 已装同版本 → 跳过（源保留，不重解压）
 *   3. E6#18g 决策序②③：账本 removed 标记 → 该插件跳过自动恢复（用户故意删除）；无任何记录者照装（③ 铺种子）
 *   4. E6#18g 决策序④：账本有活性记录（removed:false）+ 目录缺 → 跳过不铺种子（不复活——墓碑化交 renderer）；
 *      无记录者照装（③）
 * fixture 全虚构 id/文案（硬约束 21）。2026-09-05 塌平单根：发货夹无 builtin/user 子目录层，
 * 直扫 bundled-plugins/*.linkdesk-plugin → userData/plugins/<id>/。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import JSZip from "jszip";

const electronMock = vi.hoisted(() => {
  const paths: { appRoot: string; userData: string } = { appRoot: "", userData: "" };
  const app = {
    isPackaged: false,
    getAppPath: () => paths.appRoot,
    getPath: (key: string) => (key === "userData" ? paths.userData : ""),
  };
  return { app, paths };
});
vi.mock("electron", () => electronMock);

import { installBundledPlugins } from "./bundled-install.js";

/** 虚构 fixture 的 manifest 文本 */
function manifestJson(pluginId: string, version: string): string {
  return JSON.stringify({ pluginId, version, name: `Demo ${pluginId}` });
}

/** 在 dir 下真写一个 `<pluginId>.linkdesk-plugin` zip */
async function writeZip(dir: string, pluginId: string, version: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
  const zip = new JSZip();
  zip.file("plugin.json", manifestJson(pluginId, version));
  zip.file("README.md", `demo ${pluginId} readme`);
  const buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  await fs.promises.writeFile(path.join(dir, `${pluginId}.linkdesk-plugin`), buf);
}

/** 断言 <userData>/plugins/<id>/plugin.json 存在（已自动装）——2026-09-05 塌平单根（无 sub 层） */
async function expectInstalled(userData: string, pluginId: string, version: string): Promise<void> {
  const raw = await fs.promises.readFile(path.join(userData, "plugins", pluginId, "plugin.json"), "utf-8");
  expect((JSON.parse(raw) as { version: string }).version).toBe(version);
}

describe("installBundledPlugins——首启自动装（平铺单根 + removed 豁免 + 幂等）", () => {
  let appRoot: string; // dev getAppPath()——bundled-plugins 发货夹所在
  let userData: string; // dev getPath('userData')——解压家 userData/plugins

  beforeEach(async () => {
    appRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bundled-install-app-"));
    userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bundled-install-ud-"));
    electronMock.paths.appRoot = appRoot;
    electronMock.paths.userData = userData;
    // 发货夹平铺单根（无 builtin/user 子目录层）
    await writeZip(path.join(appRoot, "bundled-plugins"), "demo-a", "1.0.0");
    await writeZip(path.join(appRoot, "bundled-plugins"), "demo-b", "1.0.0");
  });

  afterEach(async () => {
    await fs.promises.rm(appRoot, { recursive: true, force: true });
    await fs.promises.rm(userData, { recursive: true, force: true });
  });

  it("无账本 + 无已装：发货夹全自动装；发货源 zip 保留（永久备份）", async () => {
    await installBundledPlugins();
    await expectInstalled(userData, "demo-a", "1.0.0");
    await expectInstalled(userData, "demo-b", "1.0.0");
    // 发货源没被消费
    await expect(fs.promises.stat(path.join(appRoot, "bundled-plugins", "demo-a.linkdesk-plugin"))).resolves.toBeTruthy();
    await expect(fs.promises.stat(path.join(appRoot, "bundled-plugins", "demo-b.linkdesk-plugin"))).resolves.toBeTruthy();
  });

  it("已装同版本：跳过不重解压，发货源保留（幂等）", async () => {
    // 预装 demo-a 同版本到 userData
    await fs.promises.mkdir(path.join(userData, "plugins", "demo-a"), { recursive: true });
    await fs.promises.writeFile(
      path.join(userData, "plugins", "demo-a", "plugin.json"),
      manifestJson("demo-a", "1.0.0"),
    );
    await fs.promises.writeFile(path.join(userData, "plugins", "demo-a", "keep-me.txt"), "untouched");
    await installBundledPlugins();
    await expectInstalled(userData, "demo-a", "1.0.0");
    // 未重解压——已装目录未被发货 zip 覆盖（keep-me.txt 还在）
    expect(await fs.promises.readFile(path.join(userData, "plugins", "demo-a", "keep-me.txt"), "utf-8")).toBe("untouched");
    // 无已装的 demo-b 照常自动装
    await expectInstalled(userData, "demo-b", "1.0.0");
  });

  it("决策序②③：账本 removed 标记跳过恢复；无任何记录者照装（③ 铺种子）", async () => {
    // 账本（userData/installed-plugins.json——与 readLedgerState 读的路径一致）
    await fs.promises.writeFile(
      path.join(userData, "installed-plugins.json"),
      JSON.stringify({ "demo-a": { version: "1.0.0", installedAt: "x", source: "user", removed: true } }),
    );
    await installBundledPlugins();
    // demo-a removed → ② 豁免——不复活
    await expect(fs.promises.stat(path.join(userData, "plugins", "demo-a"))).rejects.toThrow();
    // demo-b 无任何账本记录 + 目录缺 → ③ 铺种子
    await expectInstalled(userData, "demo-b", "1.0.0");
    // 发货源都保留
    await expect(fs.promises.stat(path.join(appRoot, "bundled-plugins", "demo-a.linkdesk-plugin"))).resolves.toBeTruthy();
  });

  it("决策序④：活性记录（removed:false）+ 目录缺 → 跳过不铺种子（不复活）；无记录者照装（③）", async () => {
    // demo-b 有活性记录但目录已被删（removed:false = 非故意删的墓碑，纯记录）——E6#18g ④ respect 不复活，
    // 墓碑化交 renderer reconcile 唯一 owner（boot 层只尊重不补种，防「删了重启自己回来」复活缝）。
    await fs.promises.writeFile(
      path.join(userData, "installed-plugins.json"),
      JSON.stringify({
        "demo-b": { version: "1.0.0", installedAt: "x", source: "user", removed: false },
      }),
    );
    await installBundledPlugins();
    // demo-b 目录缺失不铺种子
    await expect(fs.promises.stat(path.join(userData, "plugins", "demo-b"))).rejects.toThrow();
    // demo-a 无账本记录 + 目录缺 → ③ 照常铺种子
    await expectInstalled(userData, "demo-a", "1.0.0");
    // 发货源都保留
    await expect(fs.promises.stat(path.join(appRoot, "bundled-plugins", "demo-b.linkdesk-plugin"))).resolves.toBeTruthy();
  });
});
