#!/usr/bin/env node
/**
 * R7 · 插件仓自足（`check-plugin-repo-self-sufficiency.mjs`）——「层间依赖方向」第二条腿（与 R6 同族）。
 *
 * 判据出处：`docs/04-软件更新/已落地/插件仓自足与壳耦合清账/00-README.md` §六 **D3**（2026-10-06 拍板
 * = **B 判据 ＋ 门禁腿**，且须负控实测能红）＋ §一.1 的 17 只仓普查口径（那是人工普查，本腿是它的机械替身）。
 * 同族先例：`check-shared-components-zero-shell-deps.mjs`（**R6**，守「共享件不得依赖壳内部」）——
 * 两条腿量的**是同一件事的两端**：`插件仓 → 壳` 与 `共享件 → 壳`，都归「依赖方向只许朝公开面」。
 * ⇒ 共用一套底座（`lib/gate-scan.mjs` 的容器解析 / 例外账本 ＋ `lib/plugin-repos.mjs` 的仓发现），
 * ⛔ 不另造一把量同一件事的尺（memory `two-rulers-one-caliber`）。
 *
 * ══ 守的是哪句话 ══
 *   > 任何一只插件仓**只靠本仓 ＋ 公开 npm** 就能构建、校验、发版。
 *
 * ── 为什么要有这条腿（先例是血）──
 *   2026-10-05 升级 `theme-iconset-pastel` 时，为扩图标清单改了**壳仓** `scripts/convert-material-icons.mjs`
 *   （「产物的图纸住壳仓」）——而这件事**没有任何门禁看得见**：插件仓不在壳仓 `npm run check` 的扫描域里，
 *   唯一会亮的黄灯（`check-npm-release`）只盯 npm 货架。⇒ 把「自足」从**假设**变成**每次 check 真跑一遍**。
 *
 * ── 三条判定（对**官方仓**硬红；不在官方名单里的仓**只报告不判红**，照 R1–R6 的第三条边界）──
 *   ① **依赖声明只许指公开来源** —— `dependencies` / `devDependencies` / `peerDependencies` /
 *      `optionalDependencies` 的值里出现 `file:` / `link:` / `workspace:` / `portal:` / 相对路径 /
 *      绝对路径（盘符、`~`）⇒ 红（那些写法**只在本机成立**，换台机器或换个作者就装不上）。
 *      版本区间 / `git+https` / `npm:` 别名 / tarball URL 一律放行——它们是**公开**来源。
 *   ② **清单与配置里的路径不许越出本仓** —— 仓内每个 JSON（`plugin.json` / `package.json` /
 *      `marketplace.json` / `.vscode/settings.json` / 主题配方 / 字典 / 图标映射）里的**字符串值**，
 *      形如路径 **且解析后真的存在** **且落在本仓之外** ⇒ 红（典型：`$schema` 指去壳仓、
 *      `entry` / `path` 指去仓外）。
 *      🔴 「要求可解析」是**故意的**：干净检出（无 `node_modules`）时 `./node_modules/…` 解不开，
 *      按「不存在」处置 ⇒ **不假红**（假红是门禁第一杀手）；死链另有 `check-doc-links` 管。
 *      仓内连字符路径（`icons/material/x.svg`）与仓外不可解析串**都不进红**。
 *   ③ **脚本点到的文件必须在本仓** —— `package.json` 的 `scripts` 里出现的**文件路径 token**
 *      必须落在本仓内；其中**被执行的那个**（`node` / `tsx` 之后的第一个非旗标 token，或命令首 token
 *      本身就是 `./x.mjs`）还必须**真实存在**。这是「**产物生成器 / 校验器必须住在作者自己的仓里，
 *      且真的在**」的机械脚注（出处就是 pastel 那一课）。
 *      🔴 只对「被执行的那个」查存在，对**像路径的参数**（`--config vitest.config.ts`、
 *      `--out reports/junit.json`）**只查越界不查存在**——参数点名的常常是**将要生成**的产物，
 *      查存在必假红（自测里有一例正控钉这个）。
 *
 * ── 🔴 边界（判不了什么，如实写在这里，⛔ 别指望本腿）──
 *   · 判的是**声明面**，判不了**来历**：「这份产物当初是拿谁的工具生成的」机械上不可见——
 *     pastel 那次是维护者**手工**在壳仓跑脚本，`package.json` 里一个字都没提它。那半条靠
 *     **清单随仓**（作者侧编辑决定文件，先例 `icon-import.json`）＋ 文档纪律，不靠本腿。
 *   · **`package-lock.json` 不进域**：它是派生物，`resolved` 字段是货架 URL 与依赖树快照。
 *   · **注释 / README 里的路径不进域**（本腿只读 JSON 值，不剥源码注释）：各仓说明里引用壳仓文档
 *     解释「为什么有这份文件」是**正解**，不是耦合（普查实测 17 只各 7～15 处，全是注释与作者文档链接）。
 *   · **公开地依赖壳仓远端**（`"x": "git+https://…/linkdesk.git"`）本腿不判：要认远端身份，且今天零命中；
 *     真要判，口径先拍板，别让门禁自己发明规则。
 *   · 第三方作者仓**只报告**：硬约束 10 的同一条道理——跳过一律按现场数据认，⛔ 不写名单、⛔ 不代改。
 *
 * ── 例外账本 ──
 *   与 R6 同一套形状（`applyExceptions`）：**文件级** ＋ `why` ＋ `until`（到期条件），且**反向核对**
 *   （条目今天一条违规也没放行 ⇒ 报「过期例外」，逼人删条目而不是让白名单越积越宽）。
 *   今天 **0 条**——2026-10-05 普查 17 只仓零命中，没有值得挂账的存量。
 *
 * ── 容器可以不在场 ──
 *   本腿的插件域要读插件容器（默认 `E:/linkdesk-plugins`，可用 `LINKDESK_PLUGIN_CONTAINER` 或位置参数覆盖）。
 *   容器不在场 ⇒ **高声跳过并退出 0**（⛔ 不静默）：门禁必须能在没有插件容器的机器上跑通整条 `npm run check`，
 *   这是 `check-gate-health` 的 EXEMPT 注释里立过的规矩。
 *
 * 用法：node scripts/check-plugin-repo-self-sufficiency.mjs [容器目录]
 *       node scripts/check-plugin-repo-self-sufficiency.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as jsonc from "jsonc-parser";

import { applyExceptions, resolveContainer } from "./lib/gate-scan.mjs";
import { discoverPluginRepos, officialPluginIds, readManifestJson } from "./lib/plugin-repos.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");

/** 例外账本（今天 0 条；形状与纪律见文件头「例外账本」段）。 */
export const EXCEPTIONS = [];

