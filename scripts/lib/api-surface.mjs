/**
 * 「插件能用的面」采集库（E6#115）——快照生成器与只加不删门禁的**唯一生成器**。
 *
 * 本层的承诺（memory `plugin-authoring-manual.md:179-180`）：「平台承担兼容责任……旧扩展在新版本上
 * 仍然能跑」。本库把「面」机械地抽出来，好让 `gen-api-surface.mjs` 冻结成快照、让
 * `check-api-surface-additive.mjs` 与上一个已发布 tag 比对：**新增放过，缺项/改名判红**。
 *
 * ── 四栏（收什么 / 不收什么）──
 *   ① `apiNamespaces` —— `window.linkdesk.*` 的**命名空间与成员**。**两个面都收**：
 *      · `apiNamespaces` = `LinkDeskAPI`（`src/core/api/linkdesk-api.ts` 交叉组装的**作者编译期**面）；
 *      · `poolExposed`   = `PoolExposed`（`src/core/api/linkdesk-api/surfaces.ts`，**插件运行时真正注入**
 *        的那份 `contextBridge.exposeInMainWorld` 对象）——它是 `LinkDeskAPI` 的 Pick/Omit 投影：
 *        从 `LinkDeskAPI` 里删成员**不一定**从 `PoolExposed` 里删，反之亦然，所以两面分别冻。
 *      ⛔ 不收 `ShellExposed`（壳自己的面，不是插件能用的面）。⛔ 不收**可选性**（`?`）：可选 ↔ 必选
 *        的变化不改运行时行为（插件产物是冻结的），收它只会制造假红——见 §残余边界。
 *   ② `manifestFields` —— `plugin.json` 的**字段路径 ＋ 枚举值**。真源 = `public/schemas/plugin.schema.json`
 *      （live 权威；另外三份拷贝由 `check-plugin-schema-sync.mjs` 逐字节守着，所以只读 live 一份）。
 *   ③ `hostClassNames` / `reservedKeyframes` —— 宿主 `ldk-*` 类名 ＋ 保留关键帧。**与尺子
 *      `scripts/plugin-dangling-name-audit.mjs` 同一个生成器**（`scripts/lib/host-surface.mjs`），
 *      ⛔ 不许另写一把（两处不同源 = 「快照说缺、尺子说没悬空」）。
 *   ④ `ledger` —— `scripts/host-reserved.json` 各栏（`$comment` / `version` 除外：前者是散文，
 *      后者是**账形状的修订号**，抬版是正常动作，不是面被拿走）。
 *
 * ── 集合语义（§五判据⑤的直接依据）──
 *   每个数组都**排序后**写入 ⇒ 只改顺序 / 只改注释**不产生 diff**（否则天天假红）。
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectHostDefs, ROOT } from "./host-surface.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

/** 快照文件（相对仓库根，随版本提交、进 git） */
export const SNAPSHOT_REL = "scripts/host-api-surface.json";

const API_ENTRY = "src/core/api/linkdesk-api.ts";
const API_SURFACES = "src/core/api/linkdesk-api/surfaces.ts";
const PLUGIN_SCHEMA = "public/schemas/plugin.schema.json";
const LEDGER = "scripts/host-reserved.json";

/** 根级直挂成员（不是命名空间）落这一栏 */
const ROOT_BUCKET = "apiRootMembers";

/** 各栏的生成口径（写进快照的 `generatedFrom`，供人手工核） */
export const COLUMN_CALIBERS = {
  apiNamespaces:
    `LinkDeskAPI（${API_ENTRY} 交叉组装 15 域；成员名取 TS 类型检查器解出的属性名，排序、集合语义）。` +
    `⛔ 不收可选性（?）、不收签名与返回类型——那些变化不改冻结产物在运行时的行为。`,
  poolExposed:
    `PoolExposed（${API_SURFACES}）——池 preload contextBridge 真正注入的那份面；` +
    `与 LinkDeskAPI 分别冻，因为 Pick/Omit 的增删可以不同步。`,
  manifestFields:
    `public/schemas/plugin.schema.json（live 权威）的 properties 路径；值 = 该节点的 enum 取值（无枚举为空数组）。` +
    `$ref 就地解析（含 $defs），allOf 分支一并走。`,
  hostClassNames:
    `src/**/*.css 的**裸定义** ∩ ldk-*（与尺子 plugin-dangling-name-audit.mjs 同生成器 scripts/lib/host-surface.mjs；` +
    `第三方 CSS 的 codicon-* 等不进本栏——它们不是宿主契约）。`,
  reservedKeyframes: "packages/plugin-sdk/schemas/reserved-class-names.json 的 keyframes 名。",
  ledger: `scripts/host-reserved.json 各栏（除 $comment / version：后者是账形状修订号，抬版不是面被拿走）。`,
};

