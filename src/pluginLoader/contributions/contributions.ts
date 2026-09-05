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

import type { PluginManifest, ViewPluginEntry, ThemeContribution, IconThemeContribution, IconContribution, LanguageContribution, ContributesViews, IconThemeMappings, IconThemeMapping } from "../../core/api/types";
import type { FontFaceSpec } from "../../core/types/ipc/events";
import { getPluginAssetPath } from "../../core/utils/path/pluginAssetPath";
import { registerViewPlugin } from "./viewRegistry";
import { registerTheme, getAvailableThemes, ensurePluginFontFacesCleanup, normalizeThemeValue, syncThemeColorEnum, fontFormatOf } from "../../core/services/ui/ThemeEngine";
import { ThemeRegistry, parseThemeRecipe } from "../../core/registry/appearance/ThemeRegistry";
import { IconRegistry } from "../../core/registry/appearance/IconRegistry";
import { LanguageRegistry } from "../../core/registry/languages/LanguageRegistry";
import { pushToast, TOAST_TTL_INFO } from "../../core/services/ui/NotificationService";
import { registerConfiguration, registerConfigurationDefaults, updateConfigurationEnum } from "../../core/registry/ConfigurationRegistry";
import type { ManifestMenuItem, TitleBarContribution } from "../../core/registry/commands/MenuRegistry";
import { registerMenuItems, registerTitleBarContribution } from "../../core/registry/commands/MenuRegistry";
import { registerCommand } from "../../core/registry/commands/CommandRegistry";
import { registerKeybinding } from "../../core/registry/commands/KeybindingRegistry";
import { registerPluginLanguageBundle } from "./i18nResources";
import i18n from "../../i18n";
import { pluginModules, pluginStatusBarModules, viewRenderModules, pluginManifestRaw, extractPluginId, errMsg, log } from "../resolution/state";

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
      properties: config.properties as Record<string, import("../../core/registry/ConfigurationRegistry").ConfigurationProperty>,
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
      const { ViewContainerService } = await import("../../core/services/layout/ViewContainerService");
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
    // E5.8#1c：schema 归口 ContributesViews（types.ts 权威定义）——替代手写内联类型
    const views = c.views as ContributesViews;
    try {
      const { ViewContainerService } = await import("../../core/services/layout/ViewContainerService");
      for (const [containerId, viewDefs] of Object.entries(views)) {
        for (const viewDef of viewDefs) {
          // E5#34b: render 路径相对于插件根目录。
          // 优先级：1) 调用方传入 pluginRoot  2) import.meta.glob 推导  3) IPC resolvePath（glob 外插件兜底）
          const resolvedRoot = pluginRoot ?? (() => {
            const mk = Object.keys(pluginManifestRaw).find(k => extractPluginId(k) === pluginId);
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
              // E5.8#36.5：titleActions 声明透传——ViewDescriptor 原样存（JSON 可序列化，壳→池直传零加工）
              titleActions: viewDef.titleActions,
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
 * prod（E6 打包格式）：manifest.entry 返回预构建 chunk 名 `<pluginId>.js`——
 *   vite.config 多入口产物名 = 插件目录名（dist/plugins/<sub>/<id>.js），
 *   entry 字段是源码路径，在打包格式中不参与入口解析。
 *
 * E6#7（1.2-4）：可选 4 参 opts.bundle——目录含 index.bundle.js 的 .linkdesk-plugin 解压产物
 *   （磁盘格式事实）入口恒 "index.bundle.js"，不随 dev/prod 与 manifest.entry 变（SDK 打包时
 *   把作者 entry 源码路径原样拷进 plugin.json，不可当入口判据——检测走 state.isBundlePlugin）。
 *
 * E6#15d G3a（纯数据包对称跳过）：prod 非 bundle 且 **无 manifest.entry** → 返回 null——
 *   theme×10/lang×2 这类纯贡献包（contributes.themes/languages，无 JS 产物）与 entryless-view
 *   插件（视图走 contributes.views[].render 由 ViewContainerService 加载）都不存在主 JS。
 *   旧实现 prod 一律返 `${pluginId}.js` → 解压产物目录里没有这文件 → linkdesk:// 404 →
 *   「加载失败——可能未构建」误报 toast（不阻断但每次首启弹 12 个）。dev `manifest.entry || null`
 *   与 glob 分支 `role==="data"`（runtime.ts:294）早已对称跳过入口 import——此处补 prod 侧同一缺口。
 *   跳过只豁免主入口 import：loadPluginLifecycle 贡献注册 + 主题/语言数据加载照走，loadState 照常 active。
 */
export function runtimeEntryPath(
  manifest: PluginManifest,
  pluginId: string,
  isDev: boolean,
  opts?: { bundle?: boolean },
): string | null {
  if (opts?.bundle) return "index.bundle.js";
  if (isDev) return manifest.entry || null;
  if (!manifest.entry) return null;
  return `${pluginId}.js`;
}

/**
 * 插件视图入口模块解析——E5.7#82：两套入口映射合一。
 *
 * dev：构建时 glob（pluginModules，Vite 展开）∪ 运行时 /@fs 源码（Vite 即时编译）
 * E6 打包（prod）：构建时插件仍走同一张 glob 表（chunk 随池 bundle 分发）；
 *   运行时安装的插件 = 预构建 chunk `<pluginId>.js`，经 linkdesk:// 动态 import——
 *   协议平铺 root-direct 直解析（electron/plugins/protocol.ts，双根 app→userData）。
 *   2026-09-05 塌平：无 builtin/user 子目录层，代码根直接含插件目录。pluginId → 模块语义全局唯一。
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
 *
 * E5.8#133.4：拆 URL 解析出 resolvePluginDataUrl——JSON/文本两加载器共用同一寻址，单一权威防两处漂移。
 * E5.8#133.5 根因修复：dev/prod 无分叉——恒 linkdesk:// 协议（单一权威，见下）。
 */

/**
 * 插件数据文件可 fetch 的 URL——恒 `linkdesk://{pluginId}/{filePath}`（dev/prod 同一条路零漂移）。
 *
 * E5.8#133.5 删除 dev 探测（http://localhost:1420/plugins/{builtin,user}/...）的根因：
 * 1. Vite SPA fallback 对不存在的路径返回 200 + text/html——仅凭 response.ok 会把 HTML 误判为命中
 *    （#133.4 重构把 .json() 校验移出探测循环后引入的回归：user 插件先探 builtin 拿到 HTML → 数据全加载失败）；
 * 2. dev 下 fetch() 一个 .css 返回 Vite HMR 的 JS 模块包装（text/javascript），非原始 CSS——
 *    图标主题 glyph CSS 注入必炸。
 * linkdesk:// 协议（electron/plugins/protocol.ts）在请求时读盘 root-direct 直解析（2026-09-05 塌平：
 * 双根 app→userData 各自直接含插件目录，无子目录回退层）：
 * 正确 MIME（.json/.css/.ttf…）、缺失 404 而非 HTML、运行时发现天然支持
 * （#39a 原目标——绕开 Vite glob 缓存）。探测不必要，且是两处回归的根源。
 */
export function resolvePluginDataUrl(pluginId: string, filePath: string): string {
  return `linkdesk://${pluginId}/${filePath}`;
}

/** fetch 插件数据文件原始响应（JSON/文本共用单一 fetch 逻辑，防两处漂移）——未找到/异常 → null。 */
async function fetchPluginDataRaw<T>(
  pluginId: string,
  filePath: string,
  parse: (res: Response) => Promise<T>
): Promise<T | null> {
  const url = resolvePluginDataUrl(pluginId, filePath);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[pluginLoader] 数据文件加载失败 — "${pluginId}/${filePath}" (${response.status})`);
      return null;
    }
    return await parse(response);
  } catch (e) {
    console.warn(`[pluginLoader] 数据文件加载异常 — "${pluginId}/${filePath}": ${errMsg(e)}`);
    return null;
  }
}

/** fetch 插件数据文件并解析 JSON——未找到/异常 → null（调用方 toast 反馈）。 */
function fetchPluginDataFile(pluginId: string, filePath: string): Promise<Record<string, unknown> | null> {
  return fetchPluginDataRaw(pluginId, filePath, (res) => res.json());
}

/** fetch 插件数据文件原始文本（E5.8#133.4 图标主题 glyph CSS）——未找到/异常 → null。 */
function fetchPluginDataText(pluginId: string, filePath: string): Promise<string | null> {
  return fetchPluginDataRaw(pluginId, filePath, (res) => res.text());
}

/* ── 主题 JSON 数据异步加载（对标 loadLanguageContributionData） ── */

/** 加载 contributes.themes 声明的 JSON 颜色文件——用 fetch() 绕开 glob 缓存。
 *  E5.8#50.15：05 schema 解析——主题 JSON → Recipe → ThemeRegistry.registerRecipe（数据层单真源）；
 *  同时桥接 flat Theme → ThemeEngine（现 apply 路径仍读 flat，引擎 Recipe 化在 #50.16）。 */
async function loadThemeContributionData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const themeList = manifest.contributes?.themes as ThemeContribution[] | undefined;
  if (!themeList?.length) return;

  for (const tc of themeList) {
    const data = await fetchPluginDataFile(pluginId, tc.path);
    if (!data) {
      // E5.8#61 审计#4：主题数据文件损坏/缺失 → UI 反馈（原仅 console.warn 无提示——
      // metadata 已注册但 recipe/flat 缺失 → 应用时静默无效果，用户不知道为什么）
      pushToast({
        message: i18n.t("主题「{{name}}」数据文件加载失败，已跳过", { name: tc.label }),
        severity: "warning",
        ttl: TOAST_TTL_INFO,
        source: pluginId,
      });
      continue;
    }
    const recipe = parseThemeRecipe(data, tc);
    if (!recipe) {
      console.warn(`[theme] "${tc.label}" 解析失败——既无 colorways[] 也无平铺 colors（决策 F：只读新格式）`);
      pushToast({
        message: i18n.t("主题「{{name}}」数据损坏，已跳过加载", { name: tc.label }),
        severity: "warning",
        ttl: TOAST_TTL_INFO,
        source: pluginId,
      });
      continue;
    }
    // 数据层：Recipe 登记（05 schema 配方单真源）
    ThemeRegistry.registerRecipe(recipe, pluginId);
    // E5.8#50.17：登记资产字体卸载清理——配方带 font.ui 资产路径时 applyRecipe 才注册 @font-face，
    // 卸载须移除 style + 还原 --font-*（字体回默认验收）；幂等 + 重装可再登记
    ensurePluginFontFacesCleanup(pluginId);
    // 桥接：flat Theme → ThemeEngine（现 apply 路径；#50.16 引擎按 Recipe 合并后此桥退役）
    const themeType = recipe.type ?? (tc.uiTheme === "light" ? "light" : "dark");
    const surface = recipe.appearance?.glass;
    const background = recipe.appearance?.background;
    registerTheme(
      {
        name: recipe.name,
        type: themeType,
        colors: recipe.colorways[0]?.colors ?? {},
        surface,
        background,
      },
      pluginId
    );
  }
}

/* ── 图标主题 mappings 数据异步加载（E5.8#133.1） ── */

/**
 * 归一化插件 mappings JSON → core IconThemeMappings（双形态，E5.8#133 ④ 拍板）。
 * - 字体 glyph：`{ class: "codicon codicon-x" | "myfont myfont-x", color?: "#f1e05a" }`——原样
 * - 图像资产：`{ imagePath: "icons/js.svg" }`——getPluginAssetPath 解析 linkdesk:// 绝对 URL（硬约束 12 同族）
 * 无效条目（无 class 也无 imagePath）跳过 + warn；整表无效 → null（上层 toast 反馈）。
 */
function normalizeIconThemeMappings(data: Record<string, unknown>, pluginId: string): IconThemeMappings | null {
  const result: IconThemeMappings = {};
  let anyValid = false;
  // E5.8#133.6：匹配表（多条目）+ 顶层默认图标（单条目）分别归一化；默认图标对齐 VS Code iconTheme 顶层键
  for (const section of ["files", "extensions", "folders", "foldersExpanded"] as const) {
    const raw = data[section];
    if (!raw || typeof raw !== "object") continue;
    const out: Record<string, IconThemeMapping> = {};
    for (const [name, def] of Object.entries(raw as Record<string, unknown>)) {
      const entry = normalizeEntry(name, def, pluginId);
      if (entry) { out[name] = entry; anyValid = true; }
    }
    if (Object.keys(out).length > 0) result[section] = out;
  }
  for (const section of ["file", "folder", "folderExpanded", "rootFolder", "rootFolderExpanded"] as const) {
    const raw = data[section];
    if (!raw || typeof raw !== "object") continue;
    const entry = normalizeEntry(section, raw as Record<string, unknown>, pluginId);
    if (entry) { result[section] = entry; anyValid = true; }
  }
  return anyValid ? result : null;
}

/** 单条映射条目归一化——双形态（glyph class 原样 / imagePath 解析 linkdesk://）；无效 → null + warn */
function normalizeEntry(name: string, def: unknown, pluginId: string): IconThemeMapping | null {
  if (!def || typeof def !== "object") {
    console.warn(`[iconTheme] 映射条目 "${name}" 无效——需对象（class 或 imagePath），已跳过`);
    return null;
  }
  const d = def as Record<string, unknown>;
  if (typeof d.class === "string") {
    return typeof d.color === "string" ? { class: d.class, color: d.color } : { class: d.class };
  }
  if (typeof d.imagePath === "string") {
    return { imagePath: getPluginAssetPath(pluginId, d.imagePath) };
  }
  console.warn(`[iconTheme] 映射条目 "${name}" 无效——需 class 或 imagePath，已跳过`);
  return null;
}

/* ── 图标主题自定义字体元数据（E5.8#133.4：mappings JSON 顶层可选 font 段） ── */

/** 图标主题自定义字体元数据——解析后仅含广播所需产物（glyph CSS 文本由调用方 fetch 后并入）。
 *  契约：作者在 mappings JSON 顶层声明 `font: { path, family, glyphs? }`——
 *  path = 字体资产相对路径（或绝对 URL），family = 作者 glyph CSS 里 font-family 写的族名，
 *  glyphs（可选）= glyph 类 CSS 文件相对路径。@font-face 由壳生成（池独立文档复刻），glyph 类作者自写。 */
export interface IconThemeFontMeta {
  /** 广播给池复刻 @font-face 的规格（壳已解析 linkdesk:// 绝对 URL） */
  fontFaces: FontFaceSpec[];
  /** glyph 类 CSS 文件相对路径——"" = 未声明（仅 @font-face，无自定义 glyph 类） */
  glyphCssPath: string;
}

/** 归一化图标主题 font 段——纯函数（不含 fetch/注册，可单测）。
 *  无 font 段 / 缺 path 或 family → null（自定义字体跳过，mappings 不受影响）。 */
export function normalizeIconThemeFontMeta(data: Record<string, unknown>, pluginId: string): IconThemeFontMeta | null {
  const raw = data.font;
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.path !== "string" || typeof f.family !== "string") {
    console.warn(`[iconTheme] font 段无效——需 path + family，已忽略自定义字体`);
    return null;
  }
  // 已含协议（linkdesk:// / http(s):// / data:）→ 原样；相对路径 → getPluginAssetPath 解析插件资产（硬约束 12 同族）
  const url = /^[a-z][a-z0-9+.-]*:/i.test(f.path) ? f.path : getPluginAssetPath(pluginId, f.path);
  const fontFaces: FontFaceSpec[] = [{ family: f.family, url, format: fontFormatOf(f.path) }];
  const glyphCssPath = typeof f.glyphs === "string" ? f.glyphs : "";
  return { fontFaces, glyphCssPath };
}

/** 加载 contributes.iconThemes 声明的 mappings JSON——镜像 loadThemeContributionData + fetchPluginDataFile 复用。
 *  关联 IconRegistry（ID → mappings），装/卸动态刷新（卸载时 IconRegistry disposer 清理）。
 *  E5.8#133.4：可选 font 段 → 自定义字体 @font-face + glyph CSS 一并关联（广播进池复刻）。 */
async function loadIconThemeContributionData(pluginId: string, manifest: PluginManifest): Promise<void> {
  const iconThemeList = manifest.contributes?.iconThemes as IconThemeContribution[] | undefined;
  if (!iconThemeList?.length) return;

  for (const it of iconThemeList) {
    const data = await fetchPluginDataFile(pluginId, it.path);
    if (!data) {
      pushToast({
        message: i18n.t("图标主题「{{name}}」数据文件加载失败，已跳过", { name: it.label }),
        severity: "warning",
        ttl: TOAST_TTL_INFO,
        source: pluginId,
      });
      continue;
    }
    const mappings = normalizeIconThemeMappings(data, pluginId);
    if (!mappings) {
      console.warn(`[iconTheme] "${it.label}" 解析失败——mappings JSON 无有效条目`);
      pushToast({
        message: i18n.t("图标主题「{{name}}」数据损坏，已跳过加载", { name: it.label }),
        severity: "warning",
        ttl: TOAST_TTL_INFO,
        source: pluginId,
      });
      continue;
    }
    IconRegistry.setMappings(it.id, mappings);
    // E5.8#133.4：可选自定义字体——fontFaces（@font-face 规格）+ glyph CSS 文本；font 段缺省 → 零字资产，仅 codicon/imagePath
    const fontMeta = normalizeIconThemeFontMeta(data, pluginId);
    if (fontMeta) {
      const glyphCss = fontMeta.glyphCssPath
        ? (await fetchPluginDataText(pluginId, fontMeta.glyphCssPath)) ?? ""
        : "";
      IconRegistry.setFontAssets(it.id, { fontFaces: fontMeta.fontFaces, glyphCss });
    }
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

/**
 * 同步 app.theme 枚举——主题/配方注册注销后调用。不影响 onApply，只更新下拉选项。
 * E5.8#50.19：枚举 = 配方 id 优先 + flat 主题名退路（08 §7.2 #1「动态配方 id 列表」）。
 * E5.8#50.21：flat 名归一化后与配方 id 冲突（"Dark"/"Light" → "dark"/"light"）→ 剔除，收敛为纯配方 id
 *   （旧值持久化经读时归一化照常解析；未迁移 json 名如 "薄荷苏打" 保留——flat 桥接仍可选）。
 * #50.25 全量迁移 colorways 后 flat 名自然消失，枚举纯配方 id。
 */
function syncAppThemeEnum(): void {
  const recipeIds = ThemeRegistry.getRecipes().map((r) => r.id);
  const flatNames = getAvailableThemes().filter((n) => !recipeIds.includes(normalizeThemeValue(n) ?? n));
  const available = [...recipeIds, ...flatNames];
  if (available.length === 0) return; // 无主题时不更新——保留上次枚举，避免下拉变输入框
  updateConfigurationEnum("app.theme", available, available.includes("dark") ? "dark" : available[0]);
  // E5.8 Phase 11.14：配色全集 enum 随配方集变化折叠同步——主题插件注册/注销后 app.themeColor
  // 可选配色对齐当前配方集（custom = 全配方配色 / followTheme = 活动配方配色）。四生命周期站点
  // （applyPostLoadSteps/activatePlugin/disable/uninstall）经本函数单处折叠覆盖。
  syncThemeColorEnum();
}

/** 同步 app.language 枚举——语言注册/注销后调用。不影响 onApply，只更新下拉选项。 */
function syncAppLanguageEnum(): void {
  const languages = LanguageRegistry.getAll();
  if (languages.length === 0) return; // 无语言时不更新——保留上次枚举
  const codes = languages.map(l => l.id);
  updateConfigurationEnum("app.language", codes, codes.includes("zh") ? "zh" : codes[0]);
}

/** 同步 app.iconTheme 枚举——图标主题注册/注销后调用。不影响 onApply，只更新下拉选项。
 *  E5.8#133：枚举 = "default"（codicon 保底）+ 已登记图标主题 id。卸载插件 → 枚举消失（回退保底）。
 *  对标 syncAppThemeEnum——无主题时不更新（保 enum 空下拉变输入框的坑）；default 恒在。 */
function syncIconThemeEnum(): void {
  const themeIds = IconRegistry.getAll().map((t) => t.id);
  updateConfigurationEnum("app.iconTheme", ["default", ...themeIds], "default");
}

export {
  extractThemeColors,
  resolveRuntimePluginRoot,
  resolveViewModule,
  loadPluginComponent,
  fetchPluginDataFile,
  loadThemeContributionData,
  normalizeIconThemeMappings,
  loadIconThemeContributionData,
  loadLanguageContributionData,
  loadPluginI18nData,
  syncAppThemeEnum,
  syncAppLanguageEnum,
  syncIconThemeEnum,
};
