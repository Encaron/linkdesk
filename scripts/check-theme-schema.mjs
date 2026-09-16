/**
 * 机械检查：主题/图标数据 JSON formal schema（E5.8#129 立 theme；E6#60 扩 iconThemes）。
 *
 * 契约保护——contributes.themes 指向的主题 JSON 按 public/schemas/theme.schema.json 校验，
 * contributes.iconThemes 指向的 mappings JSON 按 public/schemas/icon-theme.schema.json 校验，
 * 格式错当场拦（npm run check 红灯），不静默（运行时 parseThemeRecipe / normalizeIconThemeMappings
 * 兜底 toast/warn 是第二道防线）。对标 plugin.schema.json（编辑器 IntelliSense + 构建期契约）。
 *
 * 单一权威：public/schemas/theme.schema.json + icon-theme.schema.json（唯一校验源，schema 内嵌描述自带文档；
 * E6#60 起两文件另有 packages/plugin-sdk/schemas/ 字节副本供 npm 作者，漂移由 check-plugin-schema-sync 守）。
 *
 * 实现：内置轻量 JSON Schema 走查器（schema 无关通用）——type / enum / required / properties /
 * additionalProperties（false 或子 schema）/ items + minItems / description / anyOf /
 * $defs + 本地 $ref（"#/$defs/x"）。子集刻意收窄，零运行时依赖（不引 ajv——node_modules 里只是传递
 * 依赖，不可靠）。schema 文件仍是唯一契约——校验器走查通用，两者不会漂移；SDK 侧作者校验用 ajv
 * 编同一份 schema（同规则），见 packages/plugin-sdk/src/validate.ts。
 *
 * 用法：node scripts/check-theme-schema.mjs（已挂 npm run check）
 *       node scripts/check-theme-schema.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * ── 🔴 E6#109p-b（1.28）补自测 ＋ 补「覆盖域变更」警告 ──
 *   1.27 体检：本门禁**没有自测**，而且**今天 0 个对象却照常输出 ✅**——`theme.schema.json 0 个主题文件、
 *   icon-theme.schema.json 0 个图标主题 mappings全部合规` 会被读者读成「都查过了」。本轮两笔：
 *   ① 照 `check-theme-audit.mjs` 的 E6#99 样板补**同款 ⚠️ 覆盖域警告**（总数为 0 时**在 ✅ 之前**打印，
 *      含 `iconThemes` 也为 0 的情形）；
 *   ② 导出 `createValidator` ＋ `--self-test`（**内存夹具**为主，⛔ 不往包里造文件；正控绿 / 负控红）。
 *   ⛔ **已知能力缺口（钉在自测里，本轮不修）**：走查器**不支持 `if`/`then`/`pattern`/`format`**，
 *   而 SDK 侧用 ajv 编同一份 schema ⇒ 同一份 schema 两侧判定能力不同。自测里有一例把这条钉死
 *   （含 `pattern` 的 schema 对不合规数据**仍然零错误** ⇒ 断言「放行」）。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 规则表：contributes 键 → schema 文件（每键独立扫描）
const RULES = [
  {
    contribKey: "themes",
    schemaRel: "public/schemas/theme.schema.json",
    schemaLabel: "theme.schema.json",
    fileKind: "主题文件",
  },
  {
    contribKey: "iconThemes",
    schemaRel: "public/schemas/icon-theme.schema.json",
    schemaLabel: "icon-theme.schema.json",
    fileKind: "图标主题 mappings",
  },
];

/* ── 通用 JSON Schema 走查器（支持 $defs + 本地 $ref + anyOf） ── */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function checkType(v, type) {
  if (type === "object") return isPlainObject(v);
  if (type === "array") return Array.isArray(v);
  if (type === "integer") return Number.isInteger(v);
  return typeof v === type;
}

/**
 * 建校验器——闭包持根 schema 的 $defs 表（$ref 解析用）。
 * 校验 value 对照 schema，错误推入 errors（path = JSON 指针风格）。
 * E6#109p-b（1.28）起导出：`--self-test` 用同一支走查器跑内存夹具（判据本体一字未改）。
 */
