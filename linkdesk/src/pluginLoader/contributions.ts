/**
 * 插件加载器——contributes 解析 + 模块解析 + 数据加载 + 枚举同步。
 * E5.8#0d.10-1c：自 loader.ts 拆出——parseContributions（contributes → 各 Registry）
 * + 模块解析三件套（resolveRuntimePluginRoot/runtimeEntryPath/resolveViewModule）
 * + loadPluginComponent + fetchPluginDataFile + 主题/语言/i18n 数据加载 + 枚举同步。
 *
 * 🔒 环依赖守卫：本文件只依赖 state/manifest/viewRegistry/各 Registry/i18nResources——
 * 不依赖 runtime/lifecycle-ops（parseContributions 的 views 兜底链调 resolveRuntimePluginRoot
 * 本文件内消化；syncAppThemeEnum/syncAppLanguageEnum 被 runtime.applyPostLoadSteps 与
 * lifecycle-ops 双端消费，放此处防 runtime↔lifecycle-ops 成环）。
 */

import type { PluginManifest, ViewPluginEntry, ThemeContribution, IconThemeContribution, IconContribution, LanguageContribution } from "../core/api/types";
import { registerViewPlugin } from "./viewRegistry";
import { registerTheme, getAvailableThemes } from "../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import { IconRegistry } from "../core/registry/appearance/IconRegistry";
import { LanguageRegistry } from "../core/registry/languages/LanguageRegistry";
import { pushToast } from "../core/services/ui/NotificationService";
import { registerConfiguration, registerConfigurationDefaults, updateConfigurationEnum } from "../core/registry/ConfigurationRegistry";
import type { ManifestMenuItem, TitleBarContribution } from "../core/registry/commands/MenuRegistry";
import { registerMenuItems, registerTitleBarContribution } from "../core/registry/commands/MenuRegistry";
import { registerCommand } from "../core/registry/commands/CommandRegistry";
import { registerKeybinding } from "../core/registry/commands/KeybindingRegistry";
import { registerPluginLanguageBundle } from "./i18nResources";
import i18n from "../i18n";
import { pluginModules, pluginStatusBarModules, viewRenderModules, pluginManifests, extractPluginId, errMsg, log } from "./state";

/** 从主题 JSON 数据中提取扁平化 colors——归一化 #36j2。消两处重复。 */
function extractThemeColors(data: Record<string, unknown>): Record<string, string> {
  const raw = data.colors;
  if (!raw || typeof raw !== "object") return {};
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") colors[k] = v;
  }
  return colors;
}

/* ── Phase 5：parseContributions——对标 VS Code package.json contributes ── */

/**
 * 解析插件的 contributes 声明，分发到各 Registry。
 * 按 key 逐项检测，不认识的 key 静默跳过。
 * Phase 6 加 contributes.themes / contributes.languages 时此处只需加一个 if——不崩。
 */
