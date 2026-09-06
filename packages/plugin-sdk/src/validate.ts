/**
 * 作者面 schema 验证工具（E6#5 立 plugin.json；E6#60 扩 theme/icon 数据文件）。
 * - validatePluginJson（plugin.schema.json，2020-12）——jsonc 解析 + JSON Schema + i18n 文件存在性。
 * - validateThemeJson / validateIconThemeJson（theme.schema.json draft-07 / icon-theme.schema.json 2020-12）——
 *   E6#60 主题/图标作者数据文件校验，镜像 scripts/check-theme-schema.mjs 同规则（同一 schema 文件编译，永不漂移）。
 * 纯逻辑、无 vite import——validatePluginJson 与 bin / defineLinkdeskPluginConfig 三方共用。
 *
 * 设计裁决：
 *   - **解析走 jsonc-parser**（对齐壳 E6#55）——作者 plugin.json 可写注释/尾逗号（对标 VS Code
 *     package.json），注释不参与校验。语法错误报 plugin.json:行:列（ESLint 风格）。
 *   - **必填/contributes 以 plugin.schema.json 为唯一真源**（判据⑧归一性）——读包内 schema 副本做
 *     ajv-2020 全量校验，不手写第二份字段清单。schema 改 → 校验自动跟上。副本漂移由
 *     scripts/check-plugin-schema-sync.mjs 整文件守卫。
 *   - **i18n 文件存在性**是 schema 管不了的第二类检查（schema 只验声明形状，不验文件存在）。
 *   - **entry 语义洞（H2，E6#5a 注记）**：schema 的 entry 条件块只认**废弃 `type`**（const view/card/
 *     protocol，allOf/if/then）；E5.8 后插件走 pluginRole/factoryRole 无 type → schema 拦不住「现代
 *     view 插件缺 entry」，由 vite build 兜底（无 input 报错）。不在此手写第二条 entry 规则（违归一）；
 *     schema 上游补丁留 schema 轮。
 *   - 友好错误：schema 违规没有 plugin.json 行号（JSON Pointer 语义），格式定为
 *     `plugin.json:<instancePath 美化>: <中文消息>`；语法错才有 :行:列。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as jsonc from "jsonc-parser";
import Ajv2020 from "ajv/dist/2020.js"; // 2020-12（plugin.schema / icon-theme.schema）——ajv 无 exports 映射，Node ESM 需显式 .js
import Ajv from "ajv"; // 默认构造 = draft-07——theme.schema（E5.8#129）是 draft-07，draft 自动判定见 compileDataValidator
import type { ErrorObject } from "ajv";

/**
 * 包内 schema 副本定位——dist/validate.js → ../schemas = 包根/schemas；src 直跑同样上溯一级命中。
 * 三份 author 面 schema（plugin/theme/icon-theme）包内副本字节同步由 scripts/check-plugin-schema-sync.mjs 守卫
 * （E6#60：theme/icon-theme 收编——live public/schemas + 包内拷贝，作者 npm i @linkdesk/plugin-sdk 即达）。
 */
const SCHEMAS_DIR = new URL("../schemas/", import.meta.url);

/**
 * pluginId 形状约束——复制自壳 src/pluginLoader/manifest.ts:64（独立 npm 包不能 import @src 壳源码；
 * 加载契约 = 安装目录名 → validateInstallManifest 兜底，E6#7 钉死）。防路径穿越字符直通文件系统。
 */
export const SAFE_PLUGIN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** i18n 声明（相对插件根路径 + 声明来源）——validate 存在性检查与 packager 拷贝清单共用 */
export interface I18nDecl {
  rel: string;
  origin: "contributes.i18n" | "i18n";
}

/**
 * 收集插件 i18n 声明——顶层**废弃** `manifest.i18n` + `contributes.i18n` 两层（schema 243/623 行：
 * 顶层 i18n @deprecated，contributes 为现役）。shape = { 语言代码: 相对路径 }。
 */
export function collectI18nDecls(manifest: unknown): I18nDecl[] {
  if (!manifest || typeof manifest !== "object") return [];
  const m = manifest as Record<string, unknown>;
  const out: I18nDecl[] = [];
  const push = (o: unknown, origin: I18nDecl["origin"]): void => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    for (const v of Object.values(o as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() !== "") out.push({ rel: v, origin });
    }
  };
  push(m.i18n, "i18n");
  const c = m.contributes as Record<string, unknown> | undefined;
  push(c?.i18n, "contributes.i18n");
  return out;
}

