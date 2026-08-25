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
  mergeDomains, // E5.8#85 补课：迁移取主题基准 token（无 overrides；缺 radius 域回退壳默认在公式内）
  getAvailableThemes,
  getCurrentTheme,
  deriveAppearanceSeeds,
  deriveRadiusAbsoluteMigration, // E5.8#85 补课：旧圆角倍数→绝对 px 迁移公式
  normalizeThemeValue,
  syncThemeColorConfig,
  APPEARANCE_OVERRIDE_KEYS,
  MIX_FOLLOW_THEME,
} from "../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import type { ThemeRecipe } from "../core/types/theme"; // E5.8#50.19：配方路径应用 helper 的类型标注
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "../pluginLoader/loader";
import { factorySlots } from "../core/services/bootstrap/FactorySlots";
import {
  getConfigurationValue, setConfigurationValue, resetConfigurationValue, inspectConfiguration,
  setConfigurationValueBatch, resetConfigurationValueBatch,
} from "../core/services/configuration/ConfigurationService";
import { registerConfiguration, updateConfigurationEnum, getMergedSchema } from "../core/registry/ConfigurationRegistry";
import {
  registerConfigMigration, // E5.8#85 补课：schema 版本迁移登记——未来语义切换的唯一入口（勿再手写一次性块）
  runPendingConfigMigrations,
} from "../core/services/configuration/schemaMigrations";
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

/** 配方路径应用——app.themeColor 解析配色（E5.8#82：配色域来源统一，无 themeColorMode 包装层）+ 同步动态 enum。
 *  overrides 缺省读用户外观配置（getAppearanceOverrides，applyRecipe 内置）。
 *  E5.8#70：enum 同步后回写生效配色 id——选主题后 app.themeColor 立即显示真实配色非空（bug 7 复制为空 +
 *  #60 F1.2 下拉谎报同源修复；详见 ThemeEngine.syncThemeColorConfig）。
 *  E5.8#82：themeColor 双语义——recipe 模式 = 配方内配色变体 id；mix 模式 = colors 域来源（配方 id / "followTheme"）。
 *  applyRecipe 的 colorwayId 参数只对 recipe 模式有选配语义；mix 模式来源由 mergeMixDomains 按 MIX_DOMAIN_KEYS 读。 */
const applyRecipeForConfig = (recipe: ThemeRecipe): void => {
  const storedColor = getConfigurationValue<string>("app.themeColor");
  // recipe 模式：配色变体 id（空 / 残留 "followTheme" → 配方首配色）；mix 模式：来源配方 id 被 resolveColorway
  // 找不到 → 自然回退首配色，颜色域实际由混搭合并按来源取（两者解耦，不互踩）
  const colorwayId = storedColor && storedColor !== MIX_FOLLOW_THEME ? storedColor : undefined;
  applyRecipe(recipe, colorwayId);
  applyAccentColor(getEffectiveAccentColor());
  updateConfigurationEnum("app.themeColor", recipe.colorways.map((c) => c.id));
  syncThemeColorConfig(recipe);
};

/** 外观覆盖 key 全集——切回 followTheme 批量删除（覆盖丢弃回配方，08 §7.3.5）。
 *  E5.8#60 F1.1：单一来源 ThemeEngine.APPEARANCE_OVERRIDE_KEYS——插件 API theme.resetAppearance 共用本表
 *  （曾只清 5 键漏 app.fontFamily → 第三方复位外观后字体不回基线，12 档案 §#60）。 */

/** 混搭来源 key 全集——mixMode→mix 播种全 "followTheme"（与 ThemeEngine MIX_DOMAIN_KEYS 同源）。
 *  E5.8#82：colors 域来源统一为 app.themeColor（app.mixColor 删除）——六域来源 key 对称。 */
const MIX_SOURCE_KEYS = [
  "app.themeColor", "app.mixFont", "app.mixRadius", "app.mixGlass", "app.mixBackground", "app.mixSurface",
] as const;

/** 混搭复位禁用条件——6 来源全「跟随主题」时复位按钮置灰（10 §6 决策记录 3，mockup 已实现） */
const MIX_RESET_DISABLED_WHEN = MIX_SOURCE_KEYS.map((key) => ({ key, value: "followTheme" }));

