/**
 * App 启动初始化 hook——useAppStartup：mount-once 初始化管线。
 * E5.8#0d.10-3b：自 App.tsx 拆出——IpcBridge/兜底主题/核心配置/核心命令/color-picker 命令/壳快捷键注册
 * + initAll 异步管线 + post-init React state 同步 + cleanup。
 * 依赖方向：startup → core 服务/registry + pluginLoader + i18n + components/shared（color-picker 动态加载）；
 * App 消费：useAppStartup({ setTheme, setLang, setReady })。无反向依赖。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { pushToast } from "../core/services/ui/NotificationService";
import {
  loadTheme,
  applyTheme,
  applyAccentColor,
  registerFallbackThemes,
  getEffectiveAccentColor,
  getCurrentTheme,
} from "../core/services/ui/ThemeEngine";
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "../pluginLoader/loader";
import { factorySlots } from "../core/services/bootstrap/FactorySlots";
import { getConfigurationValue, setConfigurationValue } from "../core/services/configuration/ConfigurationService";
import { registerConfiguration } from "../core/registry/ConfigurationRegistry";
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

export interface AppStartupDeps {
  setTheme: (v: string) => void;
  setLang: (v: "zh" | "en") => void;
  setReady: (v: boolean) => void;
}

/** E5.8#50.10：外观覆盖配置 onApply 统一入口——当前主题存在才重应用（启动时 app.theme 先注册先 apply，本组恒非空）。
 * 重应用 = applyTheme（内部合并用户外观覆盖） + applyAccentColor——防 applyTheme 重写主题 accent 覆盖用户自定义强调色。 */
const applyThemeIfReady = (): void => {
  const theme = getCurrentTheme();
  if (!theme) return;
  applyTheme(theme);
  applyAccentColor(getEffectiveAccentColor());
};

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

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组
      registerConfiguration(APP_PLUGIN_ID, {
        title: t("通用"),
        properties: {
          "app.theme": {
            type: "string",
            default: "Dark",
            enum: ["Dark", "Light"],
            description: t("配色主题"),
            onApply: async (v) => {
              const t = await loadTheme(v as string);
              applyTheme(t);
              // E3f #59d2：强调色走归一化函数——三种路径一条函数，不手写 if/else
              applyAccentColor(getEffectiveAccentColor());
            },
          },
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
          "app.accentMode": {
            type: "string",
            default: "custom",
            enum: ["custom", "followTheme"],
            description: t("强调色模式——自定义固定色 / 跟随主题（主题无强调色时用自定义兜底）"),
            onApply: (v) => {
              if (v === "custom") {
                // 读当前 DOM 上实际显示的强调色——切模式前可能跟着主题走，不是 app.accentColor 的旧值
                const current = document.documentElement.style.getPropertyValue("--accent").trim();
                if (current) setConfigurationValue("app.accentColor", current, "user");
              }
              applyAccentColor(getEffectiveAccentColor());
            },
          },
          "app.accentColor": {
            type: "string",
            // E5.8#6.6 hex 豁免：配置项默认值数据（用户可改，非样式硬编码）
            // eslint-disable-next-line linkdesk/no-hardcoded-hex
            default: "#0078d4",
            description: t("自定义强调色（图标栏高亮、开关、焦点边框）"),
            dependsOn: { key: "app.accentMode", value: "custom" },
            renderHint: "color",
            // E3.5 fix: dependsOn 只控制 UI 显隐，不阻止 applyConfiguration 在启动时调用。
            // accentMode="followTheme" 时，app.accentColor 的 onApply 不应覆盖主题的 accent。
            onApply: () => applyAccentColor(getEffectiveAccentColor()),
          },
          // E5.8#50.10：用户外观覆盖配置——neutral 默认值 = 不覆盖主题基线（玻璃主题零影响）。
          // onApply 统一走 applyThemeIfReady——单一写入点 applyTheme 末尾读本组配置覆盖（getAppearanceOverrides）。
          "app.glassBlur": {
            type: "number",
            default: 0,
            minimum: 0,
            maximum: 40,
            description: t("玻璃模糊——0 关闭，数值越大背景越模糊"),
            uiHint: "slider",
            onApply: () => applyThemeIfReady(),
          },
          "app.glassOpacity": {
            type: "number",
            default: 1,
            minimum: 0,
            maximum: 1,
            description: t("玻璃不透明度——1 不透明，越小越透明"),
            uiHint: "slider",
            onApply: () => applyThemeIfReady(),
          },
          "app.glassTint": {
            type: "string",
            default: "",
            description: t("玻璃叠加色——空 = 主题自带"),
            renderHint: "color",
            onApply: () => applyThemeIfReady(),
          },
          "app.backgroundImage": {
            type: "string",
            default: "",
            description: t("窗口背景图片路径——空 = 主题自带"),
            uiHint: "image", // E5.8#50.11：专属「选择图片」控件（选图→拷贝入库→受控路径持久化）
            onApply: () => applyThemeIfReady(),
          },
          "app.surfaceRadius": {
            type: "number",
            default: 1,
            minimum: 0.5,
            maximum: 2,
            description: t("界面圆角缩放——1 主题默认，0.5 锐利，2 圆润"),
            uiHint: "slider",
            onApply: () => applyThemeIfReady(),
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
      const initTheme = getConfigurationValue<string>("app.theme") ?? "Dark";
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