/**
 * pluginId 裁决 = manifest.pluginId ?? 源目录名（对齐壳 validateInstallManifest manifest.ts:78-104，
 * 支持目录名 ≠ pluginId 的正确安装）。manifest.pluginId 非字符串 / 任一不合 SAFE_PLUGIN_ID → 抛错。
 * 文件名 `<id>.linkdesk-plugin` 与壳解压目录 {userData}/plugins/<id>/ 都据此契约（E6#7）。
 */
export function derivePluginId(manifest: unknown, sourceDirName: string): string {
  const m = manifest as Record<string, unknown> | null | undefined;
  let pluginId: string;
  const rawId = m?.pluginId;
  if (rawId === undefined || rawId === null) {
    pluginId = sourceDirName;
  } else if (typeof rawId !== "string") {
    throw new Error(`plugin.json 的 pluginId 必须是字符串`);
  } else {
    pluginId = rawId;
  }
  if (!SAFE_PLUGIN_ID.test(pluginId)) {
    throw new Error(
      `pluginId "${pluginId}" 不合法（只允许字母/数字/._-，开头须为字母或数字）` +
        `——plugin.json 未声明 pluginId 时以项目目录名兜底，请改名目录或在 plugin.json 声明 pluginId`,
    );
  }
  return pluginId;
}

/** jsonc 读插件 manifest——注释/尾逗号容忍，语法错抛清晰错误。validate 与 packager 共用同一读取路径 */
export function readPluginManifest(path: string): unknown {
  const text = readFileSync(path, "utf8");
  const parseErrors: jsonc.ParseError[] = [];
  const value = jsonc.parse(text, parseErrors, { allowTrailingComma: true, disallowComments: false });
  if (parseErrors.length > 0) {
    const { line, col } = offsetToLineCol(text, parseErrors[0].offset);
    throw new Error(
      `${basename(path)}:${line}:${col}: ${jsonc.printParseErrorCode(parseErrors[0].error)}——plugin.json 语法错误`,
    );
  }
  return value;
}

/** jsonc 语法错 offset → {line,col}（1 起）。CRLF 的 \r 算一列，可读性足够，不做精确归一 */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/** 已编译 schema 条目——check(data) 后读 errors（反映最近一次调用） */
interface CompiledSchema {
  /** 校验 data——先 check 再读 errors（ajv validate.errors 是上次调用状态，顺序反了会拿到旧/空） */
  check(data: unknown): boolean;
  errors: ErrorObject[];
}

/**
 * ajv 编译 schema 单例——schema 读一次 compile 一次（同一 schema 全进程复用）。按 schema 文件内 $schema
 * 自动选构造（$schema 是权威，防手选 Ctor 与文件漂移）：2020-12 → ajv/dist/2020；draft-07 → ajv 默认。
 */
const compiledCache = new Map<string, CompiledSchema>();
function getSchemaValidator(schemaFileName: string): CompiledSchema {
  const cached = compiledCache.get(schemaFileName);
  if (cached) return cached;
  const raw = readFileSync(fileURLToPath(new URL(schemaFileName, SCHEMAS_DIR)), "utf8");
  const parsed = JSON.parse(raw) as { $schema?: string };
  const is2020 = typeof parsed.$schema === "string" && parsed.$schema.includes("2020-12");
  // 同一构造器签名（allErrors/strict + compile）——类型面以 Ajv 为准，运行期仍是 Ajv2020 实例
  const Ctor = (is2020 ? Ajv2020 : Ajv) as typeof Ajv;
  // eslint-disable-next-line new-cap
  const ajv = new Ctor({ allErrors: true, strict: false });
  const validate = ajv.compile(parsed as object);
  const entry: CompiledSchema = {
    check(data: unknown): boolean {
      const ok = validate(data) as boolean;
      entry.errors = validate.errors ?? [];
      return ok;
    },
    errors: [],
  };
  compiledCache.set(schemaFileName, entry);
  return entry;
}

/** plugin.json 校验器（plugin.schema.json，2020-12） */
function getPluginValidator(): CompiledSchema {
  return getSchemaValidator("plugin.schema.json");
}

/** 主题数据文件校验器（theme.schema.json，draft-07）——E6#60 sdk 侧作者校验（对照 check-theme-schema.mjs 同规则） */
function getThemeValidator(): CompiledSchema {
  return getSchemaValidator("theme.schema.json");
}

/** 图标主题 mappings 数据文件校验器（icon-theme.schema.json，2020-12）——E6#60（现无 icon-theme 校验器，一并立） */
function getIconThemeValidator(): CompiledSchema {
  return getSchemaValidator("icon-theme.schema.json");
}