export function createValidator(rootSchema) {
  const defs = rootSchema.$defs ?? {};

  function resolveRef(ref, schema, path, value, errors) {
    if (ref.startsWith("#/$defs/")) {
      const key = ref.slice("#/$defs/".length);
      if (key in defs) return validate(value, defs[key], path, errors);
      errors.push(`${path}: 无法解析 $ref "${ref}"（$defs 无 "${key}"）`);
      return;
    }
    errors.push(`${path}: 不支持非 $defs 的 $ref "${ref}"（schema 超出走查器子集）`);
  }

  function validate(value, schema, path, errors) {
    if (schema === true || schema === undefined) return;
    if (schema === false) {
      errors.push(`${path}: 禁止任何值`);
      return;
    }
    if (typeof schema.$ref === "string") {
      resolveRef(schema.$ref, schema, path, value, errors);
      return;
    }
    if (schema.type && !checkType(value, schema.type)) {
      errors.push(`${path}: 期望 ${schema.type}，实得 ${typeOf(value)}（${JSON.stringify(value)?.slice(0, 40)}）`);
      return;
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path}: 期望 enum [${schema.enum.join(" / ")}]，实得 ${JSON.stringify(value)}`);
    }
    // anyOf：任一分支过即合规；全失败报「无一分支匹配」+ 首分支错误摘要
    if (Array.isArray(schema.anyOf)) {
      for (const branch of schema.anyOf) {
        const sub = [];
        validate(value, branch, path, sub);
        if (sub.length === 0) return; // 有一分支过 → 合规
      }
      errors.push(`${path}: 不符合 anyOf——条目须满足任一形态约束（如字体 glyph 需 class，图像资产需 imagePath）`);
      return;
    }

    if (isPlainObject(value)) {
      if (schema.required) {
        for (const req of schema.required) {
          if (!(req in value)) errors.push(`${path}: 缺必需字段 "${req}"`);
        }
      }
      if (schema.properties) {
        for (const [key, sub] of Object.entries(schema.properties)) {
          if (key in value) validate(value[key], sub, `${path}.${key}`, errors);
        }
      }
      const known = schema.properties ? Object.keys(schema.properties) : [];
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!known.includes(key)) errors.push(`${path}: 未知字段 "${key}"`);
        }
      } else if (isPlainObject(schema.additionalProperties)) {
        for (const [key, val] of Object.entries(value)) {
          if (!known.includes(key)) validate(val, schema.additionalProperties, `${path}.${key}`, errors);
        }
      }
    }

    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`${path}: 至少 ${schema.minItems} 项，实得 ${value.length}`);
      }
      if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`, errors));
    }
  }

  return validate;
}

/* ── 收集插件 plugin.json ── */

function collectPluginJson(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectPluginJson(full, acc);
    else if (entry.isFile() && entry.name === "plugin.json") acc.push(full);
  }
  return acc;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/** 跑一遍走查器，返回错误数组（与 main() 同样的调用形态：根 schema 当子 schema，path 从 "" 起） */
function validateWith(schema, data) {
  const errors = [];
  createValidator(schema)(data, schema, "", errors);
  return errors;
}

/**
 * 正控 = 合规数据 ⇒ **0 错**（绿）；负控 = 违规数据 ⇒ **报出**（红）。
 * 全部是**内存夹具**（⛔ 不往 plugins/ 包里造文件——1.27 手验用的临时 probe 文件不该进自测）。
 * ⚠️ 最后一例是**已知缺口钉子**：走查器不执行 `pattern` ⇒ 不合规数据被**放行**（算 0 错）。
 *    它被计入正控，因为它**今天确实是绿的**——钉住的是「别以为它拦得住」这件事本身。
 */
