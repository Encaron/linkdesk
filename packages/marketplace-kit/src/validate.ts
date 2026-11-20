/**
 * validate——marketplace.json / authors/<id>.json 的纯校验函数（正典 11 §二/§五）。
 *
 * 两层：
 *   ① schema 层（ajv 2020-12）——结构/封闭集合/未知字段。schema 文件与 `@linkdesk/plugin-sdk`
 *      的 marketplace.schema.json **字节同源**（kitReconcile.test.ts 钉死）⇒ kit 拒的 = 市场
 *      parse 拒的（市场腿② catalogV2Reconcile 对已安装 SDK schema 对账）。未知字段在市场侧是
 *      「白名单静默丢」——kit 升级为 **error**（拼错字段不拦住，作者的意图就静默不存在）。
 *   ② 语义层（warning）——错误码与市场侧 warnings **同一套**（11 §五，插件仓源码为码表真源）：
 *      `unknown-category` / `unknown-subcategory`（categories.ts）· `duplicate-hero` /
 *      `missing-collection`（authors.ts）· `unknown-rail-category` / `missing-entry-field`
 *      （parse.ts）。🔴 小分类封闭拍板配套：名单外值的报错信息**直接列出可用清单全表**
 *      （04 §5.1——作者不用翻文档）。
 *
 * 目录模式（validateDirectory）：跨文件校验——作者块的 section.collection 引用是否在该目录
 *   marketplace.json 的 collections 里声明（单文件模式查不了，不查 = 不假装）。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { formatCategoryWhitelist, formatPrimaryCategories, isKnownPrimaryCategory, isKnownSubcategory } from "./categoryWhitelist.js";
import type { AuthorFile, CatalogEntry, MarketplaceFile } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** src/ 与 dist/ 都在包根下一层 → ../schemas 两种落点通用 */
const SCHEMAS_DIR = join(HERE, "..", "schemas");

export const MARKETPLACE_SCHEMA_URL = "https://unpkg.com/@linkdesk/marketplace-kit/schemas/marketplace.schema.json";
export const AUTHORS_SCHEMA_URL = "https://unpkg.com/@linkdesk/marketplace-kit/schemas/authors.schema.json";

export interface ValidateIssue {
  /** 市场侧同名警告码；schema 层统一 "schema" */
  code: string;
  severity: "error" | "warning";
  /** 人读路径：plugins[0].versions[1]（根 = (root)） */
  path: string;
  message: string;
}

export interface ValidateResult {
  errors: ValidateIssue[];
  warnings: ValidateIssue[];
}

/* ── ajv 编译（惰性单例——import 不付编译钱）────────────────────────────── */

let marketplaceValidate: ValidateFunction | null = null;
let authorValidate: ValidateFunction | null = null;

function compile(path: string): ValidateFunction {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, path), "utf8")) as object;
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

function getMarketplaceValidate(): ValidateFunction {
  marketplaceValidate ??= compile("marketplace.schema.json");
  return marketplaceValidate!;
}

function getAuthorValidate(): ValidateFunction {
  authorValidate ??= compile("authors.schema.json");
  return authorValidate!;
}

/* ── ajv 错误 → 人读 issue ───────────────────────────────────────────── */

/** /plugins/0/versions/1 → plugins[0].versions[1]；根 = (root) */
function humanPath(instancePath: string): string {
  if (!instancePath) return "(root)";
  const parts = instancePath.split("/").filter(Boolean);
  let out = "";
  for (const p of parts) {
    if (/^\d+$/.test(p)) out += `[${p}]`;
    else out += out ? `.${p}` : p;
  }
  return out;
}

