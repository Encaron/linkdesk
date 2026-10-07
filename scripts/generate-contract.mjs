#!/usr/bin/env node
/**
 * E5.8#19 契约生成器——Route C：契约类型文件为源。
 * 三产物（E5.8#19/#22.5 + E6#27）：
 *   ① contracts/linkdesk.d.ts     编译期契约（纯类型打包，`import type { ... } from "linkdesk"`）
 *   ② contracts/runtime-shapes.ts 运行期形状断言（never-throw guard，接收边界 validateWire 查表）
 *   ③ packages/plugin-sdk/dev-host/linkdesk-mock.generated.ts  dev 宿主 mock 树（E6#27 第三产物——
 *      与 ① 同一标注源 linkdesk-api.ts，杜绝 mock/preload 双份漂移；消费方 dev-host/mock.ts Proxy 包装）
 *
 * 产物①从 src/core/api/linkdesk-api.ts 的类型图打包自包含单文件：
 *   1. 收集 linkdesk-api.ts 全部类型导出 + 传递引用的类型声明（interface / type alias / enum）
 *   2. 按依赖序（deps-first）内联成单文件——零 @src 引用、零运行时值导出
 *   3. ambient 收口 window.linkdesk（declare global）→ 第三方拷一个文件进项目即得完整类型
 *
 * 产物②从 electron/ipc/runtime-dto-registry.ts（通道→DTO 注册表）+ 同契约类型图发射断言函数：
 *   - 每注册 DTO → assert<Name>(v): string[]（空数组 = 形状正确）+ chk<Name> 递归校验函数
 *   - validateWire(channel, payload): string[] | null（未注册通道返回 null = 无断言）
 *   - never-throw：输入任意垃圾值也只返回错误串，绝不抛异常（生产安全的核心）
 *
 * 设计依据：docs/02-Electron架构/归一化基建/契约生成/03-契约生成设计.md §4
 *           docs/02-Electron架构/归一化基建/契约生成/04-运行期校验设计.md §3-4
 * 不做语法发明——只做「把接口树打包成可拷走的一份」+「把类型图发射成形状断言」。
 *
 * 用法：
 *   node scripts/generate-contract.mjs           # 重新生成三产物
 *   node scripts/generate-contract.mjs --check   # 与磁盘比对（三产物，不一致退出码 1）——#21/#27d 门禁
 *
 * ⚠️ 产物①出口**剥工单编号**（`AI#63`，2026-09-29 用户拍板）：`.d.ts` 的读者是外部工程的 AI 与
 *    第三方插件作者，他们手里没有本仓台账——`E5.7#63.5`/`AI#38.2` 只是噪声。源注释**不动**（仓内追溯
 *    靠它 + git blame），只洗产物。实现见 `scripts/lib/strip-work-item-ids.mjs`；校验腿
 *    `scripts/check-manual-surface.mjs`（规则①）。
 *
 *   node scripts/generate-contract.mjs --self-test   # 判据自测（真变异：产物差一字符/缺失/EOL 三条负控）
 */
import ts from "typescript";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripWorkItemIds } from "./lib/strip-work-item-ids.mjs";
import { buildRuntimeShapes } from "./generate-contract/runtime-shapes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ENTRY = resolve(root, 'src/core/api/linkdesk-api.ts');
const SRC_ROOT = resolve(root, 'src');
const OUT_FILE = resolve(root, 'contracts/linkdesk.d.ts');
const OUT_RUNTIME = resolve(root, 'contracts/runtime-shapes.ts');
const OUT_MOCK = resolve(root, 'packages/plugin-sdk/dev-host/linkdesk-mock.generated.ts');
const REGISTRY_FILE = resolve(root, 'electron/ipc/runtime-dto-registry.ts');
const CHANNELS_FILE = resolve(root, 'electron/ipc/channels.ts');
const CHECK = process.argv.includes('--check');
// 2026-09-06 拆焊（反向 E5.8#22.6 版本联动）：@linkdesk/contracts 版本轴独立于壳——软件升级（用户轴）
// ≠ 契约升级（作者轴）。内容检测不撤：d.ts/runtime-shapes 仍照常从 src 逐字节生成比对（过期即红）；
// 但 contracts/package.json 的 version 改由发布者手工维护（对齐 npm 货架节奏），生成器不再读壳版本、
// 不再自动改写包版本号。判据见 memory [[version-axes-separated]]。

