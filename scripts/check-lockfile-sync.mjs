#!/usr/bin/env node
/**
 * `check-lockfile-sync`——**lockfile 与各 manifest 的「同源」门禁**（E6#107）。
 *
 * ── 它管什么（为什么必须有这一条）──
 *   2026-09-14 实证：`Build and Release` 在 CI 上**从 7.6 轮起每一次推送都红**，全死在 `npm ci`，
 *   而**本地一切全绿**——因为 `npm run check`（50 来项机械门禁）里**没有一条**看 lockfile，本地
 *   `node_modules` 一直在，于是「本地绿 ≠ 云端绿」。代价不是一条红：**Release 从未产出**，
 *   版本号一路往上走而网上一片空白（用户当晚收到数封 GitHub 失败邮件才发现）。
 *   根因形态很小：`npm ci` 要求 `package-lock.json` 与各 `package.json` **严格同源**，
 *   而升一个 workspace 包的版本号（或加一个依赖）时，只要没重跑 `npm install`，lock 就落后了。
 *   本轮把它变成一条**离线、秒级、零副作用**的机械断言。
 *
 * ── 判据（四条红 + 一条黄）──
 *   ① 根版本：`lock.packages[""].version` === 根 `package.json.version`
 *      （实证：失步时 lock 里还写着 0.1.61，而本地已 0.1.64）
 *   ② 依赖键集：根与每个 workspace 的 `dependencies` / `devDependencies` / `optionalDependencies`
 *      的**键集**必须与 lock 里同条目一致（"加了依赖没跑 install" 是 `npm ci` 的另一种红法）
 *   ③ workspace 版本：每个**存在**的 workspace 目录（由根 `workspaces` 通配符解析）必须在 lock 里有
 *      条目、且 `version` 与 `name` 同源（实证：lock 里 plugin-sdk 停在 0.1.14、脚手架停在 0.1.2）
 *   ④ workspace 在 lock 里**缺条目**：整个条目没有 ⇒ 红（`packages/plugin-docs` 曾整只不在 lock 里）
 *   ⑤ ⚠️ 黄灯不拦：lock 里有、而**目录已不存在**的 workspace 条目（18 只插件源码外移后留下的孤儿条目）。
 *      ——刻意**不判红**：npm 自己的 `npm ci` 容忍它们（实证：修好①②③④后 CI 全绿；这些条目在 lock 里
 *      带 `extraneous: true`，即 npm 自认「不在依赖树里」）。把「npm 能过」的事判成红 = 假红，
 *      而假红让真红失效（本仓最贵的坏法）。
 *      ⚠️ **别信「跑一次 npm install 就清了」**（本文件第一版就是这么写的，**实测错**）：
 *      2026-09-14 实测 `npm install --package-lock-only` **不清**它们；**手工删条目后重跑也不会写回来**
 *      （因此可一次性清理——当天已清过一次）。黄灯规则保留，是留给**日后新出现**的孤儿。
 *
 * ── 为什么不是「跑一次真 `npm ci`」──
 *   那要动 `node_modules`、要联网、要几分钟，挂不进每次提交。本门禁只读两个 JSON，职责单一：
 *   **回答「lock 与 manifest 是否同源」这一个问题**——同源则 `npm ci` 在云端必然有得跑；
 *   真跑得成不成（网络/平台）不归它管。
 *
 * 用法：
 *   node scripts/check-lockfile-sync.mjs              # 挂 npm run check（离线，秒级）
 *   node scripts/check-lockfile-sync.mjs --self-test  # 六格自测（含「7.6 那一笔」的复现负控）
 * 退出码 0 = 同源；1 = 有漂移（逐条打印差在哪）。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 顶层依赖字段——`npm ci` 校验的就是这几组（peerDependencies 不进 lock 的 packages 条目） */
const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

/** 把根 `workspaces` 声明（只支持 `<dir>/*` 一层通配，够本仓用）解析成**存在的**目录绝对路径 */
export function resolveWorkspaceDirs(rootDir) {
  const pkg = readJson(join(rootDir, "package.json"));
  const out = [];
  for (const pattern of pkg.workspaces ?? []) {
    const star = pattern.indexOf("*");
    if (star < 0) {
      const dir = resolve(rootDir, pattern);
      if (existsSync(join(dir, "package.json"))) out.push({ dir, rel: pattern });
      continue;
    }
    const base = resolve(rootDir, pattern.slice(0, star).replace(/[\\/]+$/, ""));
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const dir = join(base, name);
      if (!statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, "package.json"))) continue;
      out.push({ dir, rel: pattern.slice(0, star) + name });
    }
  }
  return out;
}