/** 只在本机成立的依赖写法（`file:` / `link:` / `workspace:` / `portal:` 全是本地解析）。 */
const LOCAL_SPEC_RE = /^(file:|link:|workspace:|portal:)/;

/** 「形如路径」的起手式：`./` `../` `/` `~\` `C:\`。 */
const PATHY_RE = /^(?:\.{1,2}[\\/]|[\\/]|~[\\/]|[A-Za-z]:[\\/])/;

/**
 * `scripts` 命令里算「文件路径」的 token。
 * 🔴 刻意收紧到「干净 token ＋ 脚本/清单扩展名」：`node -e "require('fs')…"` 那种引号载荷里有
 * 空格与括号，整体对不上本式 ⇒ 不会被误当路径（自测里有一条负控钉这个）。
 */
const SCRIPT_PATH_TOKEN_RE = /^[\w.@/\\-]+\.(?:mjs|cjs|js|ts|json)$/;

/** 能「执行一个脚本文件」的跑器：其后第一个非旗标 token 就是被执行的脚本。 */
const RUNNERS = new Set(["node", "tsx", "ts-node", "bun", "deno"]);

/** 下钻跳过（口径与 `plugin-repos.mjs` / `gate-scan.mjs` 一致）。 */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "release", "resources", ".vscode-test"]);
/** 不进域的派生物。 */
const SKIP_FILES = new Set(["package-lock.json"]);

/** 依赖字段（四个全查；少一个就等于漏一条路）。 */
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/* ───────────────────────── ① 依赖声明只许指公开来源 ───────────────────────── */

/**
 * 纯函数：`package.json` → 本机路径型依赖命中。
 * @param {any} pkg 已解析的 `package.json`
 * @returns {{id: string, where: string, why: string}[]}
 */