/* ══════════════════════════════════════════════════════════════════════════
   ① window.linkdesk.* 的两个面（TS 类型检查器）
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 剥掉 `| undefined` / `| null`——**可选成员（`?`）在类型检查器眼里是 `T | undefined` 联合**，
 * 不剥就会把它错判成「没有成员」（联合的属性是各分支的交集 = 空）⇒ 收进 `apiRootMembers`。
 * 后果不是「少收一个名字」，而是：作者哪天摘掉那个 `?`，同一处会从「根级成员」跳进「命名空间」，
 * 集合语义下看起来就是**一删一加** ⇒ 假红。可选性不是面（见文件头注），所以这里必须剥。
 */
function unwrapOptional(t) {
  if (!t || !t.isUnion()) return t;
  const parts = t.types.filter(
    (x) => !(x.flags & ts.TypeFlags.Undefined) && !(x.flags & ts.TypeFlags.Null) && !(x.flags & ts.TypeFlags.Void),
  );
  return parts.length === 1 ? parts[0] : t;
}

/**
 * 把一个类型解成「命名空间 → 成员名」＋「根级直挂成员」。
 * 用**类型检查器**而不是文本匹配：`Pick`/`Omit`/交叉类型/命名接口引用——纯文本解析在这些地方
 * 会静默退化成「零成员」⇒ 把纯重构报成「面被拿走」（假红 = 逼人绕过，比漏报更坏）。
 */
function faceFromType(checker, type) {
  const namespaces = {};
  const rootMembers = [];
  for (const prop of checker.getPropertiesOfType(type)) {
    const name = prop.getName();
    const decl = prop.valueDeclaration ?? (prop.declarations && prop.declarations[0]);
    const ptype = decl ? unwrapOptional(checker.getTypeOfSymbolAtLocation(prop, decl)) : undefined;
    const members = ptype ? checker.getPropertiesOfType(ptype).map((m) => m.getName()) : [];
    if (members.length === 0) rootMembers.push(name);
    else namespaces[name] = members.sort();
  }
  return { namespaces, rootMembers: rootMembers.sort() };
}

