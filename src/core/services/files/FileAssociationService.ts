/**
 * FileAssociationService——扩展名 → 插件映射。
 * E2c #13a：双击文件 → 由哪个插件打开，是壳的责任。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §3b
 * 对标 VS Code：package.json contributes.languages[].extensions
 *
 * 多个插件注册同一扩展名 → "打开方式…"选择器。默认用第一个注册的。
 */

/* ── 类型 ── */

/**
 * 文件关联的**角色挂牌**（T7 去硬编码）——首版只定义 `"text-fallback"`。
 * 🔴 牌 = **提名**不是夺权：挂牌只表示「我愿意当这类兜底」，壳按 D7 主权三层仲裁
 * （用户覆盖表 → 激活序优先 ＋ pluginId 字典序 tie-break）；装上第二家挂牌者**不静默漂移**。
 */
export type FileAssociationRole = "text-fallback";

export const TEXT_FALLBACK_ROLE: FileAssociationRole = "text-fallback";

export interface FileAssociation {
  /** 扩展名——不带点，如 "dxf" / "pdf" / "cpp" */
  extension: string;
  /** 处理此文件类型的插件 ID */
  pluginId: string;
  /** 可选——打开时执行的命令（默认 "workbench.action.openFile"） */
  command?: string;
  /** 可选——"打开方式…"列表中显示的名字 */
  displayName?: string;
  /**
   * 可选——角色挂牌，依附于**本条具体条目**（E23：条目必须带扩展名；孤儿 role 由 schema 校验拦）。
   * 挂牌不等于生效：生效者由 `resolveFallbackTabType()` 按仲裁顺序选出。
   */
  role?: FileAssociationRole;
}

/* ── 存储 ── */

import { trackRegistration } from "../../registry/registrationTracker";
import { FALLBACK_PLUGIN_ID } from "../../utils/plugin/fallbackPluginId";

/**
 * D1 用户覆盖表的宿主配置键（settings.json 平键）。
 * 🔴 **不注册进设置页 ConfigurationRegistry**（D1：「设置页 v1 不展示」——管理器/选择器才是它的 UI，
 * 泛型设置行再画一份 = 第二处真相源）。写入唯一入口 = `fileAssociation.setDefault` 写面
 * （壳 IpcBridgeHandler → ConfigurationService 单写者）；读 = 主进程 registry-handlers 平键直读
 * （storage-handlers `resolveEffectiveCacheDir` 同款先例）。
 */
export const WORKBENCH_FILE_ASSOCIATIONS_KEY = "workbench.fileAssociations";

/**
 * 覆盖表存储键形：**带点小写**（D1 示例 `{".pdf":"pdf-reader-x"}`）——归一口径与 `normalizeExtension`
 * 同源（E10）。查询侧 `resolveOpenTarget` 对键做同款归一 ⇒ `.PDF`/`pdf`/`.pdf` 写法都命中同一键。
 */
export function normalizeAssociationOverrideKey(ext: string): string {
  const normalized = normalizeExtension(ext);
  return normalized ? `.${normalized}` : "";
}

/** extension（小写，不带点） → FileAssociation[] */
const _associations = new Map<string, FileAssociation[]>();

/** pluginId → Set<extension>——卸载时快速清除 */
const _pluginExtensions = new Map<string, Set<string>>();

/**
 * role → 挂牌者激活序（pluginId → 首次登记序号，单调递增）。
 * ⚠️ 激活序按**插件**记、不按条目：同一插件声明 45 条挂牌（editor）只占一个序号——
 * 否则条目多的插件会凭条目数挤到后来者前面，「激活序」就退化成「声明条数序」。
 * 插件被卸载/禁用 ⇒ 注册被回收（`trackRegistration`）⇒ 自然退出参选（E5/E7 同规）。
 */
const _roleHolders = new Map<string, Map<string, number>>();

/** 挂牌激活序号发号器——只增不减（卸载不回收，保证跨装卸的比较始终稳定） */
let _roleSeq = 0;

/* ── E1/E2 第二竞争者事件（D7：装上第二只不静默漂移）── */

export interface SecondContenderEvent {
  /** 归一化扩展名（无点小写） */
  ext: string;
  /** 新声明者 pluginId */
  pluginId: string;
  /** 新声明者显示名（声明缺 displayName 时回退 pluginId） */
  displayName: string;
}

const _secondContenderSubs = new Set<(event: SecondContenderEvent) => void>();
/** 会话内已提示过的 (ext, pluginId)——「会话内一次」的去重账 */
const _secondContenderAnnounced = new Set<string>();

/**
 * 订阅「第二竞争者出现」事件。注册时间线 = 插件激活（manifest loader 注册关联时）；
 * 主进程在 registry-handlers 装配处订阅并广播到壳（壳渲染进程弹出提示）。
 * ⚠️ 启动期已并存的多家声明同样会触发——「不在启动期打扰」由**壳侧消费方**的装配时机保证
 * （startup 在 initAll（插件加载完）之后才订阅，启动批次的事件天然落在订阅前被丢弃）。
 */