/** 三产物名册（`name` = 报错里给人看的文件名；`key` = buildAll() 返回值里的字段名） */
const OUTS = [
  { name: "linkdesk.d.ts", file: OUT_FILE, key: "content" },
  { name: "runtime-shapes.ts", file: OUT_RUNTIME, key: "runtimeContent" },
  { name: "linkdesk-mock.generated.ts", file: OUT_MOCK, key: "mockContent" },
];
/** 名册 × buildAll() 结果 ⇒ driftOf 的 specs（`--check` 与 `--self-test` 同一份映射） */
export const built_specs = (built) => OUTS.map((s) => ({ name: s.name, file: s.file, built: built[s.key] }));
const readOrNull = (f) => (existsSync(f) ? readFileSync(f, "utf8") : null);

/**
 * 比对前归一行尾（2026-09-11 修假红）：仓内 `core.autocrlf=true` 且无 .gitattributes——
 * 生成器 writeFileSync 落 **LF**，检出到 Windows 工作区是 **CRLF** ⇒ 裸串比对必然不等 ⇒
 * **干净检出恒红**（三产物与 HEAD blob 逐字节相同、git diff 空，只因 CRLF 就全报「过期或缺失」）。
 * 恒红的门禁不是门禁——它会把「真过期」淹在假红里（memory [[snapshot-shadows-truth-bug-class]]）。
 * 只归一 **行尾**，内容漂移照常红。
 */
export const normEol = (s) => (s === null ? null : s.replace(/\r\n/g, "\n"));

/**
 * 三产物漂移检测——**一把尺子**：`--check` 与 `--self-test` 共用本函数（不是抄两遍）。
 * `specs` = [{name, file, built}]；`readFile` 读盘（不存在给 null）。返回**漂移的那几件**。
 */
export function driftOf(specs, readFile) {
  return specs.filter((s) => normEol(readFile(s.file) ?? null) !== normEol(s.built));
}

