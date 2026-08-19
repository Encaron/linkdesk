#!/usr/bin/env node
/**
 * E5.8#19 契约生成器——Route C：契约类型文件为源。
 * E5.8#22.5：双产物——
 *   ① contracts/linkdesk.d.ts     编译期契约（纯类型打包，`import type { ... } from "linkdesk"`）
 *   ② contracts/runtime-shapes.ts 运行期形状断言（never-throw guard，接收边界 validateWire 查表）
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
 * 设计依据：docs/02-Electron架构/E5.8_归一化基建/契约生成/03-契约生成设计.md §4
 *           docs/02-Electron架构/E5.8_归一化基建/契约生成/04-运行期校验设计.md §3-4
 * 不做语法发明——只做「把接口树打包成可拷走的一份」+「把类型图发射成形状断言」。
 *
 * 用法：
 *   node scripts/generate-contract.mjs           # 重新生成双产物
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
const OUT_RUNTIME = resolve(root, 'contracts/runtime-shapes.ts');
const REGISTRY_FILE = resolve(root, 'electron/ipc/runtime-dto-registry.ts');
const CHANNELS_FILE = resolve(root, 'electron/ipc/channels.ts');
const CHECK = process.argv.includes('--check');

// ── 1. Program + checker ────────────────────────────────────────────────
// 根文件 = 契约入口 + 运行期注册表 + 通道常量（linkdesk.d.ts 收集不受影响——emitType 只从
// 入口导出遍历且 src/ 过滤；注册表/通道文件仅供产物②解析，产物①内容字节不变）。

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

// ── 4. 运行期形状断言产物（E5.8#22.5）────────────────────────────────────
// 从注册表（通道→DTO 类型名）发射形状断言：每注册类型 → assert<Name>(v): string[] +
// chk<Name> 递归校验函数；validateWire(channel, payload) 查表。never-throw + 确定性输出。

const inSrc = (node) =>
  node.getSourceFile().fileName.replaceAll('\\', '/').startsWith(SRC_ROOT.replaceAll('\\', '/'));

/** channels.ts 的 IPC 常量值求值（AST 对象字面量行走）——通道名字面量单一来源 */
function collectIpcValues(sf) {
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (decl.name?.text !== 'IPC' || !decl.initializer) continue;
      // 解包 `as const` / `satisfies` 包装——channels.ts 的 IPC 是 `export const IPC = {...} as const`
      let init = decl.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      if (!ts.isObjectLiteralExpression(init)) continue;
      const walk = (obj, prefix) => {
        for (const prop of obj.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = prop.name.text ?? prop.name.getText();
          const path = prefix ? `${prefix}.${key}` : key;
          const init = prop.initializer;
          if (ts.isStringLiteral(init)) map.set(path, init.text);
          else if (ts.isObjectLiteralExpression(init)) walk(init, path);
        }
      };
      walk(init, '');
    }
  }
  return map;
}

/** 解析注册表行 channel 表达式（IPC.x.y 链或裸字符串字面量）→ 通道名字面量 */
function evalChannel(expr, ipcMap) {
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const parts = [];
    let cur = expr;
    while (ts.isPropertyAccessExpression(cur)) {
      parts.unshift(cur.name.text);
      cur = cur.expression;
    }
    const key = parts.join('.');
    const v = ipcMap.get(key);
    if (v === undefined) throw new Error(`[runtime-shapes] 无法求值通道 ${key}——channels.ts 无此 IPC 常量`);
    return v;
  }
  throw new Error('[runtime-shapes] 注册表 channel 字段必须是 IPC.x.y 常量引用或字符串字面量');
}

