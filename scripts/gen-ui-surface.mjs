#!/usr/bin/env node
/**
 * UI 导出面**账本**生成器（E6#121 立尺的写侧；「插件最低壳版本门禁」G1 起同笔加 `since` 打戳）。
 *
 * ── 一句话 ──
 *   把 `@linkdesk/ui` 对插件许诺的导出面冻成 `scripts/ui-surface.json`，并**给每个导出名打上
 *   `since`＝「它首次随哪个**壳版本**提供」**；同一份账本再投影给 `@linkdesk/plugin-sdk` 随包下发，
 *   让第三方插件**离线**（npm i 之后、不读壳仓、不联网、不看 tag）就能算出自己 `minAppVersion` 的地板。
 *
 * ── 为什么需要它（本格的由来）──
 *   L9 把 `@linkdesk/ui` 翻成「池 vendor 单实例供给」后，插件运行时只有壳那一版组件——
 *   每个导出名从此是终身承诺。写侧只负责如实记录；判红是读侧：
 *     · 面只加不删 → `scripts/check-ui-surface-additive.mjs`（E6#121）；
 *     · 声明 ≥ 地板 → `packages/plugin-sdk/src/eslint/checks/ui-min-app-version.ts`（G2，随包下发）。
 *   口径（提取 / 分类 / 形态 / 序列化）全部住在 `scripts/lib/ui-surface.mjs`——那是唯一真相源，
 *   改口径改那里，⛔ 别在这里另写一套。
 *
 * ── 🔴 `since` 的语义与来源（改之前先读）──
 *   · 语义是**壳版本**，不是 ui 包版本（ui 与壳的「同号锁步」已退役，E6#166「对货不对号」）——
 *     `plugin.json` 的 `minAppVersion` 比的是壳版本，所以账本只能记壳版本，⛔ 不能靠版本号大小推。
 *   · 来源＝**「最早包含这个导出的发布 tag」，没有 tag 就用当前 dev 版本**。两个读数的实测依据：
 *     · 提交时的 `package.json#version` 只能说明「当时在跑哪个 dev 号」——**它不等于那个导出所在
 *       的发布版本**。实测：本仓快照历史 6 次落点，有 4 次的 dev 号 **并不包含**该提交
 *       （`a29ec126c` dev 0.2.12 → 首个含它的 tag 是 v0.2.13；`87f824cce` dev 0.2.19 → v0.2.20；
 *       `d6f1162cd` dev 0.2.21 → v0.2.22；`59545c4c0` dev 0.2.38 → v0.2.40）。
 *       照 dev 号打戳 = 打给一个**确实存在、但里面没有这个导出**的发布版（v0.2.12 真存在！）——
 *       插件就会算出一个偏低的假地板，而那个版本恰恰是最不能跑的（vendor 供给机制都还没有）。
 *       ⇒ **`git tag --contains <该提交>` 里版本号最小的那个 tag 才是诚实读数**。
 *     · 但**光靠 tag 也回填不全**：导出落在两次发版之间时它**还没有 tag**（本次事故里的 `PluginCard`
 *       就是：dev 0.2.48 已落、`v0.2.48` 尚未打，`--contains` 是空的）——而它在壳发版前就必须进账本
 *       （否则门禁对它是瞎的）。这种情形取该提交时的 dev 号：它**必然大于所有已发版本**（下面有断言把关）。
 *     ⇒ 合起来 = **tag 优先、dev 兜底**。这也是「生成器在那一刻知道『当前壳版本 ＋ 本次新增了哪些导出』」
 *       的完整形态；两者都是 git 里的事实，不是估计。
 *   · `since` 是**只增不改的账**：新导出出现时才补一行（`--backfill` 幂等，可重复跑；跑它不会改动
 *     已记的值，除非历史被改写）。⛔ 手改这份 json 里的 since = 伪造历史。
 *
 * 用法：
 *   node scripts/gen-ui-surface.mjs                 # 增量：保留磁盘上已有的 since，新导出打「当前壳版本」
 *   node scripts/gen-ui-surface.mjs --backfill      # 一次性/补账：从 git 历史（快照提交序列）回溯全部 since
 *   node scripts/gen-ui-surface.mjs --check         # 对账：磁盘**四份生成物** == 重算（不一致退出码 1）
 *   node scripts/gen-ui-surface.mjs --self-test     # 打戳 / 渲染 / 对账 / 嵌块的纯函数自测
 *
 * ── 四份生成物（同一份账本，四个投影；都别手改）──
 *   ① `scripts/ui-surface.json`                     壳仓账本（带活戳：generatedAt / shellVersion）
 *   ② `packages/plugin-sdk/schemas/ui-surface.json` 随包下发（第三方 `npm i` 后**离线**可判；无活戳 ⇒ 字节稳定）
 *   ③ `docs/03-插件制造/19-组件速查.md` §2.1 与 `docs/03-plugin-authoring/19-component-cheatsheet.md` §2.1
 *      的「起于哪个壳版本」表（**作者读得到的那一份**——账本 json 不是给作者看的）
 *   ④ `src/core/compat/ui-surface.generated.ts`     壳运行期 TS 投影（G4 读数腿；壳不依赖 plugin-sdk，
 *      照 host-css.generated.ts 同族先例；无活戳 ⇒ 字节稳定）
 *
 * ── 与 barrel 头注释的计数对账（两处数字互为对账，硬校验）──
 *   barrel 头注释里写着各栏计数（如「32 组件 · 4 hooks · 11 helpers · 15 类型」）。本生成器重算后
 *   **机械比对**：任何一栏对不上 ⇒ 退出码 1——要么导出面真变了（先走门禁的退役 / 新增流程），
 *   要么头注释陈旧（同笔改头注释再重跑）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BARREL_REL,
  CATEGORIES,
  ROOT,
  RUNTIME_LEDGER_REL,
  SDK_LEDGER_REL,
  SEMVER_RE,
  SHELL_PKG_REL,
  SINCE_DOC_BEGIN,
  SINCE_DOC_END,
  SINCE_DOC_FILES,
  SNAPSHOT_REL,
  collectUiSurface,
  flattenUiSurface,
  isUiSurfaceShape,
  ledgerContent,
  ledgerGaps,
  ledgerSinceMap,
  renderLedger,
  renderRuntimeLedger,
  renderSdkLedger,
  renderSinceDoc,
  spliceSinceDoc,
  surfaceNames,
} from "./lib/ui-surface.mjs";

/* ── 纯函数（自测直接跑它们） ── */

