/**
 * 运行期 OS 关联同步的**触发装配**——第 5 波 T6 件 2 的口子层（真跑在 `os-associations.ts`）。
 *
 * ── 三个触发点（一个都不能少）──
 *   ① **插件装/卸/激活** ⇒ `FileAssociationService.onAssociationsChanged`（注册/回收各报一次）。
 *      这是「装上插件 ⇒ 右键「打开方式」里出现 LinkDesk」的那条链。
 *   ② **配置变**（`app.osAssociations.*`）⇒ 壳侧改 `followPlugins`/`overrides` 时立即重放，
 *      不用重启（IpcBridge 两处配置变更观察点各叫一次 `notifyOsAssociationsConfigChanged`）。
 *   ③ **启动** ⇒ 主进程装配完插件清单后显式调一次：补两件上两路都覆盖不到的事——
 *      上次退出时残留的注册（插件已被外部删除/换机）、开关当前是**关**的状态（关着时没有任何
 *      「变化」事件可依赖，必须主动撤掉残留）。
 *
 * ── 去抖 + 串行 ──
 *   启动期一只插件注册 45 条声明 = 45 次通知：去抖合并成一次真跑（否则 45 次 reg.exe 往返）。
 *   串行保证装卸交错时不并发写注册表（后一次跑读到的「已写集合」一定是前一次落盘的结果）。
 *
 * ── 依赖注入（本模块 ⛔ 不 import electron）──
 *   路径 / 配置读取 / 注册表现状 / 声明集合全由装配方（registry-handlers，主进程唯一装配点）注入，
 *   于是本模块是纯编排：单测拿假依赖即可验「去抖合并 / 开关关掉会撤 / 配置变会重放」。
 */

import { type RegExec } from './reg-exec.js';
import { syncDynamicAssociations, type SyncResult } from './os-associations.js';
import {
  OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY,
  OS_ASSOCIATIONS_OVERRIDES_KEY,
} from '../../src/core/services/files/FileAssociationService.js';

/** 装 / 卸两条腿的输入（全部由装配方提供，本模块不碰 I/O 之外的真相源） */
export interface OsAssociationsSyncDeps {
  /** 状态文件绝对路径（`{userData}/os-associations-dynamic.json`） */
  statePath: string;
  /** settings.json 现读（平键表）——与 registry-handlers `readOverrideTable` 同一份读法 */
  readSettings: () => Promise<Record<string, unknown>>;
  /** 注册表事实：`LinkDesk.Document` 的 ProgId 树在不在（=「文件关联」开关当前状态） */
  isProgIdRegistered: () => Promise<boolean>;
  /** 当前活跃插件声明的扩展名（`FileAssociationService.listDeclaredExtensions()`） */
  listDeclared: () => string[];
  /** 注入执行器（单测给替身） */
  exec?: RegExec;
}

let _deps: OsAssociationsSyncDeps | null = null;
let _timer: ReturnType<typeof setTimeout> | null = null;
/** 串行链——每次真跑挂在它后面（避免并发写注册表） */
let _chain: Promise<unknown> = Promise.resolve();
/** 最近一次真跑结果（只读快照，供诊断/单测断言） */
let _lastResult: SyncResult | null = null;

/** 去抖窗口：够长以合并启动期一连串注册，短到用户感觉「点了就生效」 */
const DEBOUNCE_MS = 150;

/** 装配（registry-handlers 在启动时叫一次；重复装配 = 覆盖，便于测试重置） */
export function configureOsAssociationsSync(deps: OsAssociationsSyncDeps): void {
  _deps = deps;
}

/** 装配是否已就绪（main.ts 启动调用前自查，避免无依赖时静默空转） */
export function isOsAssociationsSyncConfigured(): boolean {
  return _deps !== null;
}

/** 读「跟随插件」两键（缺省 = 开／空表——与配置声明的 default 保持一致） */
async function readFollowConfig(
  readSettings: () => Promise<Record<string, unknown>>,
): Promise<{ followPlugins: boolean; overrides: Record<string, boolean> }> {
  const settings = await readSettings();
  const overridesRaw = settings[OS_ASSOCIATIONS_OVERRIDES_KEY];
  const overrides: Record<string, boolean> = {};
  if (overridesRaw && typeof overridesRaw === 'object' && !Array.isArray(overridesRaw)) {
    for (const [k, v] of Object.entries(overridesRaw as Record<string, unknown>)) {
      if (typeof v === 'boolean') overrides[k] = v;
    }
  }
  return { followPlugins: settings[OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY] !== false, overrides };
}

/**
 * 立刻真跑一次（不走去抖）——启动路径与测试直调。
 * 未装配 / 任何一步抛错都**不炸主进程**（注册表写失败不该让软件起不来），返回 `null` 并留日志。
 */
export async function runOsAssociationsSyncNow(reason: string): Promise<SyncResult | null> {
  const deps = _deps;
  if (!deps) {
    console.warn(`[os-associations] 未装配，忽略同步（${reason}）`);
    return null;
  }
  try {
    const [{ followPlugins, overrides }, progIdRegistered] = await Promise.all([
      readFollowConfig(deps.readSettings),
      deps.isProgIdRegistered(),
    ]);
    const result = await syncDynamicAssociations({
      declared: deps.listDeclared(),
      followPlugins,
      overrides,
      progIdRegistered,
      statePath: deps.statePath,
      exec: deps.exec,
    });
    _lastResult = result;
    if (result.added.length > 0 || result.removed.length > 0) {
      console.log(
        `[os-associations] ${reason}：+${result.added.join('') || '0'} ` +
          `-${result.removed.join('') || '0'}（在册 ${result.active.length} 型）`,
      );
    }
    return result;
  } catch (e) {
    console.warn(`[os-associations] 同步失败（${reason}）：`, e);
    return null;
  }
}

/**
 * 去抖后串行真跑——三个触发点统一走这里。
 * `reason` 只进日志（诊断用：区分是插件事件还是配置变化引起的那一次）。
 */
export function scheduleOsAssociationsSync(reason: string): void {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    _chain = _chain.then(() => runOsAssociationsSyncNow(reason)).catch(() => {});
  }, DEBOUNCE_MS);
  // 不阻塞事件循环退出（主进程长驻，这一行只为单测/退出路径干净）
  (_timer as unknown as { unref?: () => void }).unref?.();
}

/**
 * 配置变化的窄口——只有 `app.osAssociations.*` 两键值得重放。
 * 其余键（含 `workbench.fileAssociations` 覆盖表）与本模块无关：那批走 in-app 解析，不动 OS。
 */
export function notifyOsAssociationsConfigChanged(key: string): void {
  if (key === OS_ASSOCIATIONS_FOLLOW_PLUGINS_KEY || key === OS_ASSOCIATIONS_OVERRIDES_KEY) {
    scheduleOsAssociationsSync(`config:${key}`);
  }
}

/** 测试专用：清掉装配与挂起状态（生产路径不调） */
export function resetOsAssociationsSyncForTest(): void {
  _deps = null;
  if (_timer) clearTimeout(_timer);
  _timer = null;
  _chain = Promise.resolve();
  _lastResult = null;
}
