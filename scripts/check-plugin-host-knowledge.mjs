#!/usr/bin/env node
/**
 * K1–K10 · 插件宿主知识门禁（`check-plugin-host-knowledge.mjs`）——2026-11-24 语义归属。
 *
 * 判据出处：`docs/04-软件更新/待抉择池/插件语义归属-设置与生态/03-门禁与验收/01-机械门禁.md`。
 * 一句话：**插件不得持有宿主语义**——路径 / 域字符串 / 宿主配置键特判 / 系统调用 / 资产协议 / 落盘文件名。
 *
 * ── 级别 ──
 *   · 官方仓（FACTS 表；`gate-scan.loadOfficialRepos`）⇒ **error**；
 *   · 第三方仓 ⇒ **warn**（照既有「官方强制、第三方引导」）；
 *   · 容器不在场 ⇒ 插件域跳过并高声说明（本腿必须能在没有插件容器的机器上跑）。
 *
 * ── 判据实现 ──
 *   全部在 `scripts/lib/plugin-host-knowledge.mjs`（与 `test:replaceability` 共用，⛔ 不写第二份）。
 *
 * ── 豁免账本 `scripts/host-knowledge-exempt.json` ──
 *   `{repo, rule, file, reason, owner, until}`；`until` 为 YYYY-MM-DD ⇒ **过期 = error**。
 *   账本不是清零挡箭牌：每条必须写「什么时候删」（通常是壳新 API 的 minAppVersion）。
 *
 * 用法：node scripts/check-plugin-host-knowledge.mjs [容器目录] / --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listSourceFiles, loadOfficialRepos, readStripped, resolveContainer } from "./lib/gate-scan.mjs";
import {
  RULES,
  scanPluginSource,
  scanSharedSource,
  scanShellActionMetadata,
} from "./lib/plugin-host-knowledge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const LEDGER_PATH = path.join(ROOT, "scripts", "host-knowledge-exempt.json");
const TODAY = new Date().toISOString().slice(0, 10);

function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return { entries: [], errors: ["豁免账本缺失：scripts/host-knowledge-exempt.json"] };
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const errors = [];
    for (const e of entries) {
      if (!e?.repo || !e?.rule || !e?.file || !e?.reason || !e?.owner || !e?.until) {
        errors.push(`账本条目缺字段（repo/rule/file/reason/owner/until）：${JSON.stringify(e)}`);
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.until) && e.until < TODAY) {
        errors.push(`账本过期（${e.until}）：${e.repo}/${e.file} [${e.rule}] —— 迁移完成后删本条，⛔ 不许续期当挡箭牌`);
      }
    }
    return { entries, errors };
  } catch (e) {
    return { entries: [], errors: [`账本解析失败：${e}`] };
  }
}

function isExempt(entries, repo, rule, file) {
  return entries.some(
    (e) => e.repo === repo && e.rule === rule && (e.file === file || (e.file.endsWith("/") && file.startsWith(e.file))),
  );
}

/** 自测：正控必红 / 负控不误伤（不依赖插件容器） */
function selfTest() {
  let failed = 0;
  const expectHit = (rule, src, repo, file = "src/x.ts") => {
    const hits = scanPluginSource(src, { repo, file, official: true });
    const ok = hits.some((h) => h.rule === rule);
    console.log(`${ok ? "✓" : "✗"} 正控 ${rule}（${repo}）${ok ? "命中" : "漏报"}`);
    if (!ok) failed++;
  };
  const expectClean = (rule, src, repo, file = "src/x.ts") => {
    const hits = scanPluginSource(src, { repo, file, official: true });
    const ok = !hits.some((h) => h.rule === rule);
    console.log(`${ok ? "✓" : "✗"} 负控 ${rule}（${repo}）${ok ? "不误伤" : "假红"}`);
    if (!ok) failed++;
  };

  expectHit("K1", "const d = await window.linkdesk.path.appDataDir();", "settings");
  expectHit("K2", 'await dialog.open({ defaultPathKind: "appearance" });', "settings");
  expectHit("K3", 'if (key === "app.themeColor") return;', "settings");
  expectHit("K4", "await shell.openPath(dir);", "serial-monitor");
  expectHit("K7", "function basename(p: string) { return p.split('/').pop(); }", "file-tree");
  expectHit("K8", 'await window.linkdesk.pluginState.get("app", "recentFolders");', "file-tree");
  expectHit("K9", "const u = `linkdesk://${pluginId}/${dir}`;", "marketplace");
  expectHit("K10", 'join(dir, "settings.json");', "settings");

  expectClean("K1", "const dir = env.pluginDataDir;", "file-tree");
  expectClean("K2", "const target = prop.pickTarget;", "settings");
  expectClean("K7", "export function basename(x: string) { return p().basename(x); }", "file-tree", "src/utils/hostPath.ts");
  expectClean("K9", 'image: "linkdesk://marketplace/resources/repo-official.svg"', "marketplace");
  expectClean("K10", 'catalogSiblingUrl(url, "plugin.json")', "marketplace");

  const k6a = scanSharedSource("const d = await window.linkdesk.path.appDataDir();", "src/components/shared/x.ts");
  const k6b = scanSharedSource('export const S = "followTheme";', "src/components/shared/x.ts");
  const k6c = scanSharedSource(
    "const u = `linkdesk://${id}/`;",
    "src/components/shared/asset-url/pluginAssetPath.ts",
  );
  const k6ok = k6a.some((h) => h.rule === "K6") && k6b.length === 0 && k6c.length === 0;
  console.log(`${k6ok ? "✓" : "✗"} K6 正控命中 / 负控不误伤（含协议形状唯一实现例外）`);
  if (!k6ok) failed++;

  const k5a = scanShellActionMetadata('id: "appearance.pickImage", title: "x", category: "y",', "src/core/commands/shell/x.ts");
  const k5b = scanShellActionMetadata('id: "appearance.pickImage", title: "x", description: "d", params: [],', "src/core/commands/shell/x.ts");
  const k5ok = k5a.some((h) => h.rule === "K5") && k5b.length === 0;
  console.log(`${k5ok ? "✓" : "✗"} K5 正控命中 / 负控不误伤`);
  if (!k5ok) failed++;

  if (failed > 0) {
    console.error(`\n❌ K 腿自测失败 ${failed} 条`);
    process.exit(1);
  }
  console.log("\n✅ K1–K10 自测全过（正控命中 / 负控不误伤）");
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
}

