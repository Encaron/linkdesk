/**
 * 插件加载运行时层——加载管线 + 依赖编排 + 延迟激活。
 * E5.8#0d.10-1d：自 loader.ts 拆出——loadPlugin 中枢（E6#62b 起单 IPC 运行时路——源码 glob 轨退役）。
 * 依赖方向：runtime → contributions/dependencies（纯函数，反向不成立）——防环。
 * E5.8#14：依赖编排——dep-check（环 fail / 缺 park）+ 挂起注册表 + sweep 补载（拓扑序激活）；
 *   纯逻辑在 dependencies.ts，本模块持可变编排（_pendingPlugins 由 state.ts 共享真源）。
 * 生命周期操作（disable/enable/uninstall/install）不在此——见 lifecycle-ops.ts。
 */

import type { PluginManifest } from "../../core/api/types";
import { registerViewPlugin } from "../contributions/viewRegistry";
import { registerTheme, findTheme } from "../../core/services/ui/ThemeEngine";
import type { ThemeContribution } from "../../core/api/types";
import { pushToast, TOAST_TTL_ERROR } from "../../core/services/ui/NotificationService";
import { reportError } from "../../core/services/bootstrap/ErrorService";
// Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）集中到 lifecycle.ts 消费端
import { PluginLifecycle, onPluginLifecycleChange, type PluginInstallEvent } from "../lifecycle/lifecycle";
// E5.8#11：状态机——loading/failed/active 迁移 + 失败原因记录（诊断面）
// E5.8#14：parkPending——缺依赖挂起（loading→pending + pendingReason）
// E5.8#15：orphanPlugin——依赖消失连带卸载（加载完成复核用）
import { markLoadStarted, markLoadSuccess, markLoadFailed, parkPending, orphanPlugin } from "./loadState";
// E5.8#14：#14 依赖编排纯函数（requires 解析 / 缺失判定 / 图级环检测）
// E5.8#15：formatPendingReason——挂起原因文案单源（park + orphan 共用）
import { findMissingDeps, detectDependencyCycle, formatPendingReason } from "./dependencies";
import { versionGte } from "../../core/utils/plugin/semverUtils";
import {
  pluginsApi,
  log,
  errMsg,
  loadedPluginIds,
  _loadingPromises,
  _deferredPlugins,
  _pendingPlugins,
  cachePluginMetadata,
  getDisabledList,
  getLoadedManifest,
  getManifestById,
  isBundlePlugin, // E6#7（1.2-4）：目录含 index.bundle.js → runtimeEntryPath 传 bundle 分支
} from "./state";
import { normalizeManifest, hasSidebarContainers, type OldFormatManifest } from "../discovery/manifest";
import { effectiveActivationEvents } from "./activation"; // #9g：延迟匹配按「显式 ?? 推断」生效事件
import { parseManifestJson } from "../jsonc"; // E6#55：作者 plugin.json JSONC——唯一解析入口
import {
  parseContributions,
  resolveRuntimePluginRoot,
  runtimeEntryPath,
  resolveViewModule,
  fetchPluginDataFile,
  loadThemeContributionData,
  loadIconThemeContributionData,
  loadLanguageContributionData,
  loadPluginI18nData,
  extractThemeColors,
  syncAppThemeEnum,
  syncAppLanguageEnum,
  syncIconThemeEnum,
} from "../contributions/contributions";

/* ── 当前应用版本（从 package.json 读取） ── */

/** TODO Phase 6：从 package.json 动态读取（需要 Vite define 或 import.meta.env）。
 *  当前硬编码——发版前手动更新此行。B10 fix：注释说明实际情况。 */
function getAppVersion(): string {
  return "3.0.0";
}

/* ── E5#12：加载管线唯一入口——所有插件（view/data/theme/language）走这里 ── */

/**
 * 插件加载管线——loadPlugin 唯一入口（manifest 已由 loadPlugin Step1 IPC 读盘）。
 *
 * 流程：normalizeManifest → parseContributions → 分发各 Registry。视图组件加载归一在 loadPlugin()
 * Step4（一律 stub）——本函数只负责 manifest 解析 + contributes 分发。
 * 不 import IconBar/SidePanel/TabBar——加载管线不知道 UI 的存在。
 */
