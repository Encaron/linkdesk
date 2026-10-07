#!/usr/bin/env node
/**
 * R4 · 同一能力的第二份实现（`check-duplicate-capability.mjs`）——「能力落位」六条腿之四。
 *
 * 判据出处：`docs/04-软件更新/已落地/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R4。
 *
 * ══ 守的是哪句话 ══
 *   > 同一件能力**只该有一份实现**。第二份出现的那个瞬间，就是「该上收成共享件/壳命令」的信号
 *   > ——那正是本案的起因（「打开方式」面板被 file-tree 私有实现了一遍，插件一卸就整条能力消失）。
 *   > 这一腿**只报可疑、不判死**（启发式），但它必须**报得出来**：⛔ 宁可多报一次让人看一眼，
 *   > 也不许漏掉已知形状（§三 R4 原话）。
 *
 * ── 四条子判据（全部**黄灯**，⛔ 不拦）──
 *   ① **同名组件跨仓**（裸）：`<basename>.tsx` 出现在 ≥2 只仓 ⇒ 列名（⚠️ 通用名会撞，见下）。
 *   ①b **同名 ＋ 含浮层**（锐化版）：同名文件在 ≥2 只仓里**都**出现「自绘浮层」形状 ⇒ 这才是
 *      「两个 `OpenWithPanel.tsx`」的真身（§三 R4 的原文例子）。
 *   ② **插件 CSS 里的浮层样式**出现在 ≥2 只仓 ⇒ 同形弹层各画一套。
 *   ③ **同一条宿主声明被 ≥2 只仓读取** ⇒ 同一份数据两个消费方 ⇒ 问一句「是不是各自又画了一遍」。
 *
 * ── 为什么允许误报（照 audit 族的纪律）──
 *   同名/同形是**信号**不是**判据**：`index.tsx` 这类通用名谁家都有（实测：`index.tsx` 7 只仓、
 *   `Toolbar.tsx` 2 只、`SearchView.tsx` 2 只，全是各干各的）。故 ① 的名单**附人工复核表**
 *   `REVIEWED_BENIGN`——名字在表里 ⇒ 从裸名单里清掉（表本身有**反向核对**：表里那个名字若已不在
 *   现场 ⇒ 打 ⚠️ 提醒删表，⛔ 不让复核表腐烂成「永久静音」）。⛔ 锐化版（①b）与 ②③ 不进静音。
 *
 * ── 本腿的退出码恒 0 ──
 *   与 `audit-plugin-commands.mjs` 同款「只报不拦」纪律：上拦会当场退化成**假门禁**
 *   （存量必然有命中 ⇒ 人人学会绕开它 ⇒ 真红也失效）。它进 `npm run check` 只为**每天把名单打出来**。
 *
 * ── 自证（`--self-test`）──
 *   正控：① 两仓同名 ⇒ 报；② 两仓同名且都有浮层 ⇒ 报（锐化）；③ 两仓各有浮层 CSS ⇒ 报；
 *        ④ 一条宿主声明两仓读取 ⇒ 报；⑤ 复核表过期 ⇒ ⚠️；⑥ 复核过的组合 ⇒ 静音且不算过期；
 *        ⑦ 组合变了 ⇒ 静音失效（报黄灯 ＋ 原条目转 stale）。
 *   负控：① 单仓同名 ⇒ 不报；② 单仓浮层 CSS ⇒ 不报；③ 一条声明单仓读 ⇒ 不报；
 *        ④ 复核过的通用名 ⇒ 不进裸名单；⑤ 注释里的宿主数据 ⇒ 不算（剥注释在先）；
 *        ⑥ 动作调用（install/uninstall）⇒ 不算读声明。
 *   真树回归：今日跨仓同名 3 组全在复核表里 ＋ 今日宿主数据黄灯 0 处（复核表覆盖得住现状）。
 *
 * 用法：node scripts/check-duplicate-capability.mjs [容器目录] / `--self-test`
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OVERLAY_RE, listSourceFiles, loadOfficialRepos, readStripped, resolveContainer } from "./lib/gate-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const SELF_TEST = process.argv.includes("--self-test");

/**
 * 人工复核表：已看过、确认**各干各的**的同名组件（键 = basename，值 = 复核结论）。
 * 🔴 反向核对：表里的名字若不再跨仓出现 ⇒ 打 ⚠️（条目该删了）——⛔ 不许把复核表当永久静音开关。
 */