/** 近似键提示——编辑距离 ≤2 的唯一最近键（「collection 键写成 id」类拼错的机械兜底，11 §五） */
function suggestKey(bad: string, allowed: string[]): string | null {
  const dist = (a: string, b: string): number => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length]![b.length]!;
  };
  const near = allowed.map((k) => ({ k, d: dist(bad.toLowerCase(), k.toLowerCase()) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d);
  return near.length === 1 ? near[0]!.k : (near.length > 1 ? near[0]!.k : null);
}

/** schema 属性名清单（未知字段报错「allowed: …」用——同一条「可用清单」纪律的键版）。
 *  rootDef：$ref-at-root 编译后根级错误 schemaPath 是 "#/additionalProperties"（authors.schema.json
 *  即此形态）——此时取 rootDef 的 properties 而不是包装文件的根。 */
function allowedKeysOf(schema: object, schemaPath: string, rootDef?: string): string[] | null {
  const rootProps = (schema as { properties?: Record<string, unknown> }).properties;
  const defs = (schema as { $defs?: Record<string, { properties?: Record<string, unknown> }> }).$defs ?? {};
  const m = /#\/\$defs\/([A-Za-z]+)/.exec(schemaPath);
  if (m) {
    const props = defs[m[1]!]?.properties;
    return props ? Object.keys(props) : null;
  }
  if (schemaPath.startsWith("#/additionalProperties")) {
    const props = rootDef ? defs[rootDef]?.properties : rootProps;
    return props ? Object.keys(props) : null;
  }
  return null;
}

function ajvErrorsToIssues(validate: ValidateFunction, schema: object, rootDef?: string): ValidateIssue[] {
  const schemaObj = schema;
  return (validate.errors ?? []).map((e: ErrorObject) => {
    const path = humanPath(e.instancePath);
    if (e.keyword === "additionalProperties") {
      const bad = (e.params as { additionalProperty?: string }).additionalProperty ?? "";
      const allowed = allowedKeysOf(schemaObj, e.schemaPath ?? "", rootDef);
      const hint = allowed ? suggestKey(bad, allowed) : null;
      const msg = hint
        ? `未知字段 "${bad}"（${path}）——你是不是想写 "${hint}"？`
        : `未知字段 "${bad}"（${path}）${allowed ? `——可用键：${allowed.join(", ")}` : ""}。市场解析白名单会静默丢弃它（作者以为生效了其实没有）；若这是新字段，请升级 @linkdesk/marketplace-kit。`;
      return { code: "schema", severity: "error" as const, path, message: msg };
    }
    return { code: "schema", severity: "error" as const, path, message: `${path} ${e.message ?? "schema 违规"}` };
  });
}

/* ── 语义层：marketplace.json ─────────────────────────────────────────── */

const WHITELIST_HINT = `可用清单（04 §5.1 全表，只能选不能自创 slug）：\n${formatCategoryWhitelist()}`;

/** 抓取/照市场 parse.ts missingFetchedFieldWarnings 同判据（publishedAt 含 versions[] 任一；author 两形态；repo 三来源推得出） */
function missingFetchedFields(entry: CatalogEntry): ValidateIssue[] {
  const out: ValidateIssue[] = [];
  const hasPublished =
    (typeof entry.publishedAt === "string" && entry.publishedAt.trim().length > 0) ||
    (entry.versions?.some((v) => typeof v?.publishedAt === "string" && v.publishedAt.trim().length > 0) ?? false);
  if (!hasPublished)
    out.push({ code: "missing-entry-field", severity: "warning", path: `plugins[${entry.id}]`, message: `条目 ${entry.id} 缺 publishedAt（versions[] 里任一版有也算有）——详情页「更新时间」不画行、来源页记声明提示。` });
  const authorName = typeof entry.author === "string" ? entry.author : entry.author?.name; // schema 只收对象；string 形态照市场 parse 的宽容读保留
  if (!authorName || !authorName.trim())
    out.push({ code: "missing-entry-field", severity: "warning", path: `plugins[${entry.id}]`, message: `条目 ${entry.id} 缺 author（string 或 {name} 两形态）——详情页「作者」行不画行。` });
  const repoDerivable =
    (typeof entry.repository === "string" && entry.repository.trim().length > 0) ||
    /https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\//.test(String(entry.downloadUrl ?? "")) ||
    /https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\//.test(String(entry.readmeUrl ?? ""));
  if (!repoDerivable)
    out.push({ code: "missing-entry-field", severity: "warning", path: `plugins[${entry.id}]`, message: `条目 ${entry.id} 的仓库 URL 推不出（repository / downloadUrl / readmeUrl 都没有 github 形态）——详情页「仓库/问题」行不画行。` });
  return out;
}

function marketplaceSemantics(data: MarketplaceFile): ValidateIssue[] {
  const out: ValidateIssue[] = [];
  for (const entry of data.plugins ?? []) {
    const primary = typeof entry.category === "string" ? entry.category.trim() : "";
    if (primary && !isKnownPrimaryCategory(primary))
      out.push({
        code: "unknown-category",
        severity: "warning",
        path: `plugins[${entry.id}].category`,
        message: `主分类 "${primary}" 不在封闭名单里（原值保留；市场归「其他」桶可见，不崩不藏）。\n${WHITELIST_HINT}`,
      });
    for (const raw of entry.categories ?? []) {
      const slug = typeof raw === "string" ? raw.trim() : "";
      if (!slug || isKnownSubcategory(slug)) continue;
      out.push({
        code: "unknown-subcategory",
        severity: "warning",
        path: `plugins[${entry.id}].categories`,
        message: `小分类 "${slug}" 不在封闭名单里（原值保留；UI 归「未标注小类」兜底 chip）。\n${WHITELIST_HINT}`,
      });
    }
    out.push(...missingFetchedFields(entry));
  }
  const railOrder = data.categoryRail?.order ?? [];
  for (const slug of railOrder) {
    if (!isKnownPrimaryCategory(slug))
      out.push({
        code: "unknown-rail-category",
        severity: "warning",
        path: "categoryRail.order",
        message: `rail 顺序里的 "${slug}" 不是注册主分类（未注册不进 rail、恒末位「其他」桶）。可用主分类：${formatPrimaryCategories()}`,
      });
  }
  return out;
}

/* ── 语义层：authors/<id>.json ────────────────────────────────────────── */

/** knownCollections 缺省（单文件模式）= 不查合集引用（查不了 ≠ 假装查过） */
function authorSemantics(data: AuthorFile, knownCollections?: ReadonlySet<string>): ValidateIssue[] {
  const out: ValidateIssue[] = [];
  const sections = data.homepage?.sections ?? [];
  const heroes = sections.filter((s) => s.type === "hero").length;
  if (heroes > 1)
    out.push({
      code: "duplicate-hero",
      severity: "warning",
      path: "homepage.sections",
      message: `${heroes} 个 hero 板块——第一个占大屏槽，其余按声明顺序就地渲染（市场侧同款警告 duplicate-hero）。要全是大屏请合并 slides。`,
    });
  if (knownCollections) {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      if (s.type === "collection" && !knownCollections.has(s.collection))
        out.push({
          code: "missing-collection",
          severity: "warning",
          path: `homepage.sections[${i}].collection`,
          message: `合集 "${s.collection}" 未在该目录的 marketplace.json collections[] 里声明（市场侧按 id 找不到 = 板块空转）。`,
        });
    }
  }
  return out;
}