export async function parseContributions(pluginId: string, c: Record<string, unknown>, pluginRoot?: string): Promise<void> {
  // contributes.configuration → ConfigurationRegistry
  if (c.configuration) {
    const config = c.configuration as { title: string; properties: Record<string, unknown> };
    registerConfiguration(pluginId, {
      title: config.title,
      properties: config.properties as Record<string, import("../core/registry/ConfigurationRegistry").ConfigurationProperty>,
    });
  }

  // contributes.commands → CommandRegistry
  // Phase 5c fix：静态导入替代动态 import()——动态 import 的 .then() 晚于组件 mount，
  // 导致 terminal 组件注册的真实 handler 被 placeholder 覆盖。
  if (c.commands) {
    const cmds = c.commands as Array<{ id: string; title: string; category?: string; when?: string }>;
    for (const cmd of cmds) {
      registerCommand(pluginId, {
        id: cmd.id,
        title: cmd.title,
        category: cmd.category,
        when: cmd.when,
        // E5.7 Bug C：元数据注册标 placeholder——真实 handler 注册在池侧（preload-pool _poolCommands）。
        // 壳执行时走 CommandRegistry.executeInPool 转发到池，不再调下面的诊断 warn。
        placeholder: true,
        handler: async () => {
          console.warn(`[pluginLoader] 命令 "${cmd.id}" 尚未绑定 handler——请在组件 mount 时注册`);
        },
      });
    }
  }

  // contributes.menus → MenuRegistry
  if (c.menus) {
    const menus = c.menus as Record<string, ManifestMenuItem[]>;
    for (const [menuId, items] of Object.entries(menus)) {
      registerMenuItems(menuId, pluginId, items);
    }
  }

  // contributes.keybindings → KeybindingRegistry
  if (c.keybindings) {
    const kbs = c.keybindings as Array<{ command: string; key: string; when?: string }>;
    for (const kb of kbs) {
      registerKeybinding({ command: kb.command, key: kb.key, when: kb.when, source: "plugin", pluginId });
    }
  }

  // contributes.configurationDefaults → ConfigurationRegistry（盲区 2：弱默认值）
  if (c.configurationDefaults) {
    registerConfigurationDefaults(pluginId, c.configurationDefaults as Record<string, unknown>);
  }

  // contributes.themes → ThemeRegistry（metadata only——数据在 loadPlugin 中异步加载）
  if (c.themes) {
    const themeList = c.themes as ThemeContribution[];
    for (const tc of themeList) {
      ThemeRegistry.register(tc, pluginId);
    }
  }

  // contributes.iconThemes → IconRegistry
  if (c.iconThemes) {
    const list = c.iconThemes as IconThemeContribution[];
    for (const it of list) {
      IconRegistry.register(it, pluginId);
    }
  }

  // contributes.icons → IconRegistry（共享图标）
  if (c.icons) {
    const map = c.icons as Record<string, IconContribution>;
    for (const [iconId, contribution] of Object.entries(map)) {
      IconRegistry.registerIcon(iconId, contribution, pluginId);
    }
  }

  // contributes.languages → LanguageRegistry（metadata only——数据在 loadPlugin 中异步加载）
  if (c.languages) {
    const langList = c.languages as LanguageContribution[];
    for (const lc of langList) {
      LanguageRegistry.register(lc, pluginId);
    }
  }

  // E3h #66：contributes.titleBar → MenuRegistry（TitleBar 左右槽位按钮）
  if (c.titleBar) {
    const tb = c.titleBar as { left?: TitleBarContribution[]; right?: TitleBarContribution[] };
    if (tb.left) {
      for (const item of tb.left) {
        registerTitleBarContribution(pluginId, "left", item);
      }
    }
    if (tb.right) {
      for (const item of tb.right) {
        registerTitleBarContribution(pluginId, "right", item);
      }
    }
  }

  // E3.6：contributes.viewsContainers → ViewContainerService（同步）
  if (c.viewsContainers) {
    const containers = c.viewsContainers as Record<string, { title: string; icon?: string; location?: string; hideIfEmpty?: boolean; order?: number; mergeHeaderWhenSingle?: boolean }>;
    try {
      const { ViewContainerService } = await import("../core/services/layout/ViewContainerService");
      for (const [containerId, desc] of Object.entries(containers)) {
        ViewContainerService.registerViewContainer(pluginId, {
          id: containerId,
          title: desc.title,
          icon: desc.icon,
          location: (desc.location as "sidebar" | "panel" | "auxiliarybar") ?? "sidebar",
          hideIfEmpty: desc.hideIfEmpty,
          order: desc.order,
          mergeHeaderWhenSingle: desc.mergeHeaderWhenSingle,
        });
      }
    } catch (e) { console.error("[loader] viewsContainers 注册失败:", e); }
  }

  // E3.6：contributes.views → ViewContainerService（异步——动态 import view 组件）
  if (c.views) {
    const views = c.views as Record<string, Array<{ id: string; title?: string; render: string; role?: "toolbar" | "section"; when?: string; order?: number; collapsed?: boolean; canToggleVisibility?: boolean; canMoveView?: boolean; hideByDefault?: boolean; singleViewPaneContainerTitle?: string; titleDescription?: string; showActions?: string; titleTooltip?: string; minHeight?: number }>>;
    try {
      const { ViewContainerService } = await import("../core/services/layout/ViewContainerService");
      for (const [containerId, viewDefs] of Object.entries(views)) {
        for (const viewDef of viewDefs) {
          // E5#34b: render 路径相对于插件根目录。
          // 优先级：1) 调用方传入 pluginRoot  2) import.meta.glob 推导  3) IPC resolvePath（glob 外插件兜底）
          const resolvedRoot = pluginRoot ?? (() => {
            const mk = Object.keys(pluginManifests).find(k => extractPluginId(k) === pluginId);
            return mk ? mk.replace(/\/plugin\.json$/, "") : "";
          })();
          let renderPath: string;
          if (resolvedRoot) {
            renderPath = `${resolvedRoot}/${viewDef.render}`;
          } else {
            // glob 外插件（热安装/重装）——根 URL 归一化兜底（resolveRuntimePluginRoot），不依赖调用方传参
            try {
              renderPath = `${await resolveRuntimePluginRoot(pluginId)}/${viewDef.render}`;
            } catch {
              console.warn(`[loader] ⚠️ 无法解析插件 "${pluginId}" 的根目录——view "${viewDef.id}" 加载失败`);
              continue;
            }
          }
          try {
            // E5#114d: 用 viewRenderModules glob 替代 /* @vite-ignore */——
            // 打包后 Vite 已将 glob key→构建 chunk 映射，不用源码路径。
            // E5.6#2-fix: glob 外插件（runtime/reinstall）renderPath 是 /@fs/ 绝对路径，
            // viewRenderModules key 是相对 glob 路径 → 不匹配 → 回退到 /* @vite-ignore */。
            // E5.7#98：glob loader 已带类型（{ default: ComponentType }）；动态 import 回退按 TS 内建 any（非源码）——声明收窄
            let renderModule: { default?: React.ComponentType } | undefined;
            const viewLoader = viewRenderModules[renderPath];
            if (viewLoader) {
              renderModule = await viewLoader();
            } else if (pluginRoot) {
              // 运行时插件：view 文件不在构建时 glob 中，走动态 import 直读文件
              renderModule = await import(/* @vite-ignore */ renderPath);
            } else {
              console.error(
                `[loader] ❌ view 未找到匹配模块: plugin="${pluginId}" container="${containerId}" render="${renderPath}"`
              );
              continue;
            }
            const RenderComponent = renderModule?.default ?? renderModule;
            // E5.6#11b：_renderPath 存 glob key——池 PluginComponent 按此 key O(1) 查找组件。
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const desc: any = {
              id: viewDef.id,
              title: viewDef.title ?? "",
              render: RenderComponent,
              role: viewDef.role,
              order: viewDef.order,
              collapsed: viewDef.collapsed,
              when: viewDef.when,
              canToggleVisibility: viewDef.canToggleVisibility,
              canMoveView: viewDef.canMoveView,
              hideByDefault: viewDef.hideByDefault,
              singleViewPaneContainerTitle: viewDef.singleViewPaneContainerTitle,
              titleDescription: viewDef.titleDescription,
              showActions: viewDef.showActions as "always" | "whenExpanded" | "default" | undefined,
              titleTooltip: viewDef.titleTooltip,
              minHeight: viewDef.minHeight,
            };
            desc._renderPath = renderPath;
            ViewContainerService.registerView(pluginId, containerId, desc);
          } catch (e) {
            console.error(
              `[loader] ❌ 加载 view 失败: plugin="${pluginId}" container="${containerId}" render="${renderPath}"`,
              e
            );
          }
        }
      }
    } catch (e) { console.error("[loader] views 注册失败:", e); }
  }

  // E5.7#50：contributes.fileAssociations 壳侧注册已删——唯一写入方是主进程
  // plugin-manifest-loader（启动扫盘 + 装/卸重扫）

  // E5.7#49：contributes.langDefs 壳侧注册已删——Registry 主进程化后唯一写入方是
  // 主进程 plugin-manifest-loader（启动扫盘 + 装/卸重扫）
}

