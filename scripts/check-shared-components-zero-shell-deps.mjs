#!/usr/bin/env node
/**
 * R6 · 共享件零壳依赖（`check-shared-components-zero-shell-deps.mjs`）——「能力落位」六条腿之六。
 *
 * 判据出处：`docs/04-软件更新/待抉择池/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R6
 * ＋ `01-住错层纠正-选择器转正与壳级打开面.md` §八风险表「共享件偷偷依赖壳 core（破坏可替换性）」。
 *
 * ══ 守的是哪句话 ══
 *   > 共享件**拎出来就能给第三方用**——判据 A 的前提（「消费宿主声明的控件必须住共享层」之所以
 *   > 成立，全靠共享层真的对第三方可达）。
 *
 * ── 为什么共享层要「零壳依赖」──
 *   `src/components/shared/**` 的源码就是 `@linkdesk/ui` 的源码（单一源码防漂移：`packages/linkdesk-ui/scripts/build.mjs`
 *   第 3 步把壳 `src/components/shared` 镜像成 dist 的 d.ts）。凡这一层偷用壳内部模块，第三方那边
 *   **根本编译不过**（那个相对路径在壳外不存在）——本腿就是这条「拎不出来」的机械哨兵。
 *
 * ── 🔴 射程 = **barrel 导出的那些**（这一条是判据的本体，不是放水）──
 *   「第三方可达」的唯一边界是 barrel（`packages/linkdesk-ui/src/index.ts`，其导出面即
 *   `scripts/ui-surface.json` 对账的那一份）。目录里的文件如果**没从 barrel 出去**，第三方
 *   import 不到它 ⇒ 它今天不构成「拎不出来」——本腿把它**打 ℹ️ 清单**（看得见、不算红）。
 *   反过来，**一旦它被加进 barrel**，同一份代码当场进入红区（射程随导出面自动收紧，
 *   ⛔ 不需要谁来记得补一条规则）。这就是为什么本腿只判导出件：判的是「第三方真的够不够得着」。
 *
 * ── 两条判定（对**导出件**硬红）──
 *   ① **壳内部 import**：`@/core…` / `@src/…` / `@/components/…`（非 shared），以及**相对路径逃出**
 *      `src/components/shared/` 的（`../../../core/x` 与 `@/core/x` 同一件错，⛔ 只守别名形态会漏一半）。
 *      这是**真断**：壳外的第三方拿不到那个路径，编译当场失败。
 *   ② **直接调宿主桥**：`window.linkdesk.*`（含 `return window.linkdesk;` 裸取）。新件一律走
 *      **能力注入**（props in / events out，照 `OpenWithPicker` / `PluginCard` / `BackgroundImagePicker` 先例）。
 *      这是**欠账**：`window.linkdesk` 是插件同样拿得到的宿主 API ⇒ 今天不破运行时可用性，
 *      破的是「离开壳也活得下去」（预览台 / 第三方宿主 / 无桥单测）。
 *
 * ── 例外账本（判据②的存量口径，**必读**）──
 *   判据②今天对 **5 件导出件**成立：`ContextMenu` / `FilePathInput` / `InlineInput` / `DynamicSelect` / `ThemePicker`。
 *   前三是 E5.5#7-p5 的**有意设计**（注释原文：「零 @src/core import——走 window.linkdesk.* IPC」），
 *   后两件是 E5.8 起就走桥的主题控件。⇒ **不软化判据、也不假装它们是零依赖**：照本项目
 *   「例外挂账」惯例逐条登记（文件 ＋ 理由 ＋ 到期条件），**新件一律照红**；反向核对会揪出腐烂条目。
 *   🔴 到期条件（**2026-10-06 已结案**）= 本纠正案收口前给出结论（迁成能力注入，或把判据②从 R6 里划掉）——
 *   结案口径：**两条都不走**。① ⛔ 不迁注入：这 5 件是**已发布的公共导出件**（`@linkdesk/ui` 0.2.x），
 *   把 `window.linkdesk.*` 改成 props 注入是 **breaking 的公共 API 变更**，会静默打断第三方调用方；
 *   ② ⛔ 不划掉判据②：射程本体是「新件一律零桥」，这条今天仍在生效、且是判据 A 的前提。
 *   ⇒ **维持例外**（5 条），`until` 改挂**真实触发条件**（见各条）＝「下次动这 5 件中任一件的公共 API 时同笔迁注入」。
 *   ⚠️ 边界如实写在这里：例外按 **(文件, 判据 id)** 放行 ⇒ 这 5 件里**日后新加**的桥调用也一并放行
 *   （本波不收紧——按行放行会随行号漂移，得不偿失）。判断「该不该新加一处桥」靠人，⛔ 别指望本腿。
 *   `id` 逐条写 `direct-host-bridge`（⛔ 不写 `"*"`）：同文件日后多一条 `shell-internal-import` 照红。
 *
 * ── 第三条判据（中文硬编码）照旧**不在本腿重复扫** ──
 *   已由 `scripts/audit-i18n.mjs --strict` 全程守着（已挂 `npm run check`），照 spec「已在别处守的照旧」。
 *
 * 用法：node scripts/check-shared-components-zero-shell-deps.mjs [根目录] / `--self-test`
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_PATH_RE, applyExceptions, listSourceFiles, lineOf, readStripped } from "./lib/gate-scan.mjs";
import { stripComments } from "./lib/strip-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");

/** 共享层根目录（相对仓库根）——`@linkdesk/ui` 的源码就是这里。 */
export const SHARED_DIR = "src/components/shared";
/** 公共导出面（barrel）——射程的唯一真相源。 */
export const BARREL = "packages/linkdesk-ui/src/index.ts";