/* ── 对外入口 ─────────────────────────────────────────────────────────── */

export function validateMarketplace(data: unknown): ValidateResult {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "marketplace.schema.json"), "utf8")) as object;
  const validate = getMarketplaceValidate();
  const ok = validate(data) as boolean;
  const errors = ok ? [] : ajvErrorsToIssues(validate, schema);
  const warnings = ok ? marketplaceSemantics(data as MarketplaceFile) : [];
  return { errors, warnings };
}

export function validateAuthorFile(data: unknown, knownCollections?: ReadonlySet<string>): ValidateResult {
  const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, "authors.schema.json"), "utf8")) as object;
  const validate = getAuthorValidate();
  const ok = validate(data) as boolean;
  // $ref-at-root：根级错误的「可用键」要取 authorBlock 的 properties（见 allowedKeysOf rootDef 注）
  const errors = ok ? [] : ajvErrorsToIssues(validate, schema, "authorBlock");
  const warnings = ok ? authorSemantics(data as AuthorFile, knownCollections) : [];
  return { errors, warnings };
}

export function isAuthorFileName(basename: string): boolean {
  return /^author(s)?[.\-]/i.test(basename);
}

export function isMarketplaceFileName(basename: string): boolean {
  return basename === "marketplace.json";
}

/** CLI 渲染（validate 输出统一走这里——错误码即市场侧 vocabulary） */
export function formatIssues(result: ValidateResult): string {
  const lines: string[] = [];
  for (const e of result.errors) lines.push(`✗ [${e.code}] ${e.path}: ${e.message}`);
  for (const w of result.warnings) lines.push(`⚠ [${w.code}] ${w.path}: ${w.message}`);
  if (lines.length === 0) return "OK";
  return lines.join("\n");
}
