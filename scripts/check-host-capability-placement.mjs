#!/usr/bin/env node
/**
 * R2 · 宿主能力私有化（`check-host-capability-placement.mjs`）——「能力落位」六条腿之二。
 *
 * 判据出处：`docs/04-软件更新/已落地/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R2。
 *
 * ══ 守的是判据 A（声明对等律）══
 *   > 一个控件的用途若是「**消费宿主声明**」，它必须住在**声明方与渲染方都够得着**的地方
 *   > （壳 / `@linkdesk/ui` 共享件），⛔ 不得住在任何「**可被用户卸载**」的插件里。
 *   本轮的真身：`file-tree` 的 `src/openWith/OpenWithPanel.tsx` —— 它 **既**读宿主的
 *   `fileAssociation.listHandlersFor`（宿主声明）**又**自己画浮层（`OverlayPortal` ＋ `position:fixed`），
 *   于是「打开方式」这项**宿主能力**被一只可卸载插件把持：卸载 file-tree ⇒ 设置页入口与编辑器按钮一起消失。
 *
 * ── 判据（两条，命中任一 ⇒ 红）──
 *   ① **自绘浮层 × 宿主声明**（同文件）：一个组件同时出现「`OverlayPortal` / 自建 `position:fixed` 浮层」
 *      与「`listHandlersFor` / `plugins.listAll` / `pluginManager.list` / `getCompatibility` /
 *      `contributes.fileAssociations`」⇒ 在插件里渲染宿主声明。
 *      ⚠️ 刻意**不含** `pluginManager.install/uninstall/enable`（那是**调用宿主动作**，任何插件都该能做
 *      ——混进来会把市场插件的正业判成住错层）。
 *   ② **插件 import 壳内部模块**：`@/core` / `@/components/shared` / `@src/`
 *      （插件只许经 `@linkdesk/ui` / `@linkdesk/plugin-sdk` / `window.linkdesk`）。
 *
 * ── 域与边界 ──
 *   官方仓 `src/**`（非测试、先剥注释）；⛔ 第三方仓只报不判红（硬约束 10）。
 *   🔴 **先剥注释是硬要求**：4.5 之后插件里 `OverlayPortal` 的**全部**出现只剩注释
 *      （「原为…迁入」「整段删除」）——不剥注释的判据会把**已修好的**地方重新报红。
 *   白名单机制 = `EXCEPTIONS`（文件级 ＋ 理由 ＋ **到期条件**，见 `lib/gate-scan.mjs#applyExceptions`）。
 *
 * ── 自证（`--self-test`）──
 *   正控：① 合成了 pre-4.5 `OpenWithPanel` 的形状 ⇒ 命中；② 自建 `position:fixed` ＋ `pluginManager.list` ⇒ 命中；
 *        ③ `import … from "@/core/x"` ⇒ 命中。
 *   负控：① 只画浮层不读声明 ⇒ 不命中；② 只读声明不画浮层 ⇒ 不命中；③ **注释里的** ⇒ 不命中（回归正控）；
 *        ④ `pluginManager.install`（动作调用）⇒ 不命中；⑤ `@linkdesk/ui` 正当 import ⇒ 不命中。
 *   反向核对：例外账本过期 ⇒ 红。
 *
 * ── 🔴 残余边界（如实登记）──
 *   「浮层 × 声明」是**形状**启发式，⛔ 不是完备证明：把两者拆到两个文件、或经第三方封装绕一层，
 *   本腿收不到。它抓的是**行为形状**（当年那处真正踩的形态），不是「构造上不可能」。
 *
 * 用法：node scripts/check-host-capability-placement.mjs [容器目录] / `--self-test`
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERLAY_RE,
  SHELL_INTERNAL_IMPORT_RE,
  applyExceptions,
  findPlacementShapes,
  listSourceFiles,
  lineOf,
  loadOfficialRepos,
  readStripped,
  resolveContainer,
} from "./lib/gate-scan.mjs";
import { stripComments } from "./lib/strip-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const SELF_TEST = process.argv.includes("--self-test");

/** 例外账本（文件级 ＋ 到期条件必填）。今天为空——住错层的那两处已在纠正案 4.5 修掉。 */
export const EXCEPTIONS = [];

