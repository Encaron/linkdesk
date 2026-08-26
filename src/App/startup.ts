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
  deriveAppearanceSeedMap, // E5.8#88：外观覆盖 13 键播种值全集映射（切主题重播种 + 已修改徽标基准共用）
  deriveReseedPlan, // E5.8#88：切主题重播种计划（纯函数——显式修改保留 / 未修改随新主题重基线）
  getThemeBaseTokens, // E5.8#88：主题/混搭基准 token（无外观覆盖——重播种「按新主题反推」的纯基准）
  getAppliedAccent, // E5.8#88 C4：最近应用强调色（仅 v4 迁移物化用；#98 强调色独立轴后播种不再走它）
  deriveRadiusAbsoluteMigration, // E5.8#85 补课：旧圆角倍数→绝对 px 迁移公式
  deriveGlassOpacityAbsoluteMigration, // E5.8#86：旧 wash 语义→绝对透明度迁移公式
  resolveMergedAppearanceMode, // E5.8#90：旧三枚举→单一外观模式轴迁移公式
  normalizeThemeValue,
  syncThemeColorConfig,
  APPEARANCE_OVERRIDE_KEYS,
  MIX_FOLLOW_THEME,
  MIX_SOURCE_KEYS, // E5.8#90：混搭来源 key 全集——单一来源 ThemeEngine（原本地常量改 import）
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

/** E5.8#89 E1：外观 onApply 防抖窗口——与 settings.json watcher 去抖（ConfigurationService 80ms）同哲学 */
const APPEARANCE_APPLY_DEBOUNCE_MS = 80;

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

/* ── E5.8#89 E1：滑杆 onApply 防抖——拖拽连发收敛为单次重算 + 单次广播 ──
 * 背景：设置页滑杆/色块每像素 input → setConfigurationValue → onApply → applyThemeIfReady
 * 全量重合并（commitTokens 写 :root + theme:changed 广播到全部池）——拖 1s ≈ 60 次全量重算 + 60 次广播。
 * 本防抖：尾沿 80ms——松手/停止后再触发一次 apply；内存值仍逐 tick 同步（setConfigurationValue
 * 先写内存），去抖只推迟「重算 + 广播」，读路径永远读到最新值。fire 时读生效配置 = 拖拽终态，一次收敛。
 * 对标：settings.json watcher 去抖（ConfigurationService）同 80ms 尾沿哲学。 */