/* ── 正式检查 ── */

const ledger = readLedger();
const errors = [...ledger.errors];
const warnings = [];

const { dir: container, present } = resolveContainer();
if (!present) {
  console.log(`⚠ 插件容器不在场（${container}）——插件域跳过；壳域（K5/K6）照常判。`);
}

const repos = present ? loadOfficialRepos(container, path.join(ROOT, "scripts", "sync-plugin-agents.mjs")) : [];

for (const repo of repos) {
  for (const abs of listSourceFiles(path.join(repo.dir, "src"))) {
    const src = readStripped(abs);
    if (src === null) {
      errors.push(`读不到源码（⛔ 不静默当干净）：${abs}`);
      continue;
    }
    const rel = path.relative(repo.dir, abs).split(path.sep).join("/");
    for (const h of scanPluginSource(src, { repo: repo.id, file: rel, official: repo.official })) {
      if (isExempt(ledger.entries, repo.id, h.rule, rel)) continue;
      const msg = `${repo.id}/${rel}:${h.line} [${h.rule}] ${RULES[h.rule]} —— ${h.excerpt}`;
      if (repo.official) errors.push(msg);
      else warnings.push(msg);
    }
  }
}

// K6：壳共享件不得持有宿主知识
for (const sharedDir of ["src/components/shared", "packages/linkdesk-ui/src"]) {
  const abs = path.join(ROOT, sharedDir);
  if (!fs.existsSync(abs)) continue;
  for (const f of listSourceFiles(abs, [".ts", ".tsx"])) {
    const src = readStripped(f);
    if (src === null) {
      errors.push(`读不到共享件源码：${f}`);
      continue;
    }
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    for (const h of scanSharedSource(src, rel)) {
      errors.push(`${rel}:${h.line} [${h.rule}] ${RULES[h.rule]} —— ${h.excerpt}`);
    }
  }
}

// K5：新宿主动作元数据
for (const f of listSourceFiles(path.join(ROOT, "src/core/commands/shell"))) {
  const src = readStripped(f);
  if (src === null) continue;
  for (const h of scanShellActionMetadata(src, path.relative(ROOT, f).split(path.sep).join("/"))) {
    errors.push(`${h.file}:${h.line} [${h.rule}] ${RULES[h.rule]} —— ${h.excerpt}`);
  }
}

for (const w of warnings) console.log(`⚠ [第三方·只报] ${w}`);
if (errors.length) {
  console.error(`\n❌ 插件宿主知识门禁红 ${errors.length} 条：`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}
console.log(
  `\n✅ 插件宿主知识门禁通过——官方仓 ${repos.filter((r) => r.official).length} 只 / 第三方 ${repos.filter((r) => !r.official).length} 只；` +
    `账本 ${ledger.entries.length} 条（无过期）。`,
);