export function buildMockContent({ checker, program }) {
  const LOGCALL = "console.info";
  // 个性化默认值 override：dotted path → TS 返回表达式（需要时在此追加，如 "path.join": '""'）
  const OVERRIDE_RET = {
    // E6#73f（S6）：notifications.show 契约 = Promise<NotificationHandle>（**非可选**，一律返回句柄）。
    // 中性默认对「返回对象」的 Promise 是**不 return**（resolve undefined）⇒ dev 宿主里插件写
    // `(await show(m)).update(...)` 直接崩 Cannot read properties of undefined。给个空操作句柄，
    // 与「不崩 + 可感知」策略一致（真行为走 linkdesk-plugin-sdk dev --real）。
    "notifications.show": "{ update: async () => {}, finish: async () => {}, cancel: async () => {} }",
  };

  // LinkDeskAPI 交集根类型（本文件 top 收集阶段未持有类型变量，这里现取）
  const apiSf = program.getSourceFile(ENTRY);
  const apiModule = checker.getSymbolAtLocation(apiSf);
  const apiSym = checker.getExportsOfModule(apiModule).find((e) => e.name === 'LinkDeskAPI');
  const rootType = apiSym.declarations
    ? checker.getDeclaredTypeOfSymbol(apiSym)
    : checker.getDeclaredTypeOfSymbol(checker.getAliasedSymbol(apiSym));

  const stripOpt = (t) => {
    if (t.isUnion()) {
      const m = t.types.filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
      if (m.length === 1) return m[0];
    }
    return t;
  };
  const isPromiseRet = (t) =>
    (t.symbol?.name === 'Promise' || t.aliasSymbol?.name === 'Promise') &&
    Array.isArray(t.typeArguments) && t.typeArguments.length === 1;
  /** 中性默认返回表达式（返回 undefined 的用 null——方法体不写 return） */
  const neutralExpr = (t) => {
    if (checker.isArrayType(t) || checker.isTupleType(t)) return '[]';
    if (t.flags & ts.TypeFlags.String) return '""';
    if (t.flags & ts.TypeFlags.Boolean) return 'false';
    if (t.flags & ts.TypeFlags.Number) return '0';
    if (t.flags & ts.TypeFlags.Null) return 'null';
    return null;
  };
  /** 由返回类型定 mock 行为（async 与否 + 返回表达式） */
  const bucketOf = (ret) => {
    if (isPromiseRet(ret)) return { async: true, ret: neutralExpr(ret.typeArguments[0]) };
    if (ret.flags & ts.TypeFlags.Void) return { async: false, ret: null };
    if (checker.getSignaturesOfType(ret, ts.SignatureKind.Call).length) return { async: false, ret: '() => {}' };
    return { async: false, ret: neutralExpr(ret) };
  };

  const lines = [];
  const emitNs = (type, dotted, indent) => {
    for (const p of checker.getPropertiesOfType(type)) {
      const name = p.name;
      const sub = dotted ? `${dotted}.${name}` : name;
      let pt = checker.getTypeOfSymbol(p);
      pt = stripOpt(pt);
      const sigs = checker.getSignaturesOfType(pt, ts.SignatureKind.Call);
      if (sigs.length > 0) {
        // 方法叶子——单行发射（日志 + 按返回类别的默认体）
        const b = bucketOf(sigs[0].getReturnType());
        const ov = Object.prototype.hasOwnProperty.call(OVERRIDE_RET, sub) ? OVERRIDE_RET[sub] : undefined;
        const retExpr = ov !== undefined ? ov : b.ret;
        const msg = JSON.stringify(`[linkdesk-mock] ${sub}`);
        lines.push(
          `${indent}${name}: ${b.async ? 'async ' : ''}(..._args: unknown[]) => ` +
            `{ ${LOGCALL}(${msg}, ..._args);${retExpr ? ` return ${retExpr};` : ''} },`,
        );
      } else {
        const isObj =
          (pt.flags & ts.TypeFlags.Object) !== 0 &&
          !checker.isArrayType(pt) && !checker.isTupleType(pt) && !pt.isUnion();
        if (isObj) {
          lines.push(`${indent}${name}: {`);
          emitNs(pt, sub, indent + '  ');
          lines.push(`${indent}},`);
        } else {
          // 非对象非函数的纯值属性（经 strip 后应不存在）——undefined 兜底
          lines.push(`${indent}${name}: undefined,`);
        }
      }
    }
  };
  emitNs(rootType, '', '  ');

  const banner = `/**
 * 🔥 linkdesk-mock.generated.ts—dev-host window.linkdesk mock tree (auto-generated, do not edit by hand)
 *
 * Generated from: src/core/api/linkdesk-api.ts + linkdesk-api/ (LinkDeskAPI intersection—same annotation source as linkdesk.d.ts)
 * Generator: scripts/generate-contract.mjs (E6#27 third artifact—prevents mock/preload drift; consumed by dev-host/mock.ts via a Proxy)
 * After changing a contract source, run \`node scripts/generate-contract.mjs\` (contracts:check enforces all three artifacts byte-for-byte)
 *
 * Consumer: packages/plugin-sdk/dev-host/mock.ts—injectDevMockApi() wraps this tree in a Proxy:
 *   in-tree methods = type-driven neutral defaults + a [linkdesk-mock] log line per call (mock vs real IPC is perceivable);
 *   out-of-tree paths (method names absent from the contract) = the Proxy throws "not in the linkdesk API contract".
 * Default-value strategy ("never crash + stay perceivable"; see the local-preview-environment design doc §10.2):
 *   Promise<void/…data object> → async returns undefined; Promise<array> → []; Promise<string/boolean> → ""/false;
 *   void → noop (registerCommand etc. are called by every plugin—never throw); unsubscribe handles (onChange etc.) → noop function;
 *   other sync returns → ""/undefined. Real data/behavior goes through real IPC / linkdesk-plugin-sdk dev --real (E6#28.5).
 */
export const linkdeskMock: Record<string, unknown> = {`;

  const tail = `};
`;
  return [banner, ...lines, tail]
    .join('\n')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

/**
 * 造 TS program ＋ 三产物内容（**唯一入口**：`--check`/`--self-test`/写盘都走它，
 * 保证「判据跑的东西」与「写下去的东西」是同一段代码）。
 * ⚠️ 原来这些是模块级常量（import 即执行，`--self-test` 时还会把三产物写下去）——收进函数是为了让
 *    自测能**再算一遍**，且 `--self-test` 不再有写盘副作用。
 * 🔴 **函数体刻意不缩进**：`banner` / `ambient` 是**模板串**（内容就是产物原文）——
 *    缩进会把它们的内容一起改掉，而三产物必须**逐字节不变**（`--check` 三件对账）。
 *    宁可排版朴素，也不许动产物一个字节。
 */
export function buildAll() {
const program = ts.createProgram([ENTRY, REGISTRY_FILE, CHANNELS_FILE], {
  target: ts.ScriptTarget.ES2020,
  lib: ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ removeComments: false });

// ── 2. 类型图收集（post-order DFS：依赖先于使用者，天然 deps-first）──────

const isTypeDecl = (d) =>
  ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isEnumDeclaration(d);

/** 别名符号（import type 重导出）解包到真实声明 */
function resolveSymbol(sym) {
  if (!sym) return null;
  if (sym.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(sym);
    } catch {
      return sym;
    }
  }
  return sym;
}

/** 收集某类型声明到 order（若尚未收集）；先递归收集其引用的类型 */
function emitType(sym) {
  const real = resolveSymbol(sym);
  const decl = real?.declarations?.find(isTypeDecl);
  if (!decl) return;
  // 只收集工程内 src/ 下的类型声明——lib（Promise/KeyboardEvent/Pick…）与 node_modules 一律跳过（全局可用，无需声明）
  if (!decl.getSourceFile().fileName.replaceAll('\\', '/').startsWith(SRC_ROOT.replaceAll('\\', '/'))) return;
  const key = decl.getSourceFile().fileName + '#' + decl.pos;
  if (orderKey.has(key)) return;
  orderKey.add(key); // 先标记防环（自递归 type alias 如 ManifestMenuItem）
  walkRefs(decl, (refSym) => emitType(refSym));
  order.push(decl);
}

const orderKey = new Set();
const order = [];

/** 遍历类型节点的引用（TypeReference / extends 子句 / typeof 查询），回调查到的符号 */
function walkRefs(node, cb) {
  if (ts.isTypeReferenceNode(node)) {
    const sym = resolveSymbol(checker.getSymbolAtLocation(node.typeName));
    if (sym) cb(sym);
  } else if (ts.isExpressionWithTypeArguments(node)) {
    const sym = resolveSymbol(checker.getSymbolAtLocation(node.expression));
    if (sym) cb(sym);
  } else if (ts.isTypeQueryNode(node)) {
    const sym = resolveSymbol(checker.getSymbolAtLocation(node.exprName));
    if (sym) cb(sym);
  }
  ts.forEachChild(node, (c) => walkRefs(c, cb));
}

// 入口 = linkdesk-api.ts 的全部类型导出（LinkDeskAPI + 13 独立接口 + DialogOpenOptions）
const entrySf = program.getSourceFile(ENTRY);
if (!entrySf) {
  console.error(`[contracts] 找不到入口 ${ENTRY}`);
  process.exit(1);
}
const entryModule = checker.getSymbolAtLocation(entrySf);
const exportedSyms = checker.getExportsOfModule(entryModule);
for (const exp of exportedSyms) {
  const real = resolveSymbol(exp);
  if (real?.declarations?.some(isTypeDecl)) emitType(exp);
}

if (order.length === 0) {
  console.error('[contracts] 未收集到任何类型——检查入口导出');
  process.exit(1);
}

// ── 3. 序列化 ───────────────────────────────────────────────────────────

const blocks = order.map((decl) => {
  // 1. printNode 会把「前一声明尾部的 JSDoc」当 trivia 打进来——先剥掉全部前置注释/空白到声明关键字
  let text = printer
    .printNode(ts.EmitHint.Unspecified, decl, decl.getSourceFile())
    .replace(/^\s*((?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n?)\s*)*/, '');
  // 2. export 判定看语法树真实修饰符（JSDoc 在 export 关键字前不能靠正则）
  const hasExport = ts.getModifiers(decl)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (!hasExport) text = 'export ' + text;
  // 3. 重新挂上真正归属本声明的 JSDoc（getJSDocCommentsAndTags 用 proximity 规则，跨文件同样正确）
  const docs = ts.getJSDocCommentsAndTags(decl);
  if (docs.length) text = `${docs.map((d) => d.getText()).join('\n')}\n${text}`;
  // 4. 生成物里不带 ESLint 抑制注释（源文件的工具噪音）
  text = text
    .split('\n')
    .filter((line) => !line.includes('eslint-disable'))
    .join('\n');
  return text;
});

// ── 3.5 类型名唯一性校验（E5.8#20-c）────────────────────────────────────
// 契约平铺进单文件：两个同名类型声明会被 TS 声明合并成幽灵复合型（字段并集、必选性被强并），
// 消费方拿到既不是甲也不是乙的错型——静默错型。源图里不同模块可同名（模块作用域合法），
// 但打进单文件必须全局唯一。命中 = 契约产物缺陷，直接失败（防未来加类型再踩坑）。
const nameCount = new Map();
for (const d of order) {
  const n = d.name?.text; // interface / type alias / enum 都有 .name
  if (!n) continue;
  nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
}
const dups = [...nameCount.entries()].filter(([, c]) => c > 1);
if (dups.length > 0) {
  console.error(
    `[contracts] ✗ 契约类型名冲突（平铺单文件要求源类型全局唯一）：${dups.map(([n, c]) => `${n}×${c}`).join(', ')}`,
  );
  console.error('   同名声明会合并成幽灵复合型——请给其中一处改唯一名（如池线 Pool 前缀 / 按钮型 Btn 后缀）');
  process.exit(1);
}

const banner = `/**
 * 🔥 linkdesk.d.ts—the window.linkdesk plugin API contract (auto-generated, do not edit by hand)
 *
 * Generated from: src/core/api/linkdesk-api.ts + linkdesk-api/ (15 domain interfaces + types.ts)
 *                 + src/core/types/ipc/* + src/core/types/pool/* (wire payload types)
 * Generator: scripts/generate-contract.mjs (Route C—contract type files are the source, pure-type bundling)
 * After changing a contract source, run \`node scripts/generate-contract.mjs\` (enforced by check-contracts in npm run check)
 *
 * Usage (third-party plugin authors):
 *   Copy this file into your project + reference it from tsconfig, or \`npm i -D @linkdesk/contracts\` (#22.6)
 *   import type { PluginListEntry } from "linkdesk";
 *   window.linkdesk.filesystem.readFile(...)   // ambient types work directly
 */
`;

const ambient = `declare global {
  interface Window {
    /** Plugin API—modeled after the VS Code vscode namespace (injected by preload-pool.ts / preload-shell.ts) */
    linkdesk: LinkDeskAPI;
  }
}

export {};`;

// 行尾空白归一化——TS printer 偶发 `, ` 逗号换行残留，git diff --cached --check 无豁免通道必须归零。
// 先 CRLF→LF（源文件 Windows 行尾会经 trivia 进入产物），再剥行尾 [ \t]。
const rawContent = [banner, '// ── Contract types ──', ...blocks, '', ambient, ''].join('\n');
// 工单编号不进产物（AI#63）——**先剥编号、再归行尾**（剥完可能留缝上空白，让同一步收走）
const content = stripWorkItemIds(rawContent)
  .text.replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.replace(/[ \t]+$/, ''))
  .join('\n');