export function judgeDeps(pkg) {
  const hits = [];
  for (const field of DEP_FIELDS) {
    const deps = pkg?.[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== "string") continue;
      if (!LOCAL_SPEC_RE.test(spec) && !PATHY_RE.test(spec)) continue;
      hits.push({
        id: "local-spec",
        where: `${field}.${name} = ${JSON.stringify(spec)}`,
        why: "依赖写成了本机路径——换台机器（或第三方作者）装不上",
      });
    }
  }
  return hits;
}

/* ───────────────────── ② 清单与配置里的路径不许越出本仓 ───────────────────── */

/** 递归收集 JSON 里的字符串值：`{value, at}`（`at` = 可读的 JSON 路径，供报点用）。 */
function walkStrings(node, at, out) {
  if (typeof node === "string") {
    out.push({ value: node, at });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkStrings(v, `${at}[${i}]`, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walkStrings(v, at ? `${at}.${k}` : k, out);
  }
}

/** 仓内要看的 JSON（递归枚举；跳过 `node_modules` 等与锁文件）。 */
export function listJsonFiles(repoDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (e.name.endsWith(".json") && !SKIP_FILES.has(e.name)) {
        out.push(p);
      }
    }
  };
  walk(repoDir);
  return out.sort();
}

/**
 * 纯函数（IO 只经注入的 `isOutside` / `exists`）：一份 JSON 文本 → 越界路径命中。
 *
 * @param {{text: string, fileAbs: string, rel: string}} input
 * @param {(abs: string) => boolean} isOutside 该绝对路径是否落在本仓之外
 * @param {(abs: string) => boolean} exists
 */
export function judgePathFields({ text, fileAbs, rel }, isOutside, exists) {
  const errors = [];
  const doc = jsonc.parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) return []; // 解析失败是别的腿的账（本腿退回「没看见」，⛔ 不冒充判据）
  const strings = [];
  walkStrings(doc, "", strings);
  const hits = [];
  for (const { value, at } of strings) {
    const raw = value.split("#")[0]; // 允许 `x.json#L1` 形态的锚点
    if (!PATHY_RE.test(raw)) continue;
    const abs = path.resolve(path.dirname(fileAbs), raw);
    if (!exists(abs)) continue; // 🔴 判「可解析」——解不开就不判（干净检出不得假红）
    if (!isOutside(abs)) continue; // 落在本仓内 = 正解
    hits.push({
      id: "outside-path",
      rel,
      where: `${at || "(根)"} = ${JSON.stringify(value)}`,
      why: `清单/配置里的路径指到了本仓之外：${abs}`,
    });
  }
  return hits;
}

/* ───────────────────── ③ 脚本点到的文件必须在本仓 ───────────────────── */

/**
 * 纯函数（IO 经注入的 `resolve` / `exists`）：`scripts` 里点到的文件路径必须在本仓内，
 * 其中**被执行的脚本**还必须真实存在。
 *
 * 🔴 为什么分两档（假红是门禁第一杀手）：
 *   · **被执行的那个**（`node` / `tsx` / `ts-node` / `bun` / `deno` 之后的第一个非旗标 token，
 *     或命令首个 token 本身就是 `./x.mjs` 形态）⇒ 必须落在本仓内**且存在**
 *     ——「生成器 / 校验器必须住在作者自己的仓里，且真的在」（pastel 那一课的机械脚注）。
 *   · **其余像路径的参数**（`--config vitest.config.ts`、`--out reports/junit.json`）⇒ **只判越界，不判存在**
 *     ——参数点名的文件常常是**将要生成**的产物，都还没生成 ⇒ 判存在必假红。
 *     越界照样红：`--config ../../../linkdesk/vitest.config.ts` 是耦合，跑不掉。
 *
 * @param {any} pkg 已解析的 `package.json`
 */
