/**
 * 机械检查：主题 JSON 文件 formal schema（E5.8#129，audit-theme-schema）。
 *
 * 契约保护——contributes.themes 指向的主题 JSON 文件按 public/schemas/theme.schema.json 校验，
 * 格式错当场拦（npm run check 红灯），不静默（运行时 parseThemeRecipe 兜底 toast 是第二道防线）。
 * 对标 plugin.schema.json（编辑器 IntelliSense + 构建期契约）；本脚本是机械层（对标 #137 三件套）。
 *
 * 单一权威：public/schemas/theme.schema.json（唯一校验源，schema 内嵌描述自带文档）。
 *
 * 实现：内置轻量 JSON Schema（draft-07 子集）校验器——type / enum / required / properties /
 * additionalProperties（false 或子 schema）/ items + minItems / description。子集刻意收窄到
 * theme.schema.json 实际使用的构造，零运行时依赖（不引 ajv——node_modules 里只是传递依赖，不可靠）。
 * schema 文件仍是唯一契约——校验器是 schema 无关的通用走查，两者不会漂移。
 *
 * 用法：node scripts/check-theme-schema.mjs（已挂 npm run check）
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCHEMA_PATH = resolve(ROOT, "public/schemas/theme.schema.json");

/* ── 通用 JSON Schema（draft-07 子集）校验器 ── */

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

/** 校验 value 对照 schema，错误推入 errors（path = JSON 指针风格） */
function validate(value, schema, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${path}: 禁止任何值`);
    return;
  }

  if (schema.type && !checkType(value, schema.type)) {
    errors.push(`${path}: 期望 ${schema.type}，实得 ${typeOf(value)}（${JSON.stringify(value)?.slice(0, 40)}）`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: 期望 enum [${schema.enum.join(" / ")}]，实得 ${JSON.stringify(value)}`);
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

/* ── 收集插件 contributes.themes 指向的主题 JSON 文件 ── */

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
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`❌ ${relative(ROOT, SCHEMA_PATH)} 不存在——审计失效。`);
    process.exit(1);
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const pluginsDir = resolve(ROOT, "plugins");
  const pluginFiles = collectPluginJson(pluginsDir);

  const violations = [];
  let scanned = 0;

  for (const pluginJson of pluginFiles) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(pluginJson, "utf-8"));
    } catch (e) {
      violations.push(`${relative(ROOT, pluginJson)}: JSON 解析失败（${e.message}）`);
      continue;
    }
    const themes = manifest?.contributes?.themes;
    if (!Array.isArray(themes)) continue;

    for (const tc of themes) {
      if (!tc?.path) {
        violations.push(`${relative(ROOT, pluginJson)}: contributes.themes 条目缺 path`);
        continue;
      }
      const themeFile = resolve(dirname(pluginJson), tc.path);
      if (!existsSync(themeFile)) {
        violations.push(`${relative(ROOT, themeFile)}: 主题文件不存在（plugin.json 声明 ${tc.path}）`);
        continue;
      }
      let data;
      try {
        data = JSON.parse(readFileSync(themeFile, "utf-8"));
      } catch (e) {
        violations.push(`${relative(ROOT, themeFile)}: JSON 解析失败（${e.message}）`);
        continue;
      }
      scanned++;
      const errors = [];
      validate(data, schema, "", errors);
      for (const err of errors) {
        violations.push(`${relative(ROOT, themeFile)}${err || ": 无效"}`);
      }
    }
  }

  if (violations.length) {
    console.error(`❌ 主题 schema 校验失败——${violations.length} 处违规：`);
    for (const v of violations) console.error(`   ${v}`);
    console.error(`   扫描 ${scanned} 个主题文件（schema = public/schemas/theme.schema.json，E5.8#129）`);
    process.exit(1);
  }
  console.log(`✅ 主题 schema 校验通过——${scanned} 个 contributes.themes 指向文件全部合规（theme.schema.json）`);
}

main();