// ── 4. 运行期形状断言产物（E5.8#22.5）────────────────────────────────────
// 从注册表（通道→DTO 类型名）发射形状断言：每注册类型 → assert<Name>(v): string[] +
// chk<Name> 递归校验函数；validateWire(channel, payload) 查表。never-throw + 确定性输出。


  const runtimeContent = buildRuntimeShapes({ program, checker, isTypeDecl, resolveSymbol, SRC_ROOT, REGISTRY_FILE, CHANNELS_FILE });
  const mockContent = buildMockContent({ checker, program });
  return { blocks, content, runtimeContent, mockContent };
}

/* ════════════════════════════════════════════════════════════════════════
   5. 写盘 / 比对（三产物——版本号独立，见文件头拆焊注）
   ════════════════════════════════════════════════════════════════════════ */

async function main() {
  if (process.argv.includes("--self-test")) {
    const { selfTest } = await import("./generate-contract/selftest.mjs");
    process.exit(selfTest({ buildAll, driftOf, OUTS }));
  }

  const built = buildAll();
  const { blocks, content, runtimeContent, mockContent } = built;

  if (CHECK) {
    const bad = new Set(driftOf(built_specs(built), readOrNull).map((s) => s.name));
    for (const s of OUTS) {
      if (bad.has(s.name)) {
        console.error(`[contracts] ✗ ${s.name} 过期或缺失——请运行 node scripts/generate-contract.mjs`);
      } else {
        console.log(`[contracts] ✓ ${s.name} 最新`);
      }
    }
    // 2026-09-06 拆焊：contracts 版本不再与壳比对——版本轴独立，货架节奏由 check-npm-release 黄灯闸盯。
    // 内容检测（上方三产物逐字节比对）不撤——内容过期仍红。
    process.exit(bad.size ? 1 : 0);
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  mkdirSync(dirname(OUT_MOCK), { recursive: true });
  writeFileSync(OUT_FILE, content, "utf8");
  writeFileSync(OUT_RUNTIME, runtimeContent, "utf8");
  writeFileSync(OUT_MOCK, mockContent, "utf8");
  console.log(`[contracts] 已生成 ${OUT_FILE}（${blocks.length} 个类型声明，${content.length} 字符）`);
  const helperCount = (runtimeContent.match(/^function chk/gm) || []).length;
  console.log(`[contracts] 已生成 ${OUT_RUNTIME}（${helperCount} 个校验函数，${runtimeContent.length} 字符）`);
  const mockMethodCount = (mockContent.match(/\(\.\.\._args: unknown\[\]\) =>/g) || []).length;
  console.log(`[contracts] 已生成 ${OUT_MOCK}（${mockMethodCount} 个方法桩，${mockContent.length} 字符）`);
  console.log("[contracts] @linkdesk/contracts 版本轴独立——version 由发布者手工维护（2026-09-06 拆焊，不随壳动）");
}

main();