export function judgeScripts(pkg, resolveToken, exists) {
  const hits = [];
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== "object") return hits;
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== "string") continue;
    const tokens = cmd.split(/\s+/).filter(Boolean);
    const mustExist = new Set();
    // 「被执行的那个」= 跑器之后的第一个非旗标 token（跳过 `--experimental-…` 这类前置旗标）
    for (let i = 0; i < tokens.length; i++) {
      if (!RUNNERS.has(tokens[i].replace(/\.(cmd|exe|bat)$/i, ""))) continue;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].startsWith("-")) continue;
        if (SCRIPT_PATH_TOKEN_RE.test(tokens[j])) mustExist.add(tokens[j]);
        break;
      }
    }
    // 命令首个 token 直接就是路径：`"./tools/check.mjs --x"`（脚本被直接执行）
    if (tokens[0] && PATHY_RE.test(tokens[0]) && SCRIPT_PATH_TOKEN_RE.test(tokens[0])) mustExist.add(tokens[0]);

    for (const token of new Set(tokens)) {
      if (!SCRIPT_PATH_TOKEN_RE.test(token)) continue;
      const abs = resolveToken(token);
      if (!abs) {
        hits.push({
          id: "script-outside",
          where: `scripts.${name} = ${JSON.stringify(cmd)}`,
          why: `命令里的文件路径落在本仓之外：${token}（换个作者/换台机器就没有这个文件）`,
        });
        continue;
      }
      if (mustExist.has(token) && !exists(abs)) {
        hits.push({
          id: "script-missing",
          where: `scripts.${name} = ${JSON.stringify(cmd)}`,
          why: `被执行的脚本在本仓里不存在：${token}（生成器/校验器必须住本仓，且真的在）`,
        });
      }
    }
  }
  return hits;
}

/* ─────────────────────────── 单仓判定（IO 编排） ─────────────────────────── */

/** 按仓扫描 → 命中表（`rel` 冠以仓 id，免得两个仓的同名文件互相顶账）。 */
export function scanRepo(repo) {
  const hits = [];
  const pkgPath = path.join(repo.dir, "package.json");
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    pkg = null; // 读不到就少判两段——但**明说**（下面 notes 里报）
  }
  const notes = [];
  const isOutside = (abs) => path.relative(repo.dir, abs).startsWith("..");
  const exists = (abs) => fs.existsSync(abs);

  if (pkg) {
    for (const h of judgeDeps(pkg)) hits.push({ ...h, rel: `${repo.id}/package.json` });
    for (const h of judgeScripts(
      pkg,
      (token) => {
        const abs = path.resolve(repo.dir, token);
        return isOutside(abs) ? null : abs;
      },
      exists,
    )) {
      hits.push({ ...h, rel: `${repo.id}/package.json` });
    }
  } else {
    notes.push(`${repo.id}：读不到 package.json——依赖面与脚本面本腿看不到（⛔ 不算通过）`);
  }

  for (const file of listJsonFiles(repo.dir)) {
    const rel = `${repo.id}/${path.relative(repo.dir, file).split(path.sep).join("/")}`;
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const h of judgePathFields({ text, fileAbs: file, rel }, isOutside, exists)) hits.push(h);
  }
  return { hits, notes };
}

/* ─────────────────────────────── 主流程 ─────────────────────────────── */

