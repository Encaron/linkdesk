/**
 * `runPluginLint()`——`npm run lint` 门禁编排（E6#54d）：eslint 规则腿 + 三 check 扫描腿双轨。
 *
 * 对标壳 check 同款双轨（07 §六·载体双轨）：eslint（12 项注册规则，全 WARN）管 ts/tsx；
 * css-hardcode / font-scale / spacing-grid 三移植脚本管整工程（eslint 到不了 .css，
 * ts/tsx 的 rgb()/hsl() 也归 css-hardcode 补）。jscpd = 项目级可选（文档引导，不进编排）。
 *
 * 门禁哲学（07 §六·三档）：违规全 WARN **永不 fail build**——本编排按违规数统计并打印
 * 「未处理偏离」行；退出码只反映真 error（语法致命错 / 作者自配 error 规则），WARN 不拦。
 * 知情绕行 = 标准 eslint-disable 注释（disable.ts 语义：命中豁免行整体静默不亮灯）。
 */
import { ESLint } from "eslint";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { linkdeskPluginLintConfig, type PluginLintOptions } from "./preset.js";
import { runCssHardcodeCheck } from "./checks/css-hardcode.js";
import { runFontScaleCheck } from "./checks/font-scale.js";
import { runSpacingGridCheck } from "./checks/spacing-grid.js";
import { type CheckViolation } from "./checks/scan.js";

/** 示例用的门禁 id（打印知情绕行格式）；伪 id 与 check 脚本 CHECK_IDS 同源 */
const LEG_HINT_ID = "linkdesk/no-hardcoded-hex";

export interface LintLeg {
  id: string; // 门禁 id（含伪 id 命名空间，disable 注释用同名）
  label: string; // 打印标题
  violations: CheckViolation[];
}

export interface EslintRow {
  file: string; // 相对工程根（正斜杠）
  line: number;
  column: number;
  ruleId: string | null;
  message: string;
  severity: 1 | 2;
}

export interface PluginLintReport {
  files: number; // eslint 实际 lint 文件数
  eslintRows: EslintRow[]; // eslint 腿逐条偏离（含真 error——退出码依据）
  legs: LintLeg[]; // 三 check 腿（css-hardcode / font-scale / spacing-grid）
  totalCheckViolations: number;
  tsconfigUsed: string | null; // 实际喂 import-x resolver 的 tsconfig（无则 null）
}

export async function runPluginLint(root: string, options: PluginLintOptions = {}): Promise<PluginLintReport> {
  const absRoot = resolve(root);
  const defaultTsconfig = resolve(absRoot, "tsconfig.json");
  const tsconfig = options.tsconfig
    ? resolve(absRoot, options.tsconfig)
    : existsSync(defaultTsconfig)
      ? defaultTsconfig
      : null;

  const preset = linkdeskPluginLintConfig({
    files: options.files,
    ignore: options.ignore,
    tsconfig: tsconfig ?? undefined, // 无 tsconfig → 剥 settings（import-x 直解 node_modules）
  });
  if (!tsconfig) {
    // 剥掉 import-x/typescript resolver——工程没有 tsconfig 时它无事可做
    for (const block of preset) {
      if (block.settings) delete block.settings;
    }
  }

  const eslint = new ESLint({
    cwd: absRoot,
    overrideConfigFile: true, // 只用 SDK 预设——零配置确定性强，不吞作者自配 eslint.config.js
    overrideConfig: preset,
  });
  const results = await eslint.lintFiles(["**/*.{ts,tsx,js,jsx}"]);

  const eslintRows: EslintRow[] = [];
  for (const res of results) {
    for (const m of res.messages) {
      eslintRows.push({
        file: res.filePath.slice(absRoot.length + 1).split("\\").join("/"),
        line: m.line ?? 0,
        column: m.column ?? 0,
        ruleId: m.ruleId,
        message: m.message,
        severity: m.fatal || m.severity === 2 ? 2 : 1,
      });
    }
  }

  const css = runCssHardcodeCheck(absRoot);
  const font = runFontScaleCheck(absRoot);
  const spacing = runSpacingGridCheck(absRoot);
  const legs: LintLeg[] = [
    { id: "linkdesk/no-hardcoded-hex（css + rgb/hsl 腿）", label: "check-css-hardcode", violations: css },
    { id: "linkdesk/no-hardcoded-font-size", label: "check-font-scale", violations: font },
    { id: "linkdesk/no-nonstandard-spacing", label: "check-spacing-grid", violations: spacing },
  ];
  const totalCheckViolations = css.length + font.length + spacing.length;

  return {
    files: results.length,
    eslintRows,
    legs,
    totalCheckViolations,
    tsconfigUsed: tsconfig ? tsconfig : null,
  };
}

/** 打印报告（人机双通道的即时反馈环）；返回进程退出码（真 error 才 1，WARN 永不 fail）。 */
export function renderPluginLintReport(report: PluginLintReport): string {
  const lines: string[] = [];

  const errors = report.eslintRows.filter((r) => r.severity === 2);
  const warnings = report.eslintRows.filter((r) => r.severity === 1);
  if (errors.length > 0) {
    lines.push(`❌ eslint ${errors.length} 处 error（语法致命错 / 作者自配 error 规则）——`);
    for (const r of errors) lines.push(`    ${r.file}:${r.line}:${r.column}  [${r.ruleId ?? "fatal"}]  ${r.message}`);
  }
  if (warnings.length > 0) {
    lines.push(`⚠ eslint 规则腿：${warnings.length} 处未处理偏离（${report.files} 文件）——均为 WARN，永不 fail build。`);
    for (const r of warnings) lines.push(`    ${r.file}:${r.line}:${r.column}  [${r.ruleId}]  ${r.message}`);
  } else if (errors.length === 0) {
    lines.push(`✅ eslint 规则腿：${report.files} 文件零偏离。`);
  }

  for (const leg of report.legs) {
    if (leg.violations.length === 0) {
      lines.push(`✅ ${leg.label}：零偏离。`);
      continue;
    }
    lines.push(`⚠ ${leg.label}：${leg.violations.length} 处未处理偏离——`);
    for (const v of leg.violations) {
      lines.push(`    ${v.file}:${v.line}  ${v.message}`);
    }
  }

  lines.push(
    `\n门禁 = 警告不是封锁（07 §六·三档）：未处理偏离可修可绕——知情绕行写标准注释\n` +
      `  // eslint-disable-next-line ${LEG_HINT_ID} -- 理由   （行级）\n` +
      `  /* eslint-disable ${LEG_HINT_ID} -- 内容画布 */   （文件级：内容/画布整文件豁免）\n` +
      `WARN 永不 fail build/上传；偏离标签随包可见（市场层读取 disable 注释）。`
  );
  return lines.join("\n");
}
