/**
 * App 启动初始化 hook——useAppStartup：mount-once 初始化管线。
 * E5.8#0d.10-3b：自 App.tsx 拆出——IpcBridge/兜底主题/核心配置/核心命令/color-picker 命令/壳快捷键注册
 * + initAll 异步管线 + post-init React state 同步 + cleanup。
 * E5.8 Phase 11.13 结构归一化（Domain 拆解）：「主题」配置声明 → config/appearance.ts（registerAppearanceConfiguration），
 *   外观应用编排（应用/播种/迁移）→ appearanceApplier.ts——本文件保留：hook 签名 + 「通用」配置组 + 生命周期接线 + post-init 同步。
 * 依赖方向：startup → appearanceApplier + config/appearance + core 服务/registry + pluginLoader + i18n。无反向。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { pushToast } from "../core/services/ui/NotificationService";
import { registerFallbackThemes, normalizeThemeValue } from "../core/services/ui/ThemeEngine";
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "../pluginLoader/loader";
import { factorySlots } from "../core/services/bootstrap/FactorySlots";
import {
  getConfigurationValue, setConfigurationValue, resetConfigurationValue, inspectConfiguration,
} from "../core/services/configuration/ConfigurationService";
import { registerConfiguration, getMergedSchema } from "../core/registry/ConfigurationRegistry";
import { runPendingConfigMigrations } from "../core/services/configuration/schemaMigrations";
import { initLayoutService, getTabLayout } from "../core/services/layout/LayoutService";
import { initWorkspaceService } from "../core/services/layout/WorkspaceService";
import { initPluginStates, APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
import { ContextKeyService } from "../core/registry/commands/ContextKeyService";
import { initIpcBridgeHandler, unregisterIpcBridgeHandler } from "../core/services/plugins/IpcBridgeHandler";
import { initAll } from "../core/services/bootstrap/AppInitializer";
import { mountGlobalKeybindings, initUserKeybindings } from "../core/registry/commands/KeybindingRegistry";
import { applyConfiguration } from "../core/services/configuration/ConfigurationApplier";
import { ensureCoreCommands, ensureCoreKeybindings } from "../core/commands/shell/coreCommands";
import { registerCommand } from "../core/registry/commands/CommandRegistry";
import i18n from "../i18n";
import { syncCountersAfterRestore } from "../hooks/useTabManager";
import { registerAppearanceConfiguration } from "./config/appearance";

export interface AppStartupDeps {
  setTheme: (v: string) => void;
  setLang: (v: "zh" | "en") => void;
  setReady: (v: boolean) => void;
}

/** mount-once 启动管线：注册 + initAll + post-init state 同步 + cleanup（HMR/StrictMode 安全） */
export function useAppStartup({ setTheme, setLang, setReady }: AppStartupDeps): void {
  const { t } = useTranslation();
  useEffect(() => {
    // B12+B13 fix：捕获 cleanup 函数——HMR/StrictMode 下避免重复注册
    let keybindingCleanup: (() => void) | undefined;

    (async () => {
      // ═══ Pre-init：同步设置（需要 React 上下文 t() / sync-only）═══
      // E5.7#101：initV3Api 已随 v3Api.ts 整删——__v3_core__ SDK 零消费方
      // （池插件不可达壳 window 全局；E6#3 已定未来插件 SDK 走 linkdesk.*）

      // E3a #26：初始化 IpcBridge 壳侧处理器——监听主进程转发的插件 IPC 请求
      initIpcBridgeHandler();

      // M2：注册内置兜底主题——插件主题后注册同名覆盖。确保卸载全部主题插件后下拉框不为空
      registerFallbackThemes();

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组。
      // E5.8#50.19：app.theme + 5 外观覆盖 key 已迁入「主题」组（第二贡献 pluginId "appearance"，08 §5 决策 D）。
      // E5.8#79：app.accentColor 强调色也迁入「主题」组（accent 本质 = 主题色域颜色覆盖）。
      // E5.8#90：app.accentMode/app.mixMode 已删（三枚举归一外观主开关，见组内注释）；强调色并入自定义模式一槽。
      registerConfiguration(APP_PLUGIN_ID, {
        title: t("通用"),
        properties: {
          "app.language": {
            type: "string",
            default: "zh",
            enum: ["zh", "en"],
            description: t("界面语言"),
            onApply: (v) => {
              i18n.changeLanguage(v as string);
              // E3c #40：跨进程广播——壳切语言 → 所有插件 WebView 同步
              const bridge = window.linkdesk?.bridge;
              if (bridge?.broadcast) {
                const resources: Record<string, unknown> = {};
                for (const lang of i18n.languages ?? []) {
                  const bundle = i18n.getResourceBundle(lang, "translation");
                  if (bundle) resources[lang] = bundle;
                }
                bridge.broadcast("lang:changed", { lang: v, resources });
              }
            },
          },
          "app.menuStyle": {
            type: "string",
            default: "titlebar",
            enum: ["titlebar", "hamburger", "both"],
            description: t("菜单栏样式——标题栏 / 汉堡菜单 / 两者都显示"),
          },
          // E5.7#79：窗口缩放级别——view.zoomIn/Out/Reset 命令的真值源（VS Code window.zoomLevel 同款）。
          // onApply 换算 factor=1.2^level 推主进程 setZoomFactor(池 WCV)；启动 applyAllConfigurations
          // 自动执行 onApply → 持久化缩放开机即恢复（StorageService 现成）。
          "window.zoomLevel": {
            type: "number",
            default: 0,
            minimum: -8,
            maximum: 8,
            description: t("窗口缩放级别——0 为原始大小，每 ±1 放大/缩小 20%"),
            onApply: (v) => {
              // Number.isFinite 而非 typeof === "number"——后者触发 no-restricted-syntax 的
              // 字符串比较启发式误报（规则 selector 泛化，Phase 14.5 收窄时处理）
              const n = Number(v);
              const level = Number.isFinite(n) ? Math.min(8, Math.max(-8, n)) : 0;
              window.linkdesk?.window?.setZoom?.(Math.pow(1.2, level));
            },
          },
        },
      });

      // 「主题」配置组声明（pluginId "appearance"）——E5.8 Phase 11.13 结构归一化：配置声明 + onApply 编排
      // 拆至 config/appearance.ts（registerAppearanceConfiguration）；onApply 委托 appearanceApplier 外观应用编排。
      registerAppearanceConfiguration(t);

      // Phase 5：初始化 context key 核心状态
      ContextKeyService.initCoreKeys();

      // Phase 5b：注册核心命令 + TabContext 菜单项（只执行一次，幂等）
      ensureCoreCommands();
      // E3f #59e2：color-picker.pick 命令——Promise 桥接，插件调 commands.execute 弹出浮层拿到返回值
      registerCommand(APP_PLUGIN_ID, {
        id: "color-picker.pick",
        title: t("选择颜色…"),
        category: t("开发人员"),
        handler: async (...args: unknown[]) => {
          const opts = (args[0] as { initialColor?: string; presets?: string[] }) ?? {};
          const color = await import("../components/shared/color-picker/ColorPicker").then(m =>
            m.showColorPicker({ initialColor: opts.initialColor, presets: opts.presets })
          );
          // 返回值通过 executeCommand 的 Promise 传回调用方——对标 VS Code commands.executeCommand
          return color as unknown as void;
        },
      });

      // E5.7#49：ensureBuiltinProtocols() 调用已删——ProtocolRegistry 唯一写入方收敛到
      // 主进程 plugin-manifest-loader（内置方括号协议汇入主进程实例）

      // E3f #59-F：注册全部壳级快捷键——声明式 CORE_KEYBINDINGS，幂等
      ensureCoreKeybindings();

      // ═══ Async pipeline：委托给 AppInitializer（E5#107） ═══
      const result = await initAll({
        initLayoutService,
        initPluginStates,
        initWorkspaceService, // E5.5#0e
        initPluginLoader,
        startPluginWatcher,
        getLoadedPluginManifests,
        factorySlotsInitialize: (plugins) => factorySlots.initialize(plugins),
        mountGlobalKeybindings,
        initUserKeybindings,
        getConfigurationValue,
        applyConfiguration,
        getTabLayout,
        syncCountersAfterRestore,
      });

      keybindingCleanup = result.keybindingCleanup;

      // ═══ Post-init：React state 同步 ═══
      // E5.8#50.21：旧值归一化 + 落盘——workspace/user 里 legacy "Dark"/"Light" 启动即转 "dark"/"light"
      // （映射表，不弹窗不重置；getConfigurationValue 会经 enum 校验把 legacy 值读成默认，须 inspect 取原始值）
      const inspectedTheme = inspectConfiguration<string>("app.theme");
      const rawTheme = inspectedTheme.workspaceValue ?? inspectedTheme.userValue ?? "dark";
      let initTheme = normalizeThemeValue(rawTheme) ?? "dark";

      // E5.8#61 审计#5：死 app.theme id 清扫——插件卸载后残留 id 不在当前 enum（配方/主题已注销）
      // → 每次 getConfigurationValue 读都经 _validateEnum warn「不在 enum——回退默认值」刷屏。
      // 此时 initAll 已完成：全插件已加载、enum 已稳定（syncAppThemeEnum 于 applyPostLoadSteps 后调用），清扫最安全。
      // inspect 直读原始值判断——getConfigurationValue 会把死 id 读成默认值掩盖残留，不能用作判断。
      const themeEnum = getMergedSchema()["app.theme"]?.enum;
      const isDeadId = themeEnum ? !themeEnum.includes(initTheme) : false;
      if (initTheme !== rawTheme || isDeadId) {
        const scope = inspectedTheme.workspaceValue !== undefined ? "workspace" : "user";
        if (isDeadId) initTheme = themeEnum!.includes("dark") ? "dark" : themeEnum![0];
        try {
          // E5.8#61 审计#6：await 落盘——清扫值必须成为最后一个写入者，否则 settings.json watcher
          // 去抖 reload 读到陈旧死 id 文件 → diff 反向把内存改回死 id → 清扫静默失效（CDP 实测幽灵残留）
          await setConfigurationValue("app.theme", initTheme, scope);
        } catch (e) {
          console.error("[startup] app.theme 迁移/清扫落盘失败:", e);
        }
      }
      // E5.8#82：删 themeColorMode 一次性迁移——旧 settings.json 归一：
      //   custom     → 保留 app.themeColor 用户值（语义升级为配色域来源，值直接继承）；
      //   followTheme → 删 app.themeColor 用户值回主题基线（不保留失效配色选择）；
      //   随后删废弃 key 本身（引擎已不再读 app.themeColorMode）。
      try {
        const tcm = inspectConfiguration<string>("app.themeColorMode");
        if (tcm.userValue !== undefined) {
          if (tcm.userValue === "followTheme") {
            await resetConfigurationValue("app.themeColor", "user");
          }
          await resetConfigurationValue("app.themeColorMode", "user");
        }
      } catch (e) {
        console.error("[startup] themeColorMode 迁移失败:", e);
      }
      // E5.8#85 补课：跑待执行 schema 迁移——旧 settings.json（圆角倍数）升级即迁绝对 px（视觉零变化）。
      // 位置：post-init（initAll 后主题+旧覆盖已应用，getEffectiveTokens() = 旧视觉，冻结即忠实）。
      // #82 themeColorMode 是迁移机制落位前的历史一次性先例；此后语义切换一律 registerConfigMigration 登记
      // （迁移登记在 appearanceApplier 模块级——import 时已注册，先于本 post-init 执行）。
      // E5.8#90：post-migration 重应用——迁移可能改写外观模式（旧 mixMode=mix → appearanceMode=custom），
      // 但迁移的 setConfigurationValueBatch 末 key 是版本标志（无 onApply）→ 外观模式写静默。模式变更者
      // 首次启动立即应用（播种覆盖 + 强调色）——否则要等用户下一次手动切模式才生效（一程视觉回归）。
      // 安全：setTheme 在 App.tsx 只是 React state 同步（非重应用）；本 applyConfiguration 走完整 applier。
      const modeBefore = getConfigurationValue<string>("app.appearanceMode") ?? "followTheme";
      try {
        await runPendingConfigMigrations();
        const modeAfter = getConfigurationValue<string>("app.appearanceMode") ?? "followTheme";
        if (modeBefore !== modeAfter) {
          await applyConfiguration("app.appearanceMode", modeAfter);
        }
      } catch (e) {
        console.error("[startup] schema 迁移失败:", e);
      }

      const initLang = getConfigurationValue<string>("app.language") ?? "zh";
      setTheme(initTheme);
      setLang(initLang as "zh" | "en");

      // E3e debug：暴露通知 API 到 window——DevTools 控制台可调试验证
      // （__showProgress/__setDoNotDisturb/__setSourceFilter 已随 E5.7#27.5 死链整删——
      //   进度条/DND/来源过滤零消费者，Debug 钩子也是死链）
      // E5.7#98：E3e debug 钩子——窄 window 接口声明替代 as any
      const debugWindow = window as Window & {
        __pushToast?: typeof pushToast;
        __clearDismissed?: () => void;
      };
      debugWindow.__pushToast = pushToast;
      debugWindow.__clearDismissed = () => localStorage.removeItem("linkdesk_dismissed_toasts");

      setReady(true);
    })();

    // B12+B13 fix：cleanup——HMR/StrictMode double-mount 时不泄漏
    return () => {
      keybindingCleanup?.();
      stopPluginWatcher();
      unregisterIpcBridgeHandler(); // E5#103
    };
    // E5.7#99：mount-once 初始化管线——t 变化（语言切换）重跑会重注册配置/重复 initAll，
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 注册文案取首语言即可（硬约束 13 竞态面）
  }, []);
}
