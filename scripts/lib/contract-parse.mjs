/**
 * 契约解析——从 `contracts/linkdesk.d.ts` 抽出命名空间清单。
 *
 * ## 为什么单独成一个模块
 *
 * 有两个消费者，且**必须拿到完全一致的答案**：
 *   - `generate-api-cheatsheet.mjs`——生成面向作者的 SDK README 速查表
 *   - `check-namespace-matrix.mjs`——校验手维护的「命名空间矩阵」没漂移
 * 若各自复制一份「哪四种写法算命名空间」的判定，就会出现「一处修了 `?` 形状、另一处没修」的
 * 典型漂移缝。⇒ 判定只写这一份。
 *
 * ## 扫描形状（d.ts 顶层命名空间有四种写法，缺一即漏）
 *
 *   1. `    name: { ... }`               —— 绝大多数（块式）
 *   2. `    name?: { ... }`              —— 可选面 `bridge`（真壳独有）/ `hotExit`（池侧独有）
 *   3. `    name: XxxAPI["yyy"];`        —— 类型引用别名 `config` = `configuration`（@deprecated）
 *   4. `    name: (a) => b;`             —— 函数属性 `getFilePath`（webUtils 直取，无子方法）
 *
 * 方法 = 块式命名空间内 8 空格缩进的成员；`_` 前缀为内部面，不面向作者，剔除。
 *
 * ## 两个判定坑（都踩过，都有实测）
 *
 * - **多行签名的续行也是 8 空格**（`registerCommand(commandId: string,` 的下一行 `handler: (…)`）——
 *   只认缩进会把参数名 `handler` 收成方法。⇒ 必须靠**括号深度归零**判定新成员。
 * - **`?` 成员不能漏**：`syncToMainProcess?(…)` / `readdir?(…)` / `notifyManifestChanged?(…)` 等 22 个
 *   带 `?`，早期正则 `(\w+)\s*[(<:]` 卡在 `?` 上，静默少登 22 个方法。
 *   ⇒ 必须覆盖，且**标注**而不是剔除（剔除 = 又一次静默遗漏）——契约标 `?` 的语义是「只在一侧注入」。
 *
 * ## 独立验证（不是自证）
 *
 * 本模块用正则解析；**正确性由 TypeScript 编译器 AST 独立对照过**（`ts.createSourceFile` 走真实语法树，
 * 与正则是两套完全不同的机制）：14 接口 / 45 命名空间 / 242 方法，逐命名空间方法名集合一致。
 * 改动本文件的解析逻辑后，请重跑该对照——自己验自己等于没验。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "../..");
export const DTS = "contracts/linkdesk.d.ts";

/**
 * 剥掉一行里的注释，返回纯代码部分（供缩进/括号判定）。
 * 块注释跨行，`state.inBlock` 在调用之间保持。
 *
 * ⚠️ 前提：d.ts 里字符串字面量不含 `//` 或 `/*`（生成的类型声明文件里没有这种内容）。
 */
function stripComment(line, state) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf("*/", i);
      if (end === -1) return out;
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    if (line.startsWith("//", i)) break;
    if (line.startsWith("/*", i)) {
      state.inBlock = true;
      i += 2;
      continue;
    }
    out += line[i];
    i++;
  }
  return out;
}

/** 一行的括号净深度增量（`<` `>` 不计——泛型参数不改变结构层级）。 */
function depthDelta(code) {
  let d = 0;
  for (const ch of code) {
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d--;
  }
  return d;
}

/** 从 JSDoc 块取首行正文（多行注释时跳过孤零零的 `/**`）。 */
function firstDocLine(buf) {
  for (const raw of buf) {
    const text = raw
      .replace(/^\s*\/\*\*/, "")
      .replace(/\*\/\s*$/, "")
      .replace(/^\s*\*\s?/, "")
      .replace(/\s*\*\s*$/, "")
      .trim();
    if (text) return text;
  }
  return "";
}

