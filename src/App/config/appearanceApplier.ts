/**
 * App 层外观应用编排——主题/混搭配方应用 + 外观覆盖播种/复位 + schema 版本迁移登记。
 * E5.8 Phase 11.13 结构归一化：自 startup.ts 拆出（启动管线「外观应用」域，Domain 拆解）。
 * 纯函数 + 模块级迁移登记——无 React 依赖（t() key 仅配置声明消费，见 config/appearance.ts）。
 * 依赖方向：appearanceApplier → core（ThemeEngine/ConfigurationService/ThemeRegistry/schemaMigrations）；
 *   config/appearance → appearanceApplier；startup → appearanceApplier + config/appearance。无反向。
 */

import {
  applyTheme,
  applyRecipe,
  applyAccentColor,
  getEffectiveAccentColor,
  getEffectiveTokens,
  getActiveRecipe,
  mergeDomains, // E5.8#85 补课：迁移取主题基准 token（无 overrides；缺 radius 域回退壳默认在公式内）
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
  syncThemeColorEnum, // E5.8 Phase 11.14：app.themeColor 跨主题配色全集 enum（替换原 inline updateConfigurationEnum）
  APPEARANCE_OVERRIDE_KEYS,
  MIX_FOLLOW_THEME,
  MIX_SOURCE_KEYS, // E5.8#90：混搭来源 key 全集——单一来源 ThemeEngine
} from "../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../core/registry/appearance/ThemeRegistry";
import type { ThemeRecipe } from "../../core/types/theme";
import {
  getConfigurationValue, setConfigurationValueBatch, inspectConfiguration,
} from "../../core/services/configuration/ConfigurationService";
import { registerConfigMigration } from "../../core/services/configuration/schemaMigrations";

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
export const debouncedApplyThemeIfReady = (): void => {
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
export const applyRecipeForConfig = (recipe: ThemeRecipe): void => {
  const storedColor = getConfigurationValue<string>("app.themeColor");
  // recipe 模式：配色变体 id（空 / 残留 "followTheme" → 配方首配色）；mix 模式：来源配方 id 被 resolveColorway
  // 找不到 → 自然回退首配色，颜色域实际由混搭合并按来源取（两者解耦，不互踩）
  const colorwayId = storedColor && storedColor !== MIX_FOLLOW_THEME ? storedColor : undefined;
  applyRecipe(recipe, colorwayId);
  applyAccentColor(getEffectiveAccentColor());
  // E5.8 Phase 11.14：按外观模式同步配色全集 enum——custom = 全配方配色（跨主题可选，修复旧逻辑只接受
  // 当前配方配色 → setConfigurationValue 拒绝写入；UI 宣传全集与写入白名单对齐），followTheme = 配方内变体
  syncThemeColorEnum();
  syncThemeColorConfig(recipe);
};

/** 混搭复位禁用条件——6 来源全「跟随主题」时复位按钮置灰（10 §6 决策记录 3，mockup 已实现） */
export const MIX_RESET_DISABLED_WHEN = MIX_SOURCE_KEYS.map((key) => ({ key, value: "followTheme" }));

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
export const seedAppearanceOverrides = (): void => {
  const seedMap = deriveAppearanceSeedMap(getEffectiveTokens());
  // E5.8#98：强调色不入播种批——accentSource 独立轴，切 custom 不物化强调色（跟随主题就保持跟随，
  // 自定义就已是自定义色）。旧 #90 逻辑「取引擎追踪强调色 getAppliedAccent 物质化为槽值」随强调色解耦
  // 作废——若仍播种，followTheme 用户的 accentColor 被写进一个永不生效的值（14-档案 §十二）。
  // 注意不能用 getEffectiveAccentColor()——此刻模式已切 custom，读到的已是旧 app.accentColor。
  const writes: Array<{ key: string; value: unknown }> = APPEARANCE_OVERRIDE_KEYS.map((key) => ({ key, value: seedMap[key] }));
  setConfigurationValueBatch(writes, "user");
};

/** E5.8#88：当前用户外观覆盖值（raw user scope）——切主题重播种的「显式修改」判定集 */
export const readAppearanceOverrideUserValues = (): Record<string, unknown> => {
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
export const reseedAppearanceOnThemeSwitch = async (
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
// 存量值换算为绝对透明度（×0.5，视觉零变化）。公式 deriveGlassOpacityAbsoluteMigration（ThemeEngine 纯函数，
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
// 合并规则：resolveMergedAppearanceMode（ThemeEngine/migration 纯函数，公式单测在 ThemeEngine/migration.test）——任一旧枚举
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