/* ── 运行时插件路径/入口解析（E5.7#82 打包格式分支点） ── */

/**
 * 运行时插件根 URL 归一化入口。
 *
 * E5.7 生命周期契约「可卸载 ⇒ 可重装」修复：同一句 `isDev ? /@fs/{abs} : linkdesk://{id}`
 * 曾写了 5 处（entry 根/entryUrl/statusBar 根/views 兜底/themes fetch），且 pluginRoot
 * 赋值绑死在 `manifest.entry` 上——entryless 插件
 * （纯 views/commands 贡献）重装后 views 注册兜底链断裂（❌ view 未找到匹配模块）。
 * 契约：任何插件，只要能被卸载，重装就必须同 session 立即恢复全部贡献——
 * 与插件形状无关（glob 内/外、entry 有无、core 标志全不豁免，core:true 只是默认值）。
 * dev: resolvePath IPC 拼 /@fs/{abs}；prod: linkdesk://{pluginId} 协议（无需查盘）。
 * 失败 reject——各调用点保留自己的错误语义（toast / warn+continue / 静默跳过）。
 */
async function resolveRuntimePluginRoot(pluginId: string): Promise<string> {
  if (!import.meta.env.DEV) return `linkdesk://${pluginId}`;
  const abs = await window.linkdesk?.plugins?.resolvePath?.(pluginId);
  if (!abs) throw new Error(`无法解析插件 "${pluginId}" 的根目录`);
  return `/@fs/${abs}`;
}

