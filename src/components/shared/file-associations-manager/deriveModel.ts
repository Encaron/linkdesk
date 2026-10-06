/**
 * file-associations-manager/deriveModel——「默认打开方式」管理器的**纯聚合函数**（零 React、
 * 零宿主桥、零 i18n）。判据全在这里，呈现件只做渲染与转发：聚合法则
 * （「候选集合签名 × 当前生效值」）与六态徽标是本案最容易出错的窄事实，埋在 JSX 里只能靠目视。
 *
 * 另含 C5 卡内工具条的**行序／过滤纯函数**（`orderRows` / `filterRows` / `hitKindOf`，见文末
 * 「卡内行序与过滤」节）——同一性质（口径错只在界面上给错答案），一处实现 ⇒ 第三方渲染方零重推导。
 *
 * ⛔ **本件不自己算「谁是默认」**：一律消费宿主 `listHandlersFor(ext)` 给的 `isCurrent`
 * （宿主口径 = 覆盖 → 声明序 → 角色兜底）。管理器只负责「把宿主给的候选与生效值摆出来」。
 *
 * ## 三条刻意写死的口径（与设计图逐字对齐）
 *
 * 1. **禁用插件不出现**：宿主清单面只列启用插件 ⇒ 取不到声明、画不出卡（与「禁用＝不存在」同向）。
 * 2. **失效覆盖是「类型」的属性、不是某一行的属性**：覆盖键还在、指向的插件却已不在册时，该类的
 *    **每一行**都挂这个标记（用户扫哪一行都该看到「这个键是死的」）。
 * 3. **下拉显示覆盖态、徽标显示生效态**：一侧答「你设了什么」（键还在不在 ⇒ 下拉选中值），
 *    一侧答「现在实际谁上」（宿主 `isCurrent`）。
 *
 * ## 🔴 保序纪律（C5 立命之处）
 *
 * `buildCards` 直接 `p.exts.map(...)`、**⛔ 不经任何排序**——声明序是「按默认排序」的唯一来源，
 * 聚合层一旦重排，下游无论怎么排都救不回原序。
 */

import type {
  BuildInput,
  CardModel,
  ContestedRowModel,
  DeclaredExtension,
  DeclaredPlugin,
  ExtRowModel,
  HandlerSnapshot,
  ManagerModel,
  RowOption,
  RowSortMode,
  RowState,
} from "./types";

/* ── 扩展名归一（与宿主 `normalizeExtension` 同口径：小写、去前导点） ── */

/** 归一化扩展名——非法（非字符串 / 空 / 带分隔符）一律 `""`（调用方据此跳过）。 */
export function normalizeExt(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const ext = raw.trim().toLowerCase().replace(/^\.+/, "");
  if (!ext || /[\s/\\]/.test(ext)) return "";
  return ext;
}

/** 归一化扩展名 → 覆盖表存储键（`.ext` 带点小写——宿主 `normalizeAssociationOverrideKey` 同形）。 */
export function overrideKeyOf(ext: string): string {
  const normalized = normalizeExt(ext);
  return normalized ? `.${normalized}` : "";
}

/** 覆盖表里该类的覆盖值——无键 / 非法值 → `undefined`（＝「自动」）。 */
export function readOverride(
  table: Readonly<Record<string, unknown>> | undefined,
  ext: string,
): string | undefined {
  const key = overrideKeyOf(ext);
  if (!key) return undefined;
  const v = table?.[key];
  return typeof v === "string" && v ? v : undefined;
}

/** 原始扩展名串列表 → 归一化去重清单（顺序照原）——命令入参的守卫。 */
export function normalizeExtList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const ext = normalizeExt(item);
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    out.push(ext);
  }
  return out;
}

/* ── 声明面解析 ── */

/**
 * 解析 `manifest.contributes.fileAssociations`（形状 = `{extension, displayName?, role?}`）。
 * `contributes` 过 IPC 是 `Record<string, unknown>`（契约有意开放式）⇒ 这里逐项收窄，
 * 非法项静默跳过；**同一插件的重复扩展名只留首次声明**（后声明不覆盖，与宿主注册序一致）。
 *
 * `displayName` 一并收下（C5）：卡内过滤要按它命中（`python` → `.py`）——⛔ 缺了它，
 * 「显示名命中」这条检索腿就不可达。
 */