function runMain() {
  const container = resolveContainer();
  if (!container.present) {
    console.log(
      `⏭  R7 插件仓自足：插件容器不在场（${container.dir}）——插件域**跳过**（不是通过）。\n` +
        `     要在这里跑：LINKDESK_PLUGIN_CONTAINER=<容器根> node scripts/check-plugin-repo-self-sufficiency.mjs`,
    );
    return 0;
  }

  const repos = discoverPluginRepos(container.dir);
  const official = officialPluginIds(path.join(ROOT, "scripts", "sync-plugin-agents.mjs"));
  const officials = repos.filter((r) => (official ? official.has(r.id) : true));
  const thirdParty = repos.filter((r) => !officials.includes(r));

  console.log(
    `🔎 R7 插件仓自足——容器 ${container.dir}（官方 ${officials.length} 只` +
      (thirdParty.length ? ` ＋ 第三方 ${thirdParty.length} 只` : "") +
      "）",
  );
  if (official === null) {
    console.log("   ⚠️ 读不到官方名单（sync-plugin-agents.mjs 的 FACTS 表）——本腿降级为「全部按官方判」。");
  }
  if (repos.length === 0) {
    console.log("   ⏭ 容器里一只插件仓也没发现——本腿无对象（不是通过）。");
    return 0;
  }

  const hits = [];
  for (const repo of officials) {
    const { hits: repoHits, notes } = scanRepo(repo);
    for (const n of notes) console.log(`   ⚠️ ${n}`);
    hits.push(...repoHits);
  }
  for (const repo of thirdParty) {
    console.log(`   ℹ️ 第三方作者仓「${repo.id}」：只报告不判红（⛔ 不代改）。`);
  }

  const { kept, passed, violations } = applyExceptions(EXCEPTIONS, hits);

  for (const v of violations) console.log(`   🔴 ${v.msg}`);
  for (const p of passed) {
    console.log(`   ℹ️ 例外放行：${p.rel} ${p.where}（理由：${p.why}；到期条件：${p.until}）`);
  }

  if (kept.length === 0 && violations.length === 0) {
    console.log(
      `✅ 官方 ${officials.length} 只仓：依赖声明零本机路径 · 清单路径零越界 · 脚本零仓外引用 ` +
        `（判定口径与边界见本脚本文件头）。`,
    );
    return 0;
  }

  console.log(`\n🔴 R7 插件仓自足：${kept.length} 处越界——插件仓只许依赖公开 npm，仓内引用不许指出仓外。\n`);
  for (const h of kept) {
    const label = h.id === "local-spec" ? "① 依赖声明" : h.id === "outside-path" ? "② 清单路径" : "③ 脚本文件";
    console.log(`  · ${h.rel}  ${label}：${h.where}\n      ${h.why}`);
  }
  console.log(
    "\n  → 正解：把生成器/校验器搬进作者自己的仓（先例：图标清单 `icon-import.json` ＋ SDK 命令），" +
      "依赖只写 registry 版本号；路径只写本仓相对路径。\n" +
      "  → 确实要挂账的：本脚本的 `EXCEPTIONS`（文件级 ＋ 理由 ＋ 到期条件，必填）。",
  );
  return 1;
}

/* ─────────────────────────────── 自测 ─────────────────────────────── */