/**
 * 运行时插件入口文件路径——E5.7#82：E6 打包格式分支点（纯函数，单测覆盖）。
 *
 * dev：manifest.entry 源码路径（/@fs 下由 Vite 即时编译）；entryless 插件返回 null
 *   （纯 views/commands 贡献——生命周期契约不绑 entry）。
 * prod（E6 打包格式）：一律返回预构建 chunk 名 `<pluginId>.js`——
 *   vite.config 多入口产物名 = 插件目录名（dist/plugins/<sub>/<id>.js），
 *   entry 字段是源码路径，在打包格式中不参与入口解析。
 */
export function runtimeEntryPath(
  manifest: PluginManifest,
  pluginId: string,
  isDev: boolean,
): string | null {
  if (isDev) return manifest.entry || null;
  return `${pluginId}.js`;
}

/**
 * 插件视图入口模块解析——E5.7#82：两套入口映射合一。
 *
 * dev：构建时 glob（pluginModules，Vite 展开）∪ 运行时 /@fs 源码（Vite 即时编译）
 * E6 打包（prod）：构建时插件仍走同一张 glob 表（chunk 随池 bundle 分发）；
 *   运行时安装的插件 = 预构建 chunk `<pluginId>.js`，经 linkdesk:// 动态 import——
 *   协议对子目录透明扫描（electron/protocol.ts scanPluginSubdirs），
 *   解析方无需知道 builtin/user。pluginId → 模块的语义全局唯一，只有 URL 形状随环境变。
 */
async function resolveViewModule(
  pluginId: string,
  entryPath: string,
  runtimePluginRoot?: string,
): Promise<{ default: React.ComponentType<{ isActive: boolean }> } | null> {
  // 1) 构建时映射（dev 与打包产物同一张表）
  const entryKey = Object.keys(pluginModules).find((k) => extractPluginId(k) === pluginId);
  if (entryKey) return pluginModules[entryKey]();
  // 2) 运行时映射——dev /@fs 源码，prod linkdesk:// 预构建 chunk
  if (!runtimePluginRoot) return null;
  return import(/* @vite-ignore */ `${runtimePluginRoot}/${entryPath}`);
}

