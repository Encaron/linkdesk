/**
 * `runPluginLint()`——`npm run lint` 门禁编排（E6#54d）：eslint 规则腿 + 四条 check 扫描腿双轨。
 *
 * E6#109h-b①：`check-css-namespace` 腿升级为**双判据**——「裸定义类名/关键帧必须以本仓 `<pluginId>-`
 * 开头」（`checks/plugin-prefix.ts`，拍板 Q1=(A)，**不需要任何清单**）⊕「不得裸定义宿主保留名」
 * （`checks/reserved-classes.ts`，随包清单）。两者**同一个 checkId / 同一条腿**，报点按 `文件:行`
 * 去重（前缀优先）——详见该腿的组装处注释。
 *
 * 对标壳 check 同款双轨（07 §六·载体双轨）：eslint（12 项注册规则，全 WARN）管 ts/tsx；
 * css-hardcode / font-scale / spacing-grid / css-namespace 四条移植脚本管整工程（eslint 到不了 .css，
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
import { runReservedClassCheck } from "./checks/reserved-classes.js";
import { runPluginPrefixCheck } from "./checks/plugin-prefix.js";
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
  legs: LintLeg[]; // 四 check 腿（css-hardcode / font-scale / spacing-grid / css-namespace）
  totalCheckViolations: number;
  tsconfigUsed: string | null; // 实际喂 import-x resolver 的 tsconfig（无则 null）
  /** 本仓 pluginId（命名空间腿的前缀来源；取不到 ⇒ null 且该腿 fail-closed 报红） */
  pluginId: string | null;
  /** pluginId 走了「目录名兜底」时的提示行——**必须打印**（详案 15 §一：让作者知道门禁用的是目录名） */
  pluginIdNote: string | null;
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
  /**
   * 命名空间腿 = **前缀判据 ⊕ 宿主保留名判据**（E6#109h-b①，详案 15 §二选项 (A)：并入现腿、同一个
   * `CHECK_IDS.cssNamespace`、同一条 `check-css-namespace` 腿，不是两条腿）。
   *
   * 🔴 为什么要**去重**而不是简单相加：前缀判据（「裸定义必须以 `<pluginId>-` 开头」）在「裸定义」
   *    这一轴上**完全覆盖**保留名判据（插件不可能再裸定义 `.badge`——它必须以 `<pluginId>-` 开头），
   *    两条都报就成了一处命中报两次。**前缀优先**：保留名判据只补它独有的一格——**拿不到前缀**时
   *    （`plugin.json` 缺失/损坏 ⇒ 前缀判据 fail-closed）仍能逐点报出「你占了一个宿主名字」。
   *    保留名清单本身不删：前缀腿的报点里会带上「且这是宿主保留名」这句措辞（详见两个 check 的头注）。
   */
  const prefix = runPluginPrefixCheck(absRoot);
  const reserved = runReservedClassCheck(absRoot);
  const prefixKeys = new Set(prefix.violations.map((v) => `${v.file}:${v.line}`));
  const namespace: CheckViolation[] = [
    ...prefix.violations,
    ...reserved.filter((v) => !prefixKeys.has(`${v.file}:${v.line}`)),
  ];
  const legs: LintLeg[] = [
    { id: "linkdesk/no-hardcoded-hex（css + rgb/hsl 腿）", label: "check-css-hardcode", violations: css },
    { id: "linkdesk/no-hardcoded-font-size", label: "check-font-scale", violations: font },
    { id: "linkdesk/no-nonstandard-spacing", label: "check-spacing-grid", violations: spacing },
    {
      id: "linkdesk/no-reserved-class-name（裸定义类名/关键帧必须带本仓 <pluginId>- 前缀；宿主保留名同 id）",
      label: "check-css-namespace",
      violations: namespace,
    },
  ];
  const totalCheckViolations = css.length + font.length + spacing.length + namespace.length;

  return {
    files: results.length,
    eslintRows,
    legs,
    totalCheckViolations,
    tsconfigUsed: tsconfig ? tsconfig : null,
    pluginId: prefix.pluginId,
    pluginIdNote: prefix.pluginIdNote,
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

  // 命名空间腿的前缀来源（E6#109h-b①）——目录名兜底时必须让作者看见（不许静默）
  if (report.pluginIdNote) lines.push(`\nℹ 命名空间腿的前缀来源：${report.pluginIdNote}`);

  lines.push(
    `\n门禁 = 警告不是封锁（07 §六·三档）：未处理偏离可修可绕——知情绕行写标准注释\n` +
      `  // eslint-disable-next-line ${LEG_HINT_ID} -- 理由   （行级）\n` +
      `  /* eslint-disable ${LEG_HINT_ID} -- 内容画布 */   （文件级：内容/画布整文件豁免）\n` +
      `WARN 永不 fail build/上传；偏离标签随包可见（市场层读取 disable 注释）。`
  );
  return lines.join("\n");
}
