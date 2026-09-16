/**
 * 机械检查：插件贡献点三件套（audit-contributes，E5.8#137）。
 *
 * 新能力设计流程 §五 5.3——新增 `contributes.*` 必须：plugin.schema.json 字段 + 加载器消费 + 文档说明。
 * 本脚本三条机械不变量（全部通过才绿）：
 *   ① schema → 文档：live schema 每个 contributes 字段在 03-插件contributes规范.md 有说明
 *      （`contributes.<field>` 提及）。
 *   ② schema 拷贝漂移：docs/03-插件制造/plugin.schema.json 的 contributes 字段 == live schema
 *      （public/schemas/plugin.schema.json）——两份漂移即红灯（单一权威）。
 *   ③ schema → 消费面：live schema 每个 contributes 字段在 src/ + electron/ 有消费方
 *      （`contributes.<field>` 出现即算——声明被读才有意义，纯声明零消费 = 死字段）。
 *
 * live schema = public/schemas/plugin.schema.json（发布态校验源，dist/ 构建拷贝）。
 *
 * ── 🔴 E6#109p-b（1.28b）补自测 ──
 *   1.27 全量体检把本脚本判为「无自测 ＋ 半瞎（措辞宽于能力）」——本轮补三件事：
 *     · 三条判定各自抽成**纯函数**（吃字符串/数组、不读盘）：`judgeDocFields` / `judgeCopyDrift` /
 *       `judgeConsumption`。语义、输出文案、退出码**一字未改**（`main()` 仍是「读盘 → 调纯函数 →
 *       打印 → 退出码」）。
 *     · `--self-test` 全内存夹具——正控/负控都**真跑判据并断言实得结果**（只写不断言 = 假门禁的常见死法）。
 *     · 把 ③ 的**已知边界**钉成事实（见下），⛔ 不改判据。
 *
 *   ⚠️ ③ 的已知边界（1.27 指出的「措辞宽于能力」，本轮**原样保留**）：
 *     判据是**文本出现即算消费**——正则 `contributes\.\??<field>\b` 打在拼好的源码文本上，
 *     **不区分**代码 / 注释 / 字符串字面量。⇒ 一行注释里写 `contributes.views` 也算「有消费方」，
 *     哪怕加载器其实没接线。这是**现状**，不是 bug 判定；`--self-test` 里有一例专门把它钉住，
 *     要收紧（改成 AST 级）是另一件事，得单独裁决。
 *     另一条现状：`\??` 只允许 `contributes.?<field>` 这一形态，`contributes?.<field>`（问号在
 *     `contributes` 与 `.` 之间）**不命中**——本脚本不改这个行为。
 *
 * 用法：node scripts/check-contributes.mjs（已挂 npm run check）
 *       node scripts/check-contributes.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIVE_SCHEMA = "public/schemas/plugin.schema.json";
const DOCS_SCHEMA = "docs/03-插件制造/plugin.schema.json";
const DOC = "docs/03-插件制造/03-插件contributes规范.md";

/** 收集目录下所有 .ts/.tsx 文件（排除 node_modules） */
function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && (extname(full) === ".ts" || extname(full) === ".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** 读 schema 的 contributes.properties 键集合（已排序） */
function readContributesFields(schemaPath) {
  const schema = JSON.parse(readFileSync(resolve(ROOT, schemaPath), "utf-8"));
  const contributes = schema?.properties?.contributes;
  if (!contributes?.properties) {
    console.error(`❌ ${schemaPath} 无 properties.contributes——审计失效。`);
    process.exit(1);
  }
  return Object.keys(contributes.properties).sort();
}

// ─────────────────────────────── 纯判据（不读盘） ───────────────────────────────

/**
 * ① 纯判据：`fields` 里**没被 `docText` 提及**的字段（按传入顺序返回）。
 * 空数组 = 绿。`docText` 为已读入的文档全文；判据仍是「文本包含 `contributes.<field>`」，一字未改。
 */
export function judgeDocFields(fields, docText) {
  return fields.filter((field) => !docText.includes(`contributes.${field}`));
}

/**
 * ② 纯判据：live 字段集合 vs docs 拷贝字段集合是否**漂移**。
 * 返回 `{ drifted, detail }`——`detail` 是与抽函数前**逐字相同**的违规行（含行首两空格），
 * 未漂移时为 `""`，因此 `main()` 直接 push 即可保持输出不变。
 *
 * ⚠️ 比较的是**集合**（内部排序后 join）——`readContributesFields` 本来就返回排序结果，
 *    故 `main()` 的行为与抽函数前**逐位相同**；内部排序只是让「同集合异序」不再假红。
 */
export function judgeCopyDrift(liveFields, copyFields) {
  const joined = (arr) => [...arr].sort().join(", ");
  const live = joined(liveFields);
  const copy = joined(copyFields);
  if (live === copy) return { drifted: false, detail: "" };
  return {
    drifted: true,
    detail:
      `  docs/03-插件制造/plugin.schema.json 拷贝漂移：live(${liveFields.length}) [${live}] vs 拷贝(${copyFields.length}) [${copy}]——单一权威，拷贝须与 live 同步`,
  };
}

/**
 * ③ 纯判据：`fields` 里在 `sources`（**已拼接好的源码文本**）中零消费引用的字段。
 * 正则与抽函数前**一字未改**：`contributes\.\??<field>\b`。
 * 🔴 已知边界：文本出现即算消费——注释/字符串字面量同样命中（见文件头说明，⛔ 本轮不改）。
 */
export function judgeConsumption(fields, sources) {
  return fields.filter((field) => !new RegExp(`contributes\\.\\??${field}\\b`).test(sources));
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 全内存夹具——**不读仓库文件、不写任何文件**。
 * 每例都**真跑判据**并断言实得结果（正控必须真的绿、负控必须真的红），
 * 「只写不断言」= 假门禁的常见死法。
 */
function runSelfTest() {
  const DOC_ALL = [
    "# contributes 规范",
    "contributes.views —— 视图",
    "contributes.commands —— 命令",
    "",
  ].join("\n");

  // ② —— 同一集合，仅顺序不同（正控）/ live 多一个（负控）
  const driftSame = judgeCopyDrift(["commands", "views"], ["views", "commands"]);
  const driftSameOrdered = judgeCopyDrift(["commands", "views"], ["commands", "views"]);
  const driftExtra = judgeCopyDrift(
    ["commands", "probeField", "views"],
    ["commands", "views"],
  );

  // ③ —— 各种「出现即算」的形态
  const hitReal = judgeConsumption(["views"], `const v = contributes.views;`);
  const hitComment = judgeConsumption(["views"], `// contributes.views 待接线\n`);
  const hitAll = judgeConsumption(
    ["views", "commands"],
    `contributes.views + contributes.commands`,
  );
  const missNone = judgeConsumption(["views"], `export const x = 1;\n`);
  const prefixOnly = judgeConsumption(["views"], `const c = contributes.viewsContainers;\n`);

  const cases = [
    // ── 正控：合规 ⇒ 0 条（绿） ──
    ["正控①：字段全在文档里 ⇒ 0 条", judgeDocFields(["views", "commands"], DOC_ALL).length, 0],
    ["正控②：同集合同序 ⇒ 不漂移（0 条）", driftSameOrdered.drifted ? 1 : 0, 0],
    ["正控③：同集合**异序**（排序后相同）⇒ 不漂移（0 条）", driftSame.drifted ? 1 : 0, 0],
    [
      "正控④：源码里有 `contributes.views` 真实访问 ⇒ 命中，0 条",
      hitReal.length,
      0,
    ],
    [
      "正控⑤：**钉子**——只在注释里出现 `contributes.views` **也算命中**（已知边界：文本出现即算消费，含注释；⛔不改判据）⇒ 0 条",
      hitComment.length,
      0,
    ],
    ["正控⑥：多字段全部在源码里出现 ⇒ 0 条", hitAll.length, 0],
    // ── 负控：违规 ⇒ 红（条数也要对） ──
    [
      "负控①：文档缺一个字段 ⇒ 报出那一个（点名 probeField）",
      judgeDocFields(["views", "commands", "probeField"], DOC_ALL).length,
      1,
      judgeDocFields(["views", "commands", "probeField"], DOC_ALL)[0] === "probeField",
    ],
    [
      "负控②：live 多一个 ⇒ 漂移，且 detail 带两个数（live(3) vs 拷贝(2)）",
      driftExtra.drifted ? 1 : 0,
      1,
      driftExtra.detail.includes("live(3)") && driftExtra.detail.includes("拷贝(2)"),
    ],
    [
      "负控③：整段源码里没有该字段 ⇒ 报出（点名 views）",
      missNone.length,
      1,
      missNone[0] === "views",
    ],
    [
      "负控④：**前缀字段不误配**——源码只出现 `contributes.viewsContainers` 时，`views` **照样被报出**（`\\b` 挡住了 `viewsC`，实测 `contributes.viewsContainers` **不**命中 `views`；这是现状）",
      prefixOnly.length,
      1,
      prefixOnly[0] === "views",
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
      ? `\n✅ check-contributes self-test 全过（${cases.length} 例：${positives} 正控绿 / ${negatives} 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-contributes self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const violations = [];
  const live = readContributesFields(LIVE_SCHEMA);
  const docText = readFileSync(resolve(ROOT, DOC), "utf-8");

  // ── ① schema → 文档 ──
  for (const field of judgeDocFields(live, docText)) {
    violations.push(`  contributes.${field}  在 03-插件contributes规范.md 无说明——三件套缺文档`);
  }

  // ── ② schema 拷贝漂移（docs 拷贝 vs live）──
  const docs = readContributesFields(DOCS_SCHEMA);
  const drift = judgeCopyDrift(live, docs);
  if (drift.drifted) {
    violations.push(drift.detail);
  }

  // ── ③ schema → 消费面（contributes.<field> 在 src/ + electron/ 出现即算有消费方）──
  const sources = collectTsFiles(resolve(ROOT, "src"))
    .concat(collectTsFiles(resolve(ROOT, "electron")))
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
  for (const field of judgeConsumption(live, sources)) {
    violations.push(
      `  contributes.${field}  在 src/+electron/ 零消费引用——死字段或加载器漏接线（三件套缺消费）`,
    );
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(`\n❌ contributes 三件套 ${violations.length} 处违规——见新能力设计流程 §五 5.3。`);
    process.exit(1);
  }

  console.log(`✅ contributes 三件套审计干净——${live.length} 字段 schema/文档/消费全对齐。`);
}

main();
