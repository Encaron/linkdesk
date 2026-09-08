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
  loadedPluginIds,
  _deferredPlugins,
  getMetadataCache,
  cachePluginMetadata,
  getDisabledList,
  discoverInstalled,
} from "./resolution/state";
export { validateInstallManifest, resolveVersionConflict } from "./discovery/manifest";
export { runtimeEntryPath, parseContributions } from "./contributions/contributions";
import { loadPlugin, activateDeferredByEvent } from "./resolution/runtime";
// #9g 按需激活：延迟判定纯函数（shouldDeferActivation）+ 触发总线（App 层触发源只认总线，不 import runtime）
import { shouldDeferActivation, fireActivationEvent, setActivationEventHandler } from "./resolution/activation";
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
// E6#0.6b 拆夹：安全更新流独立模块（updatePlugin/checkPluginUpdates 迁 self lifecycle-ops.ts——800 行体积门禁 E6#0.6a）
import { updatePlugin, checkPluginUpdates } from "./lifecycle/update";
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
  //    对标 VS Code 启动 scan extensions 目录——listAll 同构，装/卸后重启即增删。
  //    纯浏览器预览（无 pluginsApi）discoverInstalled 内回退 eager ?raw glob 种子，行为同旧（仅浏览器，Electron 零消费）。
  const discovered = await discoverInstalled();

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
      await loadPlugin(pluginId, "startup");
      if (defer) _deferredPlugins.set(pluginId, manifest);
    } catch (e) {
      errors.push(`${pluginId}: ${errMsg(e)}`);
    }
  }

  // E6#12（1.2-4）+ #18d：账本 reconcile——发现条目（含 origin）→ 账本与实际文件系统对齐。
  //   差集双向墓碑、永不整条删（目录缺+活性 → 置 removed 章；目录重现+章 → 清章），逻辑全在
  //   PluginInstallService.reconcileDiff（纯函数可测）。只收 origin.home="userData" 的插件；
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

  // 3. 错误汇总
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

  // 7. E6#30d 退役——「待安装」站从 `.disabled/` 文件扫描改为市场目录（探索插件视图）。
  //    `.disabled/` 仍是 app 树卸载的可撤销坟场（reinstallPlugin / 卸载 toast「撤销」读它），
  //    但 loader 启动不再为其预种 uninstalled 元数据缓存、不再做幽灵差集清理（原 E5.8#156
  //    pruneUninstalledCache 随本步退役）——marketplace 探索插件视图改 fetch marketplace.json
  //    驱动（缓存语义归 marketSources.ts 5min）。卸载恢复入口 = toast「撤销」（lifecycle.ts），
  //    遗留 `.disabled/` 目录引导 = #11e 342（从市场重新安装或彻底删除，另行收编）。
  })());
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
  updatePlugin, // E6#11c（段 B）：安全更新——桥 'update' case 路由到这里
  checkPluginUpdates, // E6#13b（段 B）：只读查更新——桥 'checkUpdates' case 路由到这里
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
 * E6#62b：源码 glob 轨退役——无 glob 成员二分。磁盘新出现的目录 = 新安装（install 语义，含 toast/
 * iconOrder/plugin:installed——外部拷入插件的旧非 glob 行为），一律 loadPlugin(dir, "install")。
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

        // E6#62b：单轨——磁盘新目录 = install 语义（含 toast/iconOrder/plugin:installed 广播）
        await loadPlugin(dir, "install");
        log.appendLine(`文件监听发现新插件 "${dir}"——已即时加载`);
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
