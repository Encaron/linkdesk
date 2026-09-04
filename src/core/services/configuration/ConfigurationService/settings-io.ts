/**
 * 配置服务——持久化/初始化/写路径属主（E5.8#0.4a 拆 ConfigurationService/ feature-folder）。
 * 单域属主（0d.10-8 KeybindingRegistry 同型）：User/Workspace 串行持久化队列（E5.8#61 审计#6）、
 * User 尾沿去抖（E5.8#89 E3）、settings.json watcher、_initialized/_initPromise（StrictMode 双 effect
 * 防竞态）全部归本文件。缓存写经 cache.ts accessor（live ref）——本文件是唯一跨域组合点：
 * clearConfigurationCache（测试复位）组合 cache.resetCacheForTest + 自身 init/persist/去抖复位
 * （对标 KeybindingRegistry 顶层子模块 dispatch 组合 clearKeybindings 先例）。
 *
 * 依赖方向（单向无环）：cache/applier-registry/change-listener/value-access（均叶子或读层）→
 * settings-io（写层/IO 层，消费 value-access.getConfigurationValue 取回退值）→ 聚合器。无反向。
 */

import {
  getMergedSchema,
} from "../../../registry/ConfigurationRegistry";
import { read, write, getFilePath } from "../StorageService";
import { exists, readFile, writeFile, createDir, joinPath, appDataDir } from "../../files/FileService";
import { deepEqual } from "../../../utils/deepEqual"; // E5.8 bug 修复：diff 浅比较→深比较（settings.json 回写循环）
import {
  getUserCache,
  getWorkspaceCache,
  replaceUserCache,
  replaceWorkspaceCache,
  setCacheRoot,
  getWorkspaceRoot,
  resetCacheForTest,
} from "./cache";
import { runConfigApplier } from "./applier-registry";
import { emitChange, emitChangeSilent } from "./change-listener";
import { getConfigurationValue } from "./value-access";

/* ── 初始化 ── */

/** initConfigurationService 的进行中 Promise——StrictMode 双重 effect 时第二次调用等第一次完成 */
let _initPromise: Promise<void> | null = null;
let _initialized = false;

/**
 * 初始化配置服务——App 启动时调用一次。
 * 加载 settings.json（User scope）。Workspace scope 等 WorkspaceService setWorkspaceRoot 后加载。
 */
export async function initConfigurationService(): Promise<void> {
  // 🔥 #59c fix：和 initPluginLoader 同样模式——return 进行中 Promise 防 StrictMode 竞态
  if (_initialized) return _initPromise ?? Promise.resolve();
  _initialized = true;

  return (_initPromise = (async () => {
  // Phase 5f：统一走 StorageService（不再自研 ensureTauri + fsApi + pathApi）
  // E5.8#71：read() 文件优先（文件 = 真相）——外部编辑 settings.json 即启动生效；localStorage 仅兜底 + 缓存刷新
  const saved = await read<Record<string, unknown>>("settings");
  if (saved) replaceUserCache(saved);

  // 🔥 自愈（E5.8 bug 修复配套）：崩溃残留空 settings.json——localStorage 有数据但文件空/损坏 → 写回文件。
  // 否则编辑器"以 JSON 打开"看到空白文件，误以为设置丢失（write 双写 localStorage 幂等同数据，无害）。
  if (getUserCache() && Object.keys(getUserCache()).length > 0) {
    const filePath = await getFilePath("settings");
    if (!filePath) return; // 非 Electron 环境——无文件路径
    const raw = await readFile(filePath);
    if (!raw.trim()) await _persistUser();
  }
  })());
}

/* ── settings.json 文件变更生效闭环（E5.8#0d.5）── */

/** 纯函数——计算 next 相对 current 的变更 key 列表（value = next[key]；被删 key 的 value 为 undefined）。可单测。 */
export function diffUserSettings(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Array<{ key: string; value: unknown }> {
  const changed: Array<{ key: string; value: unknown }> = [];
  const allKeys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const key of allKeys) {
    // 🔥 深比较——对象/数组值每次 JSON 重新解析引用不同，浅比较 `===` 恒判"变更"→回写无限循环（800MB 冻结）
    if (key in current && key in next && deepEqual(current[key], next[key])) continue;
    changed.push({ key, value: key in next ? next[key] : undefined });
  }
  return changed;
}