/** 键集差——返回 { onlyLocal, onlyLock }（两侧都排序，便于打印） */
function depDiff(local, locked) {
  const keys = (o) => (o && typeof o === "object" ? Object.keys(o) : []);
  const onlyLocal = [];
  const onlyLock = [];
  for (const field of DEP_FIELDS) {
    const a = keys(local[field]);
    const b = keys(locked?.[field]);
    for (const k of a) if (!b.includes(k)) onlyLocal.push(`${field}.${k}`);
    for (const k of b) if (!a.includes(k)) onlyLock.push(`${field}.${k}`);
  }
  return { onlyLocal, onlyLock };
}

/**
 * 核心判据（对任意仓库根可跑——自测拿它测夹具树）。返回 { problems, warnings, checked }。
 * 所有相对路径按 `/` 归一（lock 的键一律正斜杠，Windows 上也一样）。
 */
export function checkLockfileSync(rootDir) {
  const problems = [];
  const warnings = [];
  let checked = 0;

  const pkgPath = join(rootDir, "package.json");
  const lockPath = join(rootDir, "package-lock.json");
  if (!existsSync(pkgPath)) return { problems: ["找不到 package.json"], warnings, checked: 0 };
  if (!existsSync(lockPath)) return { problems: ["找不到 package-lock.json——没有 lock 就没有 `npm ci` 可跑"], warnings, checked: 0 };

  const pkg = readJson(pkgPath);
  const lock = readJson(lockPath);
  const entries = lock.packages ?? {};
  const locked = (rel) => entries[rel.replace(/\\/g, "/")];

  // ① 根版本
  const rootLocked = entries[""];
  if (!rootLocked) {
    problems.push("lock 缺根条目 packages[\"\"]——lock 形状不认识");
  } else {
    checked++;
    if (rootLocked.version !== pkg.version) {
      problems.push(`根版本失同步：package.json = ${pkg.version}，lock = ${rootLocked.version}（跑 \`npm install\` 让 lock 跟上）`);
    }
    const d = depDiff(pkg, rootLocked);
    if (d.onlyLocal.length) problems.push(`根依赖在 manifest 有、lock 没有：${d.onlyLocal.join("、")}（加了依赖没跑 install）`);
    if (d.onlyLock.length) problems.push(`根依赖在 lock 有、manifest 没有：${d.onlyLock.join("、")}（删了依赖没跑 install）`);
  }

  // ③④ workspace
  const wsDirs = resolveWorkspaceDirs(rootDir);
  const wsRelSet = new Set(wsDirs.map((w) => w.rel));
  for (const { dir, rel } of wsDirs) {
    checked++;
    const manifest = readJson(join(dir, "package.json"));
    const l = locked(rel);
    if (!l) {
      problems.push(`workspace ${rel} 整个不在 lock 里（manifest ${manifest.name ?? "?"}@${manifest.version}）`);
      continue;
    }
    if (l.version !== manifest.version) {
      problems.push(`workspace ${rel} 版本失同步：manifest = ${manifest.version}，lock = ${l.version}`);
    }
    if (l.name !== undefined && l.name !== manifest.name) {
      problems.push(`workspace ${rel} 名称失同步：manifest = ${manifest.name}，lock = ${l.name}`);
    }
    const d = depDiff(manifest, l);
    if (d.onlyLocal.length) problems.push(`workspace ${rel} 依赖在 manifest 有、lock 没有：${d.onlyLocal.join("、")}`);
    if (d.onlyLock.length) problems.push(`workspace ${rel} 依赖在 lock 有、manifest 没有：${d.onlyLock.join("、")}`);
  }

  // ⑤ 孤儿条目——只黄不红（npm 自己容忍它们；判红 = 假红）
  const wsPatternBases = (pkg.workspaces ?? []).filter((w) => w.includes("*")).map((w) => w.slice(0, w.indexOf("*")));
  for (const key of Object.keys(entries)) {
    const k = key.replace(/\\/g, "/");
    if (!k || k.includes("node_modules")) continue;
    if (!wsPatternBases.some((b) => k.startsWith(b)) && !(pkg.workspaces ?? []).includes(k)) continue;
    if (wsRelSet.has(k)) continue;
    warnings.push(`${k}（lock 里有、目录已不存在；npm ci 容忍它，故只黄不红。⚠️ \`npm install\` 不会自动清——要么手工删条目，要么不管它）`);
  }

  return { problems, warnings, checked };
}

/* ── 自测 ─────────────────────────────────────────────────────────────── */

function makeFixture(root) {
  const write = (rel, obj) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  };
  return write;
}

