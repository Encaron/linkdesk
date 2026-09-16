/**
 * 机械检查：壳侧 app.* 配置项必须有保底默认值（audit-config-baseline，E5.8#137）。
 *
 * 新能力设计流程 §五 5.2——新增 `app.*` 配置项必须：registerConfiguration 声明 + 保底默认值
 * （无插件也成立）+ 设置组归属。本脚本机械拦截第一条硬性部分：声明了但没有 `default:` 的 app.* 键。
 *
 * 扫描 registerConfiguration 的 properties 对象（appearance.ts + startup.ts）——每个
 * `"app.xxx": { ... }` 块内必须有 `default:`。缺省默认值 = 用户未配置时读空值 → 下游 bug。
 *
 * ── 🔴 E6#109p-b（1.28b）补自测 ＋ 一条**发现式断言**（治「清单漏登记」）──
 *   1.27 全量体检把本脚本判为**半瞎**，依据就是下面 `TARGETS` 自己写下的那条风险：
 *   **白名单里没有的声明文件根本不被扫 ⇒ 门禁静默放行**。本轮做两件事：
 *     · 判据抽成纯函数 `scanSource(relPath, src)`（不读盘，`--self-test` 可注入源码）——语义**一字未改**
 *       （仍用同一个 `findMatchingBrace` 与同一条正则）；
 *     · 发现式断言 `unregisteredConfigSources()`：递归扫 `src/` 下全部 `.ts`/`.tsx`（排 `*.test.*`），凡**既调
 *       `registerConfiguration(` 又声明 `app.*` 键**的生产文件都必须登记在 `TARGETS` 里，否则红，
 *       并点名「哪个文件没登记 + 怎么修」。
 *   ⚠️ 断言锚为什么是「调 registerConfiguration **且** 声明 app.* 键」，而不是只看那个调用名：
 *     `src/core/registry/ConfigurationRegistry.ts` 是**定义** registerConfiguration 的地方、
 *     `src/pluginLoader/contributions/contributions.ts` 是替**插件**泛化转调（整文件无一个 `app.*` 字面量）
 *     ——两者都不是「壳配置声明站点」；只按调用名判会永久多报这两条假红。
 *
 * 用法：node scripts/check-config-baseline.mjs（已挂 npm run check）
 *       node scripts/check-config-baseline.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// app.* 声明集中在壳外观配置 + 壳通用配置 + 更新配置三处（E5.8#50.19 主题组第二贡献点
// "appearance"；E6#57.9a 更新组第三贡献点 "update"）。
// 🔴 本数组是**白名单**——新开一个壳配置声明文件却不加进来 ⇒ 该文件**根本不被扫**，
//   门禁静默放行（E6#57.9a 落地时实测确认：加文件当天不补这里，审计是假绿灯）。
//   ⇒ 1.28b 起由下方发现式断言 `unregisteredConfigSources()` 机械兜住（漏登记 = 红）。
const TARGETS = [
  "src/App/config/appearance.ts",
  "src/App/startup.ts",
  "src/App/config/update.ts",
];

/** 从 offset 找匹配的右大括号——跳过字符串字面量（对标 check-ipc-audit findMatchingBrace） */
function findMatchingBrace(text, start) {
  let depth = 0;
  let inString = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") inString = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 纯判据：一段源码里「声明了 app.* 却块内无 default:」的违规行（不读盘，`--self-test` 注入）。
 * 语义与抽函数前**一字未改**：同一条键正则 + 同一个 findMatchingBrace + 同一套文案。
 */
export function scanSource(relPath, src) {
  const violations = [];
  const re = /"(app\.[\w.]+)":\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const open = src.indexOf("{", m.index + m[0].length - 1);
    const close = findMatchingBrace(src, open);
    if (close === -1) {
      violations.push(`  ${relPath}  ⚠  "${key}" 块括号不闭合——审计无法解析`);
      continue;
    }
    const block = src.slice(open, close + 1);
    if (!/default\s*:/.test(block)) {
      violations.push(
        `  ${relPath}  ⚠  "${key}" 声明了但块内无 default:——app.* 配置项必须带保底默认值（新能力设计流程 §五 5.2）`,
      );
    }
  }
  return violations;
}

