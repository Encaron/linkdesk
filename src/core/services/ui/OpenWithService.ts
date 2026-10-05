/**
 * OpenWithService——「打开方式」选择器的**壳侧聪慧端**。
 *
 * 为什么在壳：本面板消费的全是**宿主声明**（插件清单 / 文件关联声明 / 覆盖表），按判据 A
 * （一个控件的用途若是「消费宿主声明」，必须住在声明方与渲染方都够得着的地方）它属于壳 +
 * `@linkdesk/ui` 共享件，⛔ 不得住在任何可被用户卸载的插件里（原住 file-tree 即住错层——
 * 卸载 file-tree 后设置页入口与编辑器按钮一并消失）。
 *
 * 分工（照 QuickPick/Dialog 的聪慧→哑先例）：
 *   壳（本文件）：归一化入参 → 装配处理器行（含**处理器名/类型名分离**与图标）→ 推 DTO 到池；
 *                读回池侧动作，执行「开标签 / 写覆盖表 / 去市场 / 关面板」。
 *   池（OpenWithPickerHost）：只渲染 DTO + 回传动作，不读任何宿主声明（Path B 哑渲染器）。
 *
 * 跨文档通道：`events.emit("openWith:show")`（壳 → 池）+ `events.emit("openWith:action")`（池 → 壳）。
 *   壳文档无可见 DOM（`App.tsx` 只渲染空壳），全部可见 UI 都在池文档 ⇒ 面板必须在池里渲染；
 *   这两条通道是命令式请求，主进程侧按 `commands:executeRequest` 先例 storeForReplay=false
 *   （新池创建不得重放过期请求，见 `electron/ipc/ipc-bridge.ts` onPluginEmit）。
 */
import type { OpenWithHandler, OpenWithRequest } from "@linkdesk/contracts";
import { getShellExposed } from "../../api/linkdesk-api/surfaces";
import { getUserSettings } from "../configuration/ConfigurationService";
import {
  normalizeExtension,
  resolveFallbackTabType,
  WORKBENCH_FILE_ASSOCIATIONS_KEY,
} from "../files/FileAssociationService";
import { pickIdentityArt } from "../../../components/shared/plugin-icon/iconUtils";
import { factorySlots } from "../bootstrap/FactorySlots";
import { shellEvents } from "../../react/events/ShellEvents";
import { normalizePath } from "../../utils/path/pathUtils";

/** 壳→池：面板 DTO（`open:false` = 收起）——通道名是跨文档 wire 契约，池侧按字面消费 */
const OPEN_WITH_SHOW_CHANNEL = "openWith:show";
// 反向的 `openWith:action` 本文件只**接收**（回执入口 `handleOpenWithAction`，壳侧订阅在
// `usePoolSync/useSubscriptions`）⇒ 不在此处立常量：它没有壳侧 emit 端，字面量在池侧。

/** 面板 DTO——池哑渲染的全部输入（壳侧装配产出，池不二次加工）；池侧按 wire 契约手抄同形 */
interface OpenWithPanelDTO {
  open: boolean;
  request?: OpenWithRequest;
  handlers?: OpenWithHandler[];
}

/** 池侧动作回执——`setDefault` 的 `pluginId: null` = 恢复自动（池侧按 wire 契约手抄同形） */
type OpenWithAction =
  | { type: "openOnce"; pluginId: string }
  | { type: "setDefault"; pluginId: string | null }
  | { type: "searchMarket" }
  | { type: "close" };

/** 面板当前态——`openOnce`/`setDefault` 需要知道「用户在给哪个 uri/ext 选」 */
let _current: { request: OpenWithRequest; handlers: OpenWithHandler[] } | null = null;

/** 插件清单行（只取装配要用到的字段——IPC 序列化子集的结构兼容面） */
interface PluginRow {
  pluginId: string;
  manifest?: {
    name?: string;
    icon?: string;
    iconSource?: "codicon" | "svg" | "url" | "lucide";
    marketIcon?: string;
    marketIconSource?: "codicon" | "svg" | "url" | "lucide";
  };
}

function emit(dto: OpenWithPanelDTO): void {
  window.linkdesk?.events?.emit(OPEN_WITH_SHOW_CHANNEL, dto);
}

/** 路径末段（Windows 反斜杠为主——先归一） */
function basenameOf(filePath: string): string {
  const normalized = normalizePath(filePath);
  return normalized.split("/").pop() || normalized;
}

/** 从路径推扩展名——与归一化同口径（无点/小写）；无扩展名 ⇒ "" */
function extOfPath(filePath: string): string {
  const name = basenameOf(filePath);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? normalizeExtension(name.slice(dot + 1)) : "";
}

/**
 * 归一化命令入参——⛔ 不接受裸字符串（唯一形状 = `OpenWithRequest`，见 01 §四 调用面契约）。
 * `uri` 与 `ext` 至少给一个；两者都缺 ⇒ 返回 null（调用方错误，调用处报错不弹空面板）。
 */
function normalizeRequest(input: unknown): OpenWithRequest | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as OpenWithRequest;
  const uri = typeof raw.uri === "string" && raw.uri ? raw.uri : undefined;
  const ext = typeof raw.ext === "string" && raw.ext ? normalizeExtension(raw.ext) : undefined;
  if (!uri && !ext) return null;
  const anchor =
    raw.anchor && Number.isFinite(raw.anchor.x) && Number.isFinite(raw.anchor.y)
      ? { x: raw.anchor.x, y: raw.anchor.y }
      : undefined;
  const name = raw.name ?? (uri ? basenameOf(uri) : undefined);
  return { uri, name, ext: ext ?? (uri ? extOfPath(uri) : undefined), anchor };
}