export const REVIEWED_BENIGN = new Map([
  ["index.tsx", "插件入口通用名——7 只仓各有各的入口，零共享语义（2026-10-06 复核）"],
  ["Toolbar.tsx", "file-tree 与 serial-monitor 各自的工具条，零共享语义（2026-10-06 复核）"],
  ["SearchView.tsx", "file-tree 与 marketplace 各自的搜索视图，零共享语义（2026-10-06 复核）"],
  [
    "SearchBar.tsx",
    "serial-monitor 与 pdf-reader 各自的搜索条——前者搜**串口输出流**（props 驱动，带大小写开关，Ctrl+F 开条），"
      + "后者是阅读区上的**查找浮条**（绝对定位浮层、走阅读器自己的 store，不认识 pdf.js）。props 契约与数据模型无交集，"
      + "改一处不影响另一处，零共享语义（2026-10-08 复核——pdf-reader 转官方后本闸门才扫到它）。",
  ],
]);

/** 宿主声明面（R4 判据③ 的数据键——**按键**分组，不看整串正则，才能说清「是哪条数据」）。 */
export const HOST_DATA_KEYS = [
  { key: "fileAssociation 处理器表（listHandlersFor / contributes.fileAssociations）", re: /listHandlersFor|contributes\.fileAssociations/ },
  { key: "已装插件表（plugins.listAll / pluginManager.list）", re: /plugins\.listAll|pluginManager\.list\b/ },
  { key: "兼容性判定（getCompatibility）", re: /getCompatibility/ },
];

/**
 * 纯判定①／①b：同名组件跨仓。
 * @param {Map<string, string[]>} basenames basename → 仓 id（≥2 仓）
 * @param {Map<string, Set<string>>} overlayBasenames 仓 id → 含浮层形状的 basename 集
 * @param {Map<string, string>} reviewed 复核表
 */
export function judgeDuplicates(basenames, overlayBasenames, reviewed = REVIEWED_BENIGN) {
  const raw = [];
  const sharp = [];
  for (const [name, owners] of basenames) {
    const withOverlay = owners.filter((o) => overlayBasenames.get(o)?.has(name));
    if (withOverlay.length >= 2) sharp.push({ name, repos: withOverlay });
    if (!reviewed.has(name)) raw.push({ name, repos: owners });
  }
  const stale = [...reviewed.keys()].filter((n) => !basenames.has(n));
  return { raw, sharp, stale };
}

/** 纯判定②：浮层 CSS 出现在 ≥2 只仓。 */
export function judgeOverlayCss(byRepo) {
  const hits = [...byRepo].filter(([, files]) => files.length > 0);
  return hits.length >= 2 ? hits.map(([repo, files]) => ({ repo, files })) : [];
}

/**
 * 人工复核表（判据③）：已看过、确认**不是**第二份实现的「多消费方」组合。
 * 键 = `<数据键> ← <消费方仓，字典序>`；同样有反向核对（组合已不存在 ⇒ ⚠️ 该删条目）。
 */
export const REVIEWED_HOST_DATA = new Map([
  [
    "fileAssociation 处理器表（listHandlersFor / contributes.fileAssociations） ← file-tree, settings",
    "两处**不是**同一件事：file-tree 读处理器表只为**右键项可见性门控**（双条件「有 handler ＋ 命令在册」，"
      + "渲染已归壳面板），settings 读它是**列表渲染**（按类型浏览处理器）——两份职责、零重复渲染（2026-10-06 复核）。",
  ],
]);

