/**
 * 机械检查：设计流程自身三不变量（audit-design-flow，E5.8#145）。
 *
 * 新能力设计流程 §8.4——「不走不放行」机械层（2026-08-27 用户拍板）。
 * memory/skill 是软层靠自觉（design-flow skill #136），本脚本是硬拦截。三条不变量（全过才绿）：
 *
 *  ① 清单条目 = 指针集：`E5.8-执行清单.md` 中任务号 ≥ #145 的条目必须
 *     ≤ 2 物理行 + 含 ≥1 档案链接 + 单行 ≤ 400 字符——细节沉档案，禁塞清单（§四 4.1 机械化）。
 *  ② 档案链接存在性：#145+ 条目引用的档案路径真实存在于磁盘（相对清单所在目录解析）——防悬空指针。
 *  ③ 新能力文档必带设计前置：git 未提交（??/M/A）的 `docs/02-Electron架构/*.md`
 *     （排除 `*执行清单*` / `README`）含新能力标记（`window.linkdesk.` / `contributes.`）
 *     且无「设计前置」/「非新能力」声明 → 红灯。
 *
 * 存量豁免：#0a-#144 一律跳过（实证 216/323 无档案链接、59 条超 360 字符 = 指针集铁律
 * 在历史清单从未被机械执行）；从 #145 之后严格。新 `app.*` 配置键由 §8.2
 * check-config-baseline.mjs 覆盖，不在此列。
 *
 * L2 调用时拦截（用户拍板「只拦 commit」）：`.claude/settings.json` PreToolUse 钩子
 * 匹配 `Bash(git commit*)` → 本脚本红灯直接 block commit。
 *
 * 用法：node scripts/check-design-flow.mjs（已挂 npm run check）
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // 代码根（package.json 所在：linkdesk/）
const CHECKLIST = "docs/02-Electron架构/E5.8_归一化基建/E5.8-执行清单.md";
const CHECKLIST_DIR = dirname(resolve(ROOT, CHECKLIST));
const DOC_ROOT = "docs/02-Electron架构"; // ③ 扫描根
const MIN_TASK = 145; // 存量豁免：#0a-#144 一律跳过
const MAX_LINES = 2;
const MAX_LINE_CHARS = 400;

/** 任务基号：子任务 #145.1 → 145；#0a/#36k 等历史号 → 前置数字；无数字开头 → 0（视为 <145 豁免，防误伤） */
function taskBase(raw) {
  const n = parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
}