/**
 * 装配面板行——**C1.8/C1.9 的修复本体**（壳侧装配产出）：
 *  · `title` = **处理器名**（插件显示名，取 `pluginManager.list()` 行的 `manifest.name`）；
 *  · `typeLabel` = **类型名**（声明里的 `displayName`，如 `.rs → "Rust"`）——⛔ 两者不可互换；
 *  · `manifest` 由共享 helper `pickIdentityArt()` 产出，与设置页/标签栏**同源**（修复插件侧
 *    读不到 `plugins.listAll` 导致的全白纸图标）。
 */
async function assembleHandlers(ext: string): Promise<OpenWithHandler[]> {
  const lk = getShellExposed();
  if (!lk || !ext) return [];
  const entries = (await lk.fileAssociation?.listHandlersFor?.(ext)) ?? [];
  if (entries.length === 0) return [];

  let rows: PluginRow[] = [];
  try {
    rows = ((await lk.pluginManager?.list?.()) ?? []) as PluginRow[];
  } catch {
    rows = []; // 清单读不到 ⇒ 回退 pluginId 当处理器名（面板仍可用）
  }
  const byId = new Map(rows.map((r) => [r.pluginId, r.manifest]));

  // 覆盖表（显式默认）——有键且指向当前默认 ⇒ 该行是「显式默认」而非「自动裁决」
  const overrides = (getUserSettings()[WORKBENCH_FILE_ASSOCIATIONS_KEY] ?? {}) as Record<string, unknown>;
  let explicit: string | undefined;
  for (const [key, value] of Object.entries(overrides)) {
    if (normalizeExtension(key) === ext && typeof value === "string" && value) {
      explicit = value;
      break;
    }
  }

  return entries.map((e) => {
    const manifest = byId.get(e.pluginId);
    return {
      pluginId: e.pluginId,
      title: manifest?.name ?? e.pluginId,
      // 声明里的 displayName = 文件类型显示名（如 "Rust"）——⛔ 不是插件名
      typeLabel: e.displayName,
      manifest: pickIdentityArt(manifest),
      isDefault: e.isCurrent,
      isAuto: e.isCurrent && explicit !== e.pluginId,
    };
  });
}

/** 打开面板（壳命令 handler 的唯一入口）——`request` 非法时 console.error 出声，不弹空面板 */
export async function showOpenWith(input: unknown): Promise<void> {
  const request = normalizeRequest(input);
  if (!request) {
    console.error(
      "[openWith] 入参非法——需要 { uri } 或 { ext }（OpenWithRequest 形状）:",
      input,
    );
    return;
  }
  const ext = request.ext ?? "";
  const handlers = await assembleHandlers(ext);
  _current = { request, handlers };
  emit({ open: true, request, handlers });
}

/** 收起面板（无当前态时静默——幂等）——只由动作回执与重装路径内部调用 */
function hideOpenWith(): void {
  _current = null;
  emit({ open: false });
}

/** 在指定插件里打开当前文件（照 `useOpenPathIntake` 的 `tab:create` 单一路径——判重靠身份去重） */
function openOnceIn(pluginId: string): void {
  const request = _current?.request;
  const uri = request?.uri;
  if (!uri) return; // 按类型打开（设置页入口）没有文件可开——由面板侧收敛「只给设为默认/去市场」
  const name = request.name ?? basenameOf(uri);
  shellEvents.emit("tab:create", {
    type: pluginId || resolveFallbackTabType(),
    opts: { filePath: uri, sourceId: uri, label: name, pinned: true },
  });
}

/** 动作回执处理（池 → 壳）——面板与覆盖表两条真相源都由壳侧收敛 */
export async function handleOpenWithAction(action: unknown): Promise<void> {
  const a = action as OpenWithAction | undefined;
  if (!a || typeof a !== "object" || typeof a.type !== "string") return;
  switch (a.type) {
    case "close":
      hideOpenWith();
      return;
    case "openOnce": {
      if (typeof a.pluginId !== "string" || !a.pluginId) return;
      openOnceIn(a.pluginId);
      hideOpenWith();
      return;
    }
    case "setDefault": {
      const ext = _current?.request?.ext;
      if (!ext) return;
      const target = typeof a.pluginId === "string" && a.pluginId ? a.pluginId : null;
      try {
        await getShellExposed()?.fileAssociation?.setDefault?.(ext, target);
      } catch (e) {
        console.error("[openWith] 写默认覆盖表失败:", e);
        return;
      }
      // 面板留开 + 重装行（勾选/默认标记当场移到新行——用户看得见自己刚做了什么）
      const request = _current?.request;
      if (!request) return;
      const handlers = await assembleHandlers(ext);
      _current = { request, handlers };
      emit({ open: true, request, handlers });
      return;
    }
    case "searchMarket": {
      // 「没有处理器 ⇒ 去市场找」——经 FactorySlots 解析市场套的**当前激活者**（⛔ 不写死插件 id），
      // 与图标栏点击同一条路（开市场标签页）。
      const marketId = factorySlots.getActive("marketplace") ?? factorySlots.getDefaultPluginId("marketplace");
      if (marketId) shellEvents.emit("icon:selected", marketId);
      return;
    }
    default:
      return;
  }
}
