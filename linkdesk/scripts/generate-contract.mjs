#!/usr/bin/env node
/**
 * E5.8#19 契约生成器——Route C：契约类型文件为源。
 *
 * 从 src/core/api/linkdesk-api.ts 的类型图打包自包含单文件 contracts/linkdesk.d.ts：
 *   1. 收集 linkdesk-api.ts 全部类型导出 + 传递引用的类型声明（interface / type alias / enum）
 *   2. 按依赖序（deps-first）内联成单文件——零 @src 引用、零运行时值导出
 *   3. ambient 收口 window.linkdesk（declare global）→ 第三方拷一个文件进项目即得完整类型
 *
 * 设计依据：docs/02-Electron架构/E5.8_归一化基建/契约生成/03-契约生成设计.md §4
 * 不做语法发明——只做「把接口树打包成可拷走的一份」。
 *
 * 用法：
 *   node scripts/generate-contract.mjs           # 重新生成 contracts/linkdesk.d.ts
 *   node scripts/generate-contract.mjs --check   # 与磁盘比对（不一致退出码 1）——#21 门禁
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ENTRY = resolve(root, 'src/core/api/linkdesk-api.ts');
const SRC_ROOT = resolve(root, 'src');
const OUT_FILE = resolve(root, 'contracts/linkdesk.d.ts');
const CHECK = process.argv.includes('--check');

// ── 1. Program + checker ────────────────────────────────────────────────

const program = ts.createProgram([ENTRY], {
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

const banner = `/**
 * 🔥 linkdesk.d.ts——window.linkdesk 插件 API 契约（自动生成，勿手改）
 *
 * 生成源：src/core/api/linkdesk-api.ts + linkdesk-api/（10 域接口 + types.ts）
 *         + src/core/types/ipc/* + src/core/types/pool/*（wire 载荷类型）
 * 生成器：scripts/generate-contract.mjs（Route C——契约类型文件为源，纯类型打包）
 * 改契约源 → 跑 \`node scripts/generate-contract.mjs\`（npm run check 里 check-contracts 强制）
 *
 * 用法（第三方插件作者）：
 *   拷贝本文件进项目 + tsconfig 引用，或 \`npm i -D @linkdesk/contracts\`（#22.6）
 *   import type { PluginListEntry } from "linkdesk";
 *   window.linkdesk.filesystem.readFile(...)   // ambient 类型直出
 */
`;

const ambient = `declare global {
  interface Window {
    /** 插件 API——对标 VS Code vscode 命名空间（由 preload-pool.ts / preload-shell.ts 注入） */
    linkdesk: LinkDeskAPI;
  }
}

export {};`;

// 行尾空白归一化——TS printer 偶发 `, ` 逗号换行残留，git diff --cached --check 无豁免通道必须归零。
// 先 CRLF→LF（源文件 Windows 行尾会经 trivia 进入产物），再剥行尾 [ \t]。
const content = [banner, '// ── 契约类型 ──', ...blocks, '', ambient, '']
  .join('\n')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.replace(/[ \t]+$/, ''))
  .join('\n');

// ── 4. 写盘 / 比对 ──────────────────────────────────────────────────────

if (CHECK) {
  const disk = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
  if (disk !== content) {
    console.error('[contracts] ✗ linkdesk.d.ts 过期或缺失——请运行 node scripts/generate-contract.mjs');
    process.exit(1);
  }
  console.log('[contracts] ✓ linkdesk.d.ts 最新');
  process.exit(0);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, content, 'utf8');
console.log(`[contracts] 已生成 ${OUT_FILE}（${blocks.length} 个类型声明，${content.length} 字符）`);
