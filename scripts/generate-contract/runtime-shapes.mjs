import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";

/**
 * ② 运行期形状断言产物（`contracts/runtime-shapes.ts`）的生成逻辑。
 * ⚠️ 由 `../generate-contract.mjs` 拆出（E6#0.6d 第一刀 · feature-folder）——发射逻辑一字未改，
 * 只把「TS program / checker / 共用的小工具 / 几个路径」改成**参数传入**（原来是同文件模块级常量）；
 * `inSrc` / `collectIpcValues` / `evalChannel` 三个模块级私有函数收进 `buildRuntimeShapes` 体内
 * （它们只服务它，且原本就够不着形参）。
 */

export function buildRuntimeShapes({ program, checker, isTypeDecl, resolveSymbol, SRC_ROOT, REGISTRY_FILE, CHANNELS_FILE }) {
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