/** 读壳版本（`since` 打戳与账本信息栏的唯一来源） */
export function shellVersionOf(root = ROOT) {
  const v = JSON.parse(readFileSync(resolve(root, SHELL_PKG_REL), "utf8")).version;
  if (typeof v !== "string" || !SEMVER_RE.test(v)) {
    throw new Error(`壳 ${SHELL_PKG_REL} 的 version = ${JSON.stringify(v)} 不是 x.y.z 形态——since 打不了戳`);
  }
  return v;
}

/**
 * 增量打戳（纯函数）：已有 `since` 的**原样保留**（只增不改），没记过的打 `shellVersion`。
 * 返回 `{ since, fresh }`——`fresh` = 本次新记的路径（新导出），打印出来给人核。
 */
export function stampSince({ names, since = {}, shellVersion }) {
  const out = {};
  const fresh = [];
  for (const cat of CATEGORIES) {
    for (const n of names[cat]) {
      const p = `${cat}.${n}`;
      const known = since[p];
      if (known === undefined) {
        out[p] = shellVersion;
        fresh.push(p);
        continue;
      }
      if (typeof known !== "string" || !SEMVER_RE.test(known)) {
        throw new Error(`磁盘账本里 ${p} 的 since = ${JSON.stringify(known)} 不是 x.y.z 形态——改它没有意义，重跑 --backfill 重建`);
      }
      out[p] = known;
    }
  }
  return { since: out, fresh };
}

/* ── git（只被 --backfill 用） ── */

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/** 某次提交时的壳版本（只作 **tag 兜底**：该导出还没发过版时用） */
function shellVersionAt(root, sha) {
  const r = git(root, ["show", `${sha}:${SHELL_PKG_REL}`]);
  if (r.code !== 0) throw new Error(`git show ${sha}:${SHELL_PKG_REL} 失败：${r.err}`);
  const v = JSON.parse(r.out).version;
  if (typeof v !== "string" || !SEMVER_RE.test(v)) throw new Error(`提交 ${sha} 的壳版本 = ${JSON.stringify(v)} 不是 x.y.z`);
  return v;
}