export function onSecondContender(cb: (event: SecondContenderEvent) => void): () => void {
  _secondContenderSubs.add(cb);
  return () => {
    _secondContenderSubs.delete(cb);
  };
}

/* ── 注册 ── */

/**
 * 注册文件关联——loader 在 parseContributions 阶段调用。
 * 同一扩展名允许多个插件注册——"打开方式…"选择器消费全部。
 */
export function registerFileAssociation(association: FileAssociation): () => void {
  const ext = normalizeExtension(association.extension);
  if (!ext) {
    console.warn(`[FileAssociationService] 忽略无效扩展名: "${association.extension}"`);
    return () => {};
  }

  const list = _associations.get(ext) ?? [];
  // 同插件重复注册 → 静默忽略——首次注册者的 disposer 持有删除权
  if (list.some((a) => a.pluginId === association.pluginId)) return () => {};

  // #59f3：已有其他插件注册同一扩展名——警告（多注册合法，但开发者应知情）
  if (list.length > 0) {
    console.warn(
      `[FileAssociationService] "${ext}" 已有关联（${list.map(a => a.pluginId).join(', ')}），新增: ${association.pluginId}`
    );
  }

  const entry: FileAssociation = { ...association, extension: ext };
  // E1/E2（D7「第二只装上不静默漂移」）：此前已有别的插件声明同一扩展名 ⇒ 新声明者 = 第二竞争者。
  // 会话内 (ext, pluginId) 一次（同一插件声明多条同扩展名只报一次；再装卸重放也不再扰）。
  const hadPriorHandler = list.length > 0;
  list.push(entry);
  _associations.set(ext, list);

  if (hadPriorHandler) {
    const dedupKey = `${ext}:${association.pluginId}`;
    if (!_secondContenderAnnounced.has(dedupKey)) {
      _secondContenderAnnounced.add(dedupKey);
      const event: SecondContenderEvent = {
        ext,
        pluginId: association.pluginId,
        displayName: association.displayName ?? association.pluginId,
      };
      for (const cb of _secondContenderSubs) {
        try {
          cb(event);
        } catch (e) {
          console.warn("[FileAssociationService] secondContender 订阅者抛错:", e);
        }
      }
    }
  }

  // 维护 plugin → extensions 反向索引
  const exts = _pluginExtensions.get(association.pluginId) ?? new Set();
  exts.add(ext);
  _pluginExtensions.set(association.pluginId, exts);

  // T7：角色挂牌进索引——同一插件多次挂牌只记**首个**序号（见 `_roleHolders` 注）
  const role = association.role;
  if (role) {
    const holders = _roleHolders.get(role) ?? new Map<string, number>();
    if (!holders.has(association.pluginId)) holders.set(association.pluginId, ++_roleSeq);
    _roleHolders.set(role, holders);
  }

  // E5.8#10：引用级删除——只删自己这条，不误删后来注册者（设计 §8 同名覆盖风险表）
  return trackRegistration(association.pluginId, () => {
    const current = _associations.get(ext);
    if (current) {
      const kept = current.filter((a) => a !== entry);
      if (kept.length === 0) {
        _associations.delete(ext);
      } else {
        _associations.set(ext, kept);
      }
    }
    const pluginExts = _pluginExtensions.get(association.pluginId);
    if (pluginExts) {
      pluginExts.delete(ext);
      if (pluginExts.size === 0) _pluginExtensions.delete(association.pluginId);
    }
    if (role) {
      const holders = _roleHolders.get(role);
      if (holders?.delete(association.pluginId) && holders.size === 0) _roleHolders.delete(role);
    }
  });
}

/* ── 查询 ── */

/**
 * 获取处理此扩展名的默认插件。
 * 文件树/Workspace 双击文件时调用。
 */
export function getPluginFor(extension: string): string | undefined {
  const ext = normalizeExtension(extension);
  if (!ext) return undefined;
  const list = _associations.get(ext);
  if (!list || list.length === 0) return undefined;
  return list[0].pluginId;
}

/**
 * 列出所有能处理此扩展名的插件——"打开方式…"菜单用。
 * 按注册顺序返回，第一个是默认。
 */
export function getPluginsFor(extension: string): FileAssociation[] {
  const ext = normalizeExtension(extension);
  if (!ext) return [];
  return [...(_associations.get(ext) ?? [])];
}

/**
 * 获取插件注册的所有文件关联。
 */
export function getAssociationsForPlugin(pluginId: string): FileAssociation[] {
  const exts = _pluginExtensions.get(pluginId);
  if (!exts) return [];
  const result: FileAssociation[] = [];
  for (const ext of exts) {
    const list = _associations.get(ext);
    if (list) {
      for (const a of list) {
        if (a.pluginId === pluginId) result.push(a);
      }
    }
  }
  return result;
}