/**
 * 纯判定（自测注入假输入）：返回两类违规。
 * @param {{rel: string, text: string}[]} files 已剥注释
 * @returns {{rel: string, line: number, kind: string}[]}
 */
export function judgePlacement(files) {
  const out = findPlacementShapes(files).map((h) => ({ ...h, kind: "overlay-renders-host-declaration" }));
  for (const f of files) {
    const m = SHELL_INTERNAL_IMPORT_RE.exec(f.text);
    if (m) out.push({ rel: f.rel, line: lineOf(f.text, m.index), kind: "plugin-imports-shell-internals" });
  }
  return out;
}

const FIX_HINTS = {
  "overlay-renders-host-declaration":
    "把「读宿主声明 ＋ 画浮层」的那件**整体搬走**：浮层进 `@linkdesk/ui` 共享件（判据 A），"
    + "调用面立一条**壳命令**（`SHELL_COMMANDS`）；插件只留「触发」那一行（`openWith(request)` 式）。",
  "plugin-imports-shell-internals":
    "改用 `@linkdesk/ui`（共享件）/ `@linkdesk/plugin-sdk`（常量与 helper）/ `window.linkdesk`（宿主 API）；"
    + "⛔ 插件永不 import 壳内部模块（那样它就不是独立构建产物了）。",
};