let _reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 重读 settings.json 文件并应用到内存——外部编辑（编辑器标签页保存）后即时生效。
 * 直读文件（不走 read() 的缓存回写）——reload 需要 ① 与内存 diff（零变更零通知防自写循环）② 队列未排空跳过。
 * E5.8#71：read() 已同样归一为文件优先（文件 = 真相），二者语义一致，仅 reload 保留直读以走 diff/apply 流。
 * 零变更则零通知（防自写自触发循环）；非法 JSON 不覆盖内存（等下一次保存）。
 */
export async function reloadUserSettings(): Promise<void> {
  // E5.8#61 审计#6：应用自写持久化队列未排空时跳过——启动期播种/清扫/种子连写，去抖 reload 可能
  // 读到「队列未排空的陈旧文件」→ 假 diff → 内存被回滚成陈旧值 → 清扫/播种值落盘前被覆盖
  // （CDP 实测：内存 dark 磁盘 ghost 并存）。队列排空后文件 = 内存，reload 零 diff 零回滚。
  // 重排 80ms 直至排空——外部编辑撞上写突发时同样兜底生效（下次 watcher 事件也会触发，双保险）。
  if (_pendingUserPersists > 0) {
    clearTimeout(_reloadDebounceTimer);
    _reloadDebounceTimer = setTimeout(() => { void reloadUserSettings(); }, 80);
    return;
  }
  const filePath = await getFilePath("settings");
  if (!filePath) return; // 非 Electron 环境（npm run dev 浏览器模式）

  let raw: string;
  try {
    raw = await readFile(filePath);
  } catch {
    return; // 文件不存在/读失败——保持内存现状
  }

  let next: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return; // 非法 JSON——不覆盖内存
    next = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  const changed = diffUserSettings(getUserCache(), next);
  if (changed.length === 0) return; // 零变更零通知——防自写自触发循环

  for (const { key, value } of changed) {
    if (key in next) getUserCache()[key] = value;
    else delete getUserCache()[key];
  }

  for (const { key } of changed) {
    // 被删 key 广播生效值（回落到 default/workspace）——消费方收到可直接用
    const value = key in next ? next[key] : getConfigurationValue<unknown>(key);
    emitChangeSilent(key, value, "user");
    runConfigApplier(key, value);
  }

  // 双写同步 localStorage——StorageService.write 同时写文件 + localStorage（F5/重启安全，防读到旧配置）。
  // E5.8#61 审计#6：走串行队列——外部编辑回写不得与 set 路径并发写文件（防交错/截断损坏）。
  await _persistUser();
}

let _settingsWatcherStarted = false;

/**
 * 挂 settings.json 文件监听——外部编辑（编辑器标签页保存）→ 重读生效。App mount 前调用一次。
 * 幂等（防 StrictMode 双重调用）；非 Electron 环境静默跳过。
 *
 * E5.8#59（审计#7）：去抖——壳自写持久化（set/batch 写文件）会连发 watcher 事件，
 * 立即 reload 会读到「上一写尚未落盘」的中间态文件 → 与已同步更新的内存产生假 diff →
 * 对每个「被删 key」重复调 _configApplier → 复位路径 6 覆盖 key 各多广播 1 次 theme:changed（7 连发）。
 * 去抖合并自写突发（P1+P2）→ 事件停息后读到的文件 = 内存 → diff 空 → 零重放；
 * 外部编辑（编辑器保存 settings.json）仍生效，仅延迟 ~80ms。
 */
export async function initUserSettingsWatcher(): Promise<void> {
  if (_settingsWatcherStarted) return;
  _settingsWatcherStarted = true;

  const watcher = window.linkdesk?.filesystem?.watch;
  if (!watcher) return; // 非 Electron 环境——无 window.linkdesk

  try {
    const dir = await appDataDir();
    await watcher(dir, (e: { path: string; type: string }) => {
      if (e.type === "deleted") return;
      const basename = String(e.path).split(/[\\/]/).pop();
      if (basename !== "settings.json") return;
      clearTimeout(_reloadDebounceTimer);
      _reloadDebounceTimer = setTimeout(() => { void reloadUserSettings(); }, 80);
    });
  } catch (e) {
    // watcher 启动失败不阻塞 mount——降级为"保存后重启生效"（现状）
    console.warn("[ConfigurationService] settings.json watcher 启动失败:", e);
  }
}