/** 测试夹具（`.fixture.ts`）与测试同源：不随包发货，⛔ 不进本腿射程。 */
export const FIXTURE_RE = /\.fixture\.[cm]?[jt]sx?$/;

/**
 * 例外账本（见头注「例外账本」一节——判据②的 5 件存量，逐条带到期条件 ＋ 反向核对）。
 */
export const EXCEPTIONS = [
  {
    file: `${SHARED_DIR}/context-menu/ContextMenu.tsx`,
    id: "direct-host-bridge",
    why: "存量：E5.5#7-p5 有意走桥（`function lk() { return window.linkdesk; }`，菜单项动作走 executeCommand）。"
      + "第三方插件同样拿得到 `window.linkdesk` ⇒ 今天不破可用性；新件照红。",
    until: "2026-10-06 结案＝维持例外（⛔ 不迁注入：breaking 公共 API；⛔ 不划掉判据②：新件仍照红）；触发条件＝下次改本件公共 API（或本件宿主能力注入化被立为独立案）时同笔迁注入",
  },
  {
    file: `${SHARED_DIR}/file-path-input/FilePathInput.tsx`,
    id: "direct-host-bridge",
    why: "存量：E5.5#7-p5 有意走桥（`window.linkdesk?.dialog` 开系统选文件框，无 dialog 时静默 no-op）。"
      + "「选路径」是宿主能力，注入化要调用方多传一个 handler——本波只登记、不改。",
    until: "2026-10-06 结案＝维持例外；触发条件＝下次改本件公共 API 时同笔迁注入（同 ContextMenu 口径）",
  },
  {
    file: `${SHARED_DIR}/inline-input/InlineInput.tsx`,
    id: "direct-host-bridge",
    why: "存量：E5.5#7-p5 有意走桥（`function lk() { return window.linkdesk; }`，键位捕获/上下文键经桥）。本波只登记、不改。",
    until: "2026-10-06 结案＝维持例外；触发条件＝下次改本件公共 API 时同笔迁注入（同 ContextMenu 口径）",
  },
  {
    file: `${SHARED_DIR}/select-box/DynamicSelect.tsx`,
    id: "direct-host-bridge",
    why: "存量：`window.linkdesk?.configuration` 订阅 `app.appearanceMode`（双语义下拉的配色域）。"
      + "已全程 `?.` 守卫 ⇒ 桥缺席时静默降级，但仍是直接依赖。本波只登记、不改。",
    until: "2026-10-06 结案＝维持例外；触发条件＝下次改本件公共 API 时同笔迁注入（同 ContextMenu 口径）",
  },
  {
    file: `${SHARED_DIR}/theme-picker/ThemePicker.tsx`,
    id: "direct-host-bridge",
    why: "存量：`window.linkdesk?.theme?.listRecipes` ＋ 插件生命周期订阅（E5.8#60 F1.3）。"
      + "同款 `?.` 降级；本波只登记、不改。",
    until: "2026-10-06 结案＝维持例外；触发条件＝下次改本件公共 API 时同笔迁注入（同 ContextMenu 口径）",
  },
];

