/**
 * 插件加载器。
 * Phase 4：Vite 构建时独立打包 + import() 运行时加载。
 * 设计依据：[[phase4-design-decisions]] 第 1-3 条。
 *
 * 加载时机：App 启动 initPrefs() 完成后调用 initPluginLoader()。
 * 加载顺序：先源码自带 → 再外部安装 → 错误不阻断。
 *
 * P1-4：theme/language 注册（ThemeEngine + i18next）
 * P1-5：文件监听（轮询 list_plugin_dirs）
 * P1-6：7 种错误处理 + minAppVersion 版本检查 + 同名去重
 * Phase 4.3：安装/卸载/禁用/启用完整生命周期
 *
 * 🔒 E3j #72-#73：IPC 时序保护——loader 中的四条高风险路径已覆盖：
 *   - 插件加载/卸载 → plugins:call 走 #72 请求队列（FIFO 串行）
 *   - 主题切换       → bridge:broadcast 走 #27 push 队列（顺序交付）
 *   - 语言切换       → bridge:broadcast 走 #27 push 队列（顺序交付）
 *   - 生命周期事件   → shell Emitter 同步触发（不经过 IPC）
 *   本文件不直接调用 ipcRenderer.invoke——走 window.linkdesk 桥接层，
 *   主进程自动排队，loader 代码无需感知队列存在。
 */