/* ── 写入 ── */

/**
 * 写入配置值——明确指定 scope。
 * VS Code 对标：ConfigurationTarget.USER / ConfigurationTarget.WORKSPACE
 */
export async function setConfigurationValue(
  key: string,
  value: unknown,
  scope: "user" | "workspace" = "user"
): Promise<void> {
  // M3：写入前 enum 验证——非法的主题 ID/语言代码等拒绝写入
  const schema = getMergedSchema();
  const prop = schema[key];
  if (prop?.enum && !prop.enum.includes(value as string)) {
    console.warn(`[ConfigurationService] "${key}: ${value}" 不在 enum [${prop.enum}] 中——拒绝写入`);
    return;
  }

  // 内存先写——读路径立即生效（getConfigurationValue 永远读到最新值）
  if (scope === "workspace") {
    getWorkspaceCache()[key] = value;
  } else {
    getUserCache()[key] = value;
  }

  // E5.8#89 E3：通知监听器 + applier 先于持久化——拖拽逐 tick 即时广播（config:changed → 设置页 label
  // 实时刷新 / onApply 去抖重算），持久化尾沿去抖只收敛磁盘写，不阻塞逐 tick 通知。
  emitChange(key, value, scope);

  // Phase 5f：ConfigurationApplier——自动调 onApply，组件无需手动订阅
  runConfigApplier(key, value);

  // 持久化后置——workspace 立即串行写（低频）；user 尾沿去抖（拖拽 N tick → 1 次磁盘写，E5.8#89 E3）
  if (scope === "workspace") {
    await _persistWorkspace();
  } else {
    await _persistUser();
  }
}

/**
 * E3f #53b：重置配置值——删除用户覆盖，回退到 default。
 * 对标 VS Code "Reset Setting"——移除 User scope 的 key，下次读取自动走 default 层。
 */
export async function resetConfigurationValue(
  key: string,
  scope: "user" | "workspace" = "user"
): Promise<void> {
  if (scope === "workspace") {
    delete getWorkspaceCache()[key];
    await _persistWorkspace();
  } else {
    delete getUserCache()[key];
    await _persistUser();
  }

  // 取回退后的值（走 default 层）
  const effective = getConfigurationValue(key);

  // 通知监听器——SettingsView 刷新
  emitChange(key, effective, scope);

  // ConfigurationApplier——重置后自动调 onApply
  runConfigApplier(key, effective);
}

/* ── E5.8#59：批量写/复位——播种/复位路径广播收敛 ── */

/**
 * E5.8#59（审计#7）：批量写配置——一次动作收敛为单次持久化 + 单次 applier。
 * 播种/复位先例：appearanceMode→custom 6 覆盖连写、mixMode→mix 6 来源连写——每连 setConfigurationValue
 * 各自 await + 各触发一次 applier → N 次 applyRecipe 全量重合并 + N 次 theme:changed 广播（脱出窗多池放大中间态）。
 * 本 API：同步写内存全部 key → 单次持久化 → 逐 key 通知监听器（SettingsView 逐行刷新）→ 单次 applier（末 key 代表性）。
 * 各 key onApply 全量读生效配置（壳外观覆盖 onApply = applyThemeIfReady），末 key 触发 = 读到完整终态，一次广播即收敛。
 * enum 逐 key 校验——非法 key 跳过（行为对齐 setConfigurationValue）；全部非法则零写入零广播。
 */