export function extractDeclaredExtensions(contributes: unknown): DeclaredExtension[] {
  const raw = (contributes as { fileAssociations?: unknown } | null | undefined)?.fileAssociations;
  if (!Array.isArray(raw)) return [];
  const out: DeclaredExtension[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const entry = item as { extension?: unknown; displayName?: unknown } | null | undefined;
    const declRaw = typeof entry?.extension === "string" ? entry.extension.trim() : "";
    const ext = normalizeExt(entry?.extension);
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    const typeLabel = typeof entry?.displayName === "string" ? entry.displayName.trim() : "";
    out.push({ ext, raw: declRaw, ...(typeLabel ? { typeLabel } : {}) });
  }
  return out;
}

/** 行标签最多列出几个类型——超出走「等 N 类」。 */
export const EXT_LABEL_MAX = 3;

/** 行标签的类型串前缀（`.a / .b / .c`）——`等 N 类` 后缀由视图拼 i18n。 */
export function extLabelHead(exts: readonly string[]): string {
  return exts
    .slice(0, EXT_LABEL_MAX)
    .map((e) => `.${e}`)
    .join(" / ");
}

/* ── 构建 ── */

/** 一类的三问解读：候选是谁、键在不在、生效者是谁。 */
interface ExtFacts {
  handlers: HandlerSnapshot[];
  /** 覆盖值（原始，可能指向不在册的插件） */
  override?: string;
  /** 覆盖值指向**在册候选**（＝真的改了生效结果） */
  overrideInRegistry: boolean;
  /** 当前生效插件 id（宿主 `isCurrent`；宿主没给就退回覆盖/首候选） */
  currentId: string;
}

function factsOf(ext: string, input: BuildInput): ExtFacts {
  const handlers = input.handlersByExt[ext] ?? [];
  const override = readOverride(input.overrideTable, ext);
  const overrideInRegistry = !!override && handlers.some((h) => h.pluginId === override);
  const currentId =
    handlers.find((h) => h.isCurrent)?.pluginId ?? override ?? handlers[0]?.pluginId ?? "";
  return { handlers, override, overrideInRegistry, currentId };
}

/** 卡内一行——状态判据，顺序即优先级。 */
function rowFor(pluginId: string, decl: DeclaredExtension, input: BuildInput): ExtRowModel {
  const { handlers, override, overrideInRegistry, currentId } = factsOf(decl.ext, input);
  const dangling = !!override && !overrideInRegistry;

  let state: RowState;
  if (handlers.length === 0) state = "orphan";
  else if (handlers.length === 1) {
    state = currentId === pluginId && overrideInRegistry ? "lock" : "sole";
  } else if (currentId === pluginId) state = overrideInRegistry ? "override" : "auto";
  else state = "lost";

  return {
    ext: decl.ext,
    key: overrideKeyOf(decl.ext),
    state,
    dangling,
    currentName: handlers.find((h) => h.pluginId === currentId)?.title,
    ...(decl.typeLabel ? { typeLabel: decl.typeLabel } : {}),
    ...(decl.raw && decl.raw !== decl.ext ? { rawDeclaration: decl.raw } : {}),
    // 下拉显示**覆盖态**：覆盖值不在册（浮幽灵）或压根没覆盖 ⇒ 一律回「自动」
    value: overrideInRegistry && override === currentId ? override! : "",
    options: handlers.map((h) => ({ value: h.pluginId, label: h.title })),
  };
}

/** 「按插件浏览」的卡（声明序；搜索只整卡过滤，⛔ 不切碎卡内行）。 */
function buildCards(plugins: readonly DeclaredPlugin[], input: BuildInput, q: string): CardModel[] {
  const hit = (s: string) => !q || s.toLowerCase().includes(q);
  const cards: CardModel[] = [];
  for (const p of plugins) {
    if (p.exts.length === 0) continue;
    // 🔴 声明序透传——此处一旦排序，「按默认排序」就没有真源了
    const rows = p.exts.map((decl) => rowFor(p.pluginId, decl, input));
    if (q && !hit(p.name) && !hit(p.pluginId) && !p.exts.some((decl) => hit(`.${decl.ext}`))) continue;
    cards.push({
      pluginId: p.pluginId,
      name: p.name,
      ...(p.version ? { version: p.version } : {}),
      ...(p.manifest ? { manifest: p.manifest } : {}),
      rows,
      declaredCount: rows.length,
      contestedCount: rows.filter((r) => (input.handlersByExt[r.ext]?.length ?? 0) >= 2).length,
      holdCount: rows.filter((r) => factsOf(r.ext, input).currentId === p.pluginId).length,
      overrideExts: p.exts
        .filter((decl) => readOverride(input.overrideTable, decl.ext) !== undefined)
        .map((decl) => decl.ext),
      matchedSearch: !!q,
    });
  }
  return cards;
}