/**
 * 解析契约，产出命名空间清单。
 * @returns {{interfaces: string[], namespaces: Map<string, {
 *   iface: string, methods: string[], optionalMethods?: string[], doc: string,
 *   optional: boolean, signature: string|null, aliasOf?: string
 * }>}}
 */
export function parseContract() {
  const lines = readFileSync(resolve(ROOT, DTS), "utf-8").split(/\r?\n/);
  const namespaces = new Map();
  const interfaces = [];
  const state = { inBlock: false };
  let iface = null;
  let ns = null; // 当前块式命名空间名
  let depth = 0; // 当前命名空间成员层级内的括号深度
  let docBuf = []; // 紧邻上方累积的注释行

  for (const raw of lines) {
    const inCommentAtStart = state.inBlock;
    const code = stripComment(raw, state);
    const isCommentLine = inCommentAtStart || /^\s*(\/\*|\*|\/\/)/.test(raw);
    if (isCommentLine) {
      docBuf.push(raw);
      continue;
    }

    const ifaceMatch = /^export interface (\w+API) \{/.exec(code);
    if (ifaceMatch) {
      iface = ifaceMatch[1];
      interfaces.push(iface);
      ns = null;
      depth = 0;
      docBuf = [];
      continue;
    }
    if (/^\}/.test(code)) {
      iface = null;
      ns = null;
      depth = 0;
      docBuf = [];
      continue;
    }
    if (!iface || code.trim() === "") {
      docBuf = [];
      continue;
    }

    if (ns === null) {
      // 顶层命名空间：块式 `name: {` / `name?: {`
      const block = /^ {4}(\w+)(\?)?: \{$/.exec(code);
      if (block) {
        namespaces.set(block[1], {
          iface,
          methods: [],
          optionalMethods: [],
          doc: firstDocLine(docBuf),
          optional: Boolean(block[2]),
          signature: null,
        });
        ns = block[1];
        depth = 0;
        docBuf = [];
        continue;
      }
      // 顶层命名空间：类型引用别名 `name: XxxAPI["yyy"];`（如 config = configuration）
      const alias = /^ {4}(\w+)(\?)?: (\w+API)\["(\w+)"\];$/.exec(code);
      if (alias) {
        namespaces.set(alias[1], {
          iface,
          methods: [],
          doc: firstDocLine(docBuf),
          optional: Boolean(alias[2]),
          signature: null,
          aliasOf: alias[4],
        });
        docBuf = [];
        continue;
      }
      // 顶层命名空间：函数属性 `name: (...) => ...;`（无子方法，直接调用）
      const fn = /^ {4}(\w+)(\?)?: \(/.exec(code);
      if (fn) {
        namespaces.set(fn[1], {
          iface,
          methods: [],
          doc: firstDocLine(docBuf),
          optional: Boolean(fn[2]),
          signature: code.trim(),
        });
      }
      docBuf = [];
      continue;
    }

    // 命名空间内部：深度归零的行才是成员声明
    if (depth === 0) {
      if (/^ {4}\};?$/.test(code)) {
        ns = null;
        docBuf = [];
        continue;
      }
      // 成员名允许 `?`（`syncToMainProcess?(…)`）——契约标 `?` = 仅一侧 preload 注入
      const member = /^ {8}(\w+)(\?)?\s*[(<:]/.exec(code);
      if (member && !member[1].startsWith("_")) {
        const entry = namespaces.get(ns);
        if (!entry.methods.includes(member[1])) {
          entry.methods.push(member[1]); // 去重：overload 只登一次
          if (member[2]) entry.optionalMethods.push(member[1]);
        }
      }
    }
    depth += depthDelta(code);
    docBuf = [];
  }

  // 剔除内部命名空间
  for (const key of [...namespaces.keys()]) {
    if (key.startsWith("_")) namespaces.delete(key);
  }
  // 别名行继承目标命名空间的方法面（config = configuration）——方法数不能显示成 0
  for (const [, v] of namespaces) {
    if (!v.aliasOf) continue;
    const target = namespaces.get(v.aliasOf);
    if (target) v.methods = [...target.methods];
  }
  return { namespaces, interfaces };
}