export async function setConfigurationValueBatch(
  entries: Array<{ key: string; value: unknown }>,
  scope: "user" | "workspace" = "user"
): Promise<void> {
  const valid: Array<{ key: string; value: unknown }> = [];
  const schema = getMergedSchema();
  for (const { key, value } of entries) {
    const prop = schema[key];
    if (prop?.enum && !prop.enum.includes(value as string)) {
      console.warn(`[ConfigurationService] "${key}: ${value}" 不在 enum [${prop.enum}] 中——跳过`);
      continue;
    }
    valid.push({ key, value });
  }
  if (valid.length === 0) return;

  if (scope === "workspace") {
    for (const { key, value } of valid) getWorkspaceCache()[key] = value;
    await _persistWorkspace();
  } else {
    for (const { key, value } of valid) getUserCache()[key] = value;
    await _persistUser();
  }

  for (const { key, value } of valid) {
    emitChange(key, value, scope);
  }

  // 收敛——单次 applier（末 key 代表性：各 onApply 全量读生效态，终态一致）
  const last = valid[valid.length - 1];
  runConfigApplier(last.key, last.value);
}

/**
 * E5.8#59（审计#7）：批量复位——删除多个用户覆盖 key → 单次持久化 + 单次 applier。
 * 对称于 setConfigurationValueBatch（appearanceMode→followTheme 6 覆盖删 / mixMode→recipe 6 来源删）。
 * 未被显式写过的 key 跳过（无删除动作零广播）；删除后按回退生效值通知监听器。
 */
export async function resetConfigurationValueBatch(
  keys: readonly string[],
  scope: "user" | "workspace" = "user"
): Promise<void> {
  const target = scope === "workspace" ? getWorkspaceCache() : getUserCache();
  const present = keys.filter((key) => key in target);
  if (present.length === 0) return;

  for (const key of present) delete target[key];
  if (scope === "workspace") await _persistWorkspace();
  else await _persistUser();

  for (const key of present) {
    const effective = getConfigurationValue(key);
    emitChange(key, effective, scope);
  }

  const last = present[present.length - 1];
  runConfigApplier(last, getConfigurationValue(last));
}

/* ── Workspace scope 管理 ── */

/**
 * 设置当前 workspace 根路径——Phase 6 WorkspaceService 调用。
 * Phase 5 定义接口签名，Phase 6 传参消费。
 */
export async function setWorkspaceRoot(rootPath: string | null): Promise<void> {
  setCacheRoot(rootPath);
  if (!rootPath) {
    replaceWorkspaceCache({});
    return;
  }

  // E2c #19c：Workspace scope 统一走 FileService（不在 appDataDir 下，不走 StorageService）
  const wsSettingsPath = await joinPath(rootPath, ".linkdesk", "settings.json");
  try {
    if (await exists(wsSettingsPath)) {
      const raw = await readFile(wsSettingsPath);
      replaceWorkspaceCache(JSON.parse(raw));
    } else {
      replaceWorkspaceCache({});
    }
  } catch {
    replaceWorkspaceCache({});
  }
}

/* ── E5.8#61 审计#6：持久化串行队列 ──
 * 并发 setConfigurationValue 各自 await _persist*()——不串行时两个 fs.writeFile 并发写同一
 * settings.json → 交错/截断 → 文件损坏（CDP 实测：启动期多路播种/清扫连写，valid JSON + 尾部垃圾）。
 * 链式 then：每个写等前一个 resolve 再执行；task.catch 吞错防断链（本次失败仍向调用方传播）。
 * _pendingUserPersists：队列未排空计数——reloadUserSettings 用它在队列排空前跳过（防读陈旧文件回滚内存）。 */
let _userPersistChain: Promise<void> = Promise.resolve();
let _workspacePersistChain: Promise<void> = Promise.resolve();
let _pendingUserPersists = 0;

/* ── E5.8#89 E3：User scope 持久化尾沿去抖 ──
 * 拖拽滑杆连发 setConfigurationValue → 80ms 窗口内合并为单次磁盘写（对标 settings.json watcher 去抖）。
 * _persistDebounceTimer/_persistWaiters 模块级——同一窗口的 N 个 set 追加 waiter，fire 时一起 resolve。
 * _pendingUserPersists：首次排程 +1、写完成（成功或失败）才 -1——reload 在写窗口内保持跳过，
 * 窗口内再 set 只重置尾沿不重复计数（否则合并写完成只 -1 会泄漏计数）。 */
const PERSIST_DEBOUNCE_MS = 80;
let _persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _persistWaiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

/* ── 持久化 ── */

