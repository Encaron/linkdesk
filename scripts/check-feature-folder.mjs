#!/usr/bin/env node
/**
 * 机械检查：**功能域禁止平铺**（P1 D9 拍板 2026-11-24 · 红灯）。
 *
 * 判据（两条，都在 `src/core/services/**` 下，不擅自扩范围——扩范围是设计决策不是实现细节）：
 *   ① **新功能域必须是「同名夹 + 门面 index.ts」**：`services/` 直接子目录里，除基线例外，
 *      每个夹必须含 `index.ts` —— 外部只许 import 门面，内部形状随便改；
 *   ② **根级平铺冻结**：`services/<域>/` 根下的 `.ts/.tsx` 文件必须在基线表里。
 *      基线 = 拍板时点的存量（2026-11-24 冻结），⛔ 新增平铺一律红。
 *
 * 为什么需要它（D9 原文）：「现状 `scripts/check-*.mjs` 里**没有**禁止平铺的机械腿……
 * ⛔ 不靠 AI 自觉。」——spec §9.5 的落点表就是靠这条腿守住的。
 *
 * 基线住 `scripts/feature-folder-baseline.json`（入库）：
 *   { "roots": ["src/core/services"],            // 扫描根（相对仓库）
 *     "flatFiles": { "<relPath>": "豁免理由" },   // 根级平铺存量
 *     "foldersWithoutFacade": { "<relPath>": "豁免理由" } }  // 存量夹暂无门面
 * 🔴 基线只许**删行**（某个平铺文件被收进功能夹后删掉它那行），⛔ 不许为了过门禁加行——
 *    加行 = 亲手把「禁止平铺」改成「鼓励平铺」。
 *
 * 用法：node scripts/check-feature-folder.mjs            # 已挂 npm run check
 *       node scripts/check-feature-folder.mjs --self-test
 * 退出码 0 = 合规；1 = 有违规（路径 + 修法打到 stderr）。
 */

import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BASELINE = resolve(ROOT, "scripts/feature-folder-baseline.json");

const CODE_EXT = /\.(ts|tsx)$/;
/** 测试文件不算「平铺模块」——测试与被测件同层是既有规矩（PluginInstallService.test.ts 先例） */
const TEST_FILE = /\.test\.(ts|tsx)$/;

const toRel = (root, abs) => relative(root, abs).split(sep).join("/");

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * 纯函数：扫一个根，返回违规列表。
 * @param {string} absRoot 仓库根（绝对）
 * @param {{roots: string[], flatFiles?: Record<string,string>, foldersWithoutFacade?: Record<string,string>}} baseline
 */
export function scanFeatureFolders(absRoot, baseline) {
  const violations = [];
  const flatFiles = baseline.flatFiles ?? {};
  const noFacade = baseline.foldersWithoutFacade ?? {};

  for (const relRoot of baseline.roots ?? []) {
    const absDomainRoot = resolve(absRoot, relRoot);
    if (!existsSync(absDomainRoot)) continue;

    for (const name of readdirSync(absDomainRoot)) {
      const abs = join(absDomainRoot, name);
      const rel = toRel(absRoot, abs);
      const st = statSync(abs);

      // ② 根级平铺：.ts/.tsx 文件（测试除外）必须在基线里
      if (st.isFile() && CODE_EXT.test(name) && !TEST_FILE.test(name)) {
        if (!(rel in flatFiles)) {
          violations.push({
            rel,
            kind: "flat-file",
            fix: `把 ${name} 收进同名功能夹（含 index.ts 门面），或——若确属跨域共享——登记进 scripts/feature-folder-baseline.json 并写明理由`,
          });
        }
        continue;
      }

      // ① 功能域夹必须有门面 index.ts（基线例外放行）
      if (st.isDirectory()) {
        if (rel in noFacade) continue;
        const hasFacade = existsSync(join(abs, "index.ts")) || existsSync(join(abs, "index.tsx"));
        if (!hasFacade) {
          violations.push({
            rel,
            kind: "missing-facade",
            fix: `功能夹必须提供门面 index.ts（外部只许 import 门面；⛔ 深引内部模块）`,
          });
        }
        // 门面存在时，内部再出现与夹同名的模块 = 又一层平铺，不管
        // （判据只到「有无门面」，再细会开始管实现细节）
      }
    }
  }
  return violations;
}

function selfTest() {
  const cases = [];
  const fixtures = mkdtempSync(join(tmpdir(), "ldk-feature-folder-"));
  try {
    const mk = (files) => {
      const dir = mkdtempSync(join(fixtures, "case-"));
      for (const f of files) {
        const abs = join(dir, f);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, "export {};\n");
      }
      return dir;
    };
    const base = (o = {}) => ({ roots: ["src/core/services"], flatFiles: {}, foldersWithoutFacade: {}, ...o });

    // 1. 合规：夹 + 门面 + 内部模块
    let d = mk(["src/core/services/demo/index.ts", "src/core/services/demo/policy.ts"]);
    cases.push(["夹 + 门面 → 绿", scanFeatureFolders(d, base()).length === 0]);

    // 2. 夹缺门面 → 红
    d = mk(["src/core/services/demo/policy.ts"]);
    let v = scanFeatureFolders(d, base());
    cases.push(["夹缺门面 → 红", v.length === 1 && v[0].kind === "missing-facade"]);

    // 3. 根级平铺未登记 → 红
    d = mk(["src/core/services/loose.ts", "src/core/services/demo/index.ts"]);
    v = scanFeatureFolders(d, base());
    cases.push(["根级平铺 → 红", v.length === 1 && v[0].kind === "flat-file"]);

    // 4. 平铺已登记（存量冻结）→ 绿
    d = mk(["src/core/services/loose.ts", "src/core/services/demo/index.ts"]);
    cases.push([
      "已登记平铺 → 绿",
      scanFeatureFolders(d, base({ flatFiles: { "src/core/services/loose.ts": "存量" } })).length === 0,
    ]);

    // 5. 夹无门面但已登记 → 绿
    d = mk(["src/core/services/legacy/thing.ts"]);
    cases.push([
      "已登记无门面 → 绿",
      scanFeatureFolders(d, base({ foldersWithoutFacade: { "src/core/services/legacy": "存量" } })).length === 0,
    ]);

    // 6. 测试文件不算平铺
    d = mk(["src/core/services/demo/index.ts", "src/core/services/demo/index.test.ts"]);
    cases.push(["测试文件不算平铺", scanFeatureFolders(d, base()).length === 0]);

    // 7. 根不存在 → 绿（CI 局部 checkout 不乱红）
    d = mk([]);
    cases.push(["根不存在 → 绿", scanFeatureFolders(d, { roots: ["src/nope"], flatFiles: {} }).length === 0]);
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
  const baseline = readJson(BASELINE);
  if (!baseline) {
    console.error("❌ 缺基线 scripts/feature-folder-baseline.json（判据本身不许腐烂）");
    process.exit(1);
  }
  const violations = scanFeatureFolders(ROOT, baseline);
  if (violations.length === 0) {
    console.log(`✅ 功能域落位合规（${(baseline.roots ?? []).join(" / ")}）`);
    return;
  }
  console.error(`❌ 功能域落位违规 ${violations.length} 处：`);
  for (const v of violations) {
    console.error(`  · [${v.kind}] ${v.rel}\n    → ${v.fix}`);
  }
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