/**
 * 竞争区（聚合）：① 取候选 ≥2 的类（单 handler 不进此区——没有选择可言）；② 按搜索过滤
 * （类型串或任一候选名）；③ 按**候选集合签名**（激活序 id 串）分组；④ 签名内再按**当前生效值**分格。
 * 于是「同一批候选 × 同一生效值」并成一行——下拉整格生效；任何一类被单独设置就按生效值
 * 自然分出独立格，恢复自动后并回（`groupExtsCount > exts.length` 时视图给出「整组 M 类中 K 类单独设置」）。
 */
function buildContested(
  plugins: readonly DeclaredPlugin[],
  input: BuildInput,
  q: string,
): { rows: ContestedRowModel[]; extCount: number } {
  const allExts = new Set<string>();
  for (const p of plugins) for (const decl of p.exts) allExts.add(decl.ext);

  const candidates = [...allExts]
    .filter((ext) => (input.handlersByExt[ext]?.length ?? 0) >= 2)
    .sort()
    .filter((ext) => {
      if (!q) return true;
      if (`.${ext}`.includes(q)) return true;
      return (input.handlersByExt[ext] ?? []).some(
        (h) => h.title.toLowerCase().includes(q) || h.pluginId.toLowerCase().includes(q),
      );
    });

  const signatures = new Map<string, string[]>();
  for (const ext of candidates) {
    const sig = (input.handlersByExt[ext] ?? []).map((h) => h.pluginId).join("|");
    const bucket = signatures.get(sig);
    if (bucket) bucket.push(ext);
    else signatures.set(sig, [ext]);
  }

  const rows: ContestedRowModel[] = [];
  for (const members of signatures.values()) {
    const handlers = input.handlersByExt[members[0]] ?? [];
    const handlerOptions: RowOption[] = handlers.map((h) => ({ value: h.pluginId, label: h.title }));

    const byValue = new Map<string, string[]>();
    for (const ext of members) {
      const { override, overrideInRegistry, currentId } = factsOf(ext, input);
      const value = overrideInRegistry ? override! : currentId;
      const bucket = byValue.get(value);
      if (bucket) bucket.push(ext);
      else byValue.set(value, [ext]);
    }

    for (const [effectiveId, group] of byValue) {
      const exts = [...group].sort();
      const perExt = exts.map((ext) => factsOf(ext, input));
      // 只有**在册**覆盖才算「用户指定」——指向不在册插件的键已回声明序，说用户指定是撒谎
      const strong = perExt.filter((f) => f.overrideInRegistry).length;
      const anyKey = perExt.filter((f) => f.override !== undefined).length;
      const uniform =
        strong === exts.length && new Set(perExt.map((f) => f.override)).size === 1
          ? perExt[0].override!
          : "";

      rows.push({
        exts,
        groupExtsCount: members.length,
        handlers: handlerOptions,
        effectiveName: handlers.find((h) => h.pluginId === effectiveId)?.title ?? effectiveId,
        source: strong === 0 ? "auto" : strong === exts.length ? "user" : "partial",
        value: uniform,
        overrideCount: anyKey,
        handlerCount: handlers.length,
      });
    }
  }
  return { rows, extCount: candidates.length };
}

/** 组装管理器模型（纯函数）。 */
export function buildManagerModel(input: BuildInput): ManagerModel {
  const q = (input.search ?? "").trim().toLowerCase();
  const cards = buildCards(input.plugins, input, q);
  const { rows: contested, extCount } = buildContested(input.plugins, input, q);
  return {
    contested,
    cards,
    navCount: extCount + cards.length,
    contestedExtCount: extCount,
  };
}

