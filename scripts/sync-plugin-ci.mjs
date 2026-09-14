#!/usr/bin/env node
/**
 * sync-plugin-ci——把脚手架模板里的「插件仓门禁三件套」铺到 18 只官方插件仓（E6#102 · L7 7.5 轮）。
 *
 * 🔴 **为什么要有这个脚本**（而不是手改 18 遍）：清单的**唯一真相源是脚手架模板**
 *    （`packages/create-linkdesk-plugin/template/`）——「新插件一建出来就有检查」靠它。18 只官方插件
 *    仓是**同一个形状的历史工程**，它们的门禁文件必须是模板那几份的**逐字节副本**，否则「模板改了、
 *    18 只没跟」这类漂移**没有任何门禁能发现**（插件仓不在壳仓的 check 域里）。手改 18 遍 =
 *    18 份手抄，本脚本把「同源」变成机械动作。
 *
 * 铺什么（**按仓的实际情况分档**，不搞一刀切）：
 *   · 全部 18 只 —— `.github/workflows/ci.yml` + `scripts/ci-verify.mjs`（严格门禁）
 *                  ＋ `package.json` 的 `verify` 脚本 ＋ devDependency `jsonc-parser`
 *   · 有测试的仓 —— 另加 `vitest.config.ts` + `vitest.setup.ts`（**运行时地基**，见 06 §二）
 *                  ＋ `package.json` 的 `test` 脚本 ＋ devDeps（`vitest` / `jsdom`，用 RTL 的加
 *                  `@testing-library/react`）——判据是**现场数测试文件**，不是照抄文档里的表
 *
 * ⚠️ 本脚本只改**本地容器**（`E:\linkdesk-plugins\official\<id>`）；**不碰 git、不推送**。
 *    推 18 个仓是用户点头之后的事（红线②），本脚本一个字都不推。
 *
 * 用法：
 *   node scripts/sync-plugin-ci.mjs --dry-run     # 只报差异，不落盘（先看它要干什么）
 *   node scripts/sync-plugin-ci.mjs               # 落盘（文件 + package.json）
 *   LINKDESK_PLUGIN_CONTAINER=<dir> 覆盖容器位置（默认 E:\linkdesk-plugins\official）
 *
 * 🔴 **改完仍要跑 npm install 更新 lockfile**——本脚本只写 package.json；`npm ci`（CI 用的那条）
 *    要求 lock 与 package.json 一致，不一致它会**直接失败**。脚本结尾会打印逐仓命令。
 */
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TEMPLATE = join(ROOT, "packages", "create-linkdesk-plugin", "template");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:\\linkdesk-plugins\\official";
const DRY = process.argv.includes("--dry-run");

/** 模板里的五件（前两件全铺；后三件只给**有源码**的仓——纯数据插件没有 TS 工程） */
const ALWAYS = [".github/workflows/ci.yml", "scripts/ci-verify.mjs"];
const FOR_SOURCED = ["tsconfig.json"];
const FOR_TESTED = ["vitest.config.ts", "vitest.setup.ts"];
/** 版本区间与壳仓根 devDependencies 对齐（vitest/jsdom）与 SDK 的传递依赖同版（jsonc-parser） */
const DEV_DEPS = {
  "jsonc-parser": "^3.3.1",
  jsdom: "^29.1.1",
  "@testing-library/react": "^16.3.2",
  vitest: "^4.1.10",
};

if (!existsSync(CONTAINER)) {
  console.error(`❌ 容器不存在：${CONTAINER}（用 LINKDESK_PLUGIN_CONTAINER 指定）`);
  process.exit(1);
}

/** 容器下的插件仓 = 含 plugin.json 的一级目录（**不写死 id 清单**——加插件不用改脚本） */
const repos = readdirSync(CONTAINER, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(CONTAINER, e.name, "plugin.json")))
  .map((e) => e.name)
  .sort();

/** 现场数测试文件（06 §二.1 的纪律：**别按文档里的表抄**） */
function testFiles(dir) {
  const out = [];
  const walk = (cur) => {
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const p = join(cur, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const changes = [];
const record = (repo, what) => changes.push(`${repo}: ${what}`);

for (const id of repos) {
  const dir = join(CONTAINER, id);
  const tests = testFiles(dir);
  const hasSrc = existsSync(join(dir, "src"));
  const useRtl = tests.some((f) => readFileSync(f, "utf8").includes("@testing-library/react"));

  // ── 1. 文件 ──
  for (const rel of [...ALWAYS, ...(hasSrc ? FOR_SOURCED : []), ...(tests.length > 0 ? FOR_TESTED : [])]) {
    const from = join(TEMPLATE, rel);
    const to = join(dir, rel.split("/").join("\\"));
    // 比对**忽略行尾**：各仓 `.gitattributes` 强制 LF，检出后工作区与模板可能一个 CRLF 一个 LF——
    // 那种差异不是「模板变了」，不该让本脚本每次都报「更新」（改了就是改了，颠来倒去会淹掉真差异）。
    const norm = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const same = existsSync(to) && norm(to) === norm(from);
    if (same) continue;
    record(id, `${existsSync(to) ? "更新" : "新增"} ${rel}`);
    if (!DRY) {
      cpSync(from, to, { recursive: true });
    }
  }

  // ── 2. package.json（scripts + devDependencies；其余字段一律不动） ──
  const pkgPath = join(dir, "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const before = JSON.stringify(pkg);
  pkg.scripts = pkg.scripts ?? {};
  if (pkg.scripts.verify !== "node scripts/ci-verify.mjs") pkg.scripts.verify = "node scripts/ci-verify.mjs";
  if (tests.length > 0) pkg.scripts.test = "vitest run";
  pkg.devDependencies = pkg.devDependencies ?? {};
  const wantDeps = {
    "jsonc-parser": DEV_DEPS["jsonc-parser"],
    ...(tests.length > 0 ? { jsdom: DEV_DEPS.jsdom, vitest: DEV_DEPS.vitest } : {}),
    ...(useRtl ? { "@testing-library/react": DEV_DEPS["@testing-library/react"] } : {}),
  };
  for (const [k, v] of Object.entries(wantDeps)) {
    if (pkg.devDependencies[k] === undefined) {
      pkg.devDependencies[k] = v;
      record(id, `devDependencies += ${k}@${v}`);
    }
  }
  // devDependencies 按 key 排序——与模板/壳仓的可读性习惯一致（npm 不要求，纯粹给人看）
  pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)));
  const after = JSON.stringify(pkg);
  if (before !== after) {
    record(id, "package.json 已更新");
    if (!DRY) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } else {
    record(id, tests.length > 0 ? `无差异（测试 ${tests.length} 个）` : "无差异（纯数据仓）");
  }
}

console.log(`${DRY ? "[dry-run] " : ""}容器：${CONTAINER}（${repos.length} 只）`);
for (const c of changes) console.log(`  · ${c}`);
const written = changes.filter((c) => !c.includes("无差异")).length;
console.log(`\n${DRY ? "将改动" : "已改动"} ${written} 处。`);
if (!DRY && written > 0) {
  console.log(`\n🔴 下一步（必须）：更新各仓 lockfile——\`npm ci\` 要求 lock 与 package.json 一致，`);
  console.log(`   不一致会**直接失败**。逐仓：`);
  console.log(`     cd <repo> && npm install --registry=https://registry.npmjs.org`);
  console.log(`   ⚠️ 必须显式指定 registry.npmjs.org——本机默认 registry 是 npmmirror 镜像，`);
  console.log(`      不指定会把 lock 里的 resolved 改写成镜像地址（7.2 特意钉成官方源的）。`);
}