const VERSION_TAG_RE = /^v(\d+\.\d+\.\d+)$/;

/**
 * 纯函数：从 `git tag` 输出里挑**版本号最小**的发版 tag。`["e5-start","v0.2.20","v0.2.13"]` → `"0.2.13"`。
 * ⛔ 按**版本号**排序而不是按 tag 创建时间——排序键必须与判据（`appVer < minAppVersion`）同一个空间。
 */
export function oldestVersionTag(tagNames) {
  const versions = [];
  for (const t of tagNames) {
    const m = VERSION_TAG_RE.exec(String(t).trim());
    if (m) versions.push(m[1]);
  }
  if (versions.length === 0) return null;
  const key = (v) => v.split(".").map(Number);
  versions.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
  return versions[0];
}

/** 全部发版 tag 里最大的那个（下面「dev 兜底必须比它大」的断言用） */
function newestReleasedVersion(root) {
  const r = git(root, ["tag", "--list"]);
  if (r.code !== 0) throw new Error(`git tag --list 失败：${r.err}`);
  const versions = r.out.split("\n").map((t) => VERSION_TAG_RE.exec(t.trim())?.[1]).filter(Boolean);
  if (versions.length === 0) return null;
  const key = (v) => v.split(".").map(Number);
  return versions.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  })[versions.length - 1];
}

/**
 * 历史回填：走 `scripts/ui-surface.json` 的**快照提交序列**（升序），每个时点取该时点的
 * 导出面名字集合 —— 相对上一个时点**新出现**的名字，其 `since` = 该提交的「出生版本」：
 *   **最早包含它的发版 tag**；还没有 tag（尚未发版）⇒ 该提交时的 dev 号（并断言它比所有已发版本都大）。
 * 🔴 为什么走快照历史而不是 barrel 源码历史：快照是**当时代码 + 当时口径**的产物，不必拿今天的
 *    提取器去解析历史 barrel（旧形状解析不了就会抛 ⇒ 回填中断）；快照序列自带「只加不删」保证。
 */
export function historyStamps(root = ROOT, onProgress = () => {}) {
  const log = git(root, ["log", "--reverse", "--format=%H", "--", SNAPSHOT_REL]);
  if (log.code !== 0) throw new Error(`git log 失败：${log.err}`);
  const shas = log.out.split("\n").map((s) => s.trim()).filter(Boolean);
  if (shas.length === 0) {
    throw new Error(`本仓 git 历史里没有 ${SNAPSHOT_REL} 的任何提交——历史回填无从谈起（⛔ 不硬编 since）`);
  }
  const newestTag = newestReleasedVersion(root);
  const since = {};
  const timeline = [];
  const warnings = [];
  for (const sha of shas) {
    const raw = git(root, ["show", `${sha}:${SNAPSHOT_REL}`]);
    if (raw.code !== 0) throw new Error(`git show ${sha}:${SNAPSHOT_REL} 失败：${raw.err}`);
    const snap = JSON.parse(raw.out);
    if (!isUiSurfaceShape(snap)) throw new Error(`${sha} 的 ${SNAPSHOT_REL} 形状烂（缺栏 / 非数组）——回填中断，⛔ 不猜`);
    const tagsIn = git(root, ["tag", "--contains", sha]);
    if (tagsIn.code !== 0) throw new Error(`git tag --contains ${sha} 失败：${tagsIn.err}`);
    const tag = oldestVersionTag(tagsIn.out.split("\n"));
    const dev = shellVersionAt(root, sha);
    const born = tag ?? dev;
    if (!tag && newestTag) {
      const key = (v) => v.split(".").map(Number);
      const ka = key(dev);
      const kb = key(newestTag);
      const below = ka[0] < kb[0] || (ka[0] === kb[0] && (ka[1] < kb[1] || (ka[1] === kb[1] && ka[2] <= kb[2])));
      if (below) {
        warnings.push(
          `${sha.slice(0, 9)} 无任何发版 tag 包含它，但它的 dev 号 ${dev} 不大于最新发版 ${newestTag}——` +
            `这个兜底戳可能是假地板（该版本已发布却不含这些导出），人工核一下分支结构`,
        );
      }
    }
    const fresh = [];
    for (const p of flattenUiSurface(snap)) {
      if (since[p] === undefined) {
        since[p] = born;
        fresh.push(p);
      }
    }
    timeline.push({ sha: sha.slice(0, 9), version: born, tag, dev, total: flattenUiSurface(snap).length, fresh });
    onProgress({ sha: sha.slice(0, 9), version: born, tag, dev, fresh });
  }
  return { since, timeline, warnings };
}

