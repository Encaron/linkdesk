/**
 * 「主题」配置组声明——壳注册第二配置贡献（pluginId "appearance"，标题「主题」）。
 * E5.8 Phase 11.13 结构归一化：自 startup.ts 拆出（配置声明域，Domain 拆解）。
 * registerAppearanceConfiguration({ t })——纯声明 + onApply 编排（onApply 委托 appearanceApplier 外观应用编排，
 *   依赖方向 config/appearance → appearanceApplier → core，无反向）。
 * t() 注入而非模块级捕获——语言切换重跑（HMR/StrictMode）时注册文案取首语言（原 startup 语义）。
 */

import {
  applyTheme,
  loadTheme,
  applyAccentColor,
  getEffectiveAccentColor,
  deriveAppearanceSeedMap,
  getThemeBaseTokens,
  getActiveRecipe,
  normalizeThemeValue,
  getAvailableThemes,
  syncThemeColorEnum, // E5.8 Phase 11.14：切外观模式同步配色全集 enum（custom = 全配方 / followTheme = 活动配方）
  APPEARANCE_OVERRIDE_KEYS,
  MIX_SOURCE_KEYS,
  // E5.8 Phase 11.15 3c：圆角滑杆上限/玻璃默认不透明度同源引擎常量——滑杆上限 = 引擎 clamp 上限，单一权威
  RADIUS_MAX_PX,
  GLASS_SURFACE_DEFAULT_ALPHA,
} from "../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../core/registry/appearance/ThemeRegistry";
import {
  getConfigurationValue, resetConfigurationValue, resetConfigurationValueBatch,
} from "../../core/services/configuration/ConfigurationService";
import { registerConfiguration, updateConfigurationEnum } from "../../core/registry/ConfigurationRegistry";
import {
  debouncedApplyThemeIfReady,
  applyRecipeForConfig,
  seedAppearanceOverrides,
  readAppearanceOverrideUserValues,
  reseedAppearanceOnThemeSwitch,
  MIX_RESET_DISABLED_WHEN,
} from "../appearanceApplier";

/** t() 类型——仅声明组取 key（原 startup useTranslation t） */
type ConfigT = (key: string) => string;

export function registerAppearanceConfiguration(t: ConfigT): void {
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
        // E5.8 用户审计 #3：resetsToTheme——齿轮「跟随主题」删本键 user scope 回落主题基线
        // （机制见 ConfigurationRegistry.ConfigurationProperty.resetsToTheme；双语义键同样适用——
        // 自定义模式选过配色变体 → 跟随主题 = 删覆盖回活动配方默认配色，切主题自动跟）
        resetsToTheme: true,
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
      // uiHint "accentSource" = 两态分段控件（设置插件，段内预览：跟随主题 = 中性分半 / 自定义 = 色块，14-档案 §十二+#99）。
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
      // E5.8#99（#5）：写 accentColor = 自定义强调色；清除（空）= 跟随主题强调色——与
      //   backgroundImage/fontFamily 三键清除语义统一（getEffectiveAccentColor 兜底主题 accent，
      //   14-档案 #99）。回主题的另一路径 = 来源开关切「跟随主题配方」。
      // getEffectiveAccentColor 按 accentSource 分流（14-档案 §十二）——accentSource=custom 才读本键。
      "app.accentColor": {
        type: "string",
        group: t("强调色"),
        // E5.8#6.6 hex 豁免：配置项默认值数据（用户可改，非样式硬编码）
        // eslint-disable-next-line linkdesk/no-hardcoded-hex
        default: "#0078d4",
        description: t("自定义强调色（图标栏高亮、开关、焦点边框）——清除 = 跟随主题强调色"),
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
          // E5.8 Phase 11.14：切模式后同步配色全集 enum——custom = ["followTheme", ...全配方配色]（跨主题可选）；
          // followTheme = 活动配方配色。播种/复位批量 API 未碰 enum（只写值），须单独同步
          syncThemeColorEnum();
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
        resetsToTheme: true,
        minimum: 0,
        maximum: RADIUS_MAX_PX, // 3c：滑杆上限 = 引擎 clamp 上限（RADIUS_MAX_PX 单一权威）
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
        resetsToTheme: true,
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
        default: GLASS_SURFACE_DEFAULT_ALPHA, // 3c：同源引擎常量——E5.8#86 绝对不透明度默认半透玻璃面（旧默认 1 的 wash 视觉 = 0.5，同值零变化）
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
        // E5.8#87：无背景（__none__）= 绝对无图（盖掉主题/mix 图）；空 = 跟随主题
        description: t("窗口背景图片路径——空 = 主题自带；无背景 = 绝对无图"),
        uiHint: "image", // E5.8#50.11：专属「选择图片」控件（选图→拷贝入库→受控路径持久化）
        sourceKey: "app.mixBackground", // E5.8#87：来源徽标——背景域 mix 来源 key
        dependsOn: { key: "app.appearanceMode", value: "custom" },
        onApply: () => debouncedApplyThemeIfReady(),
      },
      // E5.8#94：背景可读性槽（14-档案 §十 镜像补槽）——主题 ThemeBackground.opacity/mask 可表达但此前
      // 设置面无槽。app.backgroundOpacity 覆盖 --bg-opacity + --surface-bg-opacity（0 全透见窗口底色 / 1 原图；
      // #115 双 token 齐写 = 底图 + 镜像/纹理统一淡出）；app.backgroundMask 覆盖 --bg-mask（0 无遮罩 / 1 全黑）。
      // 默认 1/0 = neutral（presence 门控：显式写过即覆盖）。
      // 消费 = getAppearanceOverrides。maskColor 低优先豁免（14-档案 §十）。
      "app.backgroundOpacity": {
        type: "number",
        group: t("背景"),
        default: 1,
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
        resetsToTheme: true,
        minimum: 0,
        maximum: RADIUS_MAX_PX, // 3c：滑杆上限 = 引擎 clamp 上限（RADIUS_MAX_PX 单一权威）
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
        resetsToTheme: true,
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
        resetsToTheme: true,
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
}