/* ── 卡内行序与过滤（C5 工具条两件控件的口径；纯函数，一处实现） ──
 *
 * 🔴 为什么这两件事住聚合层而不是呈现件：它们与六态/聚格同性质——**错了不报错、只在界面上给
 * 错答案**（行序丢了看不出、分档错了像乱排），且第三方渲染方要能零重推导地复现同一口径（R4）。
 * ⛔ 两件都不碰模型：`orderRows` 只换序、`filterRows` 只留子集——**行对象一个字段都不改**
 * （改行内容＝聚合层的事，混在一起就没法单测了）。
 */

/**
 * 过滤词归一（E3/E15）：去首尾空白 ＋ 小写 ＋ **去掉一个前导点**——`.py` / `py` / `PY` 同一个词。
 * ⛔ 归一只有这一层：**子串**匹配，不做正则、不做通配（口径唯一，图 `qOf` 逐字同）。
 */
function normalizeQuery(q: string): string {
  const v = q.trim().toLowerCase();
  return v.charAt(0) === "." ? v.slice(1) : v;
}

/**
 * 命中分类——`"ext"`＝**扩展名**命中 ／ `"name"`＝**仅显示名**（类型名）命中 ／ `""`＝不命中。
 *
 * 两源都留（**显示名匹配删不得**：`python` 只靠它命中 `.py`，E4）——分类存在的意义是让视图能
 * **分档**（E5）与**标注命中理由**（E7「类型名 X」），而不是拿它当唯一判据。
 *
 * ⚠️ 与设计图的一处刻意差别：空词回 `""`（图上 `ext.includes("")` 恒真会回 `"ext"`）。空词下
 * 「命中」无从谈起；该分支在图上永不被观察（空词走 `filterRows` 短路、视图也不标理由）。
 */
export function hitKindOf(
  ext: string,
  typeLabel: string | undefined,
  q: string,
): "ext" | "name" | "" {
  const query = normalizeQuery(q);
  if (!query) return "";
  if (ext.includes(query)) return "ext";
  return String(typeLabel ?? "").toLowerCase().includes(query) ? "name" : "";
}

/**
 * 卡内行序（C5）——`"alpha"`（默认）按扩展名字母序 ／ `"declared"`＝**原样透传**模型序
 * （＝插件声明序，「按默认排序」的唯一真源）。
 *
 * 🔴 保序纪律：排序**只在这里**按 mode 施加；聚合层（`buildCards`）⛔ 不得在内部重排卡内行——
 * 声明序只有模型那一份，聚合层一旦重排，`declared` 就再也回不去。
 * ⛔ 不改传入数组（先 `slice()`）；同扩展名不可能重复（声明面已去重）。
 */
export function orderRows(rows: readonly ExtRowModel[], mode: RowSortMode): ExtRowModel[] {
  const copy = rows.slice();
  return mode === "declared" ? copy : copy.sort((a, b) => a.ext.localeCompare(b.ext));
}

/**
 * 卡内过滤（C5）——两源（扩展名 ＋ 显示名）、忽略大小写与前导点、子串匹配。
 *
 * 🔴 **分档**（E5/E6）：扩展名命中的行在上、**仅显示名**命中的行沉底并保持各自档内次序 ⇒
 * 调用方传进来的 `rows` **必须先按选定 mode 排好**：`filterRows(orderRows(card.rows, mode), q)`。
 * 分档 ⛔ 不改排序语义（档内继续服选定排序），它只回答「这行为什么在」。
 *
 * 空词 / 纯空白 ⇒ **回全量**（E2）。⚠️「不显示命中计数」是**视图**的空词判断，⛔ 不在这里表达
 * （这里回了全量，视图无从区分「没过滤」与「全命中」——所以那条判据归视图）。
 */
export function filterRows(rows: readonly ExtRowModel[], q: string): ExtRowModel[] {
  const query = normalizeQuery(q);
  if (!query) return rows.slice();
  const strong: ExtRowModel[] = [];
  const weak: ExtRowModel[] = [];
  for (const row of rows) {
    const kind = hitKindOf(row.ext, row.typeLabel, query);
    if (kind === "ext") strong.push(row);
    else if (kind === "name") weak.push(row);
  }
  return [...strong, ...weak];
}