import type { PluginManifest } from "../core/api/types";
import { pushToast, TOAST_TTL_ERROR } from "../core/services/ui/NotificationService";
import { setPluginStateValue, APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
import { initLifecycleConsumers } from "./lifecycle/lifecycle";
// E5.8#11：状态机——watcher 卸载走 unloadPlugin（唯一卸载路径）+ 启动收尾失败诊断日志
// E5.8#24 回归：watcher 跳过已失败/已挂起插件需要 getLoadDiagnostics 读状态机
import { unloadPlugin, getLoadDiagnosticsSummary, getLoadDiagnostics } from "./resolution/loadState";
// E5.8#61 审计#2：watcher 手动删目录卸载路径补 revert（原只有 lifecycle-ops 正规卸载走）——
// lifecycle-ops 不 import loader（无环），此处反向 import 安全
import { revertThemeIfCurrent, revertLanguageIfCurrent, reapplyThemeAfterUnload } from "./lifecycle/lifecycle-ops";
import {
  pluginsApi,
  log,
  errMsg,
  pluginManifestRaw,
  loadedPluginIds,
  _deferredPlugins,
  extractPluginId,
  getMetadataCache,
  cachePluginMetadata,
  getDisabledList,
  discoverInstalled,
  type CachedPluginMeta,
} from "./resolution/state";
export { validateInstallManifest, resolveVersionConflict } from "./discovery/manifest";
export { runtimeEntryPath, parseContributions } from "./contributions/contributions";
import { loadPlugin, activateDeferredByEvent } from "./resolution/runtime";
// #9g 按需激活：延迟判定纯函数（shouldDeferActivation）+ 触发总线（App 层触发源只认总线，不 import runtime）
import { shouldDeferActivation, fireActivationEvent, setActivationEventHandler } from "./resolution/activation";
import { parseManifestJson } from "./jsonc"; // E6#55：作者 plugin.json JSONC——唯一解析入口
import {
  disablePlugin,
  enablePlugin,
  installPlugin,
  installWithProgress, // E6#13（1.2-5）：显式包安装流名（installPlugin 路由别名——#13e 壳面注册）
  uninstallPlugin,
  reinstallPlugin,
  getDisabledPluginInfo,
  getUninstalledPluginInfo,
  isPluginDisabled,
  getListPluginManifests,
} from "./lifecycle/lifecycle-ops";
export {
  disablePlugin,
  enablePlugin,
  uninstallPlugin,
  installPlugin,
  reinstallPlugin,
  isPluginDisabled,
  getLoadedPluginManifests,
  getDisabledPluginInfo,
  getUninstalledPluginInfo,
} from "./lifecycle/lifecycle-ops";

/* ── 初始化 ── */

let _initialized = false;
/** initPluginLoader 的进行中 Promise——StrictMode 双重 effect 时第二次调用等第一次完成 */
let _loadingPromise: Promise<void> | null = null;

export async function initPluginLoader(): Promise<void> {
  // 🔥 #59c fix：StrictMode 双重 effect 第二次调用时等第一次 Promise 完成
  if (_initialized) return _loadingPromise ?? Promise.resolve();
  _initialized = true;

  return (_loadingPromise = (async () => {
  // Phase 5h 行为归一化：注册 lifecycle 消费端（iconOrder/toast/config/tab——只注册一次）
  initLifecycleConsumers();

  // #44/#9g：命令预激活——CommandRegistry 执行命令前经触发总线发 `onCommand:<id>`（激活延迟插件）。
  // 🔥 必须 await——否则钩子在 initPluginLoader 返回后才挂上，用户首次命令执行时钩子未就绪。
  const { setPreActivateHook } = await import("../core/registry/commands/CommandRegistry");
  setPreActivateHook(async (commandId: string) => {
    await fireActivationEvent(`onCommand:${commandId}`);
  });
  // #9g ②：激活事件总线常驻处理器 = runtime 路由器（扫 _deferredPlugins 命中即激活）。
  // App 层触发源（sidebarHost icon:selected / tabActions tab:create / 命令钩子）只认 fireActivationEvent，
  // 经此单点转 runtime——触发源不 import 重型 runtime 模块（防环 + 防启动拉全图）。
  setActivationEventHandler((event) => activateDeferredByEvent(event));

  const errors: string[] = [];
  const disabled = getDisabledList();

  // 1. E6#9a：启动发现单源——plugins:listAll（主进程直扫 plugins/ 全子目录）→ [{ pluginId, entry, manifest }]。
  //    import.meta.glob 是构建时扫描——打包/市场安装的插件不在源码树，glob 看不到（仅 dev/源码内置覆盖）。
  //    对标 VS Code 启动 scan extensions 目录——listAll 同构，装/卸后重启即增删。
  //    纯浏览器预览（无 pluginsApi）discoverInstalled 内回退 glob 种子，行为同旧。
  const discovered = await discoverInstalled();
  const discoveredIds = new Set(discovered.map((e) => e.pluginId));

  // 2. 加载每个已发现插件（跳过禁用；激活延迟见 #44/#9g）
  for (const entry of discovered) {
    const pluginId = entry.pluginId;
    const manifest = entry.manifest;
    if (disabled.includes(pluginId)) {
      log.appendLine(`插件 "${pluginId}" 已禁用——跳过`);
      // B2 fix: 种子缓存——禁用插件元数据入缓存，marketplace 不依赖文件系统（manifest 已在 listAll 结果中）
      cachePluginMetadata(pluginId, manifest, "disabled");
      continue;
    }
    try {
      // #44/#9g：无 activationEvents → 壳按 contributes 自动推断触发事件（fileAssociations→onLanguage /
      // views→onView / commands→onCommand）→ 有 entry 且生效事件非空且无 "*" 时延迟 JS import
      // （启动注册-only，元数据占位注册在 loadPlugin Step4；首用事件 activatePlugin 升级实组件）。
      // entryless 纯贡献插件无 JS 可延迟、data 角色（python langDefs 等）安装即用恒立即——两者不 defer。
      const defer = shouldDeferActivation(manifest);
      await loadPlugin(pluginId, "startup", { skipView: defer });
      if (defer) _deferredPlugins.set(pluginId, manifest);
    } catch (e) {
      errors.push(`${pluginId}: ${errMsg(e)}`);
    }
  }

  // E6#12（1.2-4）：账本 reconcile——发现条目（含 origin）→ 账本与实际文件系统对齐。
  //   .linkdesk-plugin 包经 ingest 解压出现 → 目录有 → 加账本记录；userData 目录被真删 → 删记录
  //   （差集逻辑在 PluginInstallService.reconcileDiff，纯函数可测）。只收 origin.home="userData" 的插件；
  //   dev 项目源码插件（app 根）永不入账本。动态 import + try/catch 非致命——浏览器预览
  //   （无 filesystem IPC）静默跳过，账本缺席不影响启动（getInstalled 兜底 {}）。
  try {
    const { reconcileInstalledLedger } = await import("../core/services/PluginInstallService");
    const { added, removed } = await reconcileInstalledLedger(discovered);
    if (added.length > 0 || removed.length > 0) {
      log.appendLine(`📒 账本 reconcile：+${added.length}（${added.join(", ")}）−${removed.length}（${removed.join(", ")}）`);
    }
  } catch (e) {
    log.appendLine(`⚠️ 账本 reconcile 跳过（非致命）: ${errMsg(e)}`);
  }

  // 3. 源码树里 glob 有、但磁盘已不在（目录被手动删除）的插件——种子 uninstalled 缓存（F5 后详情仍可浏览）。
  //    listAll 以磁盘为准不含它们；此差集只增不删（删僵尸缓存是步骤 7 pruneUninstalledCache 的职责）。
  //    E6#55：glob 值是 ?raw 原文——先 jsonc 解析（坏文件跳过，dev 手工改坏 plugin.json 不拖垮启动）。
  for (const [path, raw] of Object.entries(pluginManifestRaw)) {
    const pluginId = extractPluginId(path);
    if (discoveredIds.has(pluginId)) continue;
    if (loadedPluginIds.has(pluginId)) continue;
    let manifest: PluginManifest;
    try {
      manifest = parseManifestJson(raw);
    } catch (e) {
      log.appendLine(`⚠️ glob 插件 "${pluginId}" plugin.json 解析失败——跳过缓存种子: ${errMsg(e)}`);
      continue;
    }
    if (disabled.includes(pluginId)) {
      cachePluginMetadata(pluginId, manifest, "disabled");
    } else {
      cachePluginMetadata(pluginId, manifest, "uninstalled");
    }
    log.appendLine(`插件 "${pluginId}" 不在磁盘——缓存为 ${disabled.includes(pluginId) ? "已禁用" : "待安装"}`);
  }

  // 5. 错误汇总
  if (errors.length > 0) {
    console.warn("[pluginLoader] 以下插件加载失败:", errors);
    pushToast({
      message: `${errors.length} 个插件加载失败`,
      ttl: TOAST_TTL_ERROR,
    });
  }

  // E5.8#11 诊断面：启动收尾把失败插件 + 原因落日志——此前 loadPlugin 内部吞错，失败原因不可见。
  // 挂载点定案：日志面（含控制台 + pluginLoader LogChannel），不做 UI（壳零改动）；
  // getLoadDiagnostics 导出——未来 dev 面板/marketplace 插件详情可挂（设计文档 §3.3 候选）
  const diags = getLoadDiagnosticsSummary();
  const failedDiag = diags.filter((d) => d.loadState === "failed");
  if (failedDiag.length > 0) {
    const detail = failedDiag.map((d) => `"${d.pluginId}": ${d.failureReason ?? "未知原因"}`).join("；");
    console.warn(`[pluginLoader] 加载失败诊断: ${detail}`);
    log.appendLine(`❌ 加载失败诊断: ${detail}`);
  }
  // E5.8#14：挂起诊断——缺依赖待就绪的插件（pending + pendingReason）启动收尾一并落日志
  // （启动期已 sweep 补载的挂起插件此刻是 active，pendingReason 已被 markLoadStarted 清——只显示真等待）
  const parkedDiag = diags.filter((d) => d.pendingReason !== undefined);
  if (parkedDiag.length > 0) {
    const detail = parkedDiag.map((d) => `"${d.pluginId}": ${d.pendingReason}`).join("；");
    console.warn(`[pluginLoader] 挂起诊断（缺依赖待就绪）: ${detail}`);
    log.appendLine(`⏸ 挂起诊断（缺依赖待就绪）: ${detail}`);
  }

  // 6. 清理僵尸缓存——status="installed" 但未真正加载的条目（插件目录已删除）
  const cache = getMetadataCache();
  let staleCount = 0;
  for (const [id, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && !loadedPluginIds.has(id)) {
      delete cache[id];
      staleCount++;
    }
  }
  if (staleCount > 0) {
    try {
      setPluginStateValue(APP_PLUGIN_ID, "pluginMetadataCache", cache);
      log.appendLine(`🧹 清理 ${staleCount} 条僵尸缓存`);
    } catch { /* 非关键路径 */ }
  }

  // 7. E5.6#16.7k——扫描 .disabled/ 目录，缓存已卸载插件元数据
  //    .disabled/ 不在 import.meta.glob 和 listPluginDirs() 的扫描范围内，
  //    必须单独扫描才能让 marketplace 的"待安装"区域显示这些插件。
  // E5.8#156：扫描后差集清理——缓存 uninstalled ∉ 目录 → 删 + 持久化。
  //   .disabled/ 清空后残留即时消失（用户实机：目录已空仍显 9 个幽灵待安装）。
  try {
    const disabledDirs: string[] = await pluginsApi().listDisabledDirs();
    for (const pluginId of disabledDirs) {
      // 不覆盖已安装插件的缓存
      if (loadedPluginIds.has(pluginId)) continue;
      if (discoveredIds.has(pluginId)) continue;
      try {
        const raw = await pluginsApi().readManifest(pluginId);
        const manifest = parseManifestJson(raw);
        cachePluginMetadata(pluginId, manifest, "uninstalled");
        log.appendLine(`📦 已卸载插件入缓存: ${pluginId}`);
      } catch (e) {
        log.appendLine(`⚠️ 已卸载插件 "${pluginId}" 元数据读取失败: ${errMsg(e)}`);
      }
    }

    const { cache: pruned, removed } = pruneUninstalledCache(getMetadataCache(), disabledDirs);
    if (removed.length > 0) {
      try {
        await setPluginStateValue(APP_PLUGIN_ID, "pluginMetadataCache", pruned);
        log.appendLine(`🧹 清理 ${removed.length} 条幽灵待安装缓存（.disabled 已无目录）: ${removed.join(", ")}`);
      } catch { /* 非关键路径 */ }
    }
  } catch { /* 非 Electron 环境（npm run dev 浏览器模式）——listDisabledDirs 不可用 */ }
  })());
}

/**
 * E5.8#156：差集清理纯函数——缓存里 `status="uninstalled"` 但 `.disabled/` 目录已不存在的条目删除。
 *
 * 语义：「待安装」= 当前 `.disabled/` 里**真可重装**的插件（目录为准），缓存只做显示名兜底。
 * 目录清空 → 残留即时消失；目录仍存在（含新移入）的条目不动——写缓存是第 7 步扫描的职责，
 * 本函数只删不增（差集方向单向）。
 *
 * 纯函数（不 mutate 入参——可单测可预测，loader.test.ts 三态）：返回 { cache（新对象）, removed（被删 pluginId 列表） }，
 * 调用方决定是否持久化（loader 第 7 步：有删除才 setPluginStateValue）。
 */
export function pruneUninstalledCache(
  cache: Record<string, CachedPluginMeta>,
  disabledDirs: readonly string[],
): { cache: Record<string, CachedPluginMeta>; removed: string[] } {
  const dirSet = new Set(disabledDirs);
  const out: Record<string, CachedPluginMeta> = {};
  const removed: string[] = [];
  for (const [id, meta] of Object.entries(cache)) {
    if (meta.status === "uninstalled" && !dirSet.has(id)) {
      removed.push(id);
      continue;
    }
    out[id] = meta;
  }
  return { cache: out, removed };
}

// E5#43：接口反转——loader 注册自己到 IpcBridgeHandler，核心不再直接 import loader
import { setPluginAPI } from "../core/services/plugins/IpcBridgeHandler";
setPluginAPI({
  enablePlugin,
  disablePlugin,
  installPlugin,
  installWithProgress, // E6#13（1.2-5）：显式包安装流名——桥 'installWithProgress' case 路由到这里
  uninstallPlugin,
  reinstallPlugin,
  getDisabledPluginInfo,
  getUninstalledPluginInfo,
  isPluginDisabled,
  // E5.8#15.5：IPC list 数据源换成含挂起插件的合并面——getLoadedPluginManifests 只供内部消费方
  getListPluginManifests,
});

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}