function buildRuntimeShapes() {
  const regSf = program.getSourceFile(REGISTRY_FILE);
  const chSf = program.getSourceFile(CHANNELS_FILE);
  if (!regSf || !chSf) {
    console.error('[runtime-shapes] 找不到注册表/通道文件');
    process.exit(1);
  }
  const ipcMap = collectIpcValues(chSf);

  // 1. 读注册表行（AST：RUNTIME_DTO_REGISTRY 数组字面量）——通道名字面量 + DTO 类型名
  const rows = [];
  for (const stmt of regSf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const decl = stmt.declarationList.declarations[0];
    if (decl.name?.text !== 'RUNTIME_DTO_REGISTRY' || !decl.initializer || !ts.isArrayLiteralExpression(decl.initializer)) continue;
    for (const el of decl.initializer.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      let channelExpr = null;
      let typeName = null;
      for (const prop of el.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.text;
        if (key === 'channel') channelExpr = prop.initializer;
        if (key === 'type' && ts.isStringLiteral(prop.initializer)) typeName = prop.initializer.text;
      }
      if (!channelExpr || !typeName) throw new Error('[runtime-shapes] 注册表行缺 channel/type');
      rows.push({ channel: evalChannel(channelExpr, ipcMap), typeName });
    }
  }
  if (rows.length === 0) {
    console.error('[runtime-shapes] 注册表为空——无通道断言可发射');
    process.exit(1);
  }
  // 注册类型名去重（assert<Name> 函数会撞名）
  const rowNames = new Map();
  for (const r of rows) rowNames.set(r.typeName, (rowNames.get(r.typeName) ?? 0) + 1);
  const rowDups = [...rowNames.entries()].filter(([, c]) => c > 1);
  if (rowDups.length > 0) throw new Error(`[runtime-shapes] 注册类型名重复（assert/chk 会撞名）：${rowDups.map(([n, c]) => `${n}×${c}`).join(', ')}`);

  // 2. 注册表文件 import type 名 → 符号（解析 DTO 类型的唯一入口）
  const nameToSym = new Map();
  for (const stmt of regSf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const nb = stmt.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) {
      const local = (el.propertyName ?? el.name).text;
      const sym = checker.getSymbolAtLocation(el.name);
      if (sym) nameToSym.set(local, sym);
    }
  }

  // 3. 发射器状态（全部确定性——单计数器 + Map 去重 + 源序遍历）
  const helpers = new Map(); // key → fnName
  const helperBodies = [];
  let tempCounter = 0;
  const MAX_INLINE_DEPTH = 24; // 匿名复杂类型递归防爆栈（命名类型走 helper 去环，用不到这么深）

  const mint = () => `_t${tempCounter++}`;
  const indent = (lines, n) => lines.map((l) => '  '.repeat(n) + l);

  const isSimpleAtom = (t) =>
    (t.flags & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean | ts.TypeFlags.BigInt
      | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0
    || (t.flags & ts.TypeFlags.Literal) !== 0;
  const isUnion = (t) => (t.flags & ts.TypeFlags.Union) !== 0;
  const isSimple = (t) => (isUnion(t) ? t.types.every(isSimpleAtom) : isSimpleAtom(t));

  const fmtLit = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  // 嵌入「字符串内容」用的字面量描述——转义内层引号/反斜杠，区别于 fmtLit（TS 代码位置用）
  const escLit = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // 字面量类型的 TS 代码表示——BooleanLiteral 无 value 属性（intrinsicName 区分 true/false），
  // 用 typeToString 兜底；String/Number/BigInt Literal 走 value（fmtLit 处理字符串引号）
  const litCode = (t) =>
    (t.flags & ts.TypeFlags.BooleanLiteral) !== 0 ? checker.typeToString(t) : fmtLit(t.value);
  // 字面量「描述文本」——同上，但字符串内容走 escLit（转义内层引号）
  const litDesc = (t) =>
    (t.flags & ts.TypeFlags.BooleanLiteral) !== 0 ? checker.typeToString(t) : escLit(t.value);

  /** 命名类型信息（src 声明才有名）——命名对象/联合靠它生成 helper 去环 */
  function namedInfo(t) {
    const cand = t.aliasSymbol ?? t.symbol;
    const decl = cand?.declarations?.find(isTypeDecl);
    if (decl && inSrc(decl)) {
      return { name: cand.name, key: decl.getSourceFile().fileName + '#' + decl.pos };
    }
    return null;
  }

  /** 注册类型的声明类型解析——type alias 走类型节点（保 aliasSymbol），interface/enum 走 declared type */
  function resolveDeclaredType(realSym) {
    const decl = realSym.declarations?.find(isTypeDecl);
    if (decl && ts.isTypeAliasDeclaration(decl)) return checker.getTypeFromTypeNode(decl.type);
    return checker.getDeclaredTypeOfSymbol(realSym);
  }

  /** 简单类型 accept 表达式（union 成员用）——Any/Unknown/Never 返回 null（恒真） */
  function acceptExpr(t, expr) {
    if (t.flags & ts.TypeFlags.String) return `typeof ${expr} === "string"`;
    if (t.flags & ts.TypeFlags.Number) return `typeof ${expr} === "number"`;
    if (t.flags & ts.TypeFlags.Boolean) return `typeof ${expr} === "boolean"`;
    if (t.flags & ts.TypeFlags.BigInt) return `typeof ${expr} === "bigint"`;
    if (t.flags & ts.TypeFlags.Null) return `${expr} === null`;
    if (t.flags & ts.TypeFlags.Undefined) return `${expr} === undefined`;
    if (t.flags & ts.TypeFlags.Literal) return `${expr} === ${litCode(t)}`;
    return null;
  }

  /** 简单类型 → 校验行（Any/Unknown/Never 不查，返回空） */
  function simpleLines(t, expr, P, E) {
    const lines = [];
    if (isUnion(t)) {
      const acc = t.types.map((m) => acceptExpr(m, expr)).filter(Boolean);
      if (acc.length === 0) return lines;
      const desc = t.types.map((m) => {
        if (m.flags & ts.TypeFlags.Literal) return litDesc(m);
        if (m.flags & ts.TypeFlags.String) return 'string';
        if (m.flags & ts.TypeFlags.Number) return 'number';
        if (m.flags & ts.TypeFlags.Boolean) return 'boolean';
        if (m.flags & ts.TypeFlags.BigInt) return 'bigint';
        if (m.flags & ts.TypeFlags.Null) return 'null';
        if (m.flags & ts.TypeFlags.Undefined) return 'undefined';
        return '?';
      }).join('|');
      lines.push(`if (!(${acc.join(' || ')})) ${E}.push((${P}) + ": 期望 ${desc}");`);
    } else if (t.flags & ts.TypeFlags.Literal) {
      lines.push(`if (${expr} !== ${litCode(t)}) ${E}.push((${P}) + ": 期望 ${litDesc(t)}");`);
    } else if (t.flags & ts.TypeFlags.Null) {
      lines.push(`if (${expr} !== null) ${E}.push((${P}) + ": 期望 null");`);
    } else if (t.flags & ts.TypeFlags.Undefined) {
      lines.push(`if (${expr} !== undefined) ${E}.push((${P}) + ": 期望 undefined");`);
    } else if (t.flags & ts.TypeFlags.String) {
      lines.push(`if (typeof ${expr} !== "string") ${E}.push((${P}) + ": 期望 string，实收 " + typeof ${expr});`);
    } else if (t.flags & ts.TypeFlags.Number) {
      lines.push(`if (typeof ${expr} !== "number") ${E}.push((${P}) + ": 期望 number，实收 " + typeof ${expr});`);
    } else if (t.flags & ts.TypeFlags.Boolean) {
      lines.push(`if (typeof ${expr} !== "boolean") ${E}.push((${P}) + ": 期望 boolean，实收 " + typeof ${expr});`);
    } else if (t.flags & ts.TypeFlags.BigInt) {
      lines.push(`if (typeof ${expr} !== "bigint") ${E}.push((${P}) + ": 期望 bigint，实收 " + typeof ${expr});`);
    }
    return lines;
  }

  /** 发射 helper 函数体——主体走 emitStructural 结构化内联（不得命中命名短路→自调用）。
   *  嵌套命名引用仍由 emitStructural 内的 emitCheck 走 helper（递归类型靠此去环）。 */
  function emitHelperFn(t, fnName, hint) {
    const body = emitStructural(t, 'v', 'p', 'errs', hint, 0);
    return `function ${fnName}(v: unknown, p: string, errs: string[]): void {\n${indent(body, 1).join('\n')}\n}`;
  }

  /** 确保命名类型有 helper——已发射直接复用（命名递归联合靠此去环） */
  function ensureHelper(t, name, key) {
    const existing = helpers.get(key);
    if (existing) return existing;
    const fnName = `chk${name}`;
    helpers.set(key, fnName);
    helperBodies.push(emitHelperFn(t, fnName, name));
    return fnName;
  }

  /** 对 expr 发射形状校验（写入 E）——返回相对缩进行数组 */
  function emitCheck(t, expr, P, E, hint, depth) {
    if (isSimple(t)) return simpleLines(t, expr, P, E);

    // 命名类型 → helper 调用（去环）
    const named = namedInfo(t);
    if (named) return [`${ensureHelper(t, named.name, named.key)}(${expr}, (${P}), ${E});`];

    return emitStructural(t, expr, P, E, hint, depth);
  }

  /** 字面量判别分表达式——复杂 union 每成员统计「顶层字面量字段匹配数」。
   *  判别联合（如 PoolDialogData = {open:false} | {open:true;...}）排序时先比判别分，
   *  避免缺 message 时误报 {open:false} 成员的 "期望 false"（误导诊断为版本漂移）。
   *  返回数字表达式字符串：非对象 → 0；对象 → 每个命中字面量的字段 +1。 */
  function discrExpr(t, expr) {
    const props = checker.getPropertiesOfType(t);
    if (props.length === 0) return null;
    const terms = [];
    for (const prop of props) {
      const declNode = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!declNode) continue;
      let pt;
      try {
        pt = declNode.type ? checker.getTypeFromTypeNode(declNode.type) : checker.getTypeOfSymbolAtLocation(prop, declNode);
      } catch {
        continue;
      }
      const acc = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prop.name)
        ? `(${expr} as Record<string, unknown>).${prop.name}`
        : `(${expr} as Record<string, unknown>)[${JSON.stringify(prop.name)}]`;
      if (pt.flags & ts.TypeFlags.Literal) {
        terms.push(`(${acc} === ${litCode(pt)} ? 1 : 0)`);
      } else if (isUnion(pt) && pt.types.every((m) => (m.flags & ts.TypeFlags.Literal) !== 0)) {
        // 字面量联合（如 boolean=false|true、align="left"|"right"）——任一命中 +1
        terms.push(`(${pt.types.map((m) => `(${acc} === ${litCode(m)})`).join(' || ')} ? 1 : 0)`);
      }
    }
    if (terms.length === 0) return null;
    const sum = terms.join(' + ');
    return `(${expr} !== null && typeof ${expr} === "object" && !Array.isArray(${expr}) ? (${sum}) : 0)`;
  }

  /** 结构化内联发射（对象/联合/数组/元组）——helper 主体与匿名类型共用 */
  function emitStructural(t, expr, P, E, hint, depth) {
    if (depth > MAX_INLINE_DEPTH) {
      return [`/* 递归匿名类型——深度上限跳过深校验（${hint}） */`];
    }
    const nextDepth = depth + 1;

    // 元组（固定长度数组）——TS 5.9 无 TypeFlags.Tuple，元组 flags=Object，用 checker.isTupleType
    if (checker.isTupleType(t)) {
      const els = t.typeArguments ?? [];
      const lines = [
        `if (!Array.isArray(${expr})) ${E}.push((${P}) + ": 期望数组");`,
        `else {`,
        `  if (${expr}.length !== ${els.length}) ${E}.push((${P}) + ": 期望长度 ${els.length}");`,
      ];
      els.forEach((el, idx) => {
        lines.push(...indent(emitCheck(el, `${expr}[${idx}]`, `(${P}) + "[${idx}]"`, E, `${hint}_${idx}`, nextDepth), 2));
      });
      lines.push(`}`);
      return lines;
    }

    // 数组（逐元素）
    if (checker.isArrayType(t)) {
      const el = checker.getElementTypeOfArrayType(t);
      const i = mint();
      const lines = [
        `if (!Array.isArray(${expr})) ${E}.push((${P}) + ": 期望数组");`,
        `else {`,
        `  for (let ${i} = 0; ${i} < ${expr}.length; ${i}++) {`,
        ...indent(emitCheck(el, `${expr}[${i}]`, `(${P}) + "[" + ${i} + "]"`, E, `${hint}_el`, nextDepth), 3),
        `  }`,
        `}`,
      ];
      return lines;
    }

    // 复杂联合（含对象/数组成员）——逐成员 temp 校验，全部失配报最近似
    if (isUnion(t)) {
      const members = t.types;
      const temps = [];
      const scores = [];
      const lines = [];
      for (let mi = 0; mi < members.length; mi++) {
        const tArr = mint();
        temps.push(tArr);
        lines.push(`const ${tArr}: string[] = [];`);
        lines.push(...indent(emitCheck(members[mi], expr, P, tArr, `${hint}_m${mi}`, nextDepth), 1));
        // 判别分——成员字面量字段匹配数（判别联合选最近似成员优先）
        const se = discrExpr(members[mi], expr);
        const sVar = mint();
        scores.push(sVar);
        lines.push(`const ${sVar} = ${se ?? 0};`);
        if (mi === members.length - 1) {
          // 最后一成员——全部失配则判别分高者优先，分平取错误少者
          const best = mint();
          lines.push(`const ${best} = [${temps.map((t_, i) => `{ e: ${t_}, s: ${scores[i]} }`).join(', ')}].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;`);
          lines.push(`if (${best}.length > 0) ${E}.push(...${best});`);
        } else {
          lines.push(`if (${temps[temps.length - 1]}.length > 0) {`);
        }
      }
      for (let i = 0; i < members.length - 1; i++) lines.push(`}`);
      return lines;
    }

    // 对象（具名属性 + 字符串索引签名）
    const props = checker.getPropertiesOfType(t);
    const idx = checker.getIndexInfoOfType(t, ts.IndexKind.String);
    if (props.length > 0 || idx) {
      const o = mint();
      const lines = [
        `if (${expr} === null || typeof ${expr} !== "object" || Array.isArray(${expr})) ${E}.push((${P}) + ": 期望 object");`,
        `else {`,
        // unknown 收窄后是 object 类型无 index signature——cast Record 使具名属性访问可编译
        `  const ${o} = ${expr} as Record<string, unknown>;`,
      ];
      for (const prop of props) {
        const declNode = prop.valueDeclaration ?? prop.declarations?.[0];
        if (!declNode) continue;
        const name = prop.name;
        const accessor = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
          ? `${o}.${name}`
          : `${o}[${JSON.stringify(name)}]`;
        const propP = `(${P}) + ".${name}"`;
        let propType;
        try {
          propType = declNode.type
            ? checker.getTypeFromTypeNode(declNode.type)
            : checker.getTypeOfSymbolAtLocation(prop, declNode);
        } catch {
          continue;
        }
        const lines2 = emitCheck(propType, accessor, propP, E, `${hint}_${name}`, nextDepth);
        const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0;
        if (optional) {
          lines.push(`  if (${accessor} !== undefined) {`);
          lines.push(...indent(lines2, 1));
          lines.push(`  }`);
        } else {
          lines.push(...indent(lines2, 1));
        }
      }
      if (idx) {
        const k = mint();
        const kLines = emitCheck(idx.type, `${o}[${k}]`, `(${P}) + "[\\"" + ${k} + "\\"]"`, E, `${hint}_idx`, nextDepth);
        if (kLines.length > 0) {
          lines.push(`  for (const ${k} of Object.keys(${o})) {`);
          lines.push(...indent(kLines, 1));
          lines.push(`  }`);
        }
      }
      lines.push(`}`);
      return lines;
    }

    // 其他（函数 / 无法结构化的类型）→ 不查
    return [`/* ${hint}: 无法结构化的类型——跳过校验 */`];
  }

  // 4. 逐注册行发射 assert + validateWire case
  const assertFns = [];
  const channelCases = [];
  for (const row of rows) {
    const importSym = nameToSym.get(row.typeName);
    if (!importSym) throw new Error(`[runtime-shapes] 注册类型 ${row.typeName} 未在本文件 import type 声明`);
    const realSym = resolveSymbol(importSym);
    const t = resolveDeclaredType(realSym);
    const named = namedInfo(t);
    if (!named) throw new Error(`[runtime-shapes] 注册类型 ${row.typeName} 不是 src 声明的命名类型`);
    const helperName = ensureHelper(t, named.name, named.key);
    assertFns.push(`export function assert${row.typeName}(v: unknown): string[] {\n  const errs: string[] = [];\n  ${helperName}(v, "payload", errs);\n  return errs;\n}`);
    channelCases.push(`    case ${JSON.stringify(row.channel)}: return assert${row.typeName}(payload);`);
  }

  const validateWireFn = `/** 通道 → 断言查表——未注册通道返回 null（无断言，安全降级）。never-throw（调用方决定上报） */
export function validateWire(channel: string, payload: unknown): string[] | null {
  switch (channel) {
${channelCases.join('\n')}
    default: return null;
  }
}`;

  const runtimeBanner = `/**
 * 🔥 runtime-shapes.ts——运行期契约形状断言（自动生成，勿手改）
 *
 * 生成源：electron/ipc/runtime-dto-registry.ts（通道→DTO 注册表）
 *         + src/core/types/ipc|pool（DTO 类型）+ electron/ipc/channels.ts（通道名）
 * 生成器：scripts/generate-contract.mjs（E5.8#22.5 第二产物）
 * 改契约源/注册表 → 跑 \`node scripts/generate-contract.mjs\`（npm run check 里 check-contracts 双产物强制）
 *
 * 用途：preload 接收边界对推流载荷做形状断言——"哪条通道拿到异形数据"可查可诊断。
 * 语义：never-throw + log-only（guard 只返回错误串，不抛异常；调用方 wire-guard.ts 决定上报方式）。
 *       未注册通道 validateWire 返回 null。
 */

// ── 类型校验函数（命名类型 helper，递归去环；v=待检值 / p=字段路径 / errs=错误收集）──`;

  return [runtimeBanner, ...helperBodies, '', '// ── 断言函数（注册表每 DTO 一个，返回错误串数组）──', ...assertFns, '', validateWireFn, '']
    .join('\n')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