async function loadPluginLifecycle(
  pluginId: string,
  manifest: PluginManifest,
  opts?: { pluginRoot?: string },
): Promise<void> {
  // Step 1: 旧格式归一化（纯函数，不 mutate）
  const contributes = normalizeManifest(manifest);

  // Step 2: 解析 contributes → 分发到各 Registry（出错不阻塞其他插件）
  if (contributes) {
    try { await parseContributions(pluginId, contributes, opts?.pluginRoot); }
    catch (e) { console.error(`[loader] parseContributions 失败: ${pluginId}`, e); }
  }

  // Step 3: 旧格式 file 字段——异步 fetch JSON，按 type 分配到 themes/languages
  if (!manifest.contributes?.themes && !manifest.contributes?.languages) {
    const old = manifest as Partial<OldFormatManifest>;
    if (typeof old.file === "string") {
      try {
        const data = await fetchPluginDataFile(pluginId, old.file);
        if (data) {
          const fileCtrb: Record<string, unknown> = {};
          if (data.type === "dark" || data.type === "light") {
            fileCtrb.themes = [{ label: manifest.name, path: old.file, uiTheme: data.type }];
          } else {
            fileCtrb.languages = [{ label: manifest.name, code: old.file.replace(/\.json$/, ""), path: old.file }];
          }
          await parseContributions(pluginId, fileCtrb);
        }
      } catch { /* file 加载失败不阻塞 */ }
    }
  }

  // 视图组件加载已归一化到 loadPlugin() Step4（一律 stub）——本函数只负责 manifest 解析 + contributes 分发。
}

/* ── E5.8#14：依赖编排——环 fail / 缺 park / 就绪 sweep（拓扑序激活） ── */

/** 已知 manifest 面——环检测走闭包的数据源（发现索引 + 延迟 + 挂起）。
 *  E6#9c：manifestIndex（readAllManifests 水合，glob + 运行时全覆盖）单一真源；
 *  延迟/挂起留兜底（环 = 相互依赖未就绪，必有挂起方，#14 分析成文）。 */
function getKnownManifest(pluginId: string): PluginManifest | undefined {
  return getManifestById(pluginId) ?? _deferredPlugins.get(pluginId) ?? _pendingPlugins.get(pluginId);
}

/** 缺依赖挂起——PENDING + pendingReason + 挂起注册表（manifest 留存供 sweep 重查）。
 *  不弹 toast——瞬态等待（#15.5 marketplace PENDING 面 + 启动挂起诊断日志负责用户可见）。 */
function parkForDependencies(pluginId: string, manifest: PluginManifest, missing: string[]): void {
  const reason = formatPendingReason(missing);
  _pendingPlugins.set(pluginId, manifest);
  parkPending(pluginId, reason);
  log.appendLine(`⏸ 插件 "${manifest.name ?? pluginId}" 缺依赖挂起——${reason}`);
}

/**
 * 扫描挂起队列——依赖就绪的插件补载（拓扑序激活的引擎：扫描序不再影响激活顺序）。
 * 触发点 = 每次 loadPlugin 完成（install/enable/reinstall 都走 loadPlugin → 自动覆盖）。
 * 不 export——零外部消费方（knip 实锤）；内部 loadPlugin 完成点自动触发。
 * 收敛：每轮 while 至少激活一个挂起插件才继续；环已在 dep-check fail-loud → 挂起互锁不会发生。
 * guard 兜底（1000）防极端竞态（sweep await 期间依赖被卸载）死循环。
 * E5.8#15：用户显式禁用优先——被禁用的消费插件不被依赖出现事件自动激活（禁用意图优先于依赖编排，
 * 否则被禁用插件"复活" = 体感无差破坏）。删除其挂起登记——重新启用时 enablePlugin 走 loadPlugin 重查。
 */
async function sweepPendingDependencies(): Promise<void> {
  let progressed = true;
  let guard = 0;
  while (progressed && guard++ < 1000) {
    progressed = false;
    for (const [id, manifest] of [..._pendingPlugins]) {
      if (loadedPluginIds.has(id)) { _pendingPlugins.delete(id); continue; } // 已激活——清理僵尸登记
      if (getDisabledList().includes(id)) { _pendingPlugins.delete(id); continue; } // 禁用优先——不自动激活
      if (findMissingDeps(id, manifest).length > 0) continue; // 依赖仍未就绪
      _pendingPlugins.delete(id);
      await loadPlugin(id, "startup");
      progressed = true;
    }
  }
}