function main() {
  const { dir: container, present } = resolveContainer();
  const repos = loadOfficialRepos(container, AGENTS_SCRIPT);
  if (!present || repos.length === 0) {
    console.log(`⚠️ 插件容器不在场（${container}）⇒ **插件域跳过**（本腿对插件域是空转，⛔ 不是「已干净」）。`);
    return;
  }

  const hits = [];
  const report = [];
  for (const r of repos) {
    const files = listSourceFiles(path.join(r.dir, "src"))
      .map((f) => ({ rel: path.relative(ROOT, f).replace(/\\/g, "/"), text: readStripped(f) }))
      .filter((f) => f.text !== null);
    for (const h of judgePlacement(files)) (r.official ? hits : report).push({ ...h, repo: r.id });
  }

  // 例外按「仓相对路径」登记（`<repoId>/<rel>`）——多仓同名文件不会互相顶掉
  const relHits = hits.map((h) => ({ ...h, rel: `${h.repo}/${h.rel.replace(new RegExp(`^plugins/${h.repo}/`), "")}` }));
  const { kept, passed, violations } = applyExceptions(EXCEPTIONS, relHits);

  if (report.length) {
    console.log(`ℹ️ 第三方仓命中 ${report.length} 处（⛔ 只报不判红、不代改）：`);
    for (const h of report.slice(0, 20)) console.log(`   · ${h.repo} ${h.rel}:${h.line}  ${h.kind}`);
  }
  if (violations.length) {
    console.error(`❌ R2 例外账本不达标——${violations.length} 处：`);
    for (const v of violations) console.error(`   [${v.kind}] ${v.msg}`);
    process.exit(1);
  }
  if (kept.length) {
    console.error(`❌ R2 宿主能力私有化 ${kept.length} 处——「消费宿主声明」的东西不许住在可卸载的插件里：\n`);
    for (const h of kept) {
      console.error(`   · ${h.repo}/${h.rel}:${h.line}  [${h.kind}]`);
      console.error(`     怎么修：${FIX_HINTS[h.kind]}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ R2 无宿主能力私有化——已扫 ${repos.length} 只官方插件仓`
      + `（判据①「浮层 × 宿主声明同文件」＋ 判据②「import 壳内部模块」；先剥注释 ⇒ 改好的地方不会假红）。`
      + (passed.length ? ` 例外放行 ${passed.length} 处（${EXCEPTIONS.length} 条登记）。` : ""),
  );
}

/* ────────────────────────────────── 自测 ────────────────────────────────── */

function selfTest() {
  const run = (text) => judgePlacement([{ rel: "src/x.tsx", text: stripComments(text) }]);
  const kinds = (t) => run(t).map((h) => h.kind).sort();

  const cases = [
    // ── 正控：该红的红 ──
    [
      "正控①：**pre-4.5 `OpenWithPanel` 的形状**（`OverlayPortal` ＋ `listHandlersFor` 同文件）⇒ 命中",
      kinds('import { OverlayPortal } from "@linkdesk/ui";\nconst rows = await lk.fileAssociation.listHandlersFor(ext);\nreturn <OverlayPortal onClose={close}><div style={{position:"fixed"}}/></OverlayPortal>;').includes("overlay-renders-host-declaration"),
      true,
    ],
    [
      "正控②：自建 `position:fixed` 浮层 ＋ `pluginManager.list()` ⇒ 命中（不走共享件的那条路也抓得住）",
      kinds('const ps = await window.linkdesk.pluginManager.list();\nreturn <div className="x" style={{ position: "fixed" }}/>;').includes("overlay-renders-host-declaration"),
      true,
    ],
    [
      "正控③：`pluginManager.list()` ＋ `getCompatibility`（宿主声明读取面）⇒ 命中",
      kinds('const ps = await lk.pluginManager.list();\nconst c = await lk.plugins.getCompatibility(req);\n<OverlayPortal/>;').includes("overlay-renders-host-declaration"),
      true,
    ],
    [
      "正控④：插件 import 壳内部模块 `@/core/registry/commands` ⇒ 命中",
      kinds('import { x } from "@/core/registry/commands";').includes("plugin-imports-shell-internals"),
      true,
    ],
    [
      "正控⑤：插件 import `@/components/shared/overlay-portal` ⇒ 命中（共享件要走 `@linkdesk/ui` 包）",
      kinds('import { OverlayPortal } from "@/components/shared/overlay-portal/OverlayPortal";').includes("plugin-imports-shell-internals"),
      true,
    ],
    // ── 负控：⛔ 不误伤 ──
    [
      "负控①：**只画浮层、不读声明**（marketplace `AddSourcePopup` 的真实形态）⇒ 不命中",
      kinds('import { OverlayPortal } from "@linkdesk/ui";\nexport const P = () => <OverlayPortal onClose={f}>hi</OverlayPortal>;').length,
      0,
    ],
    [
      "负控②：**只读声明、不画浮层**（settings `model.ts` 的真实形态）⇒ 不命中（分层是正确的）",
      kinds('export async function load(){ const l = await fa.listHandlersFor(ext); const p = await lk.pluginManager.list(); return {l, p}; }').length,
      0,
    ],
    [
      "🔴 负控③（**回归正控**）：「浮层」与**已删**的字样只出现在**注释**里 ⇒ 不命中——4.5 之后插件里的真实形态，剥注释是本腿的命门",
      kinds('// 原有自绘 OverlayPortal 面板已整段删除，改调宿主命令\nconst rows = await fa.listHandlersFor(ext);').length,
      0,
    ],
    [
      "负控④：`pluginManager.install/uninstall`（**调用宿主动作**，不是读声明）⇒ 不命中（市场插件的正业）",
      kinds('await window.linkdesk.pluginManager.install(id);\nawait window.linkdesk.pluginManager.uninstall(id);').length,
      0,
    ],
    [
      "负控⑤：正当 import（`@linkdesk/ui` / `@linkdesk/plugin-sdk`）⇒ 不命中",
      kinds('import { Button } from "@linkdesk/ui";\nimport { SHELL_COMMANDS } from "@linkdesk/plugin-sdk/shell-commands";').length,
      0,
    ],
    [
      "负控⑥：干净串（宿主声明读取 ＋ `position: relative` 布局）⇒ 不命中（别把普通定位当浮层）",
      kinds('const rows = await fa.listHandlersFor(ext);\n<div style={{ position: "relative" }}/>;').length,
      0,
    ],
  ];

  // 例外账本反向核对（与 R1 同机制，这里只钉一条：过期例外必红）
  cases.push([
    "🔴 负控⑦：例外账本过期（一条也没放行）⇒ 报 stale-exception",
    (() => {
      const { violations } = applyExceptions([{ file: "a/b.tsx", id: "*", why: "r", until: "u" }], []);
      return violations.some((v) => v.kind === "stale-exception");
    })(),
    true,
  ]);

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    process.stdout.write(`${ok ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-host-capability-placement self-test 全过（${cases.length} 例：正控红 / 负控绿 ＋ 注释不误伤回归）。\n`
      : `\n🔴 check-host-capability-placement self-test ${bad} 例不符。\n`,
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
    console.log("── check-host-capability-placement --self-test ──");
    selfTest();
  } else {
    main();
  }
}