const runtimeContent = buildRuntimeShapes();

// ── 5. 写盘 / 比对（双产物）─────────────────────────────────────────────

if (CHECK) {
  let fail = false;
  const diskMain = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
  if (diskMain !== content) {
    console.error('[contracts] ✗ linkdesk.d.ts 过期或缺失——请运行 node scripts/generate-contract.mjs');
    fail = true;
  } else {
    console.log('[contracts] ✓ linkdesk.d.ts 最新');
  }
  const diskRuntime = existsSync(OUT_RUNTIME) ? readFileSync(OUT_RUNTIME, 'utf8') : null;
  if (diskRuntime !== runtimeContent) {
    console.error('[contracts] ✗ runtime-shapes.ts 过期或缺失——请运行 node scripts/generate-contract.mjs');
    fail = true;
  } else {
    console.log('[contracts] ✓ runtime-shapes.ts 最新');
  }
  process.exit(fail ? 1 : 0);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, content, 'utf8');
writeFileSync(OUT_RUNTIME, runtimeContent, 'utf8');
console.log(`[contracts] 已生成 ${OUT_FILE}（${blocks.length} 个类型声明，${content.length} 字符）`);
const helperCount = (runtimeContent.match(/^function chk/gm) || []).length;
console.log(`[contracts] 已生成 ${OUT_RUNTIME}（${helperCount} 个校验函数，${runtimeContent.length} 字符）`);
