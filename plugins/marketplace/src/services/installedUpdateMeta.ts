/**
 * installedUpdateMeta — E6#33 更新元数据域（owner 归属 2026-09-08 拍板：市场插件自持，零壳改动）。
 *
 * 存储「已装插件 × 更新偏好/记账」三字段——lastNotifiedVersion（§二·一 铃铛幂等）/ autoUpdate
 * （§五 Opt-IN 默认关）/ pinnedVersion（§二·九 停旧版尊重）。三者全是市场插件的更新功能自读自写
 * 的状态，**非安装事实**（壳账本 installed-plugins.json 只记 version/installedAt/source/removed，
 * PluginInstallService owner 不变）——锚② 把发现/自动更新编排定案归市场插件后，壳 update 流零消费
 * 这三字段，硬塞账本要新增池↔壳 metadata API（新壳表面）。拍板：归本插件存储，05 文档 owner 注记同步
 * （账本仍只记安装事实；本域是市场对「装了之后」的偏好/记账）。
 *
 * 载体：window.linkdesk.pluginState（插件持久 KV，文件树 expandedUris / 串口 sessions 同款）——
 * owner "marketplace"（自引用，非跨插件硬编码），**单 key 整图** `installedUpdateMeta` →
 * Record<pluginId, PluginUpdateMeta>。整图单 key 而非 per-id key：发现循环（Batch C）要遍历全部
 * lastNotifiedVersion 判「哪些已提醒过」——pluginState 无 list-keys API，per-id key 枚举不到。
 *
 * IO 注入（jsdom 直测，marketSources.__setCatalogIO 同款）：__setMetaStore 换 { get, set }——
 * 默认 = window.linkdesk.pluginState（双参 get/set 在此收窄成单 key 面）。IO 不可用 → 空图/落空
 * （预览环境不崩；真 IPC 环境 pluginState 必在）。
 *
 * 语义（纯函数可单测）：
 *   - patch 的 undefined 值字段 = 删除该字段（不写盘 undefined——落盘最小，同账本 removed 惯例）
 *   - autoUpdate 只存 true（默认 off；关 = 删字段——缺省即 false，无需显式 false）
 *   - 字段删空后的空 meta 条目从图里移除（不养空壳）
 */

/* ═══ 类型（内联导出——marketplace services 惯例，消费方从本模块引） ═══ */

/** 已装插件 × 更新偏好/记账（三字段语义见 05 §二·一/§五/§二·九） */
export interface PluginUpdateMeta {
  /** #33d 自动更新 Opt-IN（默认 off，只存 true——缺省即 false，见 setAutoUpdate） */
  autoUpdate?: boolean;
  /** #33c 版本下拉停旧版——显式钉在某旧版（未钉 = undefined = 追最新） */
  pinnedVersion?: string;
  /** §二·一 发现推铃铛幂等——已就哪一版提醒过（更新成功清） */
  lastNotifiedVersion?: string;
}

/** patch 面——undefined/null 值字段 = 删除该字段；键未涉及的字段不动（映射 Partial 加 | null，null 亦删） */
export type PluginUpdateMetaPatch = { [K in keyof PluginUpdateMeta]?: PluginUpdateMeta[K] | null };

/** 整图——pluginState 单 key `installedUpdateMeta` 的落盘形状（Record<pluginId, meta>） */
export type InstalledUpdateMetaMap = Record<string, PluginUpdateMeta>;

const FIELDS = ["autoUpdate", "pinnedVersion", "lastNotifiedVersion"] as const;

/* ═══ 纯函数（merge/patch/select——IO 无关，单测主覆盖区） ═══ */

/** 单条 meta + patch → 新 meta。patch 的 undefined/null 值字段 = 删除（删字段用 undefined 或 null 皆可）。
 *  空 result = 字段全删光（调用方据此移除条目）。不 mutate 入参。 */
export function mergeUpdateMeta(base: PluginUpdateMeta | undefined, patch: PluginUpdateMetaPatch): PluginUpdateMeta {
  const next: PluginUpdateMeta = { ...(base ?? {}) };
  for (const key of FIELDS) {
    if (!(key in patch)) continue; // patch 未涉及的字段不动（缺键 ≠ undefined 值）
    const v = patch[key];
    if (v === undefined || v === null) delete next[key];
    else (next as Record<string, unknown>)[key] = v;
  }
  return next;
}