/**
 * 播种外观覆盖——appearanceMode→custom 瞬间读 getEffectiveTokens() 反推 6 覆盖 key（08 §2，对标 accent 播种先例）。
 * 反推计算委托 ThemeEngine.deriveAppearanceSeeds（纯函数，测试直测）；本处只组装来源 + 落配置。
 */
const seedAppearanceOverrides = (): void => {
  const tokens = getEffectiveTokens();
  // E5.8#85：播种反推改绝对——直接从生效 token 读实际 px（mix 下 token 即混搭来源生效值，天然含
  // #57 二次缩放根治——比例模型分母概念随 getRadiusSourcePx 一并废弃）。切 custom 视觉状态不变（播种 = 当前生效值直播）。
  const seeds = deriveAppearanceSeeds(tokens);
  // E5.8#59（审计#7）：九键一次批量写 + 单次 applier——原 6 连 setConfigurationValue 各触发
  // 一次 applyRecipe 全量重合并 + theme:changed 广播（6× 广播，脱出窗多池放大中间态闪变）。
  // 各覆盖 key onApply 均 applyThemeIfReady 全量读生效态 → 末 key 触发读到完整终态一次广播即收敛。
  // E5.8#85：+zoneRadiusScale 播种当前 surface-radius 绝对 px（切 custom zone 圆角视觉不变）。
  // E5.8#81：+zoneBackgroundImage——zones 模式反推当前 zone 图 / 纹理模式空 = 跟随主题（视觉不变）。
  setConfigurationValueBatch([
    { key: "app.surfaceRadius", value: seeds.surfaceRadius },
    { key: "app.glassBlur", value: seeds.glassBlur },
    { key: "app.glassOpacity", value: seeds.glassOpacity },
    { key: "app.glassTint", value: seeds.glassTint },
    { key: "app.backgroundImage", value: seeds.backgroundImage },
    { key: "app.fontFamily", value: seeds.fontFamily },
    { key: "app.zoneRadius", value: true },
    { key: "app.zoneRadiusScale", value: seeds.zoneRadiusPx },
    { key: "app.zoneBackgroundImage", value: seeds.zoneBackgroundImage },
  ], "user");
};

/* ── E5.8#85 补课：schema 版本迁移登记（14-档案 §五 #85 + schemaMigrations.ts） ──
 * 旧 settings.json 圆角倍数（1.15/1.36）在 #85 绝对化后被读成 ~1px——启动跑迁移换算为绝对 px。
 * 公式 deriveRadiusAbsoluteMigration：主题基准 token × 原始倍数（CDP 实测纠偏——不能读 effective token：
 *   post-init 时 #85 代码已把旧倍数误读应用，effective 是被污染视觉；基准 = mergeDomains 无 overrides）。
 * 未来语义切换（#86 glass / #87 清除 / #91 fontTone）在此链路 registerConfigMigration 登记——勿再手写一次性块。 */
