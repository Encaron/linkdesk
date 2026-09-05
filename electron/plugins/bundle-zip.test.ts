/**
 * bundle-zip 共享单包安装决策 installBundleCandidate 语义对拍单测——1.2-5/1.3-2 抽共享防回归钉子。
 *
 * 重构风险 = 两个 boot 源语义差异靠参数表达，行为不能漂：
 *   - ingest 语义（消费）：deleteSource=true——装好/同版本/损坏已装都删源 zip；损坏已装不重装（recoverCorrupt=false）。
 *   - bundled 语义（发货保留）：deleteSource=false——源 zip 永久保留；损坏已装 → 视为缺失重装（recoverCorrupt=true）；
 *     removed 豁免集命中 → 永不自动恢复（残留目录也复活不了）。
 * 本测试逐 case 对拍上述两套，真实建 zip + 真实临时目录（集成式单测），fixture 全虚构 id/文案（硬约束 21）。
 * sub 名对共享函数是任意标签（行为不随子目录名变）——统一走 "user" 一处 setup，消 before/after 重复。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import JSZip from "jszip";
import { BUNDLE_EXT, installBundleCandidate } from "./bundle-zip.js";

/** 虚构 fixture（硬约束 21——不指真实插件） */
const MANIFEST_100 = { pluginId: "demo-bundle", version: "1.0.0", name: "Demo Bundle" };

/** 平铺包（SDK 默认形态——plugin.json 在顶层）+ 一段内容 */
function flatEntries(): Record<string, string> {
  return { "plugin.json": JSON.stringify(MANIFEST_100), "README.md": "demo readme" };
}

/** 真实建 `.linkdesk-plugin` zip buffer（JSZip nodebuffer——与主进程同库同规则） */
async function makeBundle(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/** 造一个临时插件家，返回 home 与清理函数 */
async function makeHome(): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bundle-zip-test-"));
  return { home, cleanup: () => fs.promises.rm(home, { recursive: true, force: true }) };
}

/** 在 {home}/user/ 下写一个 zip，返回 zipPath */
async function seedZip(
  home: string,
  file = `demo-bundle${BUNDLE_EXT}`,
  entries: Record<string, string> = flatEntries(),
): Promise<string> {
  const zipPath = path.join(home, "user", file);
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
  await fs.promises.writeFile(zipPath, await makeBundle(entries));
  return zipPath;
}

/** 预造 {home}/user/<id>/plugin.json 内容（simulate 已装态） */
async function preseedTarget(home: string, content: string, id = "demo-bundle"): Promise<void> {
  await fs.promises.mkdir(path.join(home, "user", id), { recursive: true });
  await fs.promises.writeFile(path.join(home, "user", id, "plugin.json"), content);
}

/** 断言路径存在/不存在 */
async function expectPath(p: string, exists: boolean): Promise<void> {
  const hit = await fs.promises.stat(p).then(() => true, () => false);
  expect(hit).toBe(exists);
}

/** 读 {home}/user/<id>/plugin.json 的 version——断言已装态 */
async function readInstalledVersion(home: string, id = "demo-bundle"): Promise<string> {
  const raw = await fs.promises.readFile(path.join(home, "user", id, "plugin.json"), "utf-8");
  return (JSON.parse(raw) as { version: string }).version;
}