/** instancePath → 可读路径：/contributes/commands/0 → contributes.commands[0]；空 = 顶部 */
function prettyInstancePath(instancePath: string): string {
  if (!instancePath) return "顶部";
  return instancePath
    .replace(/^\//, "")
    .replace(/\/(\d+)\//g, "[$1].")
    .replace(/\/(\d+)$/g, "[$1]")
    .replace(/\//g, ".");
}

/** schema 违规 → 中文友好消息。required/type 白名单，其余 keyword+params 降级（不追求全覆盖） */
function formatSchemaError(err: ErrorObject): string {
  const at = prettyInstancePath(err.instancePath);
  if (err.keyword === "required") {
    const missing = (err.params as { missingProperty: string }).missingProperty;
    return `${at}: 缺少必填字段 "${missing}"`;
  }
  if (err.keyword === "type") {
    const type = (err.params as { type: string }).type;
    return `${at}: 字段类型应为 ${type}`;
  }
  if (err.keyword === "const") {
    return `${at}: 值必须为 ${JSON.stringify((err.params as { allowedValue: unknown }).allowedValue)}`;
  }
  return `${at}: 不符合 schema 约束 ${err.keyword}`;
}

/** 相对插件根的 rel 是否逃逸根目录（反斜杠/绝对/.. 统一拒）——拷贝与存在性检查共用 */
export function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && rel !== "..");
}

/**
 * 校验 plugin.json——返回 { valid, errors }，**不抛**（集成方拿非 valid 拼文案 throw）。
 * 顺序：读文件 → jsonc 语法 → schema 全量 → i18n 文件存在性（schema 干净才查第二类，防噪音）。
 */
export function validatePluginJson(path: string): ValidationResult {
  const errors: string[] = [];
  const base = basename(path);

  let manifest: unknown;
  try {
    manifest = readPluginManifest(path);
  } catch (err) {
    return { valid: false, errors: [`${err instanceof Error ? err.message : String(err)}`] };
  }

  // 1) JSON Schema（唯一真源）
  const validator = getPluginValidator();
  const ok = validator.check(manifest);
  if (!ok) {
    for (const e of validator.errors) errors.push(`${base}:${formatSchemaError(e)}`);
    return { valid: false, errors };
  }

  // 2) i18n 文件存在性（schema 管不到：声明形状合法但文件可以缺）
  const rootDir = dirname(resolve(path));
  for (const decl of collectI18nDecls(manifest)) {
    const target = resolve(rootDir, decl.rel);
    if (!isWithinRoot(rootDir, target)) {
      errors.push(`${decl.rel}: 在 ${decl.origin} 中声明的路径越出了插件根目录`);
      continue;
    }
    if (!existsSync(target)) {
      errors.push(`${decl.rel}: 在 ${decl.origin} 中声明但文件不存在`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ── 数据文件校验器（E6#60：主题/图标主题 authors 面，镜像 check-theme-schema.mjs 同规则） ── */

/**
 * 数据文件严格 JSON 读取——主题/图标 mappings 数据文件**非 JSONC**（引擎 fetchPluginDataFile JSON.parse，
 * repo check-theme-schema.mjs JSON.parse——两者一致；plugin.json 才走 jsonc，勿混）。
 */
function readDataFileStrict(path: string): { data: unknown } | { error: string } {
  try {
    return { data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    return { error: `${basename(path)}: JSON 解析失败（${err instanceof Error ? err.message : String(err)}）——数据文件非 JSONC，须严格 JSON` };
  }
}

/**
 * 校验主题/图标数据文件——schema 违规/JSON 错，格式同 validatePluginJson（{ valid, errors }，不抛）。
 * schema 文件 = 唯一真源（与 repo check-theme-schema.mjs 同一份，字节同步由 check-plugin-schema-sync 守卫），
 * 规则永不漂移；本函数跑在 schema 上，作者侧拦格式错 = repo 机械闸的第一道镜像。
 */
function validateDataFile(path: string, validator: CompiledSchema): ValidationResult {
  const read = readDataFileStrict(path);
  if ("error" in read) return { valid: false, errors: [read.error] };
  if (!validator.check(read.data)) {
    return { valid: false, errors: validator.errors.map((e) => `${basename(path)}:${formatSchemaError(e)}`) };
  }
  return { valid: true, errors: [] };
}

/** 校验主题数据 JSON 文件（对照 theme.schema.json draft-07——E5.8#129，引擎 parseThemeRecipe 消费格式） */
export function validateThemeJson(path: string): ValidationResult {
  return validateDataFile(path, getThemeValidator());
}

/** 校验图标主题 mappings JSON 文件（对照 icon-theme.schema.json 2020-12——E5.8#133 / E6#60 实收格式，引擎 normalizeIconThemeMappings 消费） */
export function validateIconThemeJson(path: string): ValidationResult {
  return validateDataFile(path, getIconThemeValidator());
}