/** 图级 patch —— 返回新图（shallow clone）；单条 patch 后为空 → 条目删除。未变（无 key 命中）→ 原图引用。 */
export function patchUpdateMetaMap(
  map: InstalledUpdateMetaMap,
  pluginId: string,
  patch: PluginUpdateMetaPatch,
): InstalledUpdateMetaMap {
  if (Object.keys(patch).length === 0) return map;
  const base = map[pluginId];
  const merged = mergeUpdateMeta(base, patch);
  const hasField = (m: PluginUpdateMeta) => m.lastNotifiedVersion !== undefined || m.autoUpdate !== undefined || m.pinnedVersion !== undefined;
  if (!base && !hasField(merged)) return map; // 无既有 + patch 全删 → 无变化
  if (base && !hasField(merged) && Object.keys(base).length === 0) return map;
  const next: InstalledUpdateMetaMap = { ...map };
  if (hasField(merged)) next[pluginId] = merged;
  else delete next[pluginId];
  return next;
}

/* ═══ 选择器（纯） ═══ */

/** 某插件 autoUpdate 是否开启——缺省 false（§五 Opt-IN 默认关，只存 true） */
export function isAutoUpdateOn(map: InstalledUpdateMetaMap, pluginId: string): boolean {
  return map[pluginId]?.autoUpdate === true;
}

/** 某插件 pinnedVersion（版本下拉停旧版；无 = undefined） */
export function getPinnedVersion(map: InstalledUpdateMetaMap, pluginId: string): string | undefined {
  return map[pluginId]?.pinnedVersion;
}

/** 某插件已就哪一版提醒过（发现只推一次——§二·一 lastNotifiedVersion；无 = 未提醒过） */
export function getLastNotified(map: InstalledUpdateMetaMap, pluginId: string): string | undefined {
  return map[pluginId]?.lastNotifiedVersion;
}

/* ═══ IO 注入（jsdom 测试替换——marketSources.__setCatalogIO 同款） ═══ */

export interface MetaStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

let _store: MetaStore | null = null;
/** 测试注入 store；传 null 恢复默认（window.linkdesk.pluginState，owner "marketplace" 单 key 面） */
export function __setMetaStore(store: MetaStore | null): void {
  _store = store;
}

const OWNER = "marketplace";
const KEY = "installedUpdateMeta";

function store(): MetaStore | null {
  if (_store !== null) return _store;
  const ps = window.linkdesk?.pluginState;
  if (!ps) return null; // 预览环境无 pluginState——空图/落空（不崩）
  return {
    get: (k) => ps.get(OWNER, k),
    set: (k, v) => ps.set(OWNER, k, v),
  };
}

async function readRaw(): Promise<InstalledUpdateMetaMap> {
  const s = store();
  if (!s) return {};
  try {
    const raw = await s.get<InstalledUpdateMetaMap>(KEY);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {}; // 读失败 → 空图（不崩——下次写覆盖）
  }
}

/* ═══ IO 面 ═══ */

/** 全量读更新元数据图（发现循环/UI 遍历用）——无记录 = {} */
export async function readUpdateMetaMap(): Promise<InstalledUpdateMetaMap> {
  return readRaw();
}

/** 读某插件更新元数据——无记录 = {} */
export async function readPluginUpdateMeta(pluginId: string): Promise<PluginUpdateMeta> {
  return (await readRaw())[pluginId] ?? {};
}

/** 写 patch（merge → 去空壳 → set）。无变化不写盘（幂等）。写失败静默（不崩，下次写覆盖） */
export async function patchUpdateMeta(pluginId: string, patch: PluginUpdateMetaPatch): Promise<void> {
  const s = store();
  if (!s) return;
  const map = await readRaw();
  const next = patchUpdateMetaMap(map, pluginId, patch);
  if (next === map) return;
  try {
    await s.set(KEY, next);
  } catch {
    /* 写失败非致命——更新元数据丢失只是重新提醒/重新默认，不破坏已装插件 */
  }
}

/* ═══ 常用动作（消费方免拼 patch——Batch C/D/E/F 接线点） ═══ */

/** 自动更新勾选开关（#33d）——开存 true，关删字段（缺省即 false） */
export function setAutoUpdate(pluginId: string, on: boolean): Promise<void> {
  return patchUpdateMeta(pluginId, on ? { autoUpdate: true } : { autoUpdate: undefined });
}

/** 版本下拉停旧版（#33c pinnedVersion）——选某版本 = pin；选最新/手动更到最新 = 清 pin（null 删字段） */
export function setPinnedVersion(pluginId: string, version: string | null): Promise<void> {
  return patchUpdateMeta(pluginId, { pinnedVersion: version ?? undefined });
}

/** 发现推铃铛后记「已提醒过该版本」（§二·一 幂等——同版不重复推）；更新成功清 = 显式传 undefined */
export function noteNotifiedVersion(pluginId: string, version: string): Promise<void> {
  return patchUpdateMeta(pluginId, { lastNotifiedVersion: version });
}

/** 更新成功 → 清提醒标记（本地版本已追上——§二·一 更新成功清） */
export function clearNotifiedVersion(pluginId: string): Promise<void> {
  return patchUpdateMeta(pluginId, { lastNotifiedVersion: undefined });
}