function runSelfTest() {
  // 一具多能：type / required / enum / items + minItems / anyOf / additionalProperties:false
  const FULL = {
    type: "object",
    required: ["id", "mode"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      mode: { enum: ["light", "dark"] },
      stops: { type: "array", minItems: 2, items: { type: "string" } },
      badge: {
        anyOf: [
          { type: "string" },
          { type: "object", required: ["glyph"], properties: { glyph: { type: "string" } } },
        ],
      },
    },
  };
  const FULL_OK = { id: "panel-demo", mode: "dark", stops: ["#000", "#fff"], badge: { glyph: "★" } };

  const ANYOF = {
    type: "object",
    properties: {
      badge: {
        anyOf: [
          { type: "string" },
          { type: "object", required: ["glyph"], properties: { glyph: { type: "string" } } },
        ],
      },
    },
  };

  const LIST = { type: "object", properties: { stops: { type: "array", minItems: 2, items: { type: "string" } } } };

  const REF_OK = {
    $defs: { hex: { type: "string" } },
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string" }, brand: { $ref: "#/$defs/hex" } },
  };

  const cases = [
    // ── 正控：合规 ⇒ 0 错（绿） ──
    ["正控①：完整合法数据（type/required/enum/items/anyOf 全过）⇒ 0 错", FULL, FULL_OK, 0],
    ["正控②：enum 合规（取值在表内）⇒ 0 错", { type: "object", properties: { mode: { enum: ["light", "dark"] } } }, { mode: "light" }, 0],
    ["正控③：anyOf 命中第一分支（字符串）⇒ 0 错", ANYOF, { badge: "ok" }, 0],
    ["正控④：anyOf 命中第二分支（对象带 glyph）⇒ 0 错", ANYOF, { badge: { glyph: "★" } }, 0],
    ["正控⑤：`$defs` + 本地 `$ref` 可解析且合规 ⇒ 0 错", REF_OK, { id: "panel-demo", brand: "#fff" }, 0],
    [
      "正控⑥：`additionalProperties` 为子 schema（未列字段按子 schema 过）⇒ 0 错",
      { type: "object", properties: { id: { type: "string" } }, additionalProperties: { type: "number" } },
      { id: "a", extra: 3 },
      0,
    ],
    ["正控⑦：`type: \"integer\"` 合规 ⇒ 0 错", { type: "object", properties: { level: { type: "integer" } } }, { level: 3 }, 0],
    ["正控⑧：缺**可选**字段（不在 required 里）⇒ 0 错", { type: "object", required: ["id"], properties: { id: { type: "string" }, note: { type: "string" } } }, { id: "a" }, 0],
    ["正控⑨：`items` 全合规且 `minItems` 达标 ⇒ 0 错", LIST, { stops: ["#000", "#fff"] }, 0],
    ["正控⑩：空 schema（无任何约束）⇒ 0 错（放行）", {}, { mystery: 1 }, 0],
    // 🔴 已知缺口钉子：走查器不执行 pattern ⇒ 不合规数据被放行（见文件头「已知能力缺口」）
    [
      "正控⑪：🔴 `pattern` 不被执行（已知缺口钉子）⇒ 0 错（不合规 id 被放行）",
      { type: "object", properties: { id: { type: "string", pattern: "^[a-z-]+$" } } },
      { id: "ABC_123" },
      0,
    ],

    // ── 负控：违规 ⇒ 必须报出（红） ──
    [
      "负控①：缺 required（少 mode）⇒ 报「缺必需字段」",
      FULL,
      { id: "panel-demo", stops: ["#000", "#fff"], badge: "ok" },
      1,
      '缺必需字段 "mode"',
    ],
    [
      "负控②：类型错（id 给数字）⇒ 报「期望 string」，且路径定位到 .id",
      { type: "object", properties: { id: { type: "string" } } },
      { id: 3 },
      1,
      "期望 string，实得 number",
    ],
    [
      '负控③：未知字段（`additionalProperties: false`）⇒ 报「未知字段 "bogusField"」（照 1.27 手验形态）',
      FULL,
      { ...FULL_OK, bogusField: 1 },
      1,
      '未知字段 "bogusField"',
    ],
    [
      "负控④：`enum` 违规（mode=neon）⇒ 报「期望 enum」",
      { type: "object", properties: { mode: { enum: ["light", "dark"] } } },
      { mode: "neon" },
      1,
      "期望 enum [light / dark]",
    ],
    ["负控⑤：`anyOf` 全不匹配（badge 给数字）⇒ 报「不符合 anyOf」", ANYOF, { badge: 42 }, 1, "不符合 anyOf"],
    ["负控⑥：`minItems` 不足（1 < 2）⇒ 报「至少 2 项」", LIST, { stops: ["#000"] }, 1, "至少 2 项，实得 1"],
    [
      "负控⑦：`$ref` 指向不存在的 `$defs` ⇒ 报「无法解析」",
      { $defs: {}, type: "object", properties: { brand: { $ref: "#/$defs/hex" } } },
      { brand: "#fff" },
      1,
      "无法解析 $ref",
    ],
    [
      "负控⑧：非 `$defs` 的 `$ref` ⇒ 报「不支持非 $defs」（超出走查器子集）",
      { type: "object", properties: { brand: { $ref: "https://example.com/hex.json" } } },
      { brand: "#fff" },
      1,
      "不支持非 $defs 的 $ref",
    ],
    ["负控⑨：`items` 元素类型错（第 2 项给数字）⇒ 报「期望 string」", LIST, { stops: ["#000", 42] }, 1, "期望 string，实得 number"],
  ];

  let bad = 0;
  for (const [tag, schema, data, want, needle] of cases) {
    const got = validateWith(schema, data);
    const detail = got.join(" / ");
    const pass = got.length === want && (needle ? detail.includes(needle) : true);
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 错\n`);
    if (!pass) {
      process.stdout.write(`      · 期望 ${want} 错${needle ? `且含「${needle}」` : ""}，实得：${detail || "（零错误）"}\n`);
    }
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-theme-schema self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n` +
          `   ⚠️ 已知缺口（已钉死，本轮**不修**）：走查器不执行 pattern（也不执行 if/then/format）⇒ 不合规数据被放行；` +
          `SDK 侧用 ajv 编同一份 schema ⇒ 两侧判定能力不同。\n`
      : `\n🔴 check-theme-schema self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  // 预载两 schema——缺失任一 = 审计失效
  const schemas = new Map();
  for (const rule of RULES) {
    const abs = resolve(ROOT, rule.schemaRel);
    if (!existsSync(abs)) {
      console.error(`❌ ${rule.schemaRel} 不存在——审计失效。`);
      process.exit(1);
    }
    schemas.set(rule.schemaRel, { rule, schema: JSON.parse(readFileSync(abs, "utf-8")) });
  }

  const pluginsDir = resolve(ROOT, "plugins");
  const pluginFiles = collectPluginJson(pluginsDir);

  const violations = [];
  const scanned = {};

  for (const pluginJson of pluginFiles) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(pluginJson, "utf-8"));
    } catch (e) {
      violations.push(`${relative(ROOT, pluginJson)}: JSON 解析失败（${e.message}）`);
      continue;
    }
    const contributes = manifest?.contributes;
    if (!isPlainObject(contributes)) continue;

    for (const { rule, schema } of schemas.values()) {
      const list = contributes[rule.contribKey];
      if (!Array.isArray(list)) continue;
      for (const tc of list) {
        if (!tc?.path || typeof tc.path !== "string") {
          violations.push(`${relative(ROOT, pluginJson)}: contributes.${rule.contribKey} 条目缺 path`);
          continue;
        }
        const dataFile = resolve(dirname(pluginJson), tc.path);
        if (!existsSync(dataFile)) {
          violations.push(`${relative(ROOT, dataFile)}: ${rule.fileKind}不存在（plugin.json 声明 ${tc.path}）`);
          continue;
        }
        let data;
        try {
          data = JSON.parse(readFileSync(dataFile, "utf-8"));
        } catch (e) {
          violations.push(`${relative(ROOT, dataFile)}: JSON 解析失败（${e.message}）`);
          continue;
        }
        scanned[rule.schemaRel] = (scanned[rule.schemaRel] ?? 0) + 1;
        const errors = [];
        createValidator(schema)(data, schema, "", errors);
        for (const err of errors) {
          violations.push(`${relative(ROOT, dataFile)}${err || ": 无效"}`);
        }
      }
    }
  }

  const totalScanned = Object.values(scanned).reduce((a, b) => a + b, 0);

  if (violations.length) {
    console.error(`❌ 主题/图标 schema 校验失败——${violations.length} 处违规：`);
    for (const v of violations) console.error(`   ${v}`);
    console.error(`   扫描 ${totalScanned} 个数据文件（${RULES.map((r) => `${r.schemaLabel} → ${scanned[r.schemaRel] ?? 0} 个`).join("；")}）`);
    process.exit(1);
  }

  // 🔴 E6#109p-b（1.28）：**覆盖域变更要明说，不许真空绿灯**——照 check-theme-audit.mjs 的 E6#99 那段
  //   同款措辞（那是全链的诚实样板）。本门禁扫 contributes.themes / contributes.iconThemes 指向的数据
  //   文件，而主题/图标集插件源码已外移各自独立仓 ⇒ 仓内两只开发夹具都不含 themes/ ⇒ 扫描数归零。
  //   归零（themes 与 iconThemes 双双为 0）时，下面这段必须在 ✅ **之前**打印——否则
  //   「theme.schema.json 0 个主题文件、icon-theme.schema.json 0 个图标主题 mappings全部合规」
  //   会被读者读成「都查过了」。
  if (totalScanned === 0) {
    console.log(
      "⚠ 覆盖域变更（E6#109p-b，照 check-theme-audit 的 E6#99 样板）：仓内 plugins/ 下 0 个主题/图标数据文件——" +
        "本门禁当前**无对象**（≠「主题/图标都合规」）。" +
        "\n   原因：主题/图标集插件的源码已外移各自独立仓，本仓只剩两只不含 themes/ 的开发夹具。" +
        "\n   去向：主题/图标 schema 检查随插件走，由各插件仓自己的 CI 负责。"
    );
  }
  console.log(`✅ 主题/图标 schema 校验通过——${RULES.map((r) => `${r.schemaLabel} ${scanned[r.schemaRel] ?? 0} 个${r.fileKind}`).join("、")}全部合规`);
}

main();
