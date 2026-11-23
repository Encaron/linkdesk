#!/usr/bin/env node
/**
 * 机械审计：**同一事实只许一处推导**（P1 spec §3.8「头像教训」· 红灯）。
 *
 * 历史证据（marketplace 自己的账）：`eb0513f`（1.4.5「头像三处统一取源」）、`817ec72`（1.4.6
 * 「三处身份同源」）——同一事实多个推导点，改一处另两处不动。根因不是漏改，是**结构上允许**。
 *
 * 本审计盯四类「事实函数」的定义点（`function X(` / `const X =` / `export … X(`）：
 *   · `pickIdentityArt`  —— 插件身份图唯一来源，只许住 `src/components/shared/plugin-icon/iconUtils.ts`
 *   · `sourceLabel`      —— 来源显示名唯一来源，只许住 `src/core/services/plugins/install/trust.ts`
 *   · `authorLabel`      —— 作者显示名（插件侧事实；壳内**零定义**，出现即第二推导点）
 *   · `repoHomeUrl`      —— 来源仓库主页（同上，壳内零定义）
 *
 * 为什么只查「定义点」不查「调用点」：调用共享件是目的，禁止的是**再造一份**。
 * 白名单按「文件」登记（`ALLOWED` 表），新增白名单必须写理由——名单本身不许腐烂。
 *
 * 用法：node scripts/audit-duplicate-facts.mjs            # 已挂 npm run check
 *       node scripts/audit-duplicate-facts.mjs --self-test
 * 退出码 0 = 无第二推导点；1 = 有（文件:行 + 该事实的唯一归属打到 stderr）。
 */

import { readdirSync, readFileSync, statSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 事实 → 唯一允许的定义文件（相对仓库根） */
export const FACT_OWNERS = {
  pickIdentityArt: "src/components/shared/plugin-icon/iconUtils.ts",
  sourceLabel: "src/core/services/plugins/install/trust.ts",
  /** 插件侧事实——壳内零定义 */
  authorLabel: null,
  repoHomeUrl: null,
};

const SCAN_ROOT = "src";
const CODE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".vite"]);

/** 定义点识别——`function X(` / `const X =` / `export function X(` / `export const X =`（排除调用/引用） */
function definitionPattern(name) {
  return new RegExp(`(?:^|[^\\w.])function\\s+${name}\\s*\\(|(?:^|[^\\w.])const\\s+${name}\\s*[=:]`, "m");
}

/**
 * 纯函数：扫一个根，返回违规列表 [{rel, line, fact, owner}]。
 * @param {string} absRoot 仓库根
 * @param {Record<string,string|null>} owners 事实 → 唯一归属文件
 * @param {string} scanRoot 相对扫描根
 */
export function scanDuplicateFacts(absRoot, owners, scanRoot = SCAN_ROOT) {
  const violations = [];
  const patterns = Object.fromEntries(Object.keys(owners).map((k) => [k, definitionPattern(k)]));

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(abs);
        continue;
      }
      if (!CODE_EXT.test(name)) continue;
      const rel = relative(absRoot, abs).split(sep).join("/");
      if (/\.test\.(ts|tsx)$/.test(name)) continue; // 测试造桩不算定义源

      let src;
      try {
        src = readFileSync(abs, "utf-8");
      } catch {
        continue;
      }
      for (const [fact, re] of Object.entries(patterns)) {
        if (!re.test(src)) continue;
        const owner = owners[fact];
        if (owner === rel) continue; // 唯一合法归属
        const line = src.slice(0, src.search(re)).split("\n").length;
        violations.push({ rel, line, fact, owner });
      }
    }
  };
  walk(resolve(absRoot, scanRoot));
  return violations;
}

function selfTest() {
  const cases = [];
  const fixtures = mkdtempSync(join(tmpdir(), "ldk-dup-facts-"));
  try {
    const mk = (files) => {
      const dir = mkdtempSync(join(fixtures, "case-"));
      for (const [name, body] of Object.entries(files)) {
        const abs = join(dir, name);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, body);
      }
      return dir;
    };
    const owners = {
      pickIdentityArt: "src/a/owner.ts",
      sourceLabel: null,
    };

    let d = mk({ "src/a/owner.ts": "export function pickIdentityArt() { return 1; }\n" });
    cases.push(["唯一归属处定义 → 绿", scanDuplicateFacts(d, owners).length === 0]);

    d = mk({
      "src/a/owner.ts": "export function pickIdentityArt() { return 1; }\n",
      "src/b/copy.ts": "export function pickIdentityArt() { return 2; }\n",
    });
    let v = scanDuplicateFacts(d, owners);
    cases.push(["第二处定义 → 红", v.length === 1 && v[0].fact === "pickIdentityArt" && v[0].rel === "src/b/copy.ts"]);

    d = mk({ "src/b/use.ts": "const x = pickIdentityArt(p);\n" });
    cases.push(["只调用不定义 → 绿", scanDuplicateFacts(d, owners).length === 0]);

    d = mk({ "src/b/const-copy.ts": "const pickIdentityArt = (p) => p.icon;\n" });
    cases.push(["const 箭头定义 → 红", scanDuplicateFacts(d, owners).length === 1]);

    d = mk({ "src/c/x.ts": "function sourceLabel(s) { return s.id; }\n" });
    v = scanDuplicateFacts(d, owners);
    cases.push(["归属为 null 的事实任何定义都红", v.length === 1 && v[0].fact === "sourceLabel"]);

    d = mk({ "src/d/thing.test.ts": "function sourceLabel() { return 1; }\n" });
    cases.push(["测试桩不算 → 绿", scanDuplicateFacts(d, owners).length === 0]);

    d = mk({ "src/e/deep/nested/x.ts": "export const sourceLabel = (s) => s.id;\n" });
    cases.push(["深层嵌套也扫到", scanDuplicateFacts(d, owners).length === 1]);
  } finally {
    rmSync(fixtures, { recursive: true, force: true });
  }

  const failed = cases.filter(([, ok]) => !ok);
  for (const [name, ok] of cases) console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (failed.length > 0) {
    console.error(`\n自测失败：${failed.length}/${cases.length}`);
    process.exit(1);
  }
  console.log(`\n自测通过：${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const violations = scanDuplicateFacts(ROOT, FACT_OWNERS);
  if (violations.length === 0) {
    console.log("✅ 事实函数无第二推导点（pickIdentityArt / sourceLabel / authorLabel / repoHomeUrl）");
    return;
  }
  console.error(`❌ 发现第二推导点 ${violations.length} 处：`);
  for (const v of violations) {
    const owner = v.owner ? `唯一归属 = ${v.owner}` : "壳内零定义（该事实属插件侧）";
    console.error(`  · ${v.rel}:${v.line} 定义了 ${v.fact}（${owner}）→ 改用唯一实现，⛔ 不要复制`);
  }
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