registerConfigMigration({
  version: 2,
  name: "E5.8#85 radius-multiplier-to-absolute-px",
  migrate: async ({ setMany }) => {
    const surfaceRadius = inspectConfiguration<number>("app.surfaceRadius").userValue;
    const zoneRadiusScale = inspectConfiguration<number>("app.zoneRadiusScale").userValue;
    // 主题基准 token——mergeDomains 无 overrides（主题原生 radius 域）；缺 radius → 壳默认（旧 source || base 同基准）
    const active = getActiveRecipe();
    const recipe = active ? ThemeRegistry.getRecipe(active.recipeId) : undefined;
    const baseTokens = active && recipe ? mergeDomains(recipe, active.colorwayId || undefined) : {};
    setMany(deriveRadiusAbsoluteMigration({ surfaceRadius, zoneRadiusScale }, baseTokens));
  },
});

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
      // E5.8#79：app.accentMode/accentColor 强调色也迁入「主题」组（accent 本质 = 主题色域颜色覆盖）。
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

      // ── E5.8#50.19：主题组——壳注册第二配置贡献（08 §5 决策 D：pluginId "appearance"，标题「主题」）。
      //    key 全表 = app.theme + app.themeColor（E5.8#82 配色域来源统一，themeColorMode/mixColor 已删）+ 外观六覆盖 + 混搭六键（08 §1/§6 行序 = mockup DOM 顺序）。
      //    显隐 = dependsOn 声明驱动（appearanceMode=custom 显 6 覆盖行，mixMode=mix 显 6 来源行）；
      //    播种 = 设置层永远只存用户偏离量（08 §2）——切 custom 反推播种，切回 followTheme 删覆盖回配方。
      //    app.theme 枚举 = 配方 id + flat 退路（syncAppThemeEnum 注册/注销时同步，动态配方 id 列表 08 §7.2 #1）。
      //    E5.8#78 组内二级标题——每 key 声明 group（5 分节：整体配方/配色/强调色/外观覆盖/域混搭），
      //    SettingsView 按 group 归到子标题下渲染（无 group 平铺原样，第三方设置零侵入）。
      registerConfiguration("appearance", {
        title: t("主题"),
        properties: {
          "app.theme": {
            type: "string",
            group: t("整体配方"), // E5.8#78：组内二级标题——主题组分节 1/5（整体配方）
            // E5.8#50.22：uiHint 声明卡片控件——设置页 renderControl "themePicker" 分支渲染配方卡片
            // （数据走 linkdesk.theme.listRecipes，选中写回本 key 走下方 onApply 应用配方）
            uiHint: "themePicker",
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
                // 配方路径——按 app.themeColor 解析配色（E5.8#82 配色域来源统一）+ 合并外观覆盖
                applyRecipeForConfig(recipe);
              } else {
                // flat 桥接——未迁移 json 名（决策 F 迁移期退路；#50.25 后仅剩配方路径）
                const theme = await loadTheme(value);
                applyTheme(theme);
                applyAccentColor(getEffectiveAccentColor());
                // E5.8#70：flat 主题无配色概念——清 stale app.themeColor（曾写入配方/主题 id →
                // 读时 enum 校验告警 + 复制/展示旧值）。enum 置空 + 删用户值（含旧配方配色，flat 下无意义）。
                updateConfigurationEnum("app.themeColor", []);
                await resetConfigurationValue("app.themeColor", "user");
              }
            },
          },
          // E5.8#82：配色域来源统一——app.themeColor 双语义（无 themeColorMode 包装层）：
          //   recipe 模式 = 当前配方内配色变体（optionsFrom theme.colorways，单配色主题控件自隐）；
          //   mix 模式   = colors 域来源（壳 UI 按 app.mixMode 动态切 theme.sources + colors 域，见 renderControl select 分支）。
          "app.themeColor": {
            type: "string",
            group: t("配色"), // E5.8#78：组内二级标题——主题组分节 2/5（配色）
            default: "",
            description: t("配色变体——活动主题配方的可用配色"),
            // 枚举仍由 applyRecipeForConfig 每次应用同步（第三方设置 UI 读取 + setConfigurationValue 校验）；壳 UI 走 optionsFrom 动态取。
            uiHint: "select",
            optionsFrom: "theme.colorways",
            optionsFromDomain: "colors",
            onApply: () => applyThemeIfReady(),
          },
          // E5.8#79：强调色移入主题组——accent 本质 = 主题色域的颜色覆盖（与 glassTint 同类），
          // 注册归属从「通用」迁至 pluginId "appearance"（设置页主题组下展示，对标用户想法 7）。
          // key 名不变 → 旧 settings.json 的 app.accentMode/app.accentColor 值仍在读（向后兼容），
          // getEffectiveAccentColor 读配置按 key 名（非注册组）——功能链路零改动。
          "app.accentMode": {
            type: "string",
            group: t("强调色"), // E5.8#78：组内二级标题——主题组分节 3/5（强调色）
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
            group: t("强调色"),
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
          "app.appearanceMode": {
            type: "string",
            group: t("外观覆盖"), // E5.8#78：组内二级标题——主题组分节 4/5（外观覆盖）
            default: "followTheme",
            enum: ["followTheme", "custom"],
            description: t("外观模式——跟随主题配方外观 / 手动覆盖外观"),
            onApply: (v) => {
              if (v === "custom") {
                // 切 custom → 读 getEffectiveTokens() 反推播种 6 覆盖 key（非归零，08 §2 对标 accent 播种）
                seedAppearanceOverrides();
              } else {
                // 切回 followTheme → 覆盖丢弃回配方（08 §7.3.5）——删 6 覆盖 key（批量复位单次 applier）
                resetConfigurationValueBatch(APPEARANCE_OVERRIDE_KEYS, "user");
              }
              // E5.8#59：播种/复位批量 API 已触发单次 applier（末 key 全量读生效态）——不再补
              // applyThemeIfReady 避免二次广播（原 6 连写 + 尾部补调 = 7 次 theme:changed）
            },
          },
          // 外观六覆盖——dependsOn appearanceMode=custom 才出现（08 §7.1 #5-10）。
          // neutral 默认值 = 不覆盖主题基线；onApply 统一走 applyThemeIfReady（单一写入点）。
          "app.surfaceRadius": {
            type: "number",
            group: t("外观覆盖"),
            default: 0,
            minimum: 0,
            maximum: 32,
            description: t("组件圆角——系统标尺 0 方角 / 32 最圆润；数值 = 标准组件圆角 px"),
            uiHint: "slider",
            unit: "px", // E5.8#85：值标签像素单位（绝对 px，非倍数）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.glassBlur": {
            type: "number",
            group: t("外观覆盖"),
            default: 0,
            minimum: 0,
            maximum: 32,
            description: t("玻璃模糊——0 关闭，数值越大背景越模糊"),
            uiHint: "slider",
            unit: "px", // E5.8#77：值标签像素单位（mockup 16px）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.glassOpacity": {
            type: "number",
            group: t("外观覆盖"),
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
            group: t("外观覆盖"),
            default: "",
            description: t("玻璃叠加色——空 = 主题自带"),
            renderHint: "color",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.backgroundImage": {
            type: "string",
            group: t("外观覆盖"),
            default: "",
            description: t("窗口背景图片路径——空 = 主题自带"),
            uiHint: "image", // E5.8#50.11：专属「选择图片」控件（选图→拷贝入库→受控路径持久化）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.fontFamily": {
            type: "string",
            group: t("外观覆盖"),
            default: "",
            description: t("界面字体——空 = 跟随主题；选择后写 --font-ui"),
            // E5.8#50.20：全字族化 FontFamilySelect（monoOnly:false 列全族非等宽）——
            // onApply 覆盖面单一写入点 getAppearanceOverrides 读本 key 写 --font-ui
            uiHint: "fontFamily",
            monoOnly: false,
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          // E5.8#85：zone 圆角绝对化——app.zoneRadius 开关 + app.zoneRadiusScale 绝对 px（用户想法 1/2、痛点 2）：
          //   组件圆角（radius-*）由 app.surfaceRadius 绝对 px 控，zone 圆角（surface-radius）由这两键独立控（两轴解耦，
          //   同走系统标尺 0→32）。消费 = getAppearanceOverrides 读本键 → applyOverrides ①b 通道直写 / "0px" 开关短路（ThemeEngine.ts）。
          "app.zoneRadius": {
            type: "boolean",
            group: t("外观覆盖"),
            default: true,
            description: t("分区圆角开关——关闭后各分区强制直角（0px）"),
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          "app.zoneRadiusScale": {
            type: "number",
            group: t("外观覆盖"),
            default: 0,
            minimum: 0,
            maximum: 32,
            description: t("分区圆角——系统标尺 0 方角 / 32 最圆润；数值 = 分区圆角 px"),
            uiHint: "slider",
            unit: "px", // E5.8#85：值标签像素单位（绝对 px，非倍数）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          // E5.8#81：zone 表面背景覆盖入口——image 控件选图写 --surface-bg-image（与全窗 --bg-image 并存：
          // 全窗垫底 + zone 浮 surface 表面，缝隙/透明处露全窗 = 预期；痛点 12 双背景语义）。
          // 消费 = getAppearanceOverrides 读本键 → surface-bg-image + zones=1（池侧量测 zone 坐标）。
          "app.zoneBackgroundImage": {
            type: "string",
            group: t("外观覆盖"),
            default: "",
            description: t("分区背景图片路径——空 = 主题自带；选择后浮各分区表面"),
            uiHint: "image",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => applyThemeIfReady(),
          },
          // 混搭七键 + 复位——mixMode 常显，六域来源 + 复位 mixMode=mix 才出现（08 §7.1 #11-17）。
          // mix* 按域合并实现在 ThemeEngine（#50.26 mergeMixDomains）——此处注册 + 播种 + dependsOn 显隐。
          // 六域来源 = uiHint "select" + optionsFrom "theme.sources"（#50.23 动态下拉按域过滤 listRecipes）；
          // onApply = applyThemeIfReady（换来源即重合并 + 广播 theme:changed，10 §2 实时预览）。
          // 「跟随主题」哨兵值 = "followTheme"（10-混搭设计 §1/§3 定稿；缺省与播种同一值）。
          "app.mixMode": {
            type: "string",
            group: t("域混搭"), // E5.8#78：组内二级标题——主题组分节 5/5（域混搭）
            default: "recipe",
            enum: ["recipe", "mix"],
            description: t("混搭模式——单一主题配方 / 按域混搭多个主题来源"),
            onApply: (v) => {
              // 切 mix → 播种 6 域来源 = "followTheme"（跟随整体配方，10 §2/08 §7.2 #11，批量写单次 applier）
              if (v === "mix") {
                setConfigurationValueBatch(
                  MIX_SOURCE_KEYS.map((key) => ({ key, value: "followTheme" })),
                  "user"
                );
              } else {
                // 切回 recipe → 来源清空回默认（08 §7.3.5 对称于外观复位——theme.resetMix 单一写入点，批量复位单次 applier）
                resetConfigurationValueBatch(MIX_SOURCE_KEYS, "user");
              }
              // E5.8#59：批量 API 末 key applier 全量读生效态（含 mixMode 本键）——引擎读 mixMode
              // 决定按域合并路径（#50.26），不再补 applyThemeIfReady 避免二次广播
            },
          },
          // E5.8#82：colors 域来源并入 app.themeColor（app.mixColor 删除）——六域来源 key 对称，
          // mix 模式下壳 UI 将 app.themeColor 渲染为 theme.sources + colors 域（DynamicSelect 双语义自解析：
          // schema 静态声明 colorways+colors，运行时读 app.mixMode 决定 recipe/mix 路径，renderControl 零改动）。
          "app.mixFont": {
            type: "string",
            group: t("域混搭"),
            default: "followTheme",
            description: t("字体域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "font",
            onApply: () => applyThemeIfReady(),
          },
          "app.mixRadius": {
            type: "string",
            group: t("域混搭"),
            default: "followTheme",
            description: t("圆角域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "radius",
            onApply: () => applyThemeIfReady(),
          },
          "app.mixGlass": {
            type: "string",
            group: t("域混搭"),
            default: "followTheme",
            description: t("玻璃域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "glass",
            onApply: () => applyThemeIfReady(),
          },
          "app.mixBackground": {
            type: "string",
            group: t("域混搭"),
            default: "followTheme",
            description: t("背景域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "background",
            onApply: () => applyThemeIfReady(),
          },
          "app.mixSurface": {
            type: "string",
            group: t("域混搭"),
            default: "followTheme",
            description: t("表面域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.mixMode", value: "mix" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "surface",
            onApply: () => applyThemeIfReady(),
          },
          // 混搭复位按钮（10 §2/§6 决策记录 3）——renderHint "action" 渲染操作按钮；
          // 点击执行 theme.resetMix 命令（单一写入点：app.mixMode→recipe → onApply 清 6 来源回跟随主题）。
          // actionDisabledAll：6 来源全「跟随主题」→ 置灰（mockup 已实现，减少噪音）。
          "app.mixReset": {
            type: "string",
            group: t("域混搭"),
            default: "",
            description: t("⟲ 全部复位为整体配方"),
            renderHint: "action",
            actionCommand: "theme.resetMix",
            dependsOn: { key: "app.mixMode", value: "mix" },
            actionDisabledAll: MIX_RESET_DISABLED_WHEN,
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
      // #82 themeColorMode 是迁移机制落位前的历史一次性先例；此后语义切换一律 registerConfigMigration 登记。
      try {
        await runPendingConfigMigrations();
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