/** 在某个源文件里按名字找类型声明（interface / type alias 两种写法都收） */
function typeByName(program, checker, relFile, typeName) {
  const sf = program.getSourceFile(resolve(ROOT, relFile));
  if (!sf) throw new Error(`找不到源文件：${relFile}`);
  for (const st of sf.statements) {
    const named = (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && st.name.text === typeName;
    if (named) return checker.getTypeAtLocation(st.name);
  }
  throw new Error(`${relFile} 里找不到类型 ${typeName}（改过聚合器/文件名？本门禁的输入面就在这两处）`);
}

/**
 * 采集 ①——两个面。返回 `{ apiNamespaces, apiRootMembers, poolExposed, poolRootMembers }`。
 * ⚠️ 会新建一个 TS Program（与 `generate-contract.mjs` 同款配置）；这正是「重算」二字的代价，
 * 也是它**不接受工作区里那份快照当输入**的原因。
 */
function collectApiFace() {
  const program = ts.createProgram([resolve(ROOT, API_ENTRY), resolve(ROOT, API_SURFACES)], {
    target: ts.ScriptTarget.ES2020,
    lib: ["lib.es2020.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const api = faceFromType(checker, typeByName(program, checker, API_ENTRY, "LinkDeskAPI"));
  const pool = faceFromType(checker, typeByName(program, checker, API_SURFACES, "PoolExposed"));
  return {
    apiNamespaces: api.namespaces,
    [ROOT_BUCKET]: api.rootMembers,
    poolExposed: pool.namespaces,
    poolRootMembers: pool.rootMembers,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ② plugin.json 字段与枚举
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 遍历 JSON Schema 收集字段路径 → 枚举值。
 * `$ref` 就地解析（本轮只允许 `#/$defs/<name>` 这种本地引用）；`allOf` 各分支一并走；
 * 环引用按「已在本路径上访问过」剪断（schema 里今天无环，写了是为了别让未来加一个环就爆栈）。
 */
function walkSchema(node, path, out, { schema, seenRefs, visited }) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return;
  if (typeof node.$ref === "string") {
    const ref = node.$ref;
    const key = `${path}|${ref}`;
    if (seenRefs.has(key) || !ref.startsWith("#/")) return;
    const target = ref
      .slice(2)
      .split("/")
      .reduce((acc, seg) => (acc ? acc[seg.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined), schema);
    if (!target) return;
    const nextVisited = new Set(visited).add(path);
    walkSchema(target, path, out, { schema, seenRefs: new Set([...seenRefs, key]), visited: nextVisited });
    return;
  }
  if (node.properties && typeof node.properties === "object") {
    for (const key of Object.keys(node.properties)) {
      const p = path ? `${path}.${key}` : key;
      if (visited.has(p)) continue;
      const child = node.properties[key];
      const enums = Array.isArray(child.enum) ? child.enum.map((v) => String(v)).sort() : [];
      out[p] = enums;
      walkSchema(child, p, out, { schema, seenRefs, visited: new Set([...visited, p]) });
    }
  }
  for (const branch of Array.isArray(node.allOf) ? node.allOf : []) {
    walkSchema(branch, path, out, { schema, seenRefs, visited });
  }
  if (node.items) walkSchema(node.items, `${path}[]`, out, { schema, seenRefs, visited });
}

function collectManifestFields() {
  const schema = JSON.parse(readFileSync(resolve(ROOT, PLUGIN_SCHEMA), "utf8"));
  const out = {};
  walkSchema(schema, "", out, { schema, seenRefs: new Set(), visited: new Set() });
  return sortObject(out);
}

/* ══════════════════════════════════════════════════════════════════════════
   ④ 宿主保留名账
   ══════════════════════════════════════════════════════════════════════════ */

function collectLedger() {
  const raw = JSON.parse(readFileSync(resolve(ROOT, LEDGER), "utf8"));
  const out = {};
  for (const key of Object.keys(raw)) {
    if (key === "$comment" || key === "version") continue; // 散文 + 账形状修订号（抬版 ≠ 面被拿走）
    out[key] = raw[key];
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   汇总 ＋ 序列化
   ══════════════════════════════════════════════════════════════════════════ */

const sortObject = (o) =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, Array.isArray(o[k]) ? [...o[k]].sort() : o[k]]));

/** 全量重算——四栏全从**仓库实况**读（不读工作区那份快照，那是门禁的比对对象不是输入） */
export function collectApiSurface() {
  const api = collectApiFace();
  const host = collectHostDefs();
  const hostClassNames = [...host.bareDefs].filter((n) => n.startsWith("ldk-")).sort();
  const reservedKeyframes = [...host.reservedKeyframes].sort();
  return {
    version: 1,
    generatedFrom: COLUMN_CALIBERS,
    apiNamespaces: sortObject(api.apiNamespaces),
    [ROOT_BUCKET]: api[ROOT_BUCKET],
    poolExposed: sortObject(api.poolExposed),
    poolRootMembers: api.poolRootMembers,
    manifestFields: collectManifestFields(),
    hostClassNames,
    reservedKeyframes,
    ledger: sortObject(collectLedger()),
  };
}

/** 稳定序列化（2 空格缩进 ＋ 末尾换行）——`git diff` 友好的唯一形态 */
export function serializeSurface(surface) {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

/**
 * 快照 → 扁平路径集合（**比对的唯一形态**）——`apiNamespaces.commands.executeCommand` 这样可点验。
 * ⛔ 跳过 `version`（账形状修订号，抬版是正常动作）与 `generatedFrom`（散文口径）——
 * 把散文算进面 = 改一个字就判红，那是标准的假红。
 */
export function flattenSurface(surface) {
  const SKIP = new Set(["version", "generatedFrom"]);
  const out = [];
  const walk = (node, prefix) => {
    if (node === null || node === undefined) {
      if (prefix) out.push(prefix);
      return;
    }
    if (Array.isArray(node)) {
      if (node.length === 0 && prefix) out.push(prefix);
      for (const v of node) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push(`${prefix}.${v}`);
        else walk(v, `${prefix}[${JSON.stringify(v)}]`);
      }
      return;
    }
    if (typeof node === "object") {
      for (const key of Object.keys(node)) {
        if (!prefix && SKIP.has(key)) continue;
        walk(node[key], prefix ? `${prefix}.${key}` : key);
      }
      return;
    }
    if (prefix) out.push(`${prefix}.${node}`);
  };
  walk(surface, "");
  return out;
}

/**
 * 面 diff —— **只加不删**的判定式。
 * · `removed` = 基线有、今天没有 ⇒ 🔴 红（面被拿走）
 * · `added`   = 今天有、基线没有 ⇒ 🟡 提示（这正是被允许的方向）
 * · 顺序/注释变化 ⇒ 两边集合相同 ⇒ 两边都空（集合语义）
 */
export function diffSurface(baseline, current) {
  const before = new Set(flattenSurface(baseline));
  const after = new Set(flattenSurface(current));
  return {
    removed: [...before].filter((p) => !after.has(p)).sort(),
    added: [...after].filter((p) => !before.has(p)).sort(),
  };
}

/** 栏名（红报文里给人指路用）：路径第一段 → 人话 */
export const COLUMN_LABELS = {
  apiNamespaces: "命名空间成员（LinkDeskAPI）",
  apiRootMembers: "根级成员（LinkDeskAPI）",
  poolExposed: "命名空间成员（池注入面）",
  poolRootMembers: "根级成员（池注入面）",
  manifestFields: "plugin.json 字段/枚举",
  hostClassNames: "宿主类名",
  reservedKeyframes: "宿主保留关键帧",
  ledger: "宿主保留名账",
};

const READ_SNAPSHOT_HINT = `快照不在仓库里 ⇒ 先跑 \`npm run api-surface:regen\` 生成并提交（${SNAPSHOT_REL}）`;

/** 读仓库里那份快照（工作区） */
export function readCommittedSurface(relPath = SNAPSHOT_REL) {
  const p = resolve(ROOT, relPath);
  if (!existsSync(p)) throw new Error(`找不到快照文件 ${relPath}——${READ_SNAPSHOT_HINT}`);
  return JSON.parse(readFileSync(p, "utf8"));
}
