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
  applyRecipe,
  applyAccentColor,
  registerFallbackThemes,
  getEffectiveAccentColor,
  getEffectiveTokens,
  getActiveRecipe,
  getBaseRadius,
  getAvailableThemes,
  getCurrentTheme,
  deriveAppearanceSeeds,
  normalizeThemeValue,
} from "../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import type { ThemeRecipe } from "../core/types/theme"; // E5.8#50.19：配方路径应用 helper 的类型标注
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "../pluginLoader/loader";
import { factorySlots } from "../core/services/bootstrap/FactorySlots";
import {
  getConfigurationValue, setConfigurationValue, resetConfigurationValue, inspectConfiguration,
} from "../core/services/configuration/ConfigurationService";
import { registerConfiguration, updateConfigurationEnum } from "../core/registry/ConfigurationRegistry";
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

/** E5.8#50.10+50.19：外观覆盖配置 onApply 统一入口——当前主题存在才重应用（启动时 app.theme 先注册先 apply，本组恒非空）。
 * 重应用 = 配方路径 applyRecipeForConfig（内部合并用户外观覆盖 + 强调色） / flat 主题 applyTheme——
 * 防 applyTheme 重写主题 accent 覆盖用户自定义强调色；配方态不被 flat 重写（applyTheme 会清 currentRecipeId）。 */
const applyThemeIfReady = (): void => {
  const recipe = resolveActiveRecipe();
  if (recipe) {
    applyRecipeForConfig(recipe);
    return;
  }
  const theme = getCurrentTheme();
  if (!theme) return;
  applyTheme(theme);
  applyAccentColor(getEffectiveAccentColor());
};

/* ── E5.8#50.19：主题组 helper——配方路径应用 / 播种 / 覆盖 key 全集（08 §7.2 接线总表） ── */

/** 活动配方解析——引擎活动态优先，配置回退（applyRecipe 未提交但 app.theme 已设的场景） */
const resolveActiveRecipe = (): ThemeRecipe | undefined => {
  // E5.8#50.21：配置回退读时归一化——旧值 "Dark"/"Light" → 壳内置配方 id "dark"/"light"
  const id = getActiveRecipe()?.recipeId ?? normalizeThemeValue(getConfigurationValue<string>("app.theme"));
  return id ? ThemeRegistry.getRecipe(id) : undefined;
};

/** 配方路径应用——按 themeColorMode/themeColor 解析配色 + 同步 app.themeColor 动态 enum（下拉 = 活动配方 colorways）。
 *  overrides 缺省读用户外观配置（getAppearanceOverrides，applyRecipe 内置）。 */
const applyRecipeForConfig = (recipe: ThemeRecipe): void => {
  const mode = (getConfigurationValue("app.themeColorMode") as string) ?? "followTheme";
  const storedColor = getConfigurationValue<string>("app.themeColor");
  const colorwayId = mode === "custom" && storedColor ? storedColor : undefined;
  applyRecipe(recipe, colorwayId);
  applyAccentColor(getEffectiveAccentColor());
  updateConfigurationEnum("app.themeColor", recipe.colorways.map((c) => c.id));
};

/** 外观覆盖 key 全集——切回 followTheme 删除（覆盖丢弃回配方，08 §7.3.5） */
const APPEARANCE_OVERRIDE_KEYS = [
  "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
  "app.glassTint", "app.backgroundImage", "app.fontFamily",
] as const;

/** 混搭来源 key 全集——mixMode→mix 播种全 "theme"（#50.26 做实际按域合并，此处仅注册 + 播种） */
const MIX_SOURCE_KEYS = [
  "app.mixColor", "app.mixFont", "app.mixRadius", "app.mixGlass", "app.mixBackground", "app.mixSurface",
] as const;

/**
 * 播种外观覆盖——appearanceMode→custom 瞬间读 getEffectiveTokens() 反推 6 覆盖 key（08 §2，对标 accent 播种先例）。
 * 反推计算委托 ThemeEngine.deriveAppearanceSeeds（纯函数，测试直测）；本处只组装来源 + 落配置。
 */
