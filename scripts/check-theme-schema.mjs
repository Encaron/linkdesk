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
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
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
 */
function createValidator(rootSchema) {
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

function main() {
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

  if (violations.length) {
    console.error(`❌ 主题/图标 schema 校验失败——${violations.length} 处违规：`);
    for (const v of violations) console.error(`   ${v}`);
    console.error(`   扫描 ${Object.values(scanned).reduce((a, b) => a + b, 0)} 个数据文件（${RULES.map((r) => `${r.schemaLabel} → ${scanned[r.schemaRel] ?? 0} 个`).join("；")}）`);
    process.exit(1);
  }
  console.log(`✅ 主题/图标 schema 校验通过——${RULES.map((r) => `${r.schemaLabel} ${scanned[r.schemaRel] ?? 0} 个${r.fileKind}`).join("、")}全部合规`);
}

main();
