/**
 * 机械检查：版本号判定门禁（E6#57.15e commit 分类约定机械层，2026-08-31 用户拍板）。
 *
 * 用户担心「AI 忘调 version-bump skill 判版本」→ 本脚本做机械兜底。
 * 核心洞察：机械上检测不到「AI 调没调 skill」，但能检测「commit message 带没带类别前缀」——
 * 类别前缀（feat:/fix:/breaking:）= 版本判定的输出物，强制分类 ≈ 强制过版本判定。
 *
 * 档位 = 警告（对标 E6 门禁哲学三档梯度「让做对更便宜」）——不 block，
 * 纯重构/文档/测试豁免不误伤；提示词层 = CLAUDE.md 硬约束 22「软件侧变更提交前
 * 必过 version-bump 判定」双保险。skill 决策层 + 门禁警告层 + 发布脚本校验层（E6#57.15d）
 * 三层共同防「更新上去了版本号没更」。
 *
 * 判定：
 *  ① staged 含软件侧代码（src/ 或 electron/ 的 .ts/.tsx，排除 *.test.* / *.spec.*）
 *     → commit message 必须带类别前缀 feat:/fix:/breaking:（可含 E6#编号）→ 缺则警告
 *  ② 纯文档（docs/ *.md）/ 配置（*.json）/ 测试 / scripts / .claude → 放行
 *
 * 用法：node scripts/check-version-bump.mjs（PreToolUse hook: Bash(git commit*)，警告档不拦截）
 * 退出码 0 = 放行（警告档）；退出码 1 = 违规硬拦（预留——用户后续可升级档位）
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // 代码根（package.json 所在：linkdesk/）

/** 软件侧代码判定：src/ 或 electron/ 的 .ts/.tsx，排除测试文件与文档/依赖目录
 *  （git diff --cached 返回相对仓库根的路径，可能带 `linkdesk/` 子目录前缀）
 */
const SOFTWARE_CODE_RE = /(^|\/)(src|electron)\/.*\.tsx?$/;
const EXCLUDE_RE = /(^|\/)(docs|node_modules|dist|scripts)\//;
const TEST_FILE_RE = /\.(test|spec)\./;

/** 从 PreToolUse hook stdin（JSON {tool_input:{command}}）提取 git commit 命令 */
function readStdin() {
  try {
    return readFileSync(0, "utf-8").trim();
  } catch {
    return "";
  }
}

/** 从 commit 命令提取 message（支持多个 -m，拼接）——无 -m（走编辑器）视为无法判定 */
function extractCommitMessage(command) {
  if (!command) return "";
  const msgs = [];
  for (const m of command.matchAll(/-m\s+["']([^"']+)["']/g)) {
    msgs.push(m[1]);
  }
  return msgs.join("\n");
}

/** 类别前缀判定：feat:/fix:/breaking:（E6#57.15e 约定，可含 E6#编号） */
const CATEGORY_RE = /^\s*(feat|fix|breaking):/i;

/** staged 软件侧代码文件列表（git commit 前 staged 已存在） */
function stagedSoftwareFiles() {
  try {
    const out = execSync("git diff --cached --name-only", { cwd: ROOT, encoding: "utf-8" });
    return out.split(/\r?\n/).filter((p) => SOFTWARE_CODE_RE.test(p) && !TEST_FILE_RE.test(p));
  } catch {
    return [];
  }
}

function main() {
  const hookInput = readStdin();
  let command = "";
  try {
    const json = JSON.parse(hookInput);
    command = json?.tool_input?.command ?? "";
  } catch {
    command = ""; // 手动跑无 stdin → 无 command，跳过 message 判定
  }

  const files = stagedSoftwareFiles();
  if (files.length === 0) {
    console.log("✅ 版本号判定门禁：无软件侧代码 staged——放行。");
    process.exit(0);
  }

  const message = extractCommitMessage(command);
  if (message && CATEGORY_RE.test(message)) {
    console.log(`✅ 版本号判定门禁：commit 已带类别前缀（feat/fix/breaking）——软件侧变更已分类。`);
    process.exit(0);
  }

  // 警告档：不 block，但醒目提示（CLAUDE.md 硬约束 22 是提示词层双保险）
  console.warn(
    `⚠️ 版本号判定门禁：本次 commit 含软件侧代码（${files.slice(0, 3).join(", ")}${files.length > 3 ? "…" : ""}）` +
      `但 commit message 未带类别前缀（feat:/fix:/breaking:）。\n` +
      `   请先调用 version-bump skill 判定本次变更类别（新功能=feat / 修复=fix / 破坏=breaking），` +
      `再在 commit message 加前缀（如 "feat:E6#xxx …"）。` +
      `（警告档不拦截；CLAUDE.md 硬约束 22 + version-bump skill 决策层双保险）`
  );
  process.exit(0); // 警告档：放行
}

main();