/* ═══════════════════════════════════════════════════════════
   P1-5 文件监听 —— 轮询检测新插件
   ═══════════════════════════════════════════════════════════ */

let _watchInterval: ReturnType<typeof setInterval> | null = null;

/**
 * E5.8#24 回归修复：watcher 是否应跳过该插件（防止 2s 轮询反复重入 loadPlugin）。
 *   - failed（依赖环/加载失败）：不进 loadedPluginIds → 每 2s 被重载 → 环 toast 反复刷屏（回归实况）。
 *     重试走显式 enable/reinstall（markLoadStarted 清 failureReason 后再走管线），不靠轮询。
 *   - pending（缺依赖挂起）：sweepPendingDependencies 在依赖就绪时自动补载，轮询重试无意义。
 *   - 未尝试过的插件 getLoadDiagnostics 返回 "pending" 但 pendingReason 为 undefined——不跳过，正常加载。
 *   独立纯函数——可单测（dependencies.test.ts 走真实 loadPlugin 状态机验证）。
 */
export function shouldWatcherSkip(pluginId: string): boolean {
  const diag = getLoadDiagnostics(pluginId);
  return diag.loadState === "failed" || diag.pendingReason !== undefined;
}

/**
 * Phase 5h：文件监听——轮询检测新插件目录。
 * 每 2 秒调用 Rust `list_plugin_dirs`。
 * - glob 中的插件（在 import.meta.glob 中）→ loadPlugin（Vite chunk）
 * - glob 外的插件（不在 glob 中）→ loadPlugin（运行时 IPC 路径）
 */
