/**
 * `runPluginLint()`——`npm run lint` 门禁编排（E6#54d）：eslint 规则腿 + 五条 check 扫描腿双轨。
 *
 * E6#109h-b①：`check-css-namespace` 腿升级为**双判据**——「裸定义类名/关键帧必须以本仓 `<pluginId>-`
 * 开头」（`checks/plugin-prefix.ts`，拍板 Q1=(A)，**不需要任何清单**）⊕「不得裸定义宿主保留名」
 * （`checks/reserved-classes.ts`，随包清单）。两者**同一个 checkId / 同一条腿**，报点按 `文件:行`
 * 去重（前缀优先）——详见该腿的组装处注释。
 *
 * 🔴 E6#109n-b（1.24）再加第三条：**token（自定义属性）作用域**（`checks/token-scope.ts`）——
 * 文档级只有宿主契约块能写、其余定义必须挂在自有命名空间的类之下、任何方不得定义 `ldk-*`
 * 自定义属性。红进腿报点（CI 严格腿判红），🟡 黄（V6）只打印不拦。规则正文见 31 号档 §一。
 *
 * 🔴 E6#109o-b（1.26）再加第四条：**选择器形态**（`checks/selector-form.ts`）——
 * S2 禁无锚选择器（元素/通配/属性/伪类/伪元素/**id** 一视同仁；顶层或限定一律禁）·
 * S3 跨方命中（选择器里出现 `ldk-*` 提及）必须自带自有 `.<pluginId>-*` 锚。两条全红、进腿报点。
 * 规则正文见 32 号档 §一（R0–R3）；1.25 实测插件侧存量 **0**（18 仓 ＋ 夹具）⇒ 纯预防、零重发成本。
 *
 * 对标壳 check 同款双轨（07 §六·载体双轨）：eslint（12 项注册规则，全 WARN）管 ts/tsx；
 * css-hardcode / font-scale / spacing-grid / css-namespace / command-ownership 五条移植脚本管整工程（eslint 到不了 .css，
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
import { runTokenScopeCheck } from "./checks/token-scope.js";
import { runSelectorFormCheck } from "./checks/selector-form.js";
import { runCommandOwnershipCheck } from "./checks/command-ownership.js";
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
  legs: LintLeg[]; // 五 check 腿（css-hardcode / font-scale / spacing-grid / css-namespace / command-ownership）
  totalCheckViolations: number;
  tsconfigUsed: string | null; // 实际喂 import-x resolver 的 tsconfig（无则 null）
  /** 本仓 pluginId（命名空间腿的前缀来源；取不到 ⇒ null 且该腿 fail-closed 报红） */
  pluginId: string | null;
  /** pluginId 走了「目录名兜底」时的提示行——**必须打印**（详案 15 §一：让作者知道门禁用的是目录名） */
  pluginIdNote: string | null;
  /** 🟡 token 作用域的黄灯建议（V6：文档级但名字带自有前缀）——**只打印、不拦**（E6#109n-b） */
  tokenAdvisories: CheckViolation[];
  /** token 作用域判据的计数（红 = 进了腿报点；黄 = advisories） */
  tokenCounts: { red: number; yellow: number };
  /** 选择器形态判据的计数（E6#109o-b）：S2 禁无锚 / S3 跨方命中不带自有锚——**都进腿报点** */
  selectorFormCounts: { anchorless: number; crossParty: number };
  /** 🟡 E6#111b（1.32）命令/协议 id 归属判据的计数：三面的站点数 ＋ 不合规站点数（**全黄**，1.49 才收紧） */
  commandOwnershipCounts: { declared: number; runtime: number; protocol: number; bad: number };
  /** 宿主保留面账的加载实况（账没读到 ⇒ 判据②空转——报告里必须能看出来，不许静默） */
  hostReservedLedger: { file: string; found: boolean; commandPrefixes: number; protocolIds: number } | null;
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
  /**
   * 🔴 E6#109n-b（1.24）：命名空间腿再加一条判据 —— **token（自定义属性）作用域**。
   *   · 红（V1/V2/V5）进本腿报点 ⇒ CI 严格腿判红；
   *   · 🟡 黄（V6：文档级但名字带自有前缀）进 `tokenAdvisories`**只打印、不拦**（22 号档 §10.3）。
   *   ⚠️ 去重口径：（`文件:行`）已被前一条判据占用时**不重复报**——同一处 CSS 同时命中
   *     「裸类名不带前缀」与「token 作用域」的概率低，但 fail-closed 那条（`plugin.json:1`）
   *     必然重叠（前缀腿已报同一件事）⇒ 以先出的为准。
   */
  const tokenScope = runTokenScopeCheck(absRoot);
  /**
   * 🔴 E6#109o-b（1.26）：命名空间腿再加一条 —— **选择器形态**（S2 禁无锚 / S3 跨方命中）。
   *   两条**都进本腿报点**（CI 严格腿判红）：无锚选择器命中「该文档里所有那一类元素」，与谁渲染无关。
   *   ⚠️ 去重口径：与前面几条腿**同一处 `文件:行` 不重复报**（以先出的为准）。特别注意 F3 形态
   *     `.ldk-side-panel :focus-visible`——**前缀腿也会报同一行**（`subjectOf()` 把它算成
   *     `ldk-side-panel` 的一次定义，那是轴 ① 的既有偏差、本轮不许改）⇒ 这里让前缀腿的话先说。
   */
  const selectorForm = runSelectorFormCheck(absRoot);
  /**
   * 🔴 E6#111b（1.32）：第五条 check 腿 —— **命令 id / 协议 id 归属**（`checks/command-ownership.ts`）。
   *   三面同判 ①②：声明面（`contributes.commands[].id`）／运行时面（`registerCommand("<字面量>")`）／
   *   协议面（`registerProtocol({ id: "<字面量>" })`）。
   *   ⚠️ **本格只判黄**（官方仓还没改名，改名归 1.42–1.48）——报点进 WARN 通道即可，
   *      `bin lint` 的退出码只看 eslint severity 2 ⇒ 对插件仓天然不构成红窗；**1.49 才收紧为红**。
   *   ⚠️ **刻意不与另几条腿去重**（与 css-namespace 内部的去重口径相反）：本腿 1.49 要**独立收紧为红**，
   *      把它的报点并进 css-namespace 腿或被那条腿吃掉，收紧时就分不清「谁在报」。fail-closed 那条与
   *      前缀腿在 `plugin.json:1` 上会各报一次——**那是两件不同的事**（一个说身份读不到，一个说前缀拿不到）。
   */
  const commandOwnership = runCommandOwnershipCheck(absRoot);
  const prefixKeys = new Set(prefix.violations.map((v) => `${v.file}:${v.line}`));
  const tokenKeys = new Set(tokenScope.violations.map((v) => `${v.file}:${v.line}`));
  const formKeys = new Set(selectorForm.violations.map((v) => `${v.file}:${v.line}`));
  const namespace: CheckViolation[] = [
    ...prefix.violations, // 前缀腿（含 fail-closed）
    ...selectorForm.violations.filter((v) => !prefixKeys.has(`${v.file}:${v.line}`)), // 形态腿（同点不重复报）
    ...tokenScope.violations.filter((v) => !prefixKeys.has(`${v.file}:${v.line}`)), // token 腿（同点不重复报）
    ...reserved.filter(
      (v) => !prefixKeys.has(`${v.file}:${v.line}`) && !tokenKeys.has(`${v.file}:${v.line}`) && !formKeys.has(`${v.file}:${v.line}`)
    ),
  ];
  const legs: LintLeg[] = [
    { id: "linkdesk/no-hardcoded-hex（css + rgb/hsl 腿）", label: "check-css-hardcode", violations: css },
    { id: "linkdesk/no-hardcoded-font-size", label: "check-font-scale", violations: font },
    { id: "linkdesk/no-nonstandard-spacing", label: "check-spacing-grid", violations: spacing },
    {
      id: "linkdesk/no-reserved-class-name（裸定义类名/关键帧必须带本仓 <pluginId>- 前缀；宿主保留名、token 作用域、选择器形态同 id）",
      label: "check-css-namespace",
      violations: namespace,
    },
    {
      id: "linkdesk/no-unowned-command-id（命令 id / 协议 id 必须带本仓 <pluginId>. 前缀，且不得占用宿主保留面）",
      label: "check-command-ownership",
      violations: commandOwnership.violations,
    },
  ];
  const totalCheckViolations =
    css.length + font.length + spacing.length + namespace.length + commandOwnership.violations.length;

  return {
    files: results.length,
    eslintRows,
    legs,
    totalCheckViolations,
    tsconfigUsed: tsconfig ? tsconfig : null,
    pluginId: prefix.pluginId,
    pluginIdNote: prefix.pluginIdNote,
    tokenAdvisories: tokenScope.advisories,
    tokenCounts: { red: tokenScope.red.length, yellow: tokenScope.yellow.length },
    selectorFormCounts: { anchorless: selectorForm.anchorless.length, crossParty: selectorForm.crossParty.length },
    commandOwnershipCounts: {
      declared: commandOwnership.declaredIds.length,
      runtime: commandOwnership.runtimeIds.length,
      protocol: commandOwnership.protocolIds.length,
      bad: commandOwnership.sites.length,
    },
    hostReservedLedger: commandOwnership.hostLedger,
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

  // 🟡 token 作用域的黄灯建议（E6#109n-b）——**只报不拦**：不进腿报点，故不影响 CI 结论
  if (report.tokenAdvisories.length > 0) {
    lines.push(
      `\n🟡 check-css-namespace（token 作用域）：${report.tokenAdvisories.length} 处**建议**（不拦 build）——` +
        `文档级定义但名字自带本仓前缀（V6）：没人跟你抢这个名字，但「写在 \`:root\`」这件事本身没有理由；` +
        `搬进自己的根类之下，作用域从整个文档缩回自己的子树。`,
    );
    for (const v of report.tokenAdvisories) lines.push(`    ${v.file}:${v.line}  ${v.message}`);
  }

  // 选择器形态判据的计数（E6#109o-b）——两条都进腿报点 ⇒ 这里只在**零违规**时补一句确认
  const sf = report.selectorFormCounts;
  if (sf.anchorless === 0 && sf.crossParty === 0) {
    lines.push(
      `\n✅ check-css-namespace（选择器形态 · S2/S3）：无锚选择器 0 ／ 跨方命中不带自有锚 0` +
        `——插件 CSS 里没有「不需要同名就能撞」的选择器（元素/通配/属性/伪类/伪元素/id 一视同仁）。`
    );
  }

  // 🟡 E6#111b（1.32）命令/协议 id 归属：读数 ＋ 账的加载实况（判据② 的输入来自账——账没读到必须让作者看见）
  const co = report.commandOwnershipCounts;
  lines.push(
    `\n🟡 check-command-ownership（命令/协议 id 归属 · 1.49 起收紧为红）：` +
      `声明面 ${co.declared} 名 ／ 运行时面 ${co.runtime} 名 ／ 协议面 ${co.protocol} 名——` +
      (co.bad === 0
        ? `无不合规站点。`
        : `${co.bad} 处不合规（不带本仓 <pluginId>. 前缀，或占用宿主保留面）。`),
  );
  if (report.hostReservedLedger && !report.hostReservedLedger.found) {
    lines.push(
      `    ⚠ 宿主保留面账没读到（${report.hostReservedLedger.file}）——判据②（不得占用宿主保留面）本轮**空转**。` +
        `SDK 安装不完整？重装 @linkdesk/plugin-sdk 后再跑。`,
    );
  }

  lines.push(
    `\n门禁 = 警告不是封锁（07 §六·三档）：未处理偏离可修可绕——知情绕行写标准注释\n` +
      `  // eslint-disable-next-line ${LEG_HINT_ID} -- 理由   （行级）\n` +
      `  /* eslint-disable ${LEG_HINT_ID} -- 内容画布 */   （文件级：内容/画布整文件豁免）\n` +
      `WARN 永不 fail build/上传；偏离标签随包可见（市场层读取 disable 注释）。`
  );
  return lines.join("\n");
}