/** 一行是否构成条目边界（结束上一条目）：空行 / 引用 / 标题 / 列表项 / 表格 / 分隔线 */
function isBoundary(line) {
  if (/^\s*$/.test(line)) return true;
  if (/^\s*([>*#-]|\|)/.test(line)) return true;
  if (/^\s*(\*\*\*|---|___)\s*$/.test(line)) return true;
  return false;
}

/** 解析清单全部条目：`- [ ] **E5.8#NNN[.x]** ...` 起（兼容 `~~` 删除线 / `🔒` 暂缓锁 / 历史 `#0d.7-1` 号），边界行止。 */
function parseChecklist() {
  const src = readFileSync(resolve(ROOT, CHECKLIST), "utf-8");
  const entries = [];
  let cur = null;
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[[ xX]\]\s+.*?\*\*(?:E5\.8)?#([0-9a-zA-Z]+(?:[.-][0-9a-zA-Z]+)*)\*\*/);
    if (m) {
      if (cur) entries.push(cur);
      cur = { raw: m[1], base: taskBase(m[1]), lines: [line] };
    } else if (cur) {
      if (isBoundary(line)) {
        entries.push(cur);
        cur = null;
      } else {
        cur.lines.push(line); // 条目续行（指针集 ≤2 行允许）
      }
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

/** 提取档案链接：`[text](target)`——页内锚点 / 外链不计档案链接，去 #片段 查存在性。 */
function extractLinks(text) {
  const out = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    let target = m[1];
    if (/^(#|https?:|mailto:)/.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target.trim()) continue;
    out.push(target);
  }
  return out;
}

/** ① + ②：≥#145 条目指针集 + 档案链接存在性。 */
function checkEntries(entries) {
  const issues = [];
  for (const e of entries) {
    if (e.base < MIN_TASK) continue;
    const links = extractLinks(e.lines.join("\n"));
    if (e.lines.length > MAX_LINES) {
      issues.push(`  E5.8#${e.raw}: 条目 ${e.lines.length} 物理行 > ${MAX_LINES}——指针集必须 ≤ ${MAX_LINES} 行，细节沉档案（§四 4.1）`);
    }
    for (const [i, len] of e.lines.map((l) => l.length).entries()) {
      if (len > MAX_LINE_CHARS) {
        issues.push(`  E5.8#${e.raw}: 第 ${i + 1} 行 ${len} 字符 > ${MAX_LINE_CHARS}——指针集单行上限，细节沉档案（§四 4.1）`);
      }
    }
    if (links.length === 0) {
      issues.push(`  E5.8#${e.raw}: 无档案链接——指针集必须含 ≥1 档案链接（§四 4.1）`);
    }
    for (const link of links) {
      if (!existsSync(resolve(CHECKLIST_DIR, link))) {
        issues.push(`  E5.8#${e.raw}: 档案链接悬空 → \`${link}\`（相对 ${CHECKLIST_DIR} 不存在）`);
      }
    }
  }
  return issues;
}

/** ③ 未提交新能力文档必带设计前置。 */
function checkUncommittedCapabilityDocs() {
  const issues = [];
  let repoRoot;
  let out;
  try {
    repoRoot = execSync("git rev-parse --show-toplevel", { cwd: ROOT, encoding: "utf8" }).trim();
    out = execSync("git status --porcelain -z", { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });
  } catch {
    issues.push("  git status 失败——无法审计未提交新能力文档（§8.4 不变量③）");
    return issues;
  }
  const resolvePath = (p) => {
    const fromRepo = resolve(repoRoot, p); // porcelain -z 给 repo 根相对路径
    return existsSync(fromRepo) ? fromRepo : resolve(ROOT, p); // 兜底 cwd 相对
  };
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    const status = rec.slice(0, 2);
    const path = rec.slice(3);
    // 未提交（??/M/A——含 A 防暂存后逃逸）+ .md + docs/02-Electron架构/ + 排除 *执行清单*/README
    if (!(status.startsWith("??") || /[AM]/.test(status))) continue;
    if (!path.endsWith(".md") || !path.includes(DOC_ROOT)) continue;
    const base = path.split("/").pop() ?? "";
    if (base.includes("执行清单") || base.includes("README")) continue;
    let src;
    try {
      src = readFileSync(resolvePath(path), "utf-8");
    } catch {
      continue;
    }
    const hasCap = /window\.linkdesk\.|contributes\./.test(src);
    const hasPreface = src.includes("设计前置") || src.includes("非新能力");
    if (hasCap && !hasPreface) {
      issues.push(`  ${path}: 含新能力标记（window.linkdesk. / contributes.）但无「设计前置」/「非新能力」声明——新能力文档必带 8 维度设计前置（§8.4 ③）`);
    }
  }
  return issues;
}

function main() {
  const entries = parseChecklist();
  const checked = entries.filter((e) => e.base >= MIN_TASK);
  const issues = [...checkEntries(entries), ...checkUncommittedCapabilityDocs()];

  if (issues.length > 0) {
    console.error(`❌ 设计流程机械门禁 ${issues.length} 处违规——不走不放行：\n${issues.join("\n")}`);
    process.exit(1);
  }
  console.log(`✅ 设计流程机械门禁干净——清单 ${entries.length} 条目，≥#145 共 ${checked.length} 条全为指针集 + 档案链接存在；未提交新能力文档无裸新能力。`);
}

main();