/**
 * User scope 持久化——Phase 5f 归一化到 StorageService。串行队列防并发写损坏（审计#6）。
 * E5.8#89 E3：尾沿去抖（PERSIST_DEBOUNCE_MS）——拖拽滑杆连发 set 收敛为单次磁盘写。
 * setConfigurationValue 已把内存写 + 通知 + onApply 前置，本函数只排程磁盘写：
 *  - 首次排程 `_pendingUserPersists++`，写完成（成功或失败）才 `--`——reload 在写窗口内保持跳过；
 *  - 窗口内再调只重置尾沿 timer + 追加 waiter——不重复计数（合并为同一次写）；
 *  - waiters 数组：被合并的 N 个 set 的 await 全部挂在 fire 后的同一次写上，写完成一起 resolve；
 *  - `_userPersistChain` 保留：fire 后仍排入串行队列，防与 reload/自愈写并发交错（审计#6）。
 */
function _persistUser(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!_persistDebounceTimer) _pendingUserPersists++;
    _persistWaiters.push({ resolve, reject });
    if (_persistDebounceTimer) clearTimeout(_persistDebounceTimer);
    _persistDebounceTimer = setTimeout(() => {
      _persistDebounceTimer = null;
      const waiters = _persistWaiters;
      _persistWaiters = [];
      // 🔥 fire 时读 getUserCache() live 引用——去抖窗口内 N 个 set 累积的终态内存一次落盘
      const task = _userPersistChain.then(() => write("settings", getUserCache()));
      _userPersistChain = task.catch(() => {});
      task.then(
        () => {
          _pendingUserPersists--;
          for (const w of waiters) w.resolve();
        },
        (e) => {
          _pendingUserPersists--;
          for (const w of waiters) w.reject(e);
        },
      );
    }, PERSIST_DEBOUNCE_MS);
  });
}

/**
 * Workspace scope 持久化——写 .linkdesk/settings.json。
 * E2c #19c：统一走 FileService。串行队列防并发写损坏（审计#6）。
 */
function _persistWorkspace(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return Promise.resolve();
  const task = _workspacePersistChain.then(async () => {
    try {
      const linkdeskDir = await joinPath(root, ".linkdesk");
      if (!(await exists(linkdeskDir))) {
        await createDir(linkdeskDir);
      }
      const wsSettingsPath = await joinPath(root, ".linkdesk", "settings.json");
      await writeFile(wsSettingsPath, JSON.stringify(getWorkspaceCache(), null, 2));
    } catch (e) {
      console.warn("[ConfigurationService] 写入 .linkdesk/settings.json 失败:", e);
    }
  });
  _workspacePersistChain = task.catch(() => {});
  return task;
}

/* ── 跨上下文桥接 + 测试复位 ── */

/**
 * E5.6#11-fix7：跨上下文桥接——池侧 ConfigurationService 是独立实例，本地 cache 为空，listener 永远不触发。
 * 壳 IpcBridgeHandler 在配置变更时通过 IpcBridge 广播 config:changed 事件（含 key/value），
 * 池侧 preload 内置 _configCache 回放，此函数供 pool-main.tsx 桥接到本地 ConfigurationService：
 *   1. 更新 User scope cache——让 getConfigurationValue 读到最新值
 *   2. 通知所有 change listener——让 useConfigurationValue/subscribeToConfiguration 重渲染
 */
export function applyRemoteConfigChange(key: string, value: unknown): void {
  if (getUserCache()[key] === value && key in getUserCache()) return;
  getUserCache()[key] = value;
  emitChangeSilent(key, value, "user");
}

/** 清空缓存（测试用）——跨域组合：cache.resetCacheForTest（三层缓存）+ 本文件 init/persist/去抖复位 */
export function clearConfigurationCache(): void {
  resetCacheForTest();
  _initialized = false;
  _pendingUserPersists = 0;
  // E5.8#89 E3：同步清掉残留去抖排程——上一个测试 pending 的 timer 不能打进下一个测试的队列
  if (_persistDebounceTimer) {
    clearTimeout(_persistDebounceTimer);
    _persistDebounceTimer = null;
  }
  const waiters = _persistWaiters;
  _persistWaiters = [];
  for (const w of waiters) w.resolve(); // 悬着的 set await 不悬挂（测试复位语义）
}