function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "ldk-lock-gate-"));
  const cases = [];
  const t = (name, fn) => cases.push({ name, fn });
  const base = () => {
    const root = mkdtempSync(join(tmp, "case-"));
    const write = makeFixture(root);
    write("package.json", { name: "demo-root", version: "1.0.0", private: true, workspaces: ["packages/*", "plugins/*"], dependencies: { alpha: "^1.0.0" } });
    write("packages/demo-a/package.json", { name: "demo-a", version: "2.0.0" });
    write("package-lock.json", {
      name: "demo-root",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "demo-root", version: "1.0.0", dependencies: { alpha: "^1.0.0" } },
        "packages/demo-a": { name: "demo-a", version: "2.0.0" },
      },
    });
    return { root, write };
  };

  /** 在夹具里改 lock / manifest 再跑判据 */
  const mutate = (root, rel, fn) => {
    const p = join(root, rel);
    const obj = JSON.parse(readFileSync(p, "utf8"));
    fn(obj);
    writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  };

  t("同源 ⇒ 绿", () => {
    const { root } = base();
    const r = checkLockfileSync(root);
    if (r.problems.length) throw new Error(`不该红：${r.problems.join("；")}`);
    if (r.checked < 2) throw new Error("应至少核了根 + 1 个 workspace");
  });

  t("🔴 负控①「7.6 那一笔」复现：workspace 升版没刷 lock ⇒ 红", () => {
    const { root } = base();
    mutate(root, "packages/demo-a/package.json", (m) => (m.version = "2.1.0"));
    const r = checkLockfileSync(root);
    if (!r.problems.some((p) => p.includes("packages/demo-a") && p.includes("2.1.0"))) throw new Error(`没抓到版本漂移：${r.problems.join("；")}`);
  });

  t("🔴 负控②根版本失同步（实证形态 0.1.61 vs 0.1.64）⇒ 红", () => {
    const { root } = base();
    mutate(root, "package.json", (m) => (m.version = "1.0.1"));
    const r = checkLockfileSync(root);
    if (!r.problems.some((p) => p.includes("根版本失同步"))) throw new Error(`没抓到根版本漂移：${r.problems.join("；")}`);
  });

  t("🔴 负控③workspace 整个不在 lock 里（实证形态 packages/plugin-docs）⇒ 红", () => {
    const { root, write } = base();
    write("packages/demo-b/package.json", { name: "demo-b", version: "0.1.0" });
    const r = checkLockfileSync(root);
    if (!r.problems.some((p) => p.includes("packages/demo-b") && p.includes("整个不在 lock"))) throw new Error(`没抓到缺条目：${r.problems.join("；")}`);
  });

  t("🔴 负控④加了依赖没跑 install ⇒ 红", () => {
    const { root } = base();
    mutate(root, "package.json", (m) => (m.dependencies.beta = "^1.0.0"));
    const r = checkLockfileSync(root);
    if (!r.problems.some((p) => p.includes("dependencies.beta"))) throw new Error(`没抓到依赖漂移：${r.problems.join("；")}`);
  });

  t("🟡 负控⑤孤儿条目（目录已不存在）⇒ 只黄不红（防假红）", () => {
    const { root, write } = base();
    write("package-lock.json", {
      name: "demo-root",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "demo-root", version: "1.0.0", dependencies: { alpha: "^1.0.0" } },
        "packages/demo-a": { name: "demo-a", version: "2.0.0" },
        "plugins/gone": { name: "gone", version: "9.9.9" },
      },
    });
    const r = checkLockfileSync(root);
    if (r.problems.length) throw new Error(`孤儿条目不该判红：${r.problems.join("；")}`);
    if (!r.warnings.some((w) => w.includes("plugins/gone"))) throw new Error("孤儿条目应出一盏黄灯");
  });

  let failed = 0;
  for (const c of cases) {
    try {
      c.fn();
      console.log(`  ✓ ${c.name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${c.name}——${e instanceof Error ? e.message : String(e)}`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(failed === 0 ? `\n[lockfile-sync] --self-test ✓ ${cases.length} 例全过` : `\n[lockfile-sync] --self-test 🔴 ${failed} 例不过`);
  return failed === 0 ? 0 : 1;
}

/* ── 入口 ─────────────────────────────────────────────────────────────── */

if (process.argv.includes("--self-test")) {
  process.exit(runSelfTest());
}

const { problems, warnings, checked } = checkLockfileSync(REPO_ROOT);
if (warnings.length > 0) {
  // 收成一行：孤儿条目是「18 只插件源码外移」的遗留形态，逐条刷屏只会淹没真信号
  const head = warnings.slice(0, 3).map((w) => w.split("（")[0]).join("、");
  console.log(`   ⚠ [lockfile-sync] ${warnings.length} 盏黄灯（lock 里有、目录已不存在，npm ci 容忍、不拦）：${head}${warnings.length > 3 ? " 等" : ""}`);
}
if (problems.length > 0) {
  console.error(`❌ [lockfile-sync] lock 与 manifest 失同步 ${problems.length} 处——**云端 \`npm ci\` 会红，Release 出不来**（本地一切照绿）：`);
  for (const p of problems) console.error(`     · ${p}`);
  console.error(`   修法：在仓库根跑 \`npm install\`（只补 lock 用 \`npm install --package-lock-only\`），然后连同 lock 一起提交。`);
  process.exit(1);
}
console.log(`✅ [lockfile-sync] lock 与 ${checked} 个 manifest 同源（云端 \`npm ci\` 装得动）`);
