/**
 * file-associations-manager/deriveModel——「默认打开方式」管理器的**纯聚合函数**（零 React、
 * 零 `window.linkdesk`、零 i18n）。判据全在这里，呈现件只做渲染与转发：聚合法则
 * （「候选集合签名 × 当前生效值」）与六态徽标是本案最容易出错的窄事实，埋在 JSX 里只能靠目视。
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