async function loadPluginComponent(pluginId: string, manifest: PluginManifest): Promise<void> {
  // E5.7#82：入口解析归一到 resolveViewModule——glob 命中 → chunk，否则诚实报缺。
  const module = await resolveViewModule(pluginId, manifest.entry ?? "index.tsx");
  if (!module) {
    pushToast({ message: `插件 "${manifest.name}" 缺少入口文件（${manifest.entry ?? "index.tsx"}）` });
    throw new Error(`找不到入口文件（${manifest.entry ?? "index.tsx"}）`);
  }
  const Component = module.default;

  if (!Component) {
    throw new Error("入口文件未导出 default 组件");
  }

  let statusBarComponent: React.ComponentType | undefined;
  const statusBarKey = Object.keys(pluginStatusBarModules).find(
    (k) => extractPluginId(k) === pluginId
  );
  if (statusBarKey) {
    const statusBarModule = await pluginStatusBarModules[statusBarKey]();
    statusBarComponent = statusBarModule.default;
  }

  const entry: ViewPluginEntry = {
    pluginId,
    manifest,
    component: Component,
    statusBarComponent,
  };

  registerViewPlugin(entry);

  // E5.5#9i：移除插件加载时的 eager WebView 创建。Per-tab 模型下 WebView 由
  // useWebViewSync Effect 3 按需创建（create(instanceId, pluginId)），一 tab 一实例。

  // E2c #19g：statusBar 声明 configurable: true → 自动注册配置项 + 注入 visible prop
  // 在 registerViewPlugin 之后、parseContributions 之前调用——
  // registerConfiguration 为 merge 语义，parseContributions 的配置会合并进来不丢失。
  const configurableItems = (manifest.statusBar ?? []).filter((i) => i.configurable);
  if (configurableItems.length > 0) {
    const properties: Record<string, { type: "boolean"; default: boolean; description: string }> = {};
    const defaults: Record<string, boolean> = {};
    for (const item of configurableItems) {
      const key = `${pluginId}.statusBar.${item.id}`;
      properties[key] = { type: "boolean", default: true, description: `状态栏显示 "${item.label || item.id}"` };
      defaults[key] = true;
    }
    registerConfiguration(pluginId, { title: manifest.name, properties });
    registerConfigurationDefaults(pluginId, defaults);
  }

  log.appendLine(`✅ 视图插件 "${manifest.name}" (${pluginId}) 已注册`);
}

/* ── 插件数据文件 fetch（#39a：全量迁移——绕开 Vite glob 缓存） ── */

/**
 * 🔥 替代 getPluginDataFile——用 fetch() 而非 import.meta.glob。
 * Vite glob 在 dev 模式下只在启动时扫描一次，新插件目录的 JSON 不被实时发现。
 * 运行时主题数据加载（对标 loadPlugin 主题分支）——从一开始就用 fetch。
 */
async function fetchPluginDataFile(pluginId: string, filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (import.meta.env.DEV) {
      // dev 模式：先试 builtin 再试 user
      for (const sub of ['builtin', 'user']) {
        const url = `http://localhost:1420/plugins/${sub}/${pluginId}/${filePath}`;
        try {
          const response = await fetch(url);
          if (response.ok) {
            return await response.json() as Record<string, unknown>;
          }
        } catch { /* fetch 失败继续试下一个 */ }
      }
      console.warn(`[pluginLoader] 数据文件加载失败 — "${pluginId}/${filePath}" (not in builtin/ or user/)`);
      return null;
    }
    // prod 模式：linkdesk:// 协议——protocol.ts 已处理 builtin/user 回退
    const url = `linkdesk://${pluginId}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[pluginLoader] 数据文件加载失败 — "${pluginId}/${filePath}" (${response.status})`);
      return null;
    }
    return await response.json() as Record<string, unknown>;
  } catch (e) {
    console.warn(`[pluginLoader] 数据文件加载异常 — "${pluginId}/${filePath}": ${errMsg(e)}`);
    return null;
  }
}

/* ── 主题 JSON 数据异步加载（对标 loadLanguageContributionData） ── */

/** 加载 contributes.themes 声明的 JSON 颜色文件——用 fetch() 绕开 glob 缓存 */
async function loadThemeContributionData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const themeList = manifest.contributes?.themes as ThemeContribution[] | undefined;
  if (!themeList?.length) return;

  for (const tc of themeList) {
    const data = await fetchPluginDataFile(pluginId, tc.path);
    if (!data) continue;
    const themeType = (data.type as "dark" | "light") ?? tc.uiTheme;
    const colors = extractThemeColors(data);
    registerTheme({ name: tc.label, type: themeType as "dark" | "light", colors }, pluginId);
  }
}