/** 纯判定③：同一条宿主声明被 ≥2 只仓读取（复核过的组合跳过 ＋ 反向核对）。 */
export function judgeHostDataConsumers(byRepoFiles, keys = HOST_DATA_KEYS, reviewed = REVIEWED_HOST_DATA) {
  const out = [];
  const seen = new Set();
  for (const { key, re } of keys) {
    const readers = [];
    for (const [repo, files] of byRepoFiles) {
      const hits = files.filter((f) => re.test(f.text)).map((f) => f.rel);
      if (hits.length) readers.push({ repo, files: hits });
    }
    if (readers.length < 2) continue;
    const sig = `${key} ← ${readers.map((r) => r.repo).sort().join(", ")}`;
    if (reviewed.has(sig)) {
      seen.add(sig);
      continue;
    }
    out.push({ key, readers });
  }
  const stale = [...reviewed.keys()].filter((s) => !seen.has(s));
  return { hits: out, stale };
}

function main() {
  const { dir: container, present } = resolveContainer();
  const repos = loadOfficialRepos(container, AGENTS_SCRIPT);
  if (!present || repos.length === 0) {
    console.log(`⚠️ R4 插件容器不在场（${container}）⇒ **空转**（本腿只扫插件域；⛔ 不是「已干净」）。`);
    process.exit(0);
  }

  const srcFiles = new Map(); // 官方仓 → [{rel, text}]
  const overlayBasenames = new Map(); // 官方仓 → Set<含浮层的 basename>
  const cssByRepo = new Map(); // 官方仓 → [含浮层的 .css]
  const thirdParty = repos.filter((r) => !r.official).map((r) => r.id);
  for (const r of repos) {
    if (!r.official) continue;
    const files = listSourceFiles(path.join(r.dir, "src"))
      .map((f) => ({ rel: path.relative(r.dir, f).split(path.sep).join("/"), text: readStripped(f) }))
      .filter((f) => f.text !== null);
    srcFiles.set(r.id, files);
    overlayBasenames.set(
      r.id,
      new Set(files.filter((f) => f.rel.endsWith(".tsx") && OVERLAY_RE.test(f.text)).map((f) => path.basename(f.rel))),
    );
    cssByRepo.set(r.id, files.filter((f) => f.rel.endsWith(".css") && OVERLAY_RE.test(f.text)).map((f) => f.rel));
  }

  const basenames = new Map();
  for (const [repo, files] of srcFiles) {
    for (const f of files) {
      if (!f.rel.endsWith(".tsx")) continue;
      const b = path.basename(f.rel);
      if (!basenames.has(b)) basenames.set(b, new Set());
      basenames.get(b).add(repo);
    }
  }
  const multi = new Map([...basenames].filter(([, s]) => s.size >= 2).map(([b, s]) => [b, [...s].sort()]));
  const dup = judgeDuplicates(multi, overlayBasenames);
  const css = judgeOverlayCss(cssByRepo);
  const hostData = judgeHostDataConsumers(srcFiles);

  const yellow = dup.raw.length + dup.sharp.length + (css.length ? 1 : 0) + hostData.hits.length;
  console.log(`── R4 同一能力的第二份实现（黄灯名单；已扫 ${srcFiles.size} 只官方插件仓）──`);
  for (const h of dup.sharp) console.log(`  🟡 [锐化·同名＋浮层] ${h.name} ← ${h.repos.join(", ")}（§三 R4 的原例形状：两个 OpenWithPanel）`);
  for (const h of dup.raw) console.log(`  🟡 [同名] ${h.name} ← ${h.repos.join(", ")}（⚠️ 通用名会撞，看一眼再定）`);
  for (const h of css) console.log(`  🟡 [浮层 CSS] ${h.repo}: ${h.files.join(", ")}（≥2 仓各有浮层样式 ⇒ 是否各画了一套？）`);
  for (const h of hostData.hits) console.log(`  🟡 [同一宿主数据多消费方] ${h.key} ← ${h.readers.map((r) => r.repo).join(", ")}`);
  for (const s of dup.stale) console.log(`  ⚠️ 复核表条目过期：\`${s}\` 已不跨仓出现 ⇒ 从 REVIEWED_BENIGN 删掉它（反核对：⛔ 复核表不是永久静音开关）`);
  for (const s of hostData.stale) console.log(`  ⚠️ 复核表条目过期：\`${s}\` 已不成组合 ⇒ 从 REVIEWED_HOST_DATA 删掉它（反核对：⛔ 复核表不是永久静音开关）`);

  console.log(
    yellow === 0
      ? `✅ R4 无第二份实现的可疑形状（同名 ${multi.size} 组已全部复核为各干各的；浮层 CSS / 宿主数据消费方均 ≤1 仓）。`
      : `🟡 R4 黄灯 ${yellow} 处（**不拦**——本条只报可疑：看一眼，若确实是第二份实现 ⇒ 上收成共享件/壳命令）。`,
  );
  process.exit(0);
}