describe("installBundleCandidate——ingest 消费 vs bundled 保留两套语义 + zip 形态", () => {
  let home: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ home, cleanup } = await makeHome());
  });

  afterEach(async () => {
    await cleanup();
  });

  /** ingest 消费语义参数（home 当前用例临时家） */
  const ingest = (zipPath: string) =>
    ({ zipPath, sub: "user", homeDir: home, tag: "test-ingest", deleteSource: true, recoverCorrupt: false }) as const;
  /** bundled 发货保留语义参数 */
  const bundled = (zipPath: string, skipIfRemoved?: Set<string>) =>
    ({
      zipPath,
      sub: "user",
      homeDir: home,
      tag: "test-bundled",
      deleteSource: false,
      recoverCorrupt: true,
      ...(skipIfRemoved ? { skipIfRemoved } : {}),
    }) as const;

  describe("ingest 消费语义（装好/同版本/损坏已装删源；损坏不重装）", () => {
    it("全新：解压到 user/demo-bundle/ + 删源 zip（已消费）", async () => {
      const zip = await seedZip(home);
      const outcome = await installBundleCandidate(ingest(zip));
      expect(outcome).toBe("installed");
      expect(await readInstalledVersion(home)).toBe("1.0.0");
      await expectPath(zip, false); // 源 zip 已删
    });

    it("已装同版本：删重复源 zip，目标不动", async () => {
      await preseedTarget(home, JSON.stringify(MANIFEST_100));
      const zip = await seedZip(home);
      expect(await installBundleCandidate(ingest(zip))).toBe("same-version");
      await expectPath(zip, false); // 重复包消费掉
    });

    it("已装异版本：保留源 zip（升级留给安装流），已装目录不被覆盖", async () => {
      await preseedTarget(home, JSON.stringify({ ...MANIFEST_100, version: "0.9.0" }));
      const zip = await seedZip(home);
      expect(await installBundleCandidate(ingest(zip))).toBe("version-kept");
      await expectPath(zip, true);
      expect(await readInstalledVersion(home)).toBe("0.9.0"); // 仍是旧版
    });

    it("已装目录损坏：消费源 zip 跳过，损坏文件不覆盖（原 ingest 语义）", async () => {
      await preseedTarget(home, "not json {{{");
      const zip = await seedZip(home);
      expect(await installBundleCandidate(ingest(zip))).toBe("same-version");
      await expectPath(zip, false); // 重复包消费掉
      expect(await fs.promises.readFile(path.join(home, "user", "demo-bundle", "plugin.json"), "utf-8")).toBe("not json {{{");
    });

    it("removed 豁免（ingest 无此语义——不传集）：照常安装", async () => {
      const zip = await seedZip(home);
      expect(await installBundleCandidate(ingest(zip))).toBe("installed");
    });
  });

  describe("bundled 发货保留语义（源 zip 不删；损坏重装；removed 豁免）", () => {
    it("全新恢复：解压到 user/demo-bundle/ + 源 zip 保留（永久备份可再恢复）", async () => {
      const zip = await seedZip(home);
      expect(await installBundleCandidate(bundled(zip))).toBe("installed");
      expect(await readInstalledVersion(home)).toBe("1.0.0");
      await expectPath(zip, true); // 源保留
    });

    it("removed 豁免命中：不恢复不消费（用户故意删除 = 永不复活），源保留", async () => {
      const zip = await seedZip(home);
      const outcome = await installBundleCandidate(bundled(zip, new Set(["demo-bundle"])));
      expect(outcome).toBe("removed-skipped");
      await expectPath(path.join(home, "user", "demo-bundle"), false); // 目录没建
      await expectPath(zip, true);
    });

    it("removed 豁免 + 残留损坏目录并存：removed 胜——不复活（防误恢复边界）", async () => {
      await preseedTarget(home, "corrupt");
      const zip = await seedZip(home);
      const outcome = await installBundleCandidate(bundled(zip, new Set(["demo-bundle"])));
      expect(outcome).toBe("removed-skipped");
      expect(await fs.promises.readFile(path.join(home, "user", "demo-bundle", "plugin.json"), "utf-8")).toBe("corrupt");
    });

    it("已装目录损坏 + recoverCorrupt：视为缺失重装覆盖（bundled 恢复主干）", async () => {
      await preseedTarget(home, "corrupt");
      const zip = await seedZip(home);
      expect(await installBundleCandidate(bundled(zip))).toBe("installed");
      expect(await readInstalledVersion(home)).toBe("1.0.0"); // 损坏文件已被发货源覆盖
      await expectPath(zip, true);
    });

    it("已装同版本：跳过（源保留不消费）", async () => {
      await preseedTarget(home, JSON.stringify(MANIFEST_100));
      const zip = await seedZip(home);
      expect(await installBundleCandidate(bundled(zip))).toBe("same-version");
      await expectPath(zip, true);
    });
  });

  describe("zip 形态（wrapper 目录 / 无 plugin.json）", () => {
    it("单层 wrapper 目录包：wrapper 剥离后 plugin.json 落插件根（容忍手包/旧工具）", async () => {
      const wrapperEntries: Record<string, string> = {};
      for (const [name, content] of Object.entries(flatEntries())) wrapperEntries[`demo-wrap/${name}`] = content;
      const zip = await seedZip(home, `demo-bundle${BUNDLE_EXT}`, wrapperEntries);
      expect(await installBundleCandidate(ingest(zip))).toBe("installed");
      const root = path.join(home, "user", "demo-bundle");
      expect(await readInstalledVersion(home)).toBe("1.0.0"); // wrapper 剥离，plugin.json 在插件根
      expect(await fs.promises.readFile(path.join(root, "README.md"), "utf-8")).toBe("demo readme");
      await expectPath(path.join(root, "demo-wrap"), false); // wrapper 名不落盘
    });

    it("无 plugin.json 的 zip：invalid，zip 保留待查", async () => {
      const zip = await seedZip(home, "junk.linkdesk-plugin", { "readme.txt": "not a plugin" });
      expect(await installBundleCandidate(ingest(zip))).toBe("invalid");
      await expectPath(zip, true); // 消费语义下仍保留待查
    });
  });
});