let _appearanceApplyTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedApplyThemeIfReady = (): void => {
  if (_appearanceApplyTimer) clearTimeout(_appearanceApplyTimer);
  _appearanceApplyTimer = setTimeout(() => {
    _appearanceApplyTimer = null;
    applyThemeIfReady();
  }, APPEARANCE_APPLY_DEBOUNCE_MS);
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

/** 混搭复位禁用条件——6 来源全「跟随主题」时复位按钮置灰（10 §6 决策记录 3，mockup 已实现） */
const MIX_RESET_DISABLED_WHEN = MIX_SOURCE_KEYS.map((key) => ({ key, value: "followTheme" }));

/**
 * 播种外观覆盖——appearanceMode→custom 瞬间读 getEffectiveTokens() 反推 9 覆盖 key（08 §2，对标 accent 播种先例）。
 * 反推计算委托 ThemeEngine.deriveAppearanceSeedMap（单写点：进 custom + 切主题共用同一映射/哲学，14-档案 #88）。
 *  E5.8#85：播种反推改绝对——直接从生效 token 读实际 px（mix 下 token 即混搭来源生效值，天然含
 *  #57 二次缩放根治——比例模型分母概念随 getRadiusSourcePx 一并废弃）。切 custom 视觉状态不变（播种 = 当前生效值直播）。
 *  E5.8#59（审计#7）：九键一次批量写 + 单次 applier——原 6 连 setConfigurationValue 各触发
 *  一次 applyRecipe 全量重合并 + theme:changed 广播（6× 广播，脱出窗多池放大中间态闪变）。
 *  各覆盖 key onApply 均 applyThemeIfReady 全量读生效态 → 末 key 触发读到完整终态一次广播即收敛。
 *  E5.8#85：+zoneRadiusScale 播种当前 surface-radius 绝对 px（切 custom zone 圆角视觉不变）。
 *  E5.8#81：+zoneBackgroundImage——zones 模式反推当前 zone 图 / 纹理模式空 = 跟随主题（视觉不变）。
 */
const seedAppearanceOverrides = (): void => {
  const seedMap = deriveAppearanceSeedMap(getEffectiveTokens());
  // E5.8#98：强调色不入播种批——accentSource 独立轴，切 custom 不物化强调色（跟随主题就保持跟随，
  // 自定义就已是自定义色）。旧 #90 逻辑「取引擎追踪强调色 getAppliedAccent 物质化为槽值」随强调色解耦
  // 作废——若仍播种，followTheme 用户的 accentColor 被写进一个永不生效的值（14-档案 §十二）。
  // 注意不能用 getEffectiveAccentColor()——此刻模式已切 custom，读到的已是旧 app.accentColor。
  const writes: Array<{ key: string; value: unknown }> = APPEARANCE_OVERRIDE_KEYS.map((key) => ({ key, value: seedMap[key] }));
  setConfigurationValueBatch(writes, "user");
};

/** E5.8#88：当前用户外观覆盖值（raw user scope）——切主题重播种的「显式修改」判定集 */
const readAppearanceOverrideUserValues = (): Record<string, unknown> => {
  const stored: Record<string, unknown> = {};
  for (const key of APPEARANCE_OVERRIDE_KEYS) {
    const uv = inspectConfiguration<unknown>(key).userValue;
    if (uv !== undefined) stored[key] = uv;
  }
  return stored;
};

/**
 * E5.8#88 切主题重播种（策略 A，14-档案 #88）：custom 模式下切主题 = 重新播种——用户显式改过的值保留，
 * 未修改的覆盖随新主题重基线（deriveReseedPlan 纯函数）。旧基准须在应用新配方前冻结（getThemeBaseTokens 无覆盖）。
 */
const reseedAppearanceOnThemeSwitch = async (
  oldBaseline: Record<string, unknown>,
  stored: Record<string, unknown>
): Promise<void> => {
  const newBaseline = deriveAppearanceSeedMap(getThemeBaseTokens());
  const writes = deriveReseedPlan(oldBaseline, newBaseline, stored);
  if (writes.length) {
    // #59 同款：批量写单次持久化 + 单次 applier（末 key 全量读生效态一次广播收敛）
    await setConfigurationValueBatch(writes, "user");
  }
};

/* ── E5.8#85 补课：schema 版本迁移登记（14-档案 §五 #85 + schemaMigrations.ts） ──
 * 旧 settings.json 圆角倍数（1.15/1.36）在 #85 绝对化后被读成 ~1px——启动跑迁移换算为绝对 px。
 * 公式 deriveRadiusAbsoluteMigration：主题基准 token × 原始倍数（CDP 实测纠偏——不能读 effective token：
 *   post-init 时 #85 代码已把旧倍数误读应用，effective 是被污染视觉；基准 = mergeDomains 无 overrides）。
 * 未来语义切换（#87 清除 / #91 fontTone）在此链路 registerConfigMigration 登记——勿再手写一次性块。 */
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

// E5.8#86：glassOpacity 语义绝对化（14-档案 §五 #86）——旧 wash 语义（tint 层 opacity = 值×0.5，index.css:453）
// 存量值换算为绝对透明度（×0.5，视觉零变化）。公式 deriveGlassOpacityAbsoluteMigration（ThemeEngine.ts 纯函数，
//   同 #85 先例）；presence 门控：未写过（userValue undefined）→ 零变更，跟随新 schema 默认 0.5（旧默认 1 的
//   wash 视觉恰好同值，未写用户视觉零变化）。
// glassTint 不迁：「alpha 再降一档」是 wash ×0.5 的产物非独立颜色变换（色值直写，无压缩代码）——去 ×0.5 后
//   有效强度自然 = 用户所选 alpha（正是 #86 定案第 2 点）。glassBlur 不迁：px 语义不变，仅每表面系数声明化。
registerConfigMigration({
  version: 3,
  name: "E5.8#86 glass-opacity-wash-to-absolute",
  migrate: async ({ setMany }) => {
    const opacity = inspectConfiguration<number>("app.glassOpacity").userValue;
    if (typeof opacity === "number") {
      setMany(deriveGlassOpacityAbsoluteMigration(opacity));
    }
  },
});

// E5.8#90：外观模型合并——旧三枚举（appearanceMode/mixMode/accentMode）归一单一外观轴（14-档案 §四 归一5）。
// 合并规则：resolveMergedAppearanceMode（ThemeEngine 纯函数，公式单测在 ThemeEngine.test）——任一旧枚举
//   表达自定义意图（appearanceMode=custom / mixMode=mix / accentMode=custom）→ 新轴 custom，否则 followTheme。
// 写入条件：已写且值不同 → 重写（followTheme 用户若曾开 mix 升 custom）；未写但有自定义意图 → 补写。
//   已写且值同 → 不写（幂等零变化）。
// 强调色物化：newMode=custom 且 accentColor 未写 且 旧 accentMode 显式 "followTheme" → 写 accentColor =
//   引擎追踪的最近实际应用强调色（getAppliedAccent——旧逻辑下 followTheme 显示主题 accent，防升级跳 #0078d4）。
//   注意不能用 getEffectiveAccentColor()——迁移时外观模式可能仍是旧值（custom），读到的已是自定义兜底。
// deleteMany 删废弃键（app.mixMode/app.accentMode）——残留会在 _validateEnum 对未注册键直通返回（陈旧值
//   可能被未来代码静默读回）。域来源键（app.mix* / app.themeColor）保留——自定义模式下仍按域合并消费。
// 幂等：已迁后重跑 appearanceMode 已在新值 → 不写；mixMode/accentMode 已删 → deleteMany 空操作。
registerConfigMigration({
  version: 4,
  name: "E5.8#90 merge-appearance-mode-axis",
  migrate: async ({ setMany, deleteMany }) => {
    const appearanceMode = inspectConfiguration<string>("app.appearanceMode").userValue;
    const mixMode = inspectConfiguration<string>("app.mixMode").userValue;
    const accentMode = inspectConfiguration<string>("app.accentMode").userValue;
    const accentColor = inspectConfiguration<string>("app.accentColor").userValue;
    const newMode = resolveMergedAppearanceMode({ appearanceMode, mixMode, accentMode });
    if (appearanceMode !== undefined) {
      if (appearanceMode !== newMode) setMany({ "app.appearanceMode": newMode });
    } else if (newMode === "custom") {
      setMany({ "app.appearanceMode": newMode });
    }
    if (newMode === "custom" && accentColor === undefined && accentMode === "followTheme") {
      const applied = getAppliedAccent();
      if (applied) setMany({ "app.accentColor": applied });
    }
    deleteMany(["app.mixMode", "app.accentMode"]);
  },
});

// E5.8#98：强调色独立轴迁移——app.accentSource（跟随主题配方/自定义）从外观主开关解耦（14-档案 §十二）。
// 旧语义（#90 后）：appearanceMode=custom → 强调色已物化进 app.accentColor（播种）→ 来源=自定义保留；
//   followTheme → 强调色跟随主题 → 来源=跟随主题。映射后 accentColor 语义不变（custom 仍读它）。
// 幂等：accentSource 已写 → 不碰；已迁后重跑零写入。
registerConfigMigration({
  version: 5,
  name: "E5.8#98 accent-source-axis",
  migrate: async ({ setMany }) => {
    const accentSource = inspectConfiguration<string>("app.accentSource").userValue;
    if (accentSource !== undefined) return;
    const appearanceMode = inspectConfiguration<string>("app.appearanceMode").userValue;
    setMany({ "app.accentSource": appearanceMode === "custom" ? "custom" : "followTheme" });
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

      // ── E5.8#50.19：主题组——壳注册第二配置贡献（08 §5 决策 D：pluginId "appearance"，标题「主题」）。
      //    key 全表 = app.theme + app.appearanceMode（E5.8#90 单一外观主开关）+ app.themeColor
      //    + 外观 14 覆盖 + 域来源 4 键 + 复位（E5.8#97 域驱动重组后结构）。
      //    显隐 = dependsOn 声明驱动（appearanceMode=custom 显强调色 + 覆盖行 + 来源行 + 复位；文字组
      //    极性槽 fontTone 无 dependsOn 恒显、字体三槽 custom 展开——部分桶显隐 SettingsView 逐 key 过滤）。
      //    播种 = 设置层永远只存用户偏离量（08 §2）——切 custom 反推播种，切回 followTheme 删覆盖回配方。
      //    app.theme 枚举 = 配方 id + flat 退路（syncAppThemeEnum 注册/注销时同步，动态配方 id 列表 08 §7.2 #1）。
      //    E5.8#78 组内二级标题——每 key 声明 group（9 分节：整体配方/配色/强调色/圆角/玻璃/背景/文字/
      //    表面/复位；E5.8#97 外观覆盖/域混搭 两旧分节拆散——数值域来源删键、资产域来源并入域小组），
      //    SettingsView 按 group 归到子标题下渲染（无 group 平铺原样，第三方设置零侵入）。
      registerConfiguration("appearance", {
        title: t("主题"),
        properties: {
          "app.theme": {
            type: "string",
            group: t("整体配方"), // E5.8#78：组内二级标题——主题组分节 1/6（整体配方）
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
                // E5.8#88 切主题重播种（策略 A，14-档案 #88）：custom 外观模式下应用新配方前冻结旧基准 + 用户显式修改集。
                //  旧基准必须用 getThemeBaseTokens（无覆盖纯基线）——读含覆盖的 getEffectiveTokens 会把用户改值
                //  误判为「未改」而重播种掉用户值（#88 设计关键）。启动首 apply（getActiveRecipe null）→ 跳过：
                //  持久化覆盖原样保留，播种只在运行中主题切换发生（此时已有活动配方，基准可算）。
                const reseed =
                  getConfigurationValue<string>("app.appearanceMode") === "custom" &&
                  getActiveRecipe() != null;
                const oldBaseline = reseed
                  ? deriveAppearanceSeedMap(getThemeBaseTokens())
                  : {};
                const stored = reseed ? readAppearanceOverrideUserValues() : {};
                // 配方路径——按 app.themeColor 解析配色（E5.8#82 配色域来源统一）+ 合并外观覆盖
                applyRecipeForConfig(recipe);
                if (reseed) await reseedAppearanceOnThemeSwitch(oldBaseline, stored);
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
          //   跟随主题模式 = 当前配方内配色变体（optionsFrom theme.colorways，单配色主题控件自隐）；
          //   自定义模式   = colors 域来源（D5 语义显性——设置页按外观模式动态切描述，见 14-档案 §四 #90）。
          "app.themeColor": {
            type: "string",
            group: t("配色"), // E5.8#78：组内二级标题——主题组分节 2/6（配色）
            default: "",
            description: t("配色变体——活动主题配方的可用配色"),
            // 枚举仍由 applyRecipeForConfig 每次应用同步（第三方设置 UI 读取 + setConfigurationValue 校验）；壳 UI 走 optionsFrom 动态取。
            uiHint: "select",
            optionsFrom: "theme.colorways",
            optionsFromDomain: "colors",
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#98：强调色独立轴——app.accentSource（跟随主题配方/自定义）从外观主开关解耦
          // （14-档案 §十二，用户拍板「把强调色的跟随主题配置加回来」）。
          // #90 曾并入 appearanceMode 单一轴（app.accentMode 删），现用户可独立于外观主开关只调强调色：
          //   followTheme → 强调色恒取当前主题配方 accent（appearanceMode=followTheme 也生效）；
          //   custom → 取 app.accentColor。行序 = 来源开关在上、取色器在下（mockup ③ 强调色区）。
          // uiHint "accentSource" = 两态分段控件（设置插件）+ 生效强调色 swatch（14-档案 §十二）。
          // 无 dependsOn——恒显（不随 custom 展开；SettingsView 空桶过滤不再吞强调色节，mockup「始终可见」）。
          "app.accentSource": {
            type: "string",
            group: t("强调色"),
            default: "followTheme",
            enum: ["followTheme", "custom"],
            enumDescriptions: [
              t("跟随主题配方——强调色取当前主题配色的强调色"),
              t("自定义——自己指定强调色（图标栏高亮、开关、焦点边框）"),
            ],
            description: t("强调色来源——跟随主题配方：取当前主题的强调色；自定义：自己指定"),
            uiHint: "accentSource",
            onApply: () => applyAccentColor(getEffectiveAccentColor()),
          },
          // E5.8#98：自定义强调色取色器——仅 accentSource=custom 时显示（来源开关为唯一显隐门控）。
          // 写 accentColor = 自定义强调色；清除 = 系统默认强调色（回主题 = 来源开关切「跟随主题配方」）。
          // getEffectiveAccentColor 按 accentSource 分流（14-档案 §十二）——accentSource=custom 才读本键。
          "app.accentColor": {
            type: "string",
            group: t("强调色"),
            // E5.8#6.6 hex 豁免：配置项默认值数据（用户可改，非样式硬编码）
            // eslint-disable-next-line linkdesk/no-hardcoded-hex
            default: "#0078d4",
            description: t("自定义强调色（图标栏高亮、开关、焦点边框）——清除 = 系统默认强调色"),
            dependsOn: { key: "app.accentSource", value: "custom" },
            renderHint: "color",
            // E3.5 fix: dependsOn 只控制 UI 显隐，不阻止 applyConfiguration 在启动时调用。
            // accentSource="followTheme" 时，app.accentColor 的 onApply 不应覆盖主题的 accent
            // （getEffectiveAccentColor 按 accentSource 分流——followTheme 取主题 accent）。
            onApply: () => applyAccentColor(getEffectiveAccentColor()),
          },
          // E5.8#90：外观主开关——单一外观模式轴（14-档案 §四 归一5）。三枚举合并：吸收 app.mixMode +
          // app.accentMode → 跟随主题 / 自定义。自定义下每槽独立指定（外观覆盖 13 键播种 +
          // 域来源 6 键默认 followTheme，未写 = 跟随主题）。group = 整体配方（主开关置顶与主题配方同节）。
          // enumDescriptions 人话（#90 验收「三枚举术语消失」——设置页不再出现 混搭模式/强调色模式 术语）。
          // E5.8#98：强调色独立轴（accentSource）——本开关不再含强调色语义（强调色区来源开关单独控制）。
          "app.appearanceMode": {
            type: "string",
            group: t("整体配方"), // E5.8#78：组内二级标题——主题组分节 1/6（整体配方，主开关与主题配方同节）
            default: "followTheme",
            enum: ["followTheme", "custom"],
            enumDescriptions: [
              t("跟随主题——外观/配色由主题配方决定"),
              t("自定义——逐项指定外观覆盖与域来源"),
            ],
            description: t("外观模式——跟随主题配方整体外观 / 自定义逐项指定"),
            onApply: (v) => {
              if (v === "custom") {
                // 切 custom → 播种 13 覆盖 key + 强调色（同一批量写单次 applier，08 §2 对标 accent 播种）
                seedAppearanceOverrides();
              } else {
                // 切回 followTheme → 覆盖丢弃回配方（08 §7.3.5）——清 9 覆盖 + 6 域来源
                // 全丢回主题基线（批量复位单次 applier）。域来源无须播种（默认 followTheme，未写 = 跟随）。
                // E5.8#98：强调色不入本批——accentSource/accentColor 独立轴，外观主开关不复位它
                // （用户 followTheme 也能只调强调色，14-档案 §十二）。
                resetConfigurationValueBatch(
                  [...APPEARANCE_OVERRIDE_KEYS, ...MIX_SOURCE_KEYS],
                  "user"
                );
              }
              // E5.8#59：播种/复位批量 API 已触发单次 applier（末 key 全量读生效态）——不再补
              // applyThemeIfReady 避免二次广播（原 6 连写 + 尾部补调 = 7 次 theme:changed）
            },
          },
          // 外观六覆盖——dependsOn appearanceMode=custom 才出现（08 §7.1 #5-10）。
          // neutral 默认值 = 不覆盖主题基线；onApply 统一走 applyThemeIfReady（单一写入点）。
          // E5.8#97：域驱动重组——数值域来源删键（mixRadius/mixGlass 死键，#85/#86 绝对化后混搭数值域
          // 无意义）→ 圆角/玻璃两小组无来源行；资产域来源并入域小组（mixBackground/mixFont/mixSurface
          // 是配方资产唯一入口——字体拾取器选不了 __ld_ 资产族 #50.20）。行序 = mockup DOM 顺序。
          // E5.8#97 撤销（2026-08-26 用户拍板）：mockup ⑧ 表面分节删除——纹理=主题插件内容资产，
          // 壳无纹理槽；mixSurface 并入背景小组（域来源随域，surface 域视觉输出 = zone 表面材质）。
          "app.surfaceRadius": {
            type: "number",
            group: t("圆角"),
            default: 0,
            minimum: 0,
            maximum: 32,
            description: t("组件圆角——系统标尺 0 方角 / 32 最圆润；数值 = 标准组件圆角 px"),
            uiHint: "slider",
            unit: "px", // E5.8#85：值标签像素单位（绝对 px，非倍数）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.glassBlur": {
            type: "number",
            group: t("玻璃"),
            default: 0,
            minimum: 0,
            maximum: 32,
            // E5.8#86：滑杆值 = 主表面（顶栏/主区/状态栏）真实模糊 px——消灭「显示 X 实际 Y」（A5）；
            // 窄表面（图标栏/侧栏 0.44×）/面板（悬浮面板 1.11×）按声明式每表面系数缩放（index.css）。
            description: t("玻璃模糊——0 关闭；数值 = 主表面真实模糊 px"),
            uiHint: "slider",
            unit: "px", // E5.8#77：值标签像素单位（mockup 16px）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.glassOpacity": {
            type: "number",
            group: t("玻璃"),
            default: 0.5, // E5.8#86：绝对不透明度默认半透玻璃面（旧默认 1 的 wash 视觉 = 0.5，同值零变化）
            minimum: 0,
            maximum: 1,
            // E5.8#86：label 直述绝对语义——0 全透见背景图 / 1 全不透明（消灭 label「1 不透明」实为半透，A3/D1）
            description: t("玻璃面不透明度——0 全透见背景 / 1 全不透明"),
            uiHint: "slider",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.glassTint": {
            type: "string",
            group: t("玻璃"),
            default: "",
            description: t("玻璃叠加色——空 = 主题自带"),
            renderHint: "color",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#96：玻璃饱和度槽（14-档案 §十 镜像补槽）——app.glassSaturate 覆盖 --glass-saturate
          // （主题 ThemeSurface.saturate 可表达但此前设置面无槽）。1 = neutral 原图（presence 门控：
          // 显式写过即覆盖，neutral 端点也是显式意图）/ 0 去饱和 / 2 加倍。消费 = getAppearanceOverrides。
          "app.glassSaturate": {
            type: "number",
            group: t("玻璃"),
            default: 1,
            minimum: 0,
            maximum: 2,
            // step 不声明——inferSliderStep(0,2) span≤2 → 0.01 连续可调（E5.8#65，与 glassOpacity 同款）
            description: t("玻璃饱和度——1 原图 / 2 加倍饱和 / 0 去饱和"),
            uiHint: "slider",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#97：背景域来源并入背景小组（资产入口唯一——配方资源图/纹理只能经来源行取，拾取器
          // 无资产族；#50.20 边界）。行序 = 来源行置顶，随后 4 覆盖行。
          "app.mixBackground": {
            type: "string",
            group: t("背景"),
            default: "followTheme",
            description: t("背景域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "background",
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.backgroundImage": {
            type: "string",
            group: t("背景"),
            default: "",
            // E5.8#87：无背景（__none__）= 绝对无图（盖掉主题/mix 图）；空 = 跟随主题
            description: t("窗口背景图片路径——空 = 主题自带；无背景 = 绝对无图"),
            uiHint: "image", // E5.8#50.11：专属「选择图片」控件（选图→拷贝入库→受控路径持久化）
            sourceKey: "app.mixBackground", // E5.8#87：来源徽标——背景域 mix 来源 key
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#94：背景可读性槽（14-档案 §十 镜像补槽）——主题 ThemeBackground.opacity/mask 可表达但此前
          // 设置面无槽。app.backgroundOpacity 覆盖 --bg-opacity（0 全透见窗口底色 / 1 原图）；app.backgroundMask
          // 覆盖 --bg-mask（0 无遮罩 / 1 全黑）。默认 1/0 = neutral（presence 门控：显式写过即覆盖）。
          // 消费 = getAppearanceOverrides。maskColor 低优先豁免（14-档案 §十）。
          "app.backgroundOpacity": {
            type: "number",
            group: t("背景"),
            default: 1,
            minimum: 0,
            maximum: 1,
            // step 不声明——inferSliderStep(0,1) span≤2 → 0.01 连续可调（E5.8#65，与 glassOpacity 同款）
            description: t("背景图不透明度——0 全透见窗口底色 / 1 原图"),
            uiHint: "slider",
            sourceKey: "app.mixBackground", // E5.8#87：来源徽标——背景域 mix 来源 key
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.backgroundMask": {
            type: "number",
            group: t("背景"),
            default: 0,
            minimum: 0,
            maximum: 1,
            // step 不声明——inferSliderStep(0,1) span≤2 → 0.01 连续可调（E5.8#65，与 glassOpacity 同款）
            description: t("背景图遮罩明暗——0 无遮罩 / 1 全黑"),
            uiHint: "slider",
            sourceKey: "app.mixBackground", // E5.8#87：来源徽标——背景域 mix 来源 key
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#97：文字组——字体域来源并入文字小组（配方字体资产唯一入口）+ 极性槽置顶恒显 +
          // 两字体槽。group 首现序 = 行序（fontTone → mixFont → fontFamily → fontFamilyMono）。
          // E5.8#91：文字极性槽——app.fontTone 独立极性偏好（非外观覆盖键，不随 appearanceMode custom
          // 播种/复位；显式选档切主题自动保留）。默认跟随主题（主题 type 决定极性）；显式亮/暗字 = 系统
          // 双字系标尺覆盖 text-primary/secondary/muted（ThemeEngine getAppearanceOverrides 读本键 →
          // applyOverrides 写 --text-*）。设置插件 uiHint "fontTone" = 三态分段控件 + 深浅底预览方块（14-档案 #91）。
          // fontTone 无 dependsOn——恒显（不随 custom 展开，SettingsView 部分桶显隐逐 key 过滤）。
          "app.fontTone": {
            type: "string",
            group: t("文字"), // E5.8#78：组内二级标题——主题组分节 7/9（文字）
            default: "followTheme",
            enum: ["followTheme", "light", "dark"],
            enumDescriptions: [
              t("跟随主题——主题明暗决定文字极性（深主题亮字 / 浅主题暗字）"),
              t("亮字（深底用）——深色底上白字"),
              t("暗字（浅底用）——浅色底上深字"),
            ],
            description: t("文字极性——文字颜色取系统标尺，不锚主题色板"),
            uiHint: "fontTone",
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#90：混搭并入外观主开关——app.mixMode 删除（三枚举归一单一外观轴，14-档案 §四 归一5）。
          // 域来源槽 = 自定义模式下每域独立指定（跟随主题 / 指定配方 id）；dependsOn appearanceMode=custom。
          // mix* 按域合并实现在 ThemeEngine（#50.26 mergeMixDomains）——此处注册 + dependsOn 显隐。
          // 域来源 = uiHint "select" + optionsFrom "theme.sources"（#50.23 动态下拉按域过滤 listRecipes）；
          // onApply = applyThemeIfReady（换来源即重合并 + 广播 theme:changed，10 §2 实时预览）。
          // 「跟随主题」哨兵值 = "followTheme"（10-混搭设计 §1/§3 定稿；缺省与播种同一值）。
          // E5.8#82：colors 域来源并入 app.themeColor（app.mixColor 删除）——域来源 key 对称，
          // 自定义模式下壳 UI 将 app.themeColor 渲染为 theme.sources + colors 域（DynamicSelect 双语义自解析：
          // schema 静态声明 colorways+colors，运行时读 app.appearanceMode 决定跟随/自定义路径，renderControl 零改动）。
          // E5.8#97：域来源并组——字体域来源行归文字组（配方字体资产唯一入口，拾取器选不了 __ld_ 资产族 #50.20）。
          "app.mixFont": {
            type: "string",
            group: t("文字"),
            default: "followTheme",
            description: t("字体域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "font",
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.fontFamily": {
            type: "string",
            group: t("文字"),
            default: "",
            // E5.8#87：系统字体（__none__）= 绝对系统默认（不跟随主题字体）；空 = 跟随主题
            description: t("界面字体——空 = 跟随主题；选择后写 --font-ui；系统字体 = 显式系统默认"),
            // E5.8#50.20：全字族化 FontFamilySelect（monoOnly:false 列全族非等宽）——
            // onApply 覆盖面单一写入点 getAppearanceOverrides 读本 key 写 --font-ui
            uiHint: "fontFamily",
            monoOnly: false,
            sourceKey: "app.mixFont", // E5.8#87：来源徽标——字体域 mix 来源 key
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#95：等宽字体槽（14-档案 §十 镜像补槽）——主题 ThemeFont.mono 可表达但此前设置面无槽。
          // app.fontFamilyMono 覆盖 --font-mono（context-menu/panel/colorpicker/quick-pick/plugin-detail 消费）。
          // 空 = 跟随主题；系统字体（__none__）= 显式系统等宽栈。monoOnly:true = FontFamilySelect 只列等宽族。
          // 消费 = getAppearanceOverrides。
          "app.fontFamilyMono": {
            type: "string",
            group: t("文字"),
            default: "",
            description: t("等宽字体——空 = 跟随主题；选择后写 --font-mono；系统字体 = 显式系统默认"),
            uiHint: "fontFamily",
            monoOnly: true,
            sourceKey: "app.mixFont", // E5.8#87：来源徽标——字体域 mix 来源 key
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#85：zone 圆角绝对化——app.zoneRadius 开关 + app.zoneRadiusScale 绝对 px（用户想法 1/2、痛点 2）：
          //   组件圆角（radius-*）由 app.surfaceRadius 绝对 px 控，zone 圆角（surface-radius）由这两键独立控（两轴解耦，
          //   同走系统标尺 0→32）。消费 = getAppearanceOverrides 读本键 → applyOverrides ①b 通道直写 / "0px" 开关短路（ThemeEngine.ts）。
          "app.zoneRadius": {
            type: "boolean",
            group: t("圆角"),
            default: true,
            description: t("分区圆角开关——关闭后各分区强制直角（0px）"),
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          "app.zoneRadiusScale": {
            type: "number",
            group: t("圆角"),
            default: 0,
            minimum: 0,
            maximum: 32,
            description: t("分区圆角——系统标尺 0 方角 / 32 最圆润；数值 = 分区圆角 px"),
            uiHint: "slider",
            unit: "px", // E5.8#85：值标签像素单位（绝对 px，非倍数）
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#81：zone 表面背景覆盖入口——image 控件选图写 --surface-bg-image（与全窗 --bg-image 并存：
          // 全窗垫底 + zone 浮 surface 表面，缝隙/透明处露全窗 = 预期；痛点 12 双背景语义）。
          // 消费 = getAppearanceOverrides 读本键 → surface-bg-image + zones=1（池侧量测 zone 坐标）。
          "app.zoneBackgroundImage": {
            type: "string",
            group: t("背景"),
            default: "",
            // E5.8#87：无背景（__none__）= 绝对无图（盖掉主题/mix 图）；空 = 跟随主题
            description: t("分区背景图片路径——空 = 主题自带；无背景 = 绝对无图"),
            uiHint: "image",
            sourceKey: "app.mixBackground", // E5.8#87：来源徽标——背景域 mix 来源 key
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // E5.8#97 撤销（2026-08-26 用户拍板）：表面平铺纹理覆盖槽 app.surfaceTexture 删除——
          // 纹理 = 主题插件内容资产（Paper Zones 纸纹/某主题磨砂 = 主题特色），壳不提供纹理通道；
          // 用户换纹理 = 换主题（Content vs Space Ownership，14-档案 §十一 补记）。主题侧
          // surface.texture 机制保留（主题作者写材质用）。表面域来源行并入背景小组（域来源随域，
          // 与 mixBackground 同列；surface 域视觉输出 = zone 表面材质 = 背景相邻，且与
          // zoneBackgroundImage 同写 --surface-bg-image——相关控件同组）。
          "app.mixSurface": {
            type: "string",
            group: t("背景"),
            default: "followTheme",
            description: t("表面域来源——跟随主题配方 / 指定主题配方 id"),
            dependsOn: { key: "app.appearanceMode", value: "custom" },
            uiHint: "select",
            optionsFrom: "theme.sources",
            optionsFromDomain: "surface",
            onApply: () => debouncedApplyThemeIfReady(),
          },
          // 复位按钮（10 §2/§6 决策记录 3）——renderHint "action" 渲染操作按钮；
          // 点击执行 theme.resetMix 命令（单一写入点：批复位 4 来源键回跟随主题，保持自定义模式）。
          // actionDisabledAll：4 来源全「跟随主题」→ 置灰（mockup 已实现，减少噪音）。
          "app.mixReset": {
            type: "string",
            group: t("复位"),
            default: "",
            description: t("⟲ 全部复位为整体配方"),
            renderHint: "action",
            actionCommand: "theme.resetMix",
            dependsOn: { key: "app.appearanceMode", value: "custom" },
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