/* ────────────────────────────────── 自测 ────────────────────────────────── */

function selfTest() {
  const ov = (o) => new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]));
  const cases = [
    // ── 正控 ──
    [
      "正控①：两仓同名组件 ⇒ 报（裸名单）",
      judgeDuplicates(new Map([["OpenWithPanel.tsx", ["file-tree", "editor"]]]), ov({})).raw.length,
      1,
    ],
    [
      "正控②（**§三 R4 原例**）：两仓都有 `OpenWithPanel.tsx` 且**都画浮层** ⇒ 报锐化版",
      judgeDuplicates(new Map([["OpenWithPanel.tsx", ["file-tree", "editor"]]]), ov({ "file-tree": ["OpenWithPanel.tsx"], editor: ["OpenWithPanel.tsx"] })).sharp.length,
      1,
    ],
    [
      "正控③：两仓各有浮层 CSS ⇒ 报（点名两仓）",
      judgeOverlayCss(new Map([["file-tree", ["a.css"]], ["editor", ["b.css"]]])).map((h) => h.repo).join(","),
      "file-tree,editor",
    ],
    [
      "正控④：同一条宿主声明被两仓读取（**未复核**的组合）⇒ 报（并点名是哪条数据）",
      judgeHostDataConsumers(new Map([
        ["marketplace", [{ rel: "m.ts", text: "const x = await fa.listHandlersFor(ext);" }]],
        ["editor", [{ rel: "p.tsx", text: "const h = await lk.fileAssociation.listHandlersFor(ext);" }]],
      ])).hits.length,
      1,
    ],
    [
      // 期望 = 当年复核表长度（空同名集 ⇒ 表里每条都该打 ⚠️）。⛔ 别写死数字——表一加行就假红。
      "正控⑤：复核表条目过期（该名字已不跨仓出现）⇒ 打 ⚠️",
      judgeDuplicates(new Map(), ov({})).stale.length,
      REVIEWED_BENIGN.size,
    ],
    [
      "正控⑥：**复核过的宿主数据组合**（今日真实形态：处理器表 ← file-tree, settings）⇒ 不进黄灯名单，且登记被确认见过",
      (() => {
        const r = judgeHostDataConsumers(new Map([
          ["settings", [{ rel: "m.ts", text: "const x = await fa.listHandlersFor(ext);" }]],
          ["file-tree", [{ rel: "p.tsx", text: "const h = await lk.fileAssociation.listHandlersFor(ext);" }]],
        ]));
        return r.hits.length === 0 && r.stale.length === 0;
      })(),
      true,
    ],
    [
      "正控⑦：复核条目在**换了消费方组合**后失效 ⇒ 报黄灯 ＋ 原条目转 stale（⛔ 复核表锁的是组合，不是数据键）",
      (() => {
        const r = judgeHostDataConsumers(new Map([
          ["settings", [{ rel: "m.ts", text: "const x = await fa.listHandlersFor(ext);" }]],
          ["editor", [{ rel: "e.tsx", text: "const h = await lk.fileAssociation.listHandlersFor(ext);" }]],
        ]));
        return r.hits.length === 1 && r.stale.length === 1;
      })(),
      true,
    ],
    // ── 负控 ──
    [
      "负控①：只在**一只仓**里出现的组件名 ⇒ 不报（不是第二份）",
      judgeDuplicates(new Map(), ov({ editor: ["Panel.tsx"] })).raw.length,
      0,
    ],
    [
      "负控②：只**一只仓**有浮层 CSS ⇒ 不报（第二份才可疑）",
      judgeOverlayCss(new Map([["file-tree", ["a.css"]], ["editor", []]])).length,
      0,
    ],
    [
      "负控③：宿主声明只被**一只仓**读取 ⇒ 不报（不是多消费方）",
      judgeHostDataConsumers(new Map([["settings", [{ rel: "m.ts", text: "fa.listHandlersFor(ext)" }]]])).hits.length,
      0,
    ],
    [
      "负控④：复核过的通用名（`index.tsx`）⇒ 不进裸名单",
      judgeDuplicates(new Map([["index.tsx", ["a", "b", "c"]]]), ov({})).raw.length,
      0,
    ],
    [
      "负控⑤：**注释里**的浮层字样 ⇒ 不算（剥注释在先；4.5 之后插件里 `OverlayPortal` 只剩注释）",
      judgeHostDataConsumers(new Map([
        ["a", [{ rel: "x.tsx", text: "// 原有 OverlayPortal 面板已删除\nconst x = 1;" }]],
        ["b", [{ rel: "y.tsx", text: "const h = fa.listHandlersFor(ext); const p = pp.list();" }]],
      ])).hits.length,
      0,
    ],
    [
      "负控⑥：`pluginManager.install`（**动作调用**，不是读声明）⇒ 不算宿主数据消费方",
      judgeHostDataConsumers(new Map([
        ["a", [{ rel: "x.ts", text: "await lk.pluginManager.install(id);" }]],
        ["b", [{ rel: "y.ts", text: "await lk.pluginManager.uninstall(id);" }]],
      ])).hits.length,
      0,
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    process.stdout.write(`${ok ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }
  // 真树回归：今日读数（容器不在场则跳过）
  const { dir: container, present } = resolveContainer();
  if (present) {
    const repos = loadOfficialRepos(container, AGENTS_SCRIPT);
    const files = new Map();
    for (const r of repos) {
      if (!r.official) continue;
      files.set(r.id, listSourceFiles(path.join(r.dir, "src")).map((f) => ({ rel: path.relative(r.dir, f).split(path.sep).join("/"), text: readStripped(f) })).filter((f) => f.text !== null));
    }
    const dupNames = new Map();
    for (const [r, fs2] of files) for (const f of fs2) {
      if (!f.rel.endsWith(".tsx")) continue;
      const b = path.basename(f.rel);
      if (!dupNames.has(b)) dupNames.set(b, new Set());
      dupNames.get(b).add(r);
    }
    const multi = new Map([...dupNames].filter(([, s]) => s.size >= 2).map(([b, s]) => [b, [...s].sort()]));
    const okRaw = [...multi.keys()].every((b) => REVIEWED_BENIGN.has(b));
    if (!okRaw) bad++;
    process.stdout.write(`${okRaw ? "✅" : "🔴"} 真树读数：今日跨仓同名 ${multi.size} 组（${[...multi.keys()].join("/")}）全部在复核表里（复核表未腐烂）\n`);
    // 真树回归②：今日宿主数据多消费方读数应全部落在 REVIEWED_HOST_DATA 里（否则说明现场变了、该看一眼）
    const hd = judgeHostDataConsumers(files);
    const okHd = hd.hits.length === 0 && hd.stale.length === 0;
    if (!okHd) bad++;
    process.stdout.write(
      `${okHd ? "✅" : "🔴"} 真树读数：今日宿主数据多消费方黄灯 ${hd.hits.length} 处、过期条目 ${hd.stale.length} 条（复核表覆盖得住现状）\n`,
    );
  }
  process.stdout.write(
    bad === 0 ? `\n✅ check-duplicate-capability self-test 全过（${cases.length} 例 ＋ 真树读数）。\n` : `\n🔴 check-duplicate-capability self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

/** 主入口判定——被 `import` 时不许自己跑 main（判据函数要能被复用／被红证脚本直接调） */
const IS_MAIN = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.resolve(argv1) === path.resolve(fileURLToPath(import.meta.url));
})();

if (IS_MAIN) {
  if (SELF_TEST) {
    console.log("── check-duplicate-capability --self-test ──");
    selfTest();
  } else {
    main();
  }
}