/** 判据①：壳内部 import 的别名形态（相对路径逃逸由 `escapesShared` 另算）。 */
export const SHELL_ALIAS_IMPORT_RE = /from\s+["'](@\/core|@\/components(?!\/shared)|\/src|@src\/)/;

/** 判据②：直接取宿主桥（裸取 `return window.linkdesk;` 也算——⛔ 不能只守 `window.linkdesk.x`）。 */
export const HOST_BRIDGE_RE = /\bwindow\s*\.\s*linkdesk\b|\bglobalThis\b[^\n]{0,40}\blinkdesk\b/;

/**
 * 解析 barrel 的 `@shared/<路径>` 说明符 → 共享层相对路径集（`<folder>/<File>.tsx`）。
 * 只认 `from "@shared/…"`（含 `export type {…} from`——类型导出同样把那个文件摆到第三方面前）。
 */
export function collectBarrelShared(barrelSrc) {
  const out = new Set();
  for (const m of stripComments(barrelSrc).matchAll(/from\s+["']@shared\/([^"']+)["']/g)) {
    out.add(`${m[1]}.tsx`);
    out.add(`${m[1]}.ts`);
  }
  return out;
}

/** 相对 import 说明符：是否**逃出**共享层（`../badge/Badge` 在层内 ⇒ 不算）。 */
export function escapesShared(fromRel, spec, sharedPrefix = SHARED_DIR) {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return false;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  return !(resolved === sharedPrefix || resolved.startsWith(`${sharedPrefix}/`));
}

/**
 * 纯判定：逐文件找两类违规（已剥注释的文本入参）。
 *
 * @param {{rel: string, text: string}[]} files 共享层源文件（rel 相对仓库根，正斜杠）
 * @param {Set<string>} exported barrel 可达集（`<folder>/<File>.tsx` 形态；空集 = 全判）
 * @returns {{ hits: object[], inventory: object[] }} hits = 导出件违规（红）；inventory = 非导出件（ℹ️）
 */
export function judgeShellDeps(files, exported = new Set()) {
  const hits = [];
  const inventory = [];
  for (const f of files) {
    if (!f.rel.startsWith(`${SHARED_DIR}/`)) continue;
    const found = [];
    const alias = SHELL_ALIAS_IMPORT_RE.exec(f.text);
    if (alias) found.push({ rel: f.rel, line: lineOf(f.text, alias.index), id: "shell-internal-import", detail: alias[1] });
    else {
      for (const m of f.text.matchAll(/from\s+["']([^"']+)["']/g)) {
        if (escapesShared(f.rel, m[1])) {
          found.push({ rel: f.rel, line: lineOf(f.text, m.index), id: "shell-internal-import", detail: m[1] });
          break;
        }
      }
    }
    const bridge = HOST_BRIDGE_RE.exec(f.text);
    if (bridge) found.push({ rel: f.rel, line: lineOf(f.text, bridge.index), id: "direct-host-bridge", detail: bridge[0].trim() });
    if (found.length === 0) continue;
    const isExported = exported.size === 0 || exported.has(f.rel.slice(`${SHARED_DIR}/`.length));
    (isExported ? hits : inventory).push(...found);
  }
  return { hits, inventory };
}

const FIX_HINTS = {
  "shell-internal-import":
    "共享件活在壳外（`@linkdesk/ui` 的源码就是它）⇒ ⛔ 不许 import 壳内部模块。改用："
    + "① 同层共享件（`@shared/…`）；② 包（`@linkdesk/contracts` / react 系）——类型也走契约；"
    + "③ 值当参数传进来（能力注入）。",
  "direct-host-bridge":
    "改成**能力注入**（照 `OpenWithPicker` / `PluginCard` / `BackgroundImagePicker` 先例）：宿主能力当 props 传进"
    + "（如 `onBrowse` / `executeCommand` / `listRecipes`），件本身纯 props in / events out——"
    + "这样它离开壳也活得下去（预览台/第三方宿主/单测都不用造桥）。存量五件见本文件 EXCEPTIONS。",
};

function main() {
  const exported = collectBarrelShared(readStripped(path.join(ROOT, BARREL)));
  const files = listSourceFiles(path.join(ROOT, SHARED_DIR))
    .map((f) => ({ rel: path.relative(ROOT, f).split(path.sep).join("/"), text: readStripped(f) }))
    .filter((f) => f.text !== null && !TEST_PATH_RE.test(f.rel) && !FIXTURE_RE.test(f.rel));

  const { hits, inventory } = judgeShellDeps(files, exported);
  const { kept, passed, violations } = applyExceptions(EXCEPTIONS, hits);

  console.log(
    `── R6 共享件零壳依赖（${files.length} 个源文件；射程 = barrel 导出的 ${exported.size / 2} 件）──`,
  );
  console.log(`   （中文硬编码照旧由 \`audit-i18n --strict\` 守——本腿不重复扫）`);
  if (inventory.length) {
    console.log(`ℹ️ 非 barrel 导出件命中 ${inventory.length} 处（第三方**今天拿不到**这些文件 ⇒ ⛔ 不判红；`);
    console.log(`   一旦它们被加进 ${BARREL}，同一份代码当场进红区）：`);
    for (const h of inventory) console.log(`   · ${h.rel}:${h.line}  [${h.id}] ${h.detail}`);
  }
  if (violations.length) {
    console.error(`❌ R6 例外账本不达标——${violations.length} 处：`);
    for (const v of violations) console.error(`   [${v.kind}] ${v.msg}`);
    process.exit(1);
  }
  if (kept.length) {
    console.error(`❌ R6 导出共享件依赖了壳 ${kept.length} 处——这一层是要「拎出来给第三方用」的：\n`);
    for (const h of kept) {
      console.error(`   · ${h.rel}:${h.line}  [${h.id}] ${h.detail}`);
      console.error(`     怎么修：${FIX_HINTS[h.id]}`);
    }
    console.error(`\n🔴 R6 ${kept.length} 处未登记（或按上面怎么写修）。`);
    process.exit(1);
  }
  console.log(
    `✅ R6 导出共享件零壳依赖（例外放行 ${passed.length} 处：${[...new Set(passed.map((p) => path.basename(p.rel)))].join(" / ")}`
      + `——五条存量挂在 EXCEPTIONS，2026-10-06 结案＝维持例外、触发条件见各条）。`,
  );
  process.exit(0);
}

/* ────────────────────────────────── 自测 ────────────────────────────────── */

function selfTest() {
  const P = SHARED_DIR;
  const f = (rel, text) => ({ rel, text });
  const EXP = new Set(["a/A.tsx"]);
  const OV = { file: `${P}/a/A.tsx`, id: "direct-host-bridge", why: "w", until: "u" };
  const cases = [
    // ── 正控 ──
    [
      "正控①（**spec 判据原文**）：**导出件**里 `import … from \"@/core/…\"` ⇒ 红 `shell-internal-import`",
      judgeShellDeps([f(`${P}/a/A.tsx`, 'import { x } from "@/core/services/plugins/PluginStateService";')], EXP).hits[0].id,
      "shell-internal-import",
    ],
    [
      "正控②：**相对路径逃出**共享层（`../../../core/x`——存量 HintTipRenderer 的真实形状）⇒ 同样红",
      judgeShellDeps([f(`${P}/a/A.tsx`, 'import type { X } from "../../../core/types/pool/poolLayout";')], EXP).hits.length,
      1,
    ],
    [
      "正控③：`window.linkdesk.commands.executeCommand` ⇒ 红 `direct-host-bridge`",
      judgeShellDeps([f(`${P}/a/A.tsx`, "const h = window.linkdesk.commands.executeCommand;")], EXP).hits[0].id,
      "direct-host-bridge",
    ],
    [
      "正控④：**裸取**桥（`return window.linkdesk;`——存量 ContextMenu 的真实形状）⇒ 也红",
      judgeShellDeps([f(`${P}/a/A.tsx`, "function lk() {\n  return window.linkdesk;\n}")], EXP).hits.length,
      1,
    ],
    [
      "正控⑤：`globalThis` 取桥（SDK 同款写法）⇒ 红",
      judgeShellDeps([f(`${P}/a/A.tsx`, "const host = (globalThis as HostBridge).linkdesk;")], EXP).hits.length,
      1,
    ],
    [
      "正控⑥（**射程的本体**）：**非导出件**里同样两份违规 ⇒ ⛔ 不判红，改打 ℹ️ 清单",
      (() => {
        const r = judgeShellDeps([f(`${P}/b/B.tsx`, 'import i18n from "../../../i18n";\nconst x = window.linkdesk;')], EXP);
        return r.hits.length === 0 && r.inventory.length === 2;
      })(),
      true,
    ],
    [
      "正控⑦：**同一份代码**，把非导出件加进 barrel ⇒ 当场进红区（射程随导出面自动收紧）",
      (() => {
        const src = f(`${P}/b/B.tsx`, 'import i18n from "../../../i18n";');
        return judgeShellDeps([src], EXP).hits.length === 0 && judgeShellDeps([src], new Set(["b/B.tsx"])).hits.length === 1;
      })(),
      true,
    ],
    [
      "正控⑧：已登记的 5 件存量 ⇒ 放行，不进红名单",
      (() => {
        const r = applyExceptions([OV], [{ rel: OV.file, line: 41, id: "direct-host-bridge", detail: "window.linkdesk" }]);
        return r.kept.length === 0 && r.passed.length === 1;
      })(),
      true,
    ],
    [
      "正控⑨：例外挂了 `direct-host-bridge`，同文件另来一条 `shell-internal-import` ⇒ **照红**（⛔ 账本不写 `\"*\"` 的原因）",
      (() => {
        const r = applyExceptions([OV], [
          { rel: OV.file, line: 1, id: "direct-host-bridge", detail: "window.linkdesk" },
          { rel: OV.file, line: 9, id: "shell-internal-import", detail: "@/core/x" },
        ]);
        return r.kept.length === 1 && r.kept[0].id === "shell-internal-import";
      })(),
      true,
    ],
    [
      "正控⑩：例外条目缺 `why` ⇒ exception-incomplete（例外必须挂账：文件 ＋ 理由 ＋ 到期条件）",
      applyExceptions([{ file: `${P}/a/A.tsx`, id: "*", until: "u" }], []).violations.some((v) => v.kind === "exception-incomplete"),
      true,
    ],
    [
      "正控⑪：例外登记了但今天没有一条违规可放行 ⇒ stale-exception（到期条件逼人回来处理）",
      applyExceptions([OV], []).violations.some((v) => v.kind === "stale-exception"),
      true,
    ],
    [
      "正控⑫：barrel 解析——`default` / 具名 / `export type` 三种写法都算导出（类型导出同样把文件摆到第三方面前）",
      [
        collectBarrelShared('export { default as ContextMenu } from "@shared/context-menu/ContextMenu";').has("context-menu/ContextMenu.tsx"),
        collectBarrelShared('export { InlineInput } from "@shared/inline-input/InlineInput";').has("inline-input/InlineInput.tsx"),
        collectBarrelShared('export type { HintTipProps } from "@shared/hint-tip/HintTip";').has("hint-tip/HintTip.tsx"),
      ].every(Boolean),
      true,
    ],
    [
      "正控⑬：字符串里**逐字**写 `\"window.linkdesk\"` 也会命中 —— 刻意宽松（宁可多报一次让人看一眼，"
        + "⛔ 不放宽成 `window.linkdesk.` 才守——那样存量 `return window.linkdesk;` 就漏了）",
      judgeShellDeps([f(`${P}/a/A.tsx`, 'const note = "共享件不得调 window.linkdesk";')], EXP).hits.length,
      1,
    ],
    // ── 负控 ──
    [
      "负控①：**注释里**的 `window.linkdesk` / `@/core` ⇒ 不算（剥注释在先——共享件里这类注释很多，"
        + "`hintAttrs.ts` / `OpenWithPicker.tsx` 头注都在说「本件零 window.linkdesk」）",
      judgeShellDeps([
        f(`${P}/a/A.tsx`, stripComments('// 本件零 window.linkdesk、零 @/core import\n/* 旧实现 import … from "@/core/x" */\nconst x = 1;')),
      ], EXP).hits.length,
      0,
    ],
    [
      "负控②：**共享层内**的相对引用（`../badge/Badge`）⇒ 不算逃逸（还在这一层里）",
      judgeShellDeps([f(`${P}/a/A.tsx`, 'import Badge from "../badge/Badge";')], EXP).hits.length,
      0,
    ],
    [
      "负控③：包与别名（`react` / `@linkdesk/contracts` / `@shared/hooks/useClickPreview`）⇒ 都不算壳内部依赖",
      judgeShellDeps([
        f(`${P}/a/A.tsx`, 'import React from "react";\nimport type { OpenWithRequest } from "@linkdesk/contracts";\nimport { useClickPreview } from "@shared/hooks/useClickPreview";'),
      ], EXP).hits.length,
      0,
    ],
    [
      "负控④：共享层**之外**的文件（壳自己的 core / commands）不在本腿射程——本腿只守共享层",
      judgeShellDeps([f("src/core/commands/shell/openWithCommands.ts", 'import { x } from "@/core/registry/x";\nconst y = window.linkdesk;')], EXP).hits.length,
      0,
    ],
    [
      "负控⑤：多绕几层但**没逃出**共享层（`src/components/shared/a/b/C.tsx` → `../../badge/Badge`）⇒ 不算",
      judgeShellDeps([f(`${P}/a/b/C.tsx`, 'import Badge from "../../badge/Badge";')], EXP).hits.length,
      0,
    ],
    [
      "负控⑥：barrel 里**注释掉的**导出行 ⇒ 不算导出（剥注释在先——barrel 头注大段提组件名）",
      collectBarrelShared('// export { default as Foo } from "@shared/foo/Foo";\nexport { default as Bar } from "@shared/bar/Bar";').has("foo/Foo.tsx"),
      false,
    ],
    [
      "负控⑦：`.fixture.ts`（测试夹具，不随包发货）本就不该进射程——由 FIXTURE_RE 在收集期排掉",
      FIXTURE_RE.test(`${P}/theme-recipes.fixture.ts`),
      true,
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    process.stdout.write(`${ok ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }

  // 真树读数：导出件违规应**恰好**等于账本登记（多一条 = 新欠账；少一条 = 该删账本行）
  const exported = collectBarrelShared(readStripped(path.join(ROOT, BARREL)));
  const files = listSourceFiles(path.join(ROOT, SHARED_DIR))
    .map((x) => ({ rel: path.relative(ROOT, x).split(path.sep).join("/"), text: readStripped(x) }))
    .filter((x) => x.text !== null && !TEST_PATH_RE.test(x.rel) && !FIXTURE_RE.test(x.rel));
  const live = judgeShellDeps(files, exported);
  const applied = applyExceptions(EXCEPTIONS, live.hits);
  const ledgerFiles = new Set(EXCEPTIONS.map((e) => e.file));
  const liveOk = applied.kept.length === 0 && applied.violations.length === 0 && live.hits.every((h) => ledgerFiles.has(h.rel));
  if (!liveOk) bad++;
  process.stdout.write(
    `${liveOk ? "✅" : "🔴"} 真树读数：${files.length} 个源文件 / barrel 导出 ${exported.size / 2} 件；`
      + `导出件违规 ${live.hits.length} 处（全在账本：${[...new Set(live.hits.map((h) => path.basename(h.rel)))].join(", ")}）、`
      + `非导出件 ℹ️ ${live.inventory.length} 处、未登记 ${applied.kept.length} 处、账本违规 ${applied.violations.length} 条\n`,
  );
  process.stdout.write(
    bad === 0 ? `\n✅ check-shared-components-zero-shell-deps self-test 全过（${cases.length} 例 ＋ 真树读数）。\n` : `\n🔴 check-shared-components-zero-shell-deps self-test ${bad} 例不符。\n`,
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
    console.log("── check-shared-components-zero-shell-deps --self-test ──");
    selfTest();
  } else {
    main();
  }
}
