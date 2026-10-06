/**
 * 悬空扫描腿**对账测试**（E6#117）——「运行时 TS 腿不是第二把尺子」的机械证明。
 *
 * 两层：
 * ① **桩层**：照格 1 `--self-test` 的正负控形态造临时目录（虚构 `demo-*` 名），验 TS 腿的
 *    判定行为（悬空该报的报、误报控三条不报）。
 * ② **真产物层**：随包 6 只 zip 上，TS 腿（解包目录口径）与格 1 尺子
 *    （`node scripts/plugin-dangling-name-audit.mjs --json`）**逐只比对悬空名集合**——
 *    两个实现谁走了样当场红。真 id 的使用边界 = CLAUDE.md 硬约束 21 的「验证真实接线」例外。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scanInstalledPluginDir } from "./dangling-scan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const AUDIT = join(ROOT, "scripts", "plugin-dangling-name-audit.mjs");
const BUNDLED = join(ROOT, "bundled-plugins");

let tmp: string | null = null;
const work = (): string => (tmp ??= mkdtempSync(join(tmpdir(), "ldk-compat-")));
afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const mkPlugin = (id: string, js: string, css?: string): string => {
  const d = join(work(), id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "plugin.json"), JSON.stringify({ pluginId: id }));
  writeFileSync(join(d, "index.bundle.js"), js);
  if (css !== undefined) writeFileSync(join(d, "index.bundle.css"), css);
  return d;
};

const danglingNames = (dir: string): string[] => (scanInstalledPluginDir(dir)?.dangling ?? []).map((d) => d.name);

describe("桩层——判定行为（照格 1 自测形态，虚构名）", () => {
  it("正控：喊了双方都没有的 ldk-* 名 ⇒ 报", () => {
    const d = mkPlugin("demo-positive", 'jsx("div",{className:"ldk-ghost-widget ldk-ghost-aux"});');
    expect(danglingNames(d).sort()).toEqual(["ldk-ghost-aux", "ldk-ghost-widget"]);
  });

  it("负控 A：第三方名在自己包 CSS 里有定义 ⇒ 不报（Monaco 那一类结构）", () => {
    const d = mkPlugin(
      "demo-selfcontained",
      'jsx("div",{className:"monaco-workbench demo-own"});',
      ".monaco-workbench{color:red}.demo-own{padding:0}",
    );
    expect(danglingNames(d)).toEqual([]);
  });

  it("负控 B：含插值的模板 ⇒ 跳过（不报、不拆）", () => {
    const d = mkPlugin("demo-interp", 'jsx("div",{className:`ldk-badge ldk-badge--${kind}`});');
    expect(danglingNames(d)).toEqual([]);
  });

  it("负控 C：宿主定义集能兜住（含保留关键帧）⇒ 不报", () => {
    const d = mkPlugin(
      "demo-hostsatisfied",
      'jsx("div",{className:"ldk-toggle ldk-input"});',
      ".demo-root .ldk-toggle{opacity:1}\n.demo-anim{animation:ldk-selectbox-in .1s}",
    );
    expect(danglingNames(d)).toEqual([]);
  });

  it("负控 D：自有/DOM 钩子名（非 ldk-）未定义 ⇒ 不报", () => {
    const d = mkPlugin("demo-hooks", 'jsx("div",{className:"demo-hook demo-other"});');
    expect(danglingNames(d)).toEqual([]);
  });

  it("负控 E：字符串/注释里的 className=（生成式代码）⇒ 不是站点", () => {
    const d = mkPlugin(
      "demo-stringtrap",
      'const html = \'<div className="ldk-ghost-from-string">\';\n// jsx("div",{className:"ldk-ghost-from-comment"});',
    );
    expect(danglingNames(d)).toEqual([]);
  });

  it("正控（关键帧轴）：animation 引了双方都没有的关键帧 ⇒ 报", () => {
    const d = mkPlugin("demo-kf", 'jsx("div",{className:"demo-own"});', ".demo-own{animation:demo-ghost-anim .2s}");
    expect(danglingNames(d)).toEqual(["demo-ghost-anim"]);
  });

  it("负控 F：读不动的目录 ⇒ null（缺数据，⛔ 不当 drifted）", () => {
    expect(scanInstalledPluginDir(join(work(), "demo-not-exist"))).toBeNull();
  });
});

describe("G4——产物里 @linkdesk/ui 静态具名导入的采集（实际地板的输入）", () => {
  const uiImportsOf = (id: string, js: string): string[] => {
    const d = mkPlugin(id, js);
    const r = scanInstalledPluginDir(d);
    expect(r).not.toBeNull();
    return r!.uiImports;
  };

  it("正控：静态具名导入 ⇒ 抓到**原名**（as 别名不进地板）；压缩形态（无空格）同抓", () => {
    expect(uiImportsOf("demo-ui-named", 'import { PluginCard, HintTip as H } from "@linkdesk/ui";')).toEqual(["HintTip", "PluginCard"]);
    expect(uiImportsOf("demo-ui-min", 'import{Badge as e,Button}from"@linkdesk/ui";')).toEqual(["Badge", "Button"]);
    expect(uiImportsOf("demo-ui-mixed", 'import Ge, { InlineInput } from "@linkdesk/ui";')).toEqual(["InlineInput"]);
    expect(uiImportsOf("demo-ui-single", `import{Slider}from'@linkdesk/ui';`)).toEqual(["Slider"]);
  });

  it("负控 A：不消费 / type-only / 命名空间 / side-effect / 动态 / require / 子路径 ⇒ 零名字（链接期不炸的形态不算）", () => {
    expect(uiImportsOf("demo-ui-none", 'const x = 1; console.log(x);')).toEqual([]);
    expect(uiImportsOf("demo-ui-ns", 'import * as ui from "@linkdesk/ui"; const C = ui.Badge;')).toEqual([]);
    expect(uiImportsOf("demo-ui-side", 'import "@linkdesk/ui"; import "@linkdesk/ui/styles.css";')).toEqual([]);
    expect(uiImportsOf("demo-ui-dyn", 'const m = await import("@linkdesk/ui"); const r = require("@linkdesk/ui");')).toEqual([]);
    expect(uiImportsOf("demo-ui-sub", 'import { X } from "@linkdesk/ui/other";')).toEqual([]);
  });

  it("负控 B：字符串 / 注释里的 import 语句（生成式文本）⇒ 不是导入（同负控 E 的误报控）", () => {
    expect(uiImportsOf("demo-ui-string", 'const help = "import { PluginCard } from \\"@linkdesk/ui\\";";')).toEqual([]);
    expect(uiImportsOf("demo-ui-comment", '// import { PluginCard } from "@linkdesk/ui"\n/* import { Badge } from "@linkdesk/ui" */')).toEqual([]);
  });

  it("负控 C：其他包的具名导入照常不抓（只认 @linkdesk/ui）", () => {
    expect(uiImportsOf("demo-ui-other", 'import { createPluginContext } from "@linkdesk/plugin-sdk"; import React from "react";')).toEqual([]);
  });

  it("负控 D：坏形态子句 ⇒ 整句放弃（不猜半个名字）；对悬空判定零影响", () => {
    expect(uiImportsOf("demo-ui-broken", "import { Badge from \"@linkdesk/ui\";")).toEqual([]);
    const d = mkPlugin("demo-ui-both", 'import { PluginCard } from "@linkdesk/ui"; jsx("div",{className:"ldk-ghost-x"});');
    const r = scanInstalledPluginDir(d)!;
    expect(r.uiImports).toEqual(["PluginCard"]);
    expect(r.dangling.map((x) => x.name)).toEqual(["ldk-ghost-x"]);
  });
});