/**
 * 列出挂牌此角色的插件（激活序优先，同序则 pluginId 字典序 tie-break）。
 * 仅在册者——已卸载/已禁用插件的注册早被回收，天然不参选（E5/E7）。
 */
export function getRoleHolders(role: FileAssociationRole = TEXT_FALLBACK_ROLE): string[] {
  const holders = _roleHolders.get(role);
  if (!holders || holders.size === 0) return [];
  return [...holders.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([pluginId]) => pluginId);
}

/**
 * T2 解析纯函数——「这个文件由谁打开」的**一处真相源**（三入口同吃的机械保证）。
 *
 * 解析序（D7 主权三层）：
 *   ① 用户覆盖表（`WORKBENCH_FILE_ASSOCIATIONS_KEY`，键归一后精确匹配 E25）——命中且**指向者在册**
 *      才生效；指向者已卸载/禁用（E6/E7：注册已回收）⇒ 视同未覆盖，键惰性保留（下次「设为默认」自然覆盖）；
 *   ② 声明表——注册序即激活序，取首个（E1/E19：第二只装上不漂移）；
 *   ③ 角色兜底（T7）——无声明者时由当前挂牌者接手；连挂牌者都没有 ⇒ welcome 提示页语义（E22）。
 *
 * ⚠️ 本函数是**纯查表**：覆盖表由调用方注入（主进程 registry-handlers 平键直读 settings.json；
 * 壳侧提示组装从 ConfigurationService 现读）——本模块不碰配置服务，保持双进程可共享。
 */
export function resolveOpenTarget(
  extension: string,
  override?: Readonly<Record<string, string>>
): string {
  const ext = normalizeExtension(extension);
  if (ext && override) {
    for (const [rawKey, target] of Object.entries(override)) {
      // 覆盖表键与查询键同口径归一（E10）；每扩展名至多一个键，命中即止
      if (normalizeExtension(rawKey) === ext) {
        if (target && getPluginsFor(ext).some((a) => a.pluginId === target)) return target;
        break;
      }
    }
  }
  const list = getPluginsFor(ext);
  if (list.length > 0) return list[0].pluginId;
  return resolveFallbackTabType();
}

/** `listHandlersFor` 行——「打开方式…」选择器的每行数据（01 §T2.1） */
export interface FileAssociationHandlerEntry {
  pluginId: string;
  /** 声明缺 displayName 时回退 pluginId（E4：识别只看声明，与插件名无关） */
  displayName: string;
  /** 是否当前默认（解析序现算，随覆盖表走） */
  isCurrent: boolean;
}

/**
 * T2 只读面——列出能处理此扩展名的**全部**声明者＋当前默认标记（「打开方式…」选择器数据源）。
 * 无声明者 ⇒ 空数组（选择器不可达：右键项 `when` 收敛 + 调用方判空，E13）。
 */
export function listHandlersFor(
  extension: string,
  override?: Readonly<Record<string, string>>
): FileAssociationHandlerEntry[] {
  const ext = normalizeExtension(extension);
  if (!ext) return [];
  const list = getPluginsFor(ext);
  if (list.length === 0) return [];
  const current = resolveOpenTarget(ext, override);
  return list.map((a) => ({
    pluginId: a.pluginId,
    displayName: a.displayName ?? a.pluginId,
    isCurrent: a.pluginId === current,
  }));
}

/**
 * T7 兜底解析——「找不到声明者时开哪个标签」的**唯一真相源**（退役 `DEFAULT_TAB_TYPE="editor"`）。
 *
 * 解析序（与 T2 `resolveOpenTarget` 同构，本函数 = 它的**最后一档**）：
 *   用户覆盖表（T2，波 3 落）→ 声明表（该扩展名，激活序优先＋pluginId 字典序）→ **角色兜底（本函数）**
 *   → 无任何挂牌者 ⇒ `FALLBACK_PLUGIN_ID`（"welcome"）＝ T1 提示页语义（E22——不塞一个不存在的插件）。
 *
 * 🔴 为什么壳不再写死 `"editor"`（硬约束 10 的白名单例外就此退役）：壳**不知道也不该知道**插件 id，
 * 「谁是文本兜底」是插件用 `role:"text-fallback"` 自报的（铁律②）。装上第二家挂牌者不静默漂移——
 * 它只是进了候选，当前默认仍是先激活的那家（D7）。
 */
export function resolveFallbackTabType(): string {
  return getRoleHolders(TEXT_FALLBACK_ROLE)[0] ?? FALLBACK_PLUGIN_ID;
}

/* ── 工具 ── */

/** 归一化扩展名：去点、去空白、转小写 */
function normalizeExtension(ext: string): string {
  if (!ext) return "";
  let s = ext.trim().toLowerCase();
  if (s.startsWith(".")) s = s.slice(1);
  return s;
}

/** 清空注册表（测试用） */
export function clearFileAssociations(): void {
  _associations.clear();
  _pluginExtensions.clear();
  _roleHolders.clear();
  _roleSeq = 0;
  _secondContenderAnnounced.clear();
}