/**
 * 插件加载唯一入口。
 * E6#62a/b：源码 glob 轨退役——全插件一条 IPC 运行时路径（manifest = readManifest 读盘 IPC，
 * root = resolveRuntimePluginRoot）。调用方不再自己判断"该走哪条路"——一条 loadPlugin 全覆盖。
 */
async function loadPlugin(
  pluginId: string,
  reason: PluginInstallEvent["reason"] = "startup",
): Promise<void> {
  if (loadedPluginIds.has(pluginId)) return;
  // 🔥 硬约束 13：竞态守卫——两次 concurrent 调用 → 第二次等第一次的 Promise
  if (_loadingPromises.has(pluginId)) { await _loadingPromises.get(pluginId)!; return; }

  const promise = (async () => {
  // E5.8#11：状态机——loading（加载开始）
  markLoadStarted(pluginId);
  // ═══ Step 1: 加载 manifest（E6#62b 收单 IPC 源——源码 glob 轨退役，无 glob 兜底） ═══
  // manifest 单一真源 = 主进程读盘（readManifest IPC 返原文 raw，jsonc 单入口 parse）——dev 内置（repo
  // 源码目录）与 prod/userData 全同一条 readManifest 路；装/卸/更新后即读即新，零陈旧 glob 索引风险。
  // manifestIndex（discoverInstalled 水合）仍供元数据/registry/环检测直查（getManifestById），loadPlugin 不依赖它。
  let manifest: PluginManifest;
  try {
    const raw = await pluginsApi().readManifest(pluginId);
    manifest = parseManifestJson(raw);
  } catch (e) {
    console.warn(`[pluginLoader] 插件 "${pluginId}" 读取 plugin.json 失败: ${errMsg(e)}`);
    markLoadFailed(pluginId, `plugin.json 读取失败: ${errMsg(e)}`);
    return;
  }

  // ═══ Step 2: 版本 + 依赖检查（共享） ═══
  if (manifest.minAppVersion) {
    const appVer = getAppVersion();
    if (!versionGte(appVer, manifest.minAppVersion)) {
      pushToast({
        message: `插件 "${manifest.name}" 需要应用版本 ≥${manifest.minAppVersion}（当前 ${appVer}），已跳过`,
        ttl: TOAST_TTL_ERROR,
      });
      markLoadFailed(pluginId, `需要应用版本 ≥${manifest.minAppVersion}（当前 ${appVer}）`);
      return;
    }
  }
  // E5.8#14：依赖编排——环检测 fail-loud（自环 + 传递环）；缺依赖挂起 PENDING（等待，非失败）
  const cycle = detectDependencyCycle(pluginId, manifest, getKnownManifest);
  if (cycle !== null) {
    pushToast({
      message: `插件 "${manifest.name}" 依赖环: ${cycle}——已跳过`,
      ttl: TOAST_TTL_ERROR,
    });
    console.warn(`[pluginLoader] 依赖环 — "${pluginId}" ${cycle}`);
    markLoadFailed(pluginId, `依赖环: ${cycle}`);
    return;
  }
  const missing = findMissingDeps(pluginId, manifest);
  if (missing.length > 0) {
    parkForDependencies(pluginId, manifest, missing);
    return;
  }

  // B2 fix: 缓存元数据——glob 外的插件也入缓存，卸载后仍可浏览详情
  cachePluginMetadata(pluginId, manifest, "installed");

  // ═══ Step 3: 解析根目录（不 import entry JS——E6#17d/#62b 注册纯声明化常轨） ═══
  // #17d 铁律（旧 glob 外专属，随 #62b 推广到全插件）：壳侧 entry import 是确定性死执行——插件代码唯一
  // 执行者 = 池，壳窗按设计不配 react import-map。一律不 import → Step4 注册 stub → 插件照常进 [+] /
  // 欢迎页，打开交池 PluginComponent 执行。真坏 bundle 报错保留在真实执行位（打开时池 import 失败 → 池
  // 错误边界/console 浮现）。存在性一律声明式（appearsIn.statusBar 等），不靠壳 import 探测（硬约束 11）。
  // runtimePluginRoot 供 Step5/6 的 contributes views / theme 数据 fetch 用——dev = /@fs/{abs} 源码，
  // prod = linkdesk://{id}（resolveRuntimePluginRoot IPC 解析）。
  let runtimePluginRoot: string | undefined;
  try {
    runtimePluginRoot = await resolveRuntimePluginRoot(pluginId);
  } catch (e) {
    console.warn(`[pluginLoader] 插件 "${pluginId}" 根目录解析失败:`, e);
    // pluginRoot 保持 undefined——views 注册走 parseContributions 兜底 resolveRuntimePluginRoot，失败则诚实跳过
  }

  // ═══ Step 4: 注册视图——一律 component-less stub（组件可选项，渲染唯一执行者 = 池 PluginComponent） ═══
  // entry 插件 = 视图 stub；entryless + 有侧栏容器 = 图标栏元数据入口（E5.8#37.9.2.3——此前
  // getViewPlugins() 只含 entry 插件 → entryless 声明 appearsIn.iconBar 被静默丢弃）。deferred（#9g）
  // 首用激活（activatePlugin）时 registerViewPlugin stub→实升级。对标 VS Code：manifest 贡献启动可见、组件懒载。
  if (manifest.entry) {
    registerViewPlugin({ pluginId, manifest });
    log.appendLine(`[OK] 元数据注册 "${manifest.name}" (${pluginId})`);
  } else if (hasSidebarContainers(manifest)) {
    registerViewPlugin({ pluginId, manifest });
    log.appendLine(`[OK] entryless 视图插件 "${manifest.name}" (${pluginId}) 已注册（图标栏入口）`);
  }

  // ═══ Step 5: 解析 contributes → 分发各 Registry ═══
  await loadPluginLifecycle(pluginId, manifest, { pluginRoot: runtimePluginRoot });

  // ═══ Step 6: 主题/语言数据异步加载 ═══
  if (manifest.contributes?.themes) {
    await loadThemeContributionData(pluginId, manifest);
    // E6#62b 去 isRuntime 门（全插件单路径）：recipe 桥已 cover 新格式——此块只兜未被 recipe 桥登记的
    // flat 旧格式主题（recipe 拒绝但 JSON 含平铺 colors 的，仍 fetch 解析补登记；dev/prod 同一条路）。
    const themeList = manifest.contributes.themes as ThemeContribution[];
    for (const tc of themeList) {
      if (findTheme(tc.label)) continue;
      try {
        const url = `${await resolveRuntimePluginRoot(pluginId)}/${tc.path}`;
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        const themeType = (data.type as "dark" | "light") ?? tc.uiTheme;
        const colors = extractThemeColors(data);
        registerTheme({ name: tc.label, type: themeType as "dark" | "light", colors }, pluginId);
      } catch { /* 静默 */ }
    }
  }
  if (manifest.contributes?.iconThemes) {
    await loadIconThemeContributionData(pluginId, manifest);
  }
  if (manifest.contributes?.languages) {
    await loadLanguageContributionData(pluginId, manifest);
  }
  if (manifest.contributes?.i18n) {
    await loadPluginI18nData(pluginId, manifest);
  }

  // ═══ Step 7: 收尾 ═══
  applyPostLoadSteps(pluginId, manifest, reason);
  })();
  _loadingPromises.set(pluginId, promise);
  try { await promise; }
  finally { _loadingPromises.delete(pluginId); }
  // E5.8#15：加载完成复核——依赖在加载期间被卸载的竞态收敛（unloadPlugin 连带只查 loadedPluginIds，
  // 加载中插件不在其内 → 错过）。插件已激活但依赖已消失 → 连带降级挂起（等依赖回归自动补载），
  // 维持"ACTIVE 插件依赖必全"不变式——对齐状态机"卸载必须总能完成"的收敛精神。
  const loadedManifest = getLoadedManifest(pluginId);
  const raceMissing = loadedManifest && loadedPluginIds.has(pluginId)
    ? findMissingDeps(pluginId, loadedManifest)
    : [];
  if (raceMissing.length > 0) {
    orphanPlugin(pluginId, raceMissing);
  }
  // E5.8#14：依赖编排——每加载完成一个插件，扫描挂起队列，依赖就绪者补载（拓扑序激活，扫描序不再影响激活）
  await sweepPendingDependencies();
}