/* jscpd:ignore-start */
/* ↑ 极简 zip 读取与格 1 脚本的 zipIndex/zipEntryText 结构同源（测试侧解包真产物用，对账关系见文件头） */

/** 读 zip 中央目录（与格 1 同款：EOCD → 中央目录条目） */
function zipIndex(buf: Buffer): Map<string, { method: number; compSize: number; localOffset: number }> {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是 zip（找不到 EOCD）");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; compSize: number; localOffset: number }>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`中央目录第 ${n} 条签名不对`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (!name.endsWith("/")) entries.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 解一条 zip 条目为文本（method 0 = stored / 8 = deflate） */
function zipEntryText(buf: Buffer, entries: Map<string, { method: number; compSize: number; localOffset: number }>, name: string): string | null {
  const e = entries.get(name);
  if (!e) return null;
  const lo = e.localOffset;
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return raw.toString("utf8");
  if (e.method === 8) return inflateRawSync(raw).toString("utf8");
  throw new Error(`条目 ${name} 用了不支持的压缩方式 ${e.method}`);
}

const isTextEntry = (n: string): boolean => /\.(css|js|mjs|cjs|html)$/i.test(n) || n === "plugin.json";

/** 把 zip 的文本条目解到临时目录（TS 腿只吃目录——运行时已装插件就是解包目录） */
function unzipTo(zipPath: string, dest: string): void {
  const buf = readFileSync(zipPath);
  const entries = zipIndex(buf);
  for (const name of entries.keys()) {
    if (!isTextEntry(name)) continue;
    const text = zipEntryText(buf, entries, name);
    if (text == null) continue;
    const out = join(dest, name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
}
/* jscpd:ignore-end */

/** 格 1 尺子对同一产物的悬空名（子进程跑 .mjs——口径的唯一真相源侧） */
function auditScriptNames(zipPath: string): string[] {
  const out = execFileSync(process.execPath, [AUDIT, "--json", zipPath], { encoding: "utf8", cwd: ROOT });
  const json = JSON.parse(out) as { artifacts: { dangling: { name: string }[] }[] };
  return json.artifacts[0].dangling.map((d) => d.name).sort();
}

describe("真产物层——随包 6 只 zip：TS 腿 ↔ 格 1 尺子逐只对账", () => {
  const zips = existsSync(BUNDLED) ? readdirSync(BUNDLED).filter((f) => f.endsWith(".linkdesk-plugin")).sort() : [];

  it("随包种子在场（测试环境自证——不在 ⇒ 本测试没验到东西）", () => {
    expect(zips.length).toBeGreaterThanOrEqual(6);
  });

  for (const zip of zips) {
    // editor 的 Monaco bundle 有数 MB（解包 ＋ 双腿扫描）——单只给 120s
    it(`对账：${zip}`, () => {
      const zipPath = join(BUNDLED, zip);
      const dest = join(work(), "unpacked", zip.replace(/\.linkdesk-plugin$/, ""));
      unzipTo(zipPath, dest);
      const tsNames = (scanInstalledPluginDir(dest)?.dangling ?? []).map((d) => d.name).sort();
      expect(tsNames).toEqual(auditScriptNames(zipPath));
    }, 120_000);
  }
});