/* ── barrel 头注释的计数对账 ── */

/** barrel 头注释的计数对账：提取「N 组件 · N hooks · N helpers · N 类型」形态的数字 */
function headerCounts(root) {
  const src = readFileSync(resolve(root, BARREL_REL), "utf8");
  const commentBlock = src.slice(0, src.indexOf("export "));
  const grab = (label) => {
    const m = new RegExp(`(\\d+)\\s*${label}`).exec(commentBlock);
    return m ? Number(m[1]) : null;
  };
  return { components: grab("组件"), hooks: grab("hooks"), helpers: grab("helpers"), types: grab("类型") };
}

function assertHeaderCounts(surface) {
  const header = headerCounts(ROOT);
  const mismatch = CATEGORIES.filter((c) => header[c] !== null && header[c] !== surface[c].length);
  if (mismatch.length > 0) {
    console.error(`🔴 计数对账失败——barrel 头注释与实算不一致：`);
    for (const c of mismatch) console.error(`   · ${c}：头注释 ${header[c]} ≠ 实算 ${surface[c].length}`);
    console.error(`   ⇒ 导出面变了就先过 check-ui-surface-additive 门禁；只是头注释陈旧就同笔改 ${BARREL_REL} 头注释再重跑。`);
    return false;
  }
  return true;
}

/* ── 自测 ── */

