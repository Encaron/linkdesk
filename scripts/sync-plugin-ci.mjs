#!/usr/bin/env node
/**
 * sync-plugin-ci——把脚手架模板里的「插件仓门禁三件套」铺到**官方发货仓**（只数现场从 FACTS 表读，
 * 不写死；E6#102 · L7 7.5 轮）。
 *
 * 🔴 **为什么要有这个脚本**（而不是手改每一只）：清单的**唯一真相源是脚手架模板**
 *    （`packages/create-linkdesk-plugin/template/`）——「新插件一建出来就有检查」靠它。官方发货各仓
 *    是**同一个形状的历史工程**，它们的门禁文件必须是模板那几份的**逐字节副本**，否则「模板改了、
 *    各仓没跟」这类漂移**没有任何门禁能发现**（插件仓不在壳仓的 check 域里）。逐仓手改 =
 *    逐份手抄，本脚本把「同源」变成机械动作。
 *
 * 铺什么（**按仓的实际情况分档**，不搞一刀切）：
 *   · 全部官方发货仓 —— `.github/workflows/ci.yml` + `scripts/ci-verify.mjs`（严格门禁）
 *                  ＋ `package.json` 的 `verify` 脚本 ＋ devDependency `jsonc-parser`
 *   · 有测试的仓 —— 另加 `vitest.config.ts` + `vitest.setup.ts`（**运行时地基**，见 06 §二）
 *                  ＋ `package.json` 的 `test` 脚本 ＋ devDeps（`vitest` / `jsdom`，用 RTL 的加
 *                  `@testing-library/react`）——判据是**现场数测试文件**，不是照抄文档里的表
 *
 * ⚠️ 本脚本只改**本地容器**（`E:\linkdesk-plugins\official\<id>`）；**不碰 git、不推送**。
 *    推各仓是用户点头之后的事（红线②），本脚本一个字都不推。
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
// 官方仓名单的唯一真相源（`sync-plugin-agents.mjs` 的 FACTS 表）与仓发现口径住在 lib——
// 与覆盖尺 `audit-plugin-tests.mjs` **共用同一份**：两份名单必然漂移（同一只仓在一把尺里在场、
// 在另一把里缺席，而没有任何灯会亮）。
import { officialPluginIds } from "./lib/plugin-repos.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const AGENTS_SCRIPT = join(ROOT, "scripts", "sync-plugin-agents.mjs");
const TEMPLATE = join(ROOT, "packages", "create-linkdesk-plugin", "template");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:\\linkdesk-plugins\\official";
const DRY = process.argv.includes("--dry-run");

/** 模板里的五件（前两件全铺；后三件只给**有源码**的仓——纯数据插件没有 TS 工程） */
const ALWAYS = [".github/workflows/ci.yml", "scripts/ci-verify.mjs"];
const FOR_SOURCED = ["tsconfig.json"];
// ⚠️ `vitest.setup.ts` 的**内容**由模板决定、本表只管「这只仓该不该有它」——模板里那份现在是一行指针
//    （`import "@linkdesk/plugin-sdk/vitest-setup";`），所以铺下去的就是指针，不必在这里另做判断。
const FOR_TESTED = ["vitest.config.ts", "vitest.setup.ts"];
/** 允许**仓内就地扩写**的「地基件」——模板只保证最小地基，仓内自有钩子（如测试前置复位）留在原地 */
const EXTENDABLE = new Set([...FOR_SOURCED, ...FOR_TESTED]);
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

/**
 * 🔴 第三方仓**不代改**（L11 红线）：本脚本只负责**官方发货仓**的 CI/测试基建一致性。
 * 第三方作者自持的仓（用户 pull 进容器的）一行都不碰——它们自足能跑，迁不迁、何时迁归作者。
 * 名单口径与覆盖尺 `audit-plugin-tests.mjs` **同源**：官方仓名单的唯一真相源是
 * `sync-plugin-agents.mjs` 的 FACTS 表——**表内 = 官方发货仓，表外 = 第三方**。
 * ⛔ 这里不许写 id 名单（硬约束 10：壳代码零插件 ID 字面量；写死名单还会在「新收编一只官方仓」
 * 时静默漏铺——漏在写入集外，没有任何灯会亮）。
 */
const OFFICIAL_IDS = officialPluginIds(AGENTS_SCRIPT);
if (!OFFICIAL_IDS) {
  // ⛔ 名单读不到时**不许降级放行**：覆盖尺那边降级成「全按官方报」只是多报几行，
  //    这边降级会把第三方作者仓当官方仓写入 = 越权改别人的仓。
  console.error(`❌ 读不到官方仓名单（${AGENTS_SCRIPT} 的 FACTS 表——脚本形态变了？）`);
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
const skipped = [];
const extended = [];
const record = (repo, what) => changes.push(`${repo}: ${what}`);

for (const id of repos) {
  if (!OFFICIAL_IDS.has(id)) {
    skipped.push(id);
    continue;
  }
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
    // 🔴 「地基件」与「门禁件」区别对待（E6#161 实测教训）：`vitest.setup.ts` / `tsconfig.json` 这类
    //    **配置/地基**文件，仓内**合法扩写**是常态（marketplace 就为多表面 realm 槽加了
    //    `beforeEach(() => __resetRealmSlots())`——一次覆盖把它抹掉，23 例测试当场红）。
    //    判据 = 模板的每个非空行**都**在本地文件里（= 模板是它的子集）⇒ 视为就地扩写，⛔ 不代改。
    //    门禁件（`ci.yml` / `ci-verify.mjs`，ALWAYS 那两份）**不适用**：它们的价值就在逐字节同源。
    if (EXTENDABLE.has(rel) && existsSync(to)) {
      const lines = (p) => norm(p).split("\n").filter((l) => l.trim() !== "");
      const tmpl = lines(from);
      const local = lines(to);
      if (tmpl.every((l) => local.includes(l))) {
        extended.push(
          `${id}: ${rel} 就地扩写（模板 ${tmpl.length} 行 ⊂ 本地 ${local.length} 行）——⛔ 保留仓内自有钩子，不代改`,
        );
        continue;
      }
    }
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
for (const e of extended) console.log(`  · ⏭ ${e}`);
if (skipped.length > 0) console.log(`  · 跳过第三方仓 ${skipped.length} 只（不在 FACTS 表内 · ⛔ 不代改）：${skipped.join("、")}`);
const written = changes.filter((c) => !c.includes("无差异")).length;
console.log(`\n${DRY ? "将改动" : "已改动"} ${written} 处。`);
if (!DRY && written > 0) {
  console.log(`\n🔴 下一步（必须）：更新各仓 lockfile——\`npm ci\` 要求 lock 与 package.json 一致，`);
  console.log(`   不一致会**直接失败**。逐仓：`);
  console.log(`     cd <repo> && npm install --registry=https://registry.npmjs.org`);
  console.log(`   ⚠️ 必须显式指定 registry.npmjs.org——本机默认 registry 是 npmmirror 镜像，`);
  console.log(`      不指定会把 lock 里的 resolved 改写成镜像地址（7.2 特意钉成官方源的）。`);
}