/** 声明站点判定：既调 registerConfiguration( 又声明 app.* 键（非 /g 副本，免得 .test 带 lastIndex 状态） */
const APP_KEY_DECL_RE = /"(app\.[\w.]+)":\s*\{/;
const REGISTER_CALL = "registerConfiguration(";

/** 纯判据：`[{ rel, src }]` 里哪些文件是「壳配置声明站点」 */
export function appConfigDeclarationSources(sources) {
  return sources
    .filter(({ src }) => src.includes(REGISTER_CALL) && APP_KEY_DECL_RE.test(src))
    .map(({ rel }) => rel);
}

/**
 * 发现式断言（纯函数）：返回「声明了 app.* 配置却没登记在 targets 里」的生产文件（rel 路径）。
 * 空数组 = 绿。**这就是把脚本头那条自带风险变成机械可查**——清单漏登记不再可能静默。
 */
export function unregisteredConfigSources(sources, targets) {
  return appConfigDeclarationSources(sources).filter((rel) => !targets.includes(rel));
}

/** 递归收集 src/ 下的生产 .ts/.tsx（排 `*.test.*`）——供发现式断言扫「谁声明了 app.* 配置」 */
function collectProductionSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...collectProductionSources(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push({
        rel: full.replace(ROOT + "/", "").replace(ROOT + "\\", "").replace(/\\/g, "/"),
        src: readFileSync(full, "utf-8"),
      });
    }
  }
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 每例都**真跑判据**并断言实得条数——负控必须真的红，正控必须真的绿（只写不断言 = 假门禁的常见死法）。
 * 说明：例 ③ 钉住**块级语义**（`default:` 出现在块内嵌套对象里也算命中）——那是**现有实现的真实行为**，
 * 本自测只把它记下来，⛔ 不改判据（要改是另一件事，得单独裁决）。
 */