function selfTest() {
  const cases = [];
  const push = (name, ok, detail) => cases.push({ name, ok, detail });
  const NAMES = { components: ["Badge", "PluginCard"], hooks: ["useClickPreview"], helpers: ["urlSourceKey"], types: ["HintTipProps"] };
  const SINCE = {
    "components.Badge": "0.2.13",
    "components.PluginCard": "0.2.48",
    "hooks.useClickPreview": "0.2.13",
    "helpers.urlSourceKey": "0.2.13",
    "types.HintTipProps": "0.2.19",
  };
  const parse = (text) => JSON.parse(text);

  // ── 正控 ──
  {
    const text = renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49", generatedAt: "2026-10-06T00:00:00.000Z" });
    const snap = parse(text);
    push("正控1：renderLedger → 解析回来 since 一条不丢（四栏）", JSON.stringify(ledgerSinceMap(snap)) === JSON.stringify(Object.fromEntries(Object.entries(SINCE).sort())), JSON.stringify(ledgerSinceMap(snap)));
  }
  {
    const snap = parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" }));
    const gaps = ledgerGaps(snap);
    push("正控2：完整账本 ledgerGaps() = 空（G1 账本完整性判据过）", gaps.length === 0, gaps.join(" / "));
  }
  {
    const a = ledgerContent(parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49", generatedAt: "2026-01-01T00:00:00.000Z" })));
    const b = ledgerContent(parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.99", generatedAt: "2026-12-31T00:00:00.000Z" })));
    push("正控3：对账指纹忽略活戳（generatedAt / shellVersion）——只认名字＋since", a === b, `${a === b ? "" : a + " ≠ " + b}`);
  }
  {
    const { since, fresh } = stampSince({ names: NAMES, since: SINCE, shellVersion: "0.2.49" });
    push("正控4：增量打戳——已记的 since 原样保留、一个 fresh 都没有（只增不改）", fresh.length === 0 && since["components.PluginCard"] === "0.2.48", JSON.stringify(fresh));
  }
  {
    const names2 = { ...NAMES, components: [...NAMES.components, "BrandNew"] };
    const { since, fresh } = stampSince({ names: names2, since: SINCE, shellVersion: "0.2.49" });
    push("正控5：新导出 ⇒ since = 当前壳版本，且进 fresh 名单", since["components.BrandNew"] === "0.2.49" && fresh.length === 1 && fresh[0] === "components.BrandNew", JSON.stringify(fresh));
  }
  {
    const a = renderSdkLedger({ names: NAMES, since: SINCE });
    const b = renderSdkLedger({ names: NAMES, since: SINCE });
    const snap = parse(a);
    push("正控6：SDK 随包投影字节稳定、自述出处、无活戳", a === b && Boolean(snap.$comment) && snap.version === 1 && snap.count === 5 && !("generatedAt" in snap), a.slice(0, 60));
  }
  {
    const snap = parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" }));
    push("正控7：账本两代形态都认（新形态 isUiSurfaceShape 为真；旧形态也真）", isUiSurfaceShape(snap) === true && isUiSurfaceShape({ components: ["Badge"], hooks: [], helpers: [], types: [] }) === true);
  }

  // ── 负控（该红的真红） ──
  {
    const snap = parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" }));
    delete snap.hooks;
    const gaps = ledgerGaps(snap);
    push("负控1：缺一整栏 ⇒ ledgerGaps 报点（缺 columns/hooks 栏）", gaps.some((g) => g.includes("hooks")), gaps.join(" / "));
  }
  {
    const snap = parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" }));
    delete snap.components.PluginCard.since;
    const gaps = ledgerGaps(snap);
    push("负控2：某一项缺 since ⇒ 报点（防「回填只回填了一半」）", gaps.some((g) => g.includes("components.PluginCard")), gaps.join(" / "));
  }
  {
    const got = ledgerGaps({ components: ["Badge"], hooks: [], helpers: [], types: [] });
    push("负控3：旧形态（裸名字数组）⇒ 报点并要求 --backfill", got.some((g) => g.includes("--backfill")), got.join(" / "));
  }
  {
    const bogus = { ...SINCE, "components.Badge": "0.24" };
    const a = ledgerContent(parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" })));
    const b = ledgerContent(parse(renderLedger({ names: NAMES, since: bogus, shellVersion: "0.2.49" })));
    push("负控4：since 被手改 ⇒ 对账指纹变化（--check 会红）", a !== b);
  }
  {
    let threw = "";
    try {
      stampSince({ names: NAMES, since: { "components.Badge": "0.24" }, shellVersion: "0.2.49" });
    } catch (e) {
      threw = e.message;
    }
    push("负控5：磁盘 since 形态坏 ⇒ 打戳当场抛（不静默沿用）", /不是 x\.y\.z/.test(threw), threw);
  }
  {
    const snap = parse(renderLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" }));
    snap.types.HintTipProps.since = 0.219;
    const gaps = ledgerGaps(snap);
    push("负控6：since 是数字（非字符串 x.y.z）⇒ 报点，⛔ 不静默当它合法", gaps.some((g) => g.includes("types.HintTipProps")), gaps.join(" / "));
  }

  // ── 「出生版本」读数（tag 优先）：这是本格判据最关键的一步，⛔ 按**版本号**最小挑，不按 tag 创建序 ──
  {
    const got = oldestVersionTag(["v0.2.20", "v0.2.13", "v0.2.14"]);
    push("正控8：oldestVersionTag 取版本号最小者（乱序输入 v0.2.20/v0.2.13/v0.2.14 → 0.2.13）", got === "0.2.13", String(got));
  }
  {
    const got = oldestVersionTag(["e5-start", "rollback-pinned-slot"]);
    push("负控7：全是非版本 tag ⇒ null（未发版，交给 dev 兜底；⛔ 不许编一个 0.0.0）", got === null, String(got));
  }
  {
    const got = oldestVersionTag(["v0.1.9", "v0.2.10", "v0.2.9"]);
    push("正控9：两位 / 三位段混排不按字符串比（v0.1.9/v0.2.10/v0.2.9 → 0.1.9；字符串序会错选 0.2.10）", got === "0.1.9", String(got));
  }

  // ── 作者手册 §2.1 的 since 表（第三份投影）：渲染 ＋ 嵌块 ──
  {
    const table = renderSinceDoc({ names: NAMES, since: SINCE, locale: "zh" });
    const hasAll = Object.keys(SINCE).every((p) => table.includes(`\`${p.split(".")[1]}\``));
    const ordered = table.indexOf("0.2.13") < table.indexOf("0.2.48");
    push(
      "正控10：since 表渲染——四栏名字全在、版本按数字序（0.2.13 在 0.2.48 前，⛔ 字符串序会颠倒 0.2.13/0.2.20）",
      hasAll && ordered,
      `缺名 = ${!hasAll}；序错 = ${!ordered}`,
    );
  }
  {
    const table = renderSinceDoc({ names: NAMES, since: SINCE, locale: "en" });
    push("正控11：en 表头与 zh 不同（Since / Components…），名字与版本同一份数据", table.includes("| Since |") && table.includes("`Badge`"), table.split("\n")[0]);
  }
  {
    const text = `前言\n${SINCE_DOC_BEGIN} 生成，勿手改 -->\n旧内容\n${SINCE_DOC_END}\n后记\n`;
    const got = spliceSinceDoc(text, "表格");
    push(
      "正控12：嵌块只换标记之间的内容，两行标记与前后文原样保留",
      got === `前言\n${SINCE_DOC_BEGIN} 生成，勿手改 -->\n表格\n${SINCE_DOC_END}\n后记\n`,
      JSON.stringify(got),
    );
  }
  {
    let threw = "";
    try {
      spliceSinceDoc(`没有标记的正文\n${SINCE_DOC_END}\n`, "表格");
    } catch (e) {
      threw = e.message;
    }
    push("负控8：标记被删 ⇒ 当场抛（⛔ 不 append——那会造出第二份真相）", /找不到/.test(threw), threw);
  }
  {
    let threw = "";
    try {
      renderSinceDoc({ names: NAMES, since: SINCE, locale: "fr" });
    } catch (e) {
      threw = e.message;
    }
    push("负控9：未知语种 ⇒ 当场抛（⛔ 不静默回落成 zh，作者会拿到看不懂的表）", /未知语种/.test(threw), threw);
  }

  // ── 第四份投影：壳运行期 TS 清单（G4 读数腿的输入）──
  {
    const a = renderRuntimeLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" });
    const b = renderRuntimeLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" });
    push(
      "正控13：运行期投影字节稳定、无活戳（同输入两次渲染逐字节同；无 generatedAt 键，shellVersion 只进信息栏）",
      a === b && a.includes('shellVersion: "0.2.49"') && !/"generatedAt"/.test(a),
      `同 = ${a === b}`,
    );
  }
  {
    const text = renderRuntimeLedger({ names: NAMES, since: SINCE, shellVersion: "0.2.49" });
    const allIn = ["PluginCard", "useClickPreview", "urlSourceKey", "HintTipProps"].every((n) => text.includes(`"${n}"`));
    push("正控14：运行期投影四栏名字全在（消费方按名查 since，跨栏都要查得到）", allIn);
  }
  {
    let threw = "";
    try {
      renderRuntimeLedger({ names: NAMES, since: { ...SINCE, "components.PluginCard": "" }, shellVersion: "0.2.49" });
    } catch (e) {
      threw = e.message;
    }
    push("负控10：since 缺失 ⇒ 运行期投影当场抛（半本账会让读数算出假绿，⛔ 不静默生成）", /不是 x\.y\.z/.test(threw), threw);
  }

  const bad = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`${c.ok ? "✅" : "🔴"} ${c.name}${c.ok ? "" : `\n     ↳ ${c.detail}`}`);
  console.log(
    bad.length === 0
      ? `\n✅ gen-ui-surface self-test 全过（${cases.length} 例）——打戳/渲染/完整性/对账都不是恒绿。`
      : `\n🔴 gen-ui-surface self-test ${bad.length} 例不符（共 ${cases.length} 例）。`,
  );
  return bad.length === 0 ? 0 : 1;
}

/* ── 主流程 ── */

function readDisk(rel) {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? { path: p, text: readFileSync(p, "utf8") } : null;
}

/** `{ names, since }` → 账本对象（对账指纹的输入；`ledgerContent` 忽略活戳，所以这里不填） */
function ledgerOf(names, since) {
  const snap = { generatedAt: "", shellVersion: "" };
  for (const cat of CATEGORIES) snap[cat] = Object.fromEntries(names[cat].map((n) => [n, { since: since[`${cat}.${n}`] }]));
  snap.count = CATEGORIES.reduce((a, c) => a + names[c].length, 0);
  return snap;
}

/* ── 作者手册 §2.1 的 since 表（同一份账本的第三个投影；渲染与落点都在 lib 里，这里只管读—嵌—写/对账） ── */

/**
 * 两份文档的期望正文（生成器与 `--check` 共用**同一段代码**）。
 * 返回 `[{ locale, rel, text, error }]`：`text === null` ⇒ 拿不到（缺文件 / 标记被删），`error` 说明原因。
 */
function expectedSinceDocs(names, since) {
  return Object.entries(SINCE_DOC_FILES).map(([locale, rel]) => {
    const disk = readDisk(rel);
    if (!disk) return { locale, rel, text: null, error: `磁盘上没有 ${rel}` };
    try {
      return { locale, rel, text: spliceSinceDoc(disk.text, renderSinceDoc({ names, since, locale })) };
    } catch (err) {
      return { locale, rel, text: null, error: `${rel}：${err instanceof Error ? err.message : String(err)}` };
    }
  });
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(selfTest());
  const CHECK = argv.includes("--check");
  const BACKFILL = argv.includes("--backfill");

  let surface;
  try {
    surface = collectUiSurface(ROOT);
  } catch (err) {
    console.error(`🔴 面重算失败：${err.message}`);
    process.exit(2);
  }
  if (!assertHeaderCounts(surface)) process.exit(1);

  const shellVersion = shellVersionOf(ROOT);
  const disk = readDisk(SNAPSHOT_REL);
  let diskJson = null;
  if (disk) {
    try {
      diskJson = JSON.parse(disk.text);
    } catch (err) {
      console.error(`🔴 ${SNAPSHOT_REL} 不是合法 JSON：${err.message}`);
      process.exit(2);
    }
  }

  // ── since：--backfill 走历史；否则在磁盘账本上增量打戳 ──
  let since;
  let fresh = [];
  if (BACKFILL) {
    let hist;
    try {
      hist = historyStamps(ROOT, ({ sha, version, dev, fresh: f }) => {
        if (f.length > 0) console.log(`   · ${sha}（出生版本 ${version}；提交时 dev ${dev}）：新记 ${f.length} 条`);
      });
    } catch (err) {
      console.error(`🔴 历史回填失败：${err.message}`);
      process.exit(2);
    }
    const stamped = stampSince({ names: surfaceNames(surface), since: hist.since, shellVersion });
    since = stamped.since;
    fresh = stamped.fresh;
    console.log(
      `ℹ️ 历史回填：${hist.timeline.length} 个快照时点 → ${Object.keys(hist.since).length} 条 since（起点批 = 壳 ${hist.timeline[0].version}）`,
    );
    for (const t of hist.timeline) {
      console.log(
        `   · ${t.sha}  出生版本 ${t.version.padEnd(7)}（${t.tag ? `首个含它的 tag v${t.tag}` : `未发版 ⇒ 兜底取 dev ${t.dev}`}）  该时点面共 ${t.total} 条`,
      );
    }
    for (const w of hist.warnings) console.error(`   ⚠ ${w}`);
  } else if (!disk) {
    console.error(`🔴 磁盘上没有 ${SNAPSHOT_REL}——账本没了就是历史没了。用 \`npm run ui-surface:regen -- --backfill\` 从 git 历史重建。`);
    process.exit(1);
  } else {
    const gaps = ledgerGaps(diskJson);
    if (gaps.length > 0) {
      console.error(`🔴 磁盘账本不完整——先补账再谈增量：`);
      for (const g of gaps) console.error(`   · ${g}`);
      process.exit(1);
    }
    const stamped = stampSince({ names: surfaceNames(surface), since: ledgerSinceMap(diskJson), shellVersion });
    since = stamped.since;
    fresh = stamped.fresh;
  }

  const names = surfaceNames(surface);
  const ledgerText = renderLedger({ names, since, shellVersion, generatedAt: diskJson?.generatedAt });
  const sdkText = renderSdkLedger({ names, since });
  const sdkDisk = readDisk(SDK_LEDGER_REL);
  const runtimeText = renderRuntimeLedger({ names, since, shellVersion });
  const runtimeDisk = readDisk(RUNTIME_LEDGER_REL);

  if (CHECK) {
    const expected = ledgerContent(ledgerOf(names, since));
    let ok = true;
    if (!disk) {
      console.error(`🔴 磁盘上没有 ${SNAPSHOT_REL} ⇒ 跑 \`npm run ui-surface:regen -- --backfill\` 生成它并提交。`);
      ok = false;
    } else if (ledgerContent(diskJson) !== expected) {
      console.error(`🔴 ${SNAPSHOT_REL} 与重算不一致（名字集合 / since 有出入；generatedAt 与 shellVersion 是活戳，不参与对账）⇒`);
      console.error(`   跑 \`npm run ui-surface:regen\`（新增导出）或 \`npm run ui-surface:regen -- --backfill\`（首次 / 重建）并同笔提交。`);
      if (fresh.length > 0) {
        console.error(`   本次重算在磁盘账本之外还多出 ${fresh.length} 条未记账的导出名（新导出 ⇒ since = 当前壳版本，且必须过 check-ui-surface-additive）：`);
        for (const p of fresh.slice(0, 20)) console.error(`     · ${p}`);
      }
      ok = false;
    }
    if (!sdkDisk) {
      console.error(`🔴 磁盘上没有 ${SDK_LEDGER_REL}（随包投影）⇒ 跑 \`npm run ui-surface:regen\` 生成它并提交。`);
      ok = false;
    } else if (sdkDisk.text !== sdkText) {
      console.error(`🔴 ${SDK_LEDGER_REL} 与壳仓账本不同步（随包投影漂了）⇒ 跑 \`npm run ui-surface:regen\` 同笔重写两份。`);
      ok = false;
    }
    // 第四份投影：壳运行期 TS 清单（G4 读数腿的输入；壳不依赖 plugin-sdk ⇒ 必须编译内有一份）
    if (!runtimeDisk) {
      console.error(`🔴 磁盘上没有 ${RUNTIME_LEDGER_REL}（壳运行期投影）⇒ 跑 \`npm run ui-surface:regen\` 生成它并提交。`);
      ok = false;
    } else if (runtimeDisk.text !== runtimeText) {
      console.error(`🔴 ${RUNTIME_LEDGER_REL} 与壳仓账本不同步（运行期投影漂了）⇒ 跑 \`npm run ui-surface:regen\` 同笔重写四份。`);
      ok = false;
    }
    // 第三份投影：作者手册 §2.1 的 since 表（手写必然漂——组件加了、表没加）
    for (const doc of expectedSinceDocs(names, since)) {
      if (doc.text === null) {
        console.error(`🔴 ${doc.error}`);
        ok = false;
        continue;
      }
      if (doc.text !== readDisk(doc.rel).text) {
        console.error(
          `🔴 ${doc.rel} 的 since 表（\`${SINCE_DOC_BEGIN} … ${SINCE_DOC_END}\` 之间）与账本不一致 ⇒` +
            `\n   跑 \`npm run ui-surface:regen\` 同笔重写三份生成物（账本 ×2 ＋ 中英手册各一）。`,
        );
        ok = false;
      }
    }
    if (!ok) process.exit(1);
    console.log(`✅ ui-surface 账本两份同步且与重算一致（${flattenUiSurface(surface).length} 条面 · 起点壳版本 ${Object.values(since).sort()[0]}）`);
    process.exit(0);
  }

  writeFileSync(resolve(ROOT, SNAPSHOT_REL), ledgerText);
  writeFileSync(resolve(ROOT, SDK_LEDGER_REL), sdkText);
  writeFileSync(resolve(ROOT, RUNTIME_LEDGER_REL), runtimeText);
  // 作者手册 §2.1 的 since 表（第三份投影：账本 → 中英各一张表，作者不用读 json）
  for (const doc of expectedSinceDocs(names, since)) {
    if (doc.text === null) {
      console.error(`🔴 ${doc.error}`);
      process.exit(1);
    }
    writeFileSync(resolve(ROOT, doc.rel), doc.text);
  }
  console.log(`✅ 已写 ${SNAPSHOT_REL} ＋ ${SDK_LEDGER_REL} ＋ ${RUNTIME_LEDGER_REL} ＋ ${Object.values(SINCE_DOC_FILES).join(" ＋ ")}（壳 ${shellVersion}；${flattenUiSurface(surface).length} 条面）：`);
  for (const c of CATEGORIES) console.log(`   · ${c.padEnd(11)} ${names[c].length} 个`);
  const bySince = {};
  for (const v of Object.values(since)) bySince[v] = (bySince[v] ?? 0) + 1;
  console.log(`   · since 分布  ${Object.entries(bySince).sort().map(([v, n]) => `${v}×${n}`).join(" · ")}`);
  if (fresh.length > 0) {
    console.log(`   · 本次**新记** ${fresh.length} 条（since = ${shellVersion}）——导出面变多要过 check-ui-surface-additive：`);
    for (const p of fresh) console.log(`     · ${p}`);
  }
}

main();