const seedAppearanceOverrides = (): void => {
  const tokens = getEffectiveTokens();
  const recipe = resolveActiveRecipe();
  const themeRadiusPx = recipe?.appearance?.radius?.md ?? parseFloat(getBaseRadius()["radius-md"] ?? "0");
  const seeds = deriveAppearanceSeeds(tokens, themeRadiusPx);
  setConfigurationValue("app.surfaceRadius", seeds.surfaceRadius, "user");
  setConfigurationValue("app.glassBlur", seeds.glassBlur, "user");
  setConfigurationValue("app.glassOpacity", seeds.glassOpacity, "user");
  setConfigurationValue("app.glassTint", seeds.glassTint, "user");
  setConfigurationValue("app.backgroundImage", seeds.backgroundImage, "user");
  setConfigurationValue("app.fontFamily", seeds.fontFamily, "user");
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

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组。
      // E5.8#50.19：app.theme + 5 外观覆盖 key 已迁入「主题」组（第二贡献 pluginId "appearance"，08 §5 决策 D）。
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

      // ── E5.8#50.19：主题组——壳注册第二配置贡献（08 §5 决策 D：pluginId "appearance"，标题「主题」）。
      //    key 全表 = app.theme + 配色三件 + 外观六覆盖 + 混搭七键（08 §1/§6 行序 = mockup DOM 顺序）。
      //    显隐 = dependsOn 声明驱动（appearanceMode=custom 显 6 覆盖行，mixMode=mix 显 6 来源行）；
      //    播种 = 设置层永远只存用户偏离量（08 §2）——切 custom 反推播种，切回 followTheme 删覆盖回配方。
      //    app.theme 枚举 = 配方 id + flat 退路（syncAppThemeEnum 注册/注销时同步，动态配方 id 列表 08 §7.2 #1）。
      registerConfiguration("appearance", {
        title: t("主题"),
        properties: {
          "app.theme": {
            type: "string",
            // 初始枚举 = 配方 id + flat 名（与 syncAppThemeEnum 同构——StrictMode remount 幂等）；
            // 注册时 fallback 配方已登记（dark/light），插件配方加载后 syncAppThemeEnum 持续刷新
            default: "dark",
            enum: (() => {
              const ids = ThemeRegistry.getRecipes().map((r) => r.id);
              const names = getAvailableThemes().filter((n) => !ids.includes(n));
              const available = [...ids, ...names];
              return available.length ? available : ["dark"];
            })(),
            description: t("主题配方——选择配色与外观来源（配方卡片）"),
            onApply: async (v) => {
              // E5.8#50.21：旧值归一化——"Dark"/"Light"（legacy flat）→ 壳内置配方 id "dark"/"light"
              const value = normalizeThemeValue(v as string) ?? (v as string);
              const recipe = ThemeRegistry.getRecipe(value);
              if (recipe) {
                // 配方路径——按 themeColorMode/themeColor 解析配色 + 合并外观覆盖
                applyRecipeForConfig(recipe);
              } else {
                // flat 桥接——未迁移 json 名（决策 F 迁移期退路；#50.25 后仅剩配方路径）
                const theme = await loadTheme(value);
                applyTheme(theme);
                applyAccentColor(getEffectiveAccentColor());
              }
            },
          },
          "app.themeColorMode": {
            type: "string",
            default: "followTheme",
            enum: ["followTheme", "custom"],
            description: t("配色模式——跟随主题配方配色 / 手动选择配色变体"),
            onApply: (v) => {
              // 切 custom → 播种 app.themeColor = 活动配方首个配色 id（08 §7.2 #2）
              if (v === "custom") {
                const recipe = resolveActiveRecipe();
                if (recipe?.colorways[0]?.id) {
                  setConfigurationValue("app.themeColor", recipe.colorways[0].id, "user");
                  updateConfigurationEnum("app.themeColor", recipe.colorways.map((c) => c.id));
                }
              }
              applyThemeIfReady();
            },
          },
          "app.themeColor": {
            type: "string",
            default: "",
            description: t("配色变体——活动主题配方的可用配色"),
            dependsOn: { key: "app.themeColorMode", value: "custom" },
            // 枚举 = 活动配方 colorways（applyRecipeForConfig 每次应用同步）——#50.23 optionsFrom 泛化前的注册表实现
            onApply: () => applyThemeIfReady(),
          },
          "app.appearanceMode": {
            type: "string",
            default: "followTheme",
            enum: ["followTheme", "custom"],
            description: t("外观模式——跟随主题配方外观 / 手动覆盖外观"),
            onApply: (v) => {
              if (v === "custom") {
                // 切 custom → 读 getEffectiveTokens() 反推播种 6 覆盖 key（非归零，08 §2 对标 accent 播种）
                seedAppearanceOverrides();
              } else {
                // 切回 followTheme → 覆盖丢弃回配方（08 §7.3.5）——删 6 覆盖 key
                for (const key of APPEARANCE_OVERRIDE_KEYS) resetConfigurationValue(key, "user");
              }
              applyThemeIfReady();
            },
          },
          // 外观六覆盖——dependsOn appearanceMode=custom 才出现（08 §7.1 #5-10）。
          // neutral 默认值 = 不覆盖主题基线；onApply 统一走 applyThemeIfReady（单一写入点）。
          "app.surfaceRadius": {
            type: "number",
            default: 1,
            minimum: 0.5,
            maximum: 2,
            description: t("界面圆角缩放——1 主题默认，0.5 半角锐利，2 圆润"),
            uiHint: "slider",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.glassBlur": {
            type: "number",
            default: 0,
            minimum: 0,
            maximum: 32,
            description: t("玻璃模糊——0 关闭，数值越大背景越模糊"),
            uiHint: "slider",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.glassOpacity": {
            type: "number",
            default: 1,
            minimum: 0,
            maximum: 1,
            description: t("玻璃不透明度——1 不透明，越小越透明"),
            uiHint: "slider",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.glassTint": {
            type: "string",
            default: "",
            description: t("玻璃叠加色——空 = 主题自带"),
            renderHint: "color",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.backgroundImage": {
            type: "string",
            default: "",
            description: t("窗口背景图片路径——空 = 主题自带"),
            uiHint: "image", // E5.8#50.11：专属「选择图片」控件（选图→拷贝入库→受控路径持久化）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.fontFamily": {
            type: "string",
            default: "",
            description: t("界面字体——空 = 跟随主题；选择后写 --font-ui"),
            // E5.8#50.20：全字族化 FontFamilySelect（monoOnly:false 列全族非等宽）——
            // onApply 覆盖面单一写入点 getAppearanceOverrides 读本 key 写 --font-ui
            uiHint: "fontFamily",
            monoOnly: false,
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          // 混搭七键——mixMode 常显，六域来源 mixMode=mix 才出现（08 §7.1 #11-17）。
          // mix* 的按域合并实现在 #50.26——此处仅注册 + 播种 + dependsOn 显隐。
          "app.mixMode": {
            type: "string",
            default: "recipe",
            enum: ["recipe", "mix"],
            description: t("混搭模式——单一主题配方 / 按域混搭多个主题来源"),
            onApply: (v) => {
              // 切 mix → 播种 6 域来源 = "theme"（跟随主题，08 §7.2 #11）
              if (v === "mix") {
                for (const key of MIX_SOURCE_KEYS) setConfigurationValue(key, "theme", "user");
              }
            },
          },
          "app.mixColor": {
            type: "string",
            default: "followTheme",
            description: t("配色域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
          },
          "app.mixFont": {
            type: "string",
            default: "followTheme",
            description: t("字体域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
          },
          "app.mixRadius": {
            type: "string",
            default: "followTheme",
            description: t("圆角域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
          },
          "app.mixGlass": {
            type: "string",
            default: "followTheme",
            description: t("玻璃域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
          },
          "app.mixBackground": {
            type: "string",
            default: "followTheme",
            description: t("背景域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
          },
          "app.mixSurface": {
            type: "string",
            default: "followTheme",
            description: t("表面域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
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
      // E5.8#50.21：旧值归一化 + 落盘——workspace/user 里 legacy "Dark"/"Light" 启动即转 "dark"/"light"
      // （映射表，不弹窗不重置；getConfigurationValue 会经 enum 校验把 legacy 值读成默认，须 inspect 取原始值）
      const inspectedTheme = inspectConfiguration<string>("app.theme");
      const rawTheme = inspectedTheme.workspaceValue ?? inspectedTheme.userValue ?? "dark";
      const initTheme = normalizeThemeValue(rawTheme) ?? "dark";
      if (initTheme !== rawTheme) {
        const scope = inspectedTheme.workspaceValue !== undefined ? "workspace" : "user";
        setConfigurationValue("app.theme", initTheme, scope)
          .catch((e) => { console.error("[startup] app.theme 迁移落盘失败:", e); });
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