export function startPluginWatcher(): void {
  if (_watchInterval) return;

  _watchInterval = setInterval(async () => {
    try {
      const dirs = await pluginsApi().listDirs();
      for (const dir of dirs) {
        if (loadedPluginIds.has(dir)) continue;
        if (getDisabledList().includes(dir)) continue;
        if (shouldWatcherSkip(dir)) continue;

        const manifestKey = Object.keys(pluginManifestRaw).find(
          (k) => extractPluginId(k) === dir
        );
        if (manifestKey) {
          // 已在 Vite glob 中——直接 loadPlugin
          await loadPlugin(dir, "startup");
          log.appendLine(`文件监听发现新插件 "${dir}"——已即时加载`);
        } else {
          await loadPlugin(dir, "install");
        }
      }

      // G16：反向检测——已加载但文件系统已删除 → 自动卸载
      // E5.8#11：走唯一卸载路径 unloadPlugin（unloading → notifyPluginRemoved → fire →
      // 集合清理 → disposed → onDidUninstall）——L6b 顺序由状态机迁移图机械保障
      const fsSet = new Set(dirs);
      for (const id of [...loadedPluginIds]) {
        if (!fsSet.has(id) && !getDisabledList().includes(id)) {
          log.appendLine(`插件 "${id}" 目录已手动删除——自动移除注册`);
          // E5.8#61 审计#2：watcher 卸载路径补 revert——原只有 marketplace 正规卸载走
          // （revertThemeIfCurrent/revertLanguageIfCurrent 须在 unloadPlugin 前——onWillUninstall
          //  注销主题/语言后 revert 找不到归属；目录删除时插件仍 loaded，revert 照常生效）
          const needsMixReapply = await revertThemeIfCurrent(id);
          await revertLanguageIfCurrent(id);
          unloadPlugin(id, "uninstall", id);
          // E5.8#61 审计#1：混搭来源已摘后才重合并（unload 前源配方仍注册——早合并找不到回退）
          if (needsMixReapply) await reapplyThemeAfterUnload();
        }
      }
    } catch {
      // 静默——polling 失败不影响运行
    }
  }, 2000);

  log.appendLine("文件监听已启动（2s 轮询，Phase 5h）");
}

/** 停止文件监听 */
export function stopPluginWatcher(): void {
  if (_watchInterval) {
    clearInterval(_watchInterval);
    _watchInterval = null;
  }
}

// 导出供 vitest——防止新增贡献类型时漏加 revert（主题/语言/图标主题…）
export { revertThemeIfCurrent, revertLanguageIfCurrent, reapplyThemeAfterUnload } from "./lifecycle/lifecycle-ops";