/**
 * 加载后收敛步骤——loadPlugin 和 loadPlugin 内部统一处理。
 * 🔥 这不是消重复——是堵缝。已归一化——loadPlugin 同时覆盖 glob 和运行时。
 * 🔥 E5 归一化：loadPlugin 单一路径，不再有遗漏。
 * 新增能力只需改 loadPlugin 一处。
 * 同类 bug：Bug 3（runtime 无侧栏）、L6（runtime 无主题颜色）、#34 bug 6（重装不显示）。
 */
function applyPostLoadSteps(pluginId: string, manifest: PluginManifest, reason: PluginInstallEvent["reason"]): void {
  loadedPluginIds.add(pluginId);
  // E5.8#11：状态机——active（注册全量生效）在 onDidInstall 之前迁移（L6b：事件只在合法迁移后发）
  markLoadSuccess(pluginId);
  syncAppThemeEnum();
  syncAppLanguageEnum();
  syncIconThemeEnum();
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, reason });
}

/* ── #44 + #9g：延迟激活——activationEvents 插件按需 import ── */

/**
 * 激活之前延迟加载的插件——import JS → 注册表占位升级 componentful。
 * E6#62b 起单条路 = 根解析 + entry import（镜像 loadPlugin Step3 语义；statusBar 存在性已声明式——E6#17d）。
 * 激活即注册表升级（同版本 component-less 占位 → 实组件——registerViewPlugin 允许 stub 升级）。
 * 不调 applyPostLoadSteps——loadedPluginIds 已有、onDidInstall 已发过（startup 静默），只通知 UI 刷新。
 */