/* ── 语言 JSON 数据异步加载（#39 fix：绕过 Vite glob 缓存） ── */

/**
 * 加载 contributes.languages 声明的 JSON 翻译文件。
 * E5#12：旧格式 manifest.languages 由 normalizeManifest + parseContributions 处理。
 * 🔥 用 fetch() 而不用 getPluginDataFile()——后者依赖 import.meta.glob，
 * Vite 在 dev 模式下可能缓存旧快照，新插件目录的 JSON 文件不被实时发现。
 */
async function loadLanguageContributionData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const langList = manifest.contributes?.languages as LanguageContribution[] | undefined;
  if (!langList?.length) return;

  let registered = 0;
  for (const lc of langList) {
    const data = await fetchPluginDataFile(pluginId, lc.path);
    if (data) {
      registerPluginLanguageBundle(lc.id, data as Record<string, unknown>, pluginId);
      registered++;
    }
  }

  // #42：新语言插件安装后重播当前语言资源——插件 WebView 无需等用户切语言
  if (registered > 0) syncLanguageBroadcast();
}

/**
 * 广播当前语言资源到所有插件 WebView。
 * #42：新语言插件安装后调用——插件 WebView 即时获得新翻译，无需等用户切语言。
 * 对标 App.tsx onApply 的广播——同一段逻辑，两处触发（语言切换 + 新翻译注册）。
 */
function syncLanguageBroadcast(): void {
  const bridge = window.linkdesk?.bridge;
  if (!bridge?.broadcast) return;
  const currentLang = i18n.language;
  const resources: Record<string, unknown> = {};
  for (const lang of i18n.languages ?? []) {
    const bundle = i18n.getResourceBundle(lang, "translation");
    if (bundle) resources[lang] = bundle;
  }
  bridge.broadcast("lang:changed", { lang: currentLang, resources });
}

/**
 * 加载 contributes.i18n 声明的插件自带翻译文件。
 * E5#109——每插件 `i18n/{lang}.json`，key=中文原文，value=译文。
 * 对标 VS Code extension l10n——注册到 i18next "translation" + pluginId 命名空间。
 * 🔥 复用 fetchPluginDataFile——和 loadLanguageContributionData 同一管道。
 */
async function loadPluginI18nData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const i18nMap = manifest.contributes?.i18n as Record<string, string> | undefined;
  if (!i18nMap || typeof i18nMap !== "object") return;

  let registered = 0;
  for (const [langCode, filePath] of Object.entries(i18nMap)) {
    if (typeof filePath !== "string") continue;
    const data = await fetchPluginDataFile(pluginId, filePath);
    if (data) {
      registerPluginLanguageBundle(langCode, data, pluginId);
      registered++;
    }
  }

  if (registered > 0) syncLanguageBroadcast();
}

/* ── 枚举同步——主题/语言注册/注销后更新下拉选项 ── */

/** 同步 app.theme 枚举——主题注册/注销后调用。不影响 onApply，只更新下拉选项。 */
function syncAppThemeEnum(): void {
  const available = getAvailableThemes();
  if (available.length === 0) return; // 无主题时不更新——保留上次枚举，避免下拉变输入框
  updateConfigurationEnum("app.theme", available, available.includes("Dark") ? "Dark" : available[0]);
}

/** 同步 app.language 枚举——语言注册/注销后调用。不影响 onApply，只更新下拉选项。 */
function syncAppLanguageEnum(): void {
  const languages = LanguageRegistry.getAll();
  if (languages.length === 0) return; // 无语言时不更新——保留上次枚举
  const codes = languages.map(l => l.id);
  updateConfigurationEnum("app.language", codes, codes.includes("zh") ? "zh" : codes[0]);
}

export {
  extractThemeColors,
  resolveRuntimePluginRoot,
  resolveViewModule,
  loadPluginComponent,
  fetchPluginDataFile,
  loadThemeContributionData,
  loadLanguageContributionData,
  loadPluginI18nData,
  syncAppThemeEnum,
  syncAppLanguageEnum,
};