function runSelfTest() {
  const cases = [
    // ── 正控：合规 / 不属射程 ⇒ 0 条（绿） ──
    [
      "正控①：合规 app.* 块（块内有 default:）⇒ 0 条",
      scanSource("x.ts", `{ properties: { "app.theme": { type: "string", default: "dark" } } }`).length,
      0,
    ],
    [
      "正控②：只声明非 app.* 键（plugin.foo 无 default:）⇒ 0 条（不属射程）",
      scanSource("x.ts", `{ properties: { "plugin.foo": { type: "string" } } }`).length,
      0,
    ],
    [
      "正控③：default: 在块内**嵌套对象**里也算命中（钉住既有块级语义，⛔不改判据）⇒ 0 条",
      scanSource("x.ts", `{ properties: { "app.nested": { type: "object", properties: { inner: { default: "x" } } } } }`)
        .length,
      0,
    ],
    [
      "正控④：源码里没有任何 app.* 键 ⇒ 0 条",
      scanSource("x.ts", `export function noop() {\n  return { a: 1 };\n}\n`).length,
      0,
    ],
    [
      "正控⑤：发现式断言——已登记的声明文件集合（今日 3 个形态）⇒ 0 个未登记",
      unregisteredConfigSources(
        [
          { rel: "src/App/config/appearance.ts", src: `registerConfiguration("appearance", {\n  properties: {\n    "app.theme": { default: "dark" },\n  },\n});` },
          { rel: "src/App/startup.ts", src: `registerConfiguration(APP_PLUGIN_ID, {\n  properties: { "app.zoom": { default: 1 } },\n});` },
          { rel: "src/App/config/update.ts", src: `registerConfiguration("update", {\n  properties: { "app.update.channel": { default: "stable" } },\n});` },
        ],
        TARGETS,
      ).length,
      0,
    ],
    [
      "正控⑥：调 registerConfiguration 但**不带任何 app.* 键**（contributions.ts 形态）⇒ 不要求登记，0 个",
      unregisteredConfigSources(
        [{ rel: "src/pluginLoader/contributions/contributions.ts", src: `registerConfiguration(pluginId, {\n  properties: config.properties,\n});` }],
        TARGETS,
      ).length,
      0,
    ],
    // ── 负控：违规 ⇒ 红（条数也要对） ──
    [
      "负控①：声明了但块内无 default:（1.27 实测的探针形态）⇒ 1 条",
      scanSource("x.ts", `{ properties: { "app.probeNoDefault": { type: "string" } } }`).length,
      1,
    ],
    [
      "负控②：块括号不闭合 ⇒ 1 条「审计无法解析」",
      scanSource("x.ts", `{ properties: { "app.unclosed": { type: "string"`).length,
      1,
      scanSource("x.ts", `{ properties: { "app.unclosed": { type: "string"`)[0]?.includes("审计无法解析"),
    ],
    [
      "负控③：同一文件两个坏块 ⇒ 2 条（不是首个命中就停）",
      scanSource("x.ts", `{ properties: {\n  "app.alpha": { type: "string" },\n  "app.beta": { type: "number" },\n} }`).length,
      2,
    ],
    [
      "负控④：发现式断言——假集合里放一个**未登记**的声明文件 ⇒ 报 1 个（并点名）",
      unregisteredConfigSources(
        [{ rel: "src/App/config/probe-unregistered.ts", src: `registerConfiguration("probe", {\n  properties: { "app.probe": { default: 1 } },\n});` }],
        TARGETS,
      ).length,
      1,
      unregisteredConfigSources(
        [{ rel: "src/App/config/probe-unregistered.ts", src: `registerConfiguration("probe", {\n  properties: { "app.probe": { default: 1 } },\n});` }],
        TARGETS,
      )[0] === "src/App/config/probe-unregistered.ts",
    ],
  ];

  let bad = 0;
  for (const [tag, got, want, probe] of cases) {
    const pass = got === want && probe !== false;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got} 处\n`);
  }
  const positives = cases.filter(([, , want]) => want === 0).length;
  const negatives = cases.length - positives;
  process.stdout.write(
    bad === 0
      ? `\n✅ check-config-baseline self-test 全过（${cases.length} 例：${positives} 正控绿 / ${negatives} 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-config-baseline self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  // ── 发现式断言先行：清单本身就漏登记 ⇒ 后面的合规结论不可信，先报这个 ──
  const sources = collectProductionSources(resolve(ROOT, "src"));
  const unregistered = unregisteredConfigSources(sources, TARGETS);
  if (unregistered.length > 0) {
    console.error("❌ 下列生产文件声明了 app.* 配置，却不在本脚本的 TARGETS 里——它们**根本不被扫**，门禁静默放行：");
    for (const rel of unregistered) console.error(`   ${rel}`);
    console.error("\n   修法：把该文件加进 scripts/check-config-baseline.mjs 的 TARGETS 数组");
    console.error("        （并确认它的 properties 里每个 app.* 键都带 default:）。");
    process.exit(1);
  }

  const violations = TARGETS.flatMap((relPath) =>
    scanSource(relPath, readFileSync(resolve(ROOT, relPath), "utf-8")),
  );

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ ${violations.length} 处 app.* 配置项缺保底默认值——见新能力设计流程 §五 5.2。`);
    process.exit(1);
  }

  console.log(`✅ app.* 配置保底审计干净——${TARGETS.length} 文件全部配置项带 default。`);
  const declared = appConfigDeclarationSources(sources);
  console.log(
    `✅ 发现式断言：src/ 下 ${declared.length} 个声明 app.* 配置的生产文件全部登记在 TARGETS（已扫 ${sources.length} 个 ts/tsx，无静默漏扫）。`,
  );
}

main();