/** 激活中插件集——并发事件防双跑（await import 完成前 delete 未发生，两次背靠背命中会双 import）。
 *  #9g 验证「激活过不重载」：首跑成功出 _deferredPlugins + 出 _activating；次跑见 manifest 空即 no-op。 */
const _activating = new Set<string>();

async function activatePlugin(pluginId: string): Promise<boolean> {
  const manifest = _deferredPlugins.get(pluginId);
  if (!manifest) return false; // 不是延迟插件——可能已激活或不存在
  if (_activating.has(pluginId)) return false; // 已在激活中——并发事件让首跑完成，语义一致

  _activating.add(pluginId);
  try {
    // E6#62b：源码 glob 轨退役——全插件一条运行时激活轨（根解析 + entry import 升级占位）。
    // 激活失败即抛上报（用户触发的激活不应静默降级）。E6#17d：statusBar 存在性已声明式（manifest
    // appearsIn.statusBar）——壳不再 import statusBar JS。② 并 #9g 轮：本段（壳侧 entry import）折叠为
    // 池侧激活——此处保留 entry import 是过渡态（随 #62e 收）。
    const runtimePluginRoot = await resolveRuntimePluginRoot(pluginId);
    // E6#7：bundle 插件入口恒 index.bundle.js（同 Step3 分支）
    const entryPath = runtimeEntryPath(manifest, pluginId, import.meta.env.DEV, { bundle: isBundlePlugin(pluginId) });
    let viewComponent: React.ComponentType<{ isActive: boolean }> | undefined;
    if (entryPath) {
      const module = await resolveViewModule(entryPath, runtimePluginRoot);
      viewComponent = module?.default;
      if (module && !viewComponent) {
        console.warn(`[pluginLoader] 插件 "${pluginId}" 未导出 default 组件`);
      }
    }
    registerViewPlugin({ pluginId, manifest, component: viewComponent });
    _deferredPlugins.delete(pluginId);
    // 图标/枚举刷新（startup 已静默，此刻才需通知 UI 拾起激活态）
    syncAppThemeEnum();
    syncAppLanguageEnum();
    syncIconThemeEnum();
    onPluginLifecycleChange.fire();
    console.log(`[pluginLoader] ⚡ 延迟激活 "${pluginId}"`);
    log.appendLine(`⚡ 延迟激活 "${pluginId}"`);
    return true;
  } catch (e) {
    reportError({ message: `插件 "${manifest.name ?? pluginId}" 激活失败: ${errMsg(e)}`, source: pluginId, error: e });
    return false;
  } finally {
    _activating.delete(pluginId);
  }
}

/**
 * #9g ② 事件路由器——发火事件命中任一延迟插件的生效事件（显式 ?? 推断）即激活。
 * 触发源统一经 activation.fireActivationEvent 发火；loader 初始化把本函数挂成总线常驻处理器。
 * 幂等：#44 语义——激活成功即出 _deferredPlugins，二次命中为 no-op（激活过不重载）。
 * 遍历用快照——activatePlugin 会 delete 当前键（边遍历边删安全）。
 */
async function activateDeferredByEvent(event: string): Promise<void> {
  for (const [pluginId, manifest] of [..._deferredPlugins]) {
    const events = effectiveActivationEvents(manifest);
    if (events.some((ev) => ev === event || ev === "*")) {
      await activatePlugin(pluginId);
    }
  }
}

export { loadPlugin, activateDeferredByEvent };