function runSelfTest() {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = fs;
  const tmp = mkdtempSync(path.join(require_tmpdir(), "r7-selftest-"));
  const outsideDir = path.join(tmp, "outside"); // 扮演「壳仓」：仓外真实存在的路径
  const repoDir = path.join(tmp, "container", "official", "demo-plugin");
  const cases = [];
  const rec = (name, got, want) => cases.push({ name, got, want, ok: got === want });

  try {
    mkdirSync(path.join(outsideDir, "scripts"), { recursive: true });
    mkdirSync(path.join(repoDir, "scripts"), { recursive: true });
    writeFileSync(path.join(outsideDir, "scripts", "make-icons.mjs"), "// 壳仓里的生成器\n");
    writeFileSync(path.join(outsideDir, "schema.json"), "{}\n");
    writeFileSync(path.join(repoDir, "scripts", "ci-verify.mjs"), "// 本仓校验器\n");
    writeFileSync(path.join(repoDir, "plugin.json"), "{}\n");

    const isOutside = (abs) => path.relative(repoDir, abs).startsWith("..");
    const exists = (abs) => fs.existsSync(abs);
    const resolveInside = (token) => {
      const abs = path.resolve(repoDir, token);
      return isOutside(abs) ? null : abs;
    };
    const rel = "demo-plugin/package.json";

    /* ① 依赖声明 */
    rec(
      "① 正控：registry 版本号 ＋ git 远端 ＋ npm 别名 ⇒ 零命中（公开来源放行）",
      judgeDeps({
        dependencies: { "@linkdesk/plugin-sdk": "^0.1.84" },
        devDependencies: { "some-lib": "git+https://example.com/x.git", "alias": "npm:real@^1.0.0" },
      }).length,
      0,
    );
    rec(
      "① 负控 A：`file:` 依赖 ⇒ 命中",
      judgeDeps({ devDependencies: { "@linkdesk/plugin-sdk": "file:../../../linkdesk/packages/plugin-sdk" } })[0]?.id,
      "local-spec",
    );
    rec("① 负控 B：`link:` 依赖 ⇒ 命中", judgeDeps({ dependencies: { x: "link:../x" } })[0]?.id, "local-spec");
    rec("① 负控 C：相对路径依赖 ⇒ 命中", judgeDeps({ dependencies: { x: "./vendor/x" } })[0]?.id, "local-spec");
    rec("① 负控 D：绝对路径依赖（盘符）⇒ 命中", judgeDeps({ dependencies: { x: "C:\\linkdesk\\x" } })[0]?.id, "local-spec");
    rec(
      "① 负控 E：四个字段都被查到（peer/optional 也逃不掉）",
      judgeDeps({ peerDependencies: { a: "file:../a" }, optionalDependencies: { b: "../b" } }).length,
      2,
    );

    /* ② 清单/配置里的路径 */
    const pathHits = (json) =>
      judgePathFields({ text: json, fileAbs: path.join(repoDir, "plugin.json"), rel }, isOutside, exists);
    rec(
      "② 正控 A：仓内相对路径（node_modules 形态）⇒ 零命中",
      pathHits('{"$schema":"./node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json"}').length,
      0,
    );
    rec(
      "② 负控 A：$schema 指去仓外且**真的存在** ⇒ 命中",
      pathHits(`{"$schema":"${path.join(outsideDir, "schema.json").replace(/\\/g, "\\\\")}"}`)[0]?.id,
      "outside-path",
    );
    rec(
      "② 负控 B：相对逃逸（../../outside/schema.json）⇒ 命中",
      pathHits('{"$schema":"../../../outside/schema.json"}')[0]?.id,
      "outside-path",
    );
    rec(
      "🔴 ② 负控 C（本腿的关键纪律）：指去仓外但**解不开**（不存在）⇒ 零命中，⛔ 不假红",
      pathHits('{"$schema":"../../../linkdesk/does-not-exist.json"}').length,
      0,
    );
    rec(
      "② 负控 D：数组里的路径也算（entry/path 藏在数组里逃不掉）",
      pathHits('{"files":["ok.json","../../../outside/schema.json"]}').length,
      1,
    );
    rec(
      "② 负控 E：注释与尾逗号（JSONC）不炸解析，命中照出",
      pathHits('{\n // 为什么\n "$schema": "../../../outside/schema.json",\n}')[0]?.id,
      "outside-path",
    );
    rec("② 正控 B：不形如路径的字符串（文案/URL）⇒ 零命中", pathHits('{"name":"粉彩图标集","homepage":"https://x.dev/a.json"}').length, 0);

    /* ③ scripts 点到的文件 */
    rec(
      "③ 正控 A：`node scripts/ci-verify.mjs`（本仓真实存在）⇒ 零命中",
      judgeScripts({ scripts: { verify: "node scripts/ci-verify.mjs" } }, resolveInside, exists).length,
      0,
    );
    rec(
      "③ 负控 A：脚本指向仓外真实文件 ⇒ 命中 script-outside",
      judgeScripts({ scripts: { icons: "node ../../../outside/scripts/make-icons.mjs" } }, resolveInside, exists)[0]?.id,
      "script-outside",
    );
    rec(
      "③ 负控 B：脚本指向本仓内但**不存在**的文件 ⇒ 命中 script-missing",
      judgeScripts({ scripts: { build: "node scripts/nope.mjs" } }, resolveInside, exists)[0]?.id,
      "script-missing",
    );
    rec(
      "🔴 ③ 负控 C：`node -e \"…\"` 的引号载荷**不**被当成路径（收紧 token 式的理由）",
      judgeScripts({ scripts: { post: 'node -e "require(\'./scripts/x.mjs\')"' } }, resolveInside, exists).length,
      0,
    );
    rec(
      "③ 正控 B：包管理 CLI 与普通参数（`linkdesk-plugin-sdk pack` / `vitest run`）⇒ 零命中",
      judgeScripts({ scripts: { build: "linkdesk-plugin-sdk pack", test: "vitest run --reporter=dot" } }, resolveInside, exists).length,
      0,
    );
    rec(
      "🔴 ③ 正控 C：**参数点名的产物还不存在**（`--out reports/junit.json`）⇒ 零命中，⛔ 不假红",
      judgeScripts({ scripts: { test: "node scripts/ci-verify.mjs --out reports/junit.json" } }, resolveInside, exists).length,
      0,
    );
    rec(
      "③ 负控 E：参数**越界**照样红（`--config ../../../outside/vitest.config.ts`）⇒ script-outside",
      judgeScripts({ scripts: { test: "vitest run --config ../../../outside/vitest.config.ts" } }, resolveInside, exists)[0]?.id,
      "script-outside",
    );
    rec(
      "③ 正控 D：跑器后带前置旗标（`node --no-warnings scripts/ci-verify.mjs`）⇒ 仍认出被执行脚本、零命中",
      judgeScripts({ scripts: { verify: "node --no-warnings scripts/ci-verify.mjs" } }, resolveInside, exists).length,
      0,
    );

    /* 例外账本：形状与反向核对（与 R6 共用底层） */
    const ex = applyExceptions([], [{ rel, id: "outside-path" }]);
    rec("例外账本：空账本时命中原样保留（kept=1）", ex.kept.length, 1);
    const exStale = applyExceptions([{ file: rel, id: "outside-path", why: "w", until: "u" }], []);
    rec("例外账本：条目今天没放行任何违规 ⇒ 报过期例外", exStale.violations[0]?.kind, "stale-exception");
    const exIncomplete = applyExceptions([{ file: rel, id: "outside-path", why: "w" }], [{ rel, id: "outside-path" }]);
    rec("例外账本：缺 `until` ⇒ 报不完整（例外必须挂账）", exIncomplete.violations[0]?.kind, "exception-incomplete");

    /* 端到端：真扫一只夹具仓（正控） */
    writeFileSync(
      path.join(repoDir, "package.json"),
      JSON.stringify(
        { name: "demo", scripts: { verify: "node scripts/ci-verify.mjs" }, devDependencies: { "@linkdesk/plugin-sdk": "^0.1.84" } },
        null,
        2,
      ),
    );
    writeFileSync(path.join(repoDir, "plugin.json"), '{"$schema":"./node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json"}\n');
    rec("端到端正控：真扫干净夹具仓 ⇒ 零命中", scanRepo({ dir: repoDir, id: "demo-plugin" }).hits.length, 0);

    /* 端到端：注入两处越界（负控）——「人为插一条 file: 依赖 / 一条指向壳仓的可解析路径 ⇒ 判红」 */
    writeFileSync(
      path.join(repoDir, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: { icons: "node ../../../outside/scripts/make-icons.mjs" },
        devDependencies: { "@linkdesk/plugin-sdk": "file:../../../linkdesk/packages/plugin-sdk" },
      }),
    );
    writeFileSync(path.join(repoDir, "plugin.json"), `{"$schema":"${path.join(outsideDir, "schema.json").replace(/\\/g, "\\\\")}"}\n`);
    const dirty = scanRepo({ dir: repoDir, id: "demo-plugin" }).hits.map((h) => h.id).sort();
    rec("端到端负控：注入「file: 依赖 ＋ 仓外可解析路径 ＋ 仓外脚本」⇒ 三条全红", dirty.join(","), "local-spec,outside-path,script-outside");

    /* 读不到 package.json 的仓：明说，⛔ 不当通过 */
    const bare = path.join(tmp, "container", "official", "bare-plugin");
    mkdirSync(bare, { recursive: true });
    writeFileSync(path.join(bare, "plugin.json"), "{}\n");
    rec("读不到 package.json ⇒ 出一行 note（⛔ 不算通过）", scanRepo({ dir: bare, id: "bare-plugin" }).notes.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const bad = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`  ${c.ok ? "✔" : "🔴"} ${c.name}${c.ok ? "" : `（得 ${JSON.stringify(c.got)}，应 ${JSON.stringify(c.want)}）`}`);
  console.log(
    bad.length === 0
      ? `\n✅ R7 self-test 全过（${cases.length} 例：三条判定各自正负控 ＋ 「不可解析不假红」＋ 例外账本 ＋ 端到端注入）`
      : `\n🔴 R7 self-test ${bad.length}/${cases.length} 例不符`,
  );
  return bad.length === 0 ? 0 : 1;
}

/** `node:os` 的 tmpdir（顶层 import 只留用到的，避免 lint 噪音）。 */
function require_tmpdir() {
  return process.env.TEMP || process.env.TMP || "/tmp";
}

if (SELF_TEST) process.exitCode = runSelfTest();
else process.exitCode = runMain();
