/**
 * 主题引擎常量——系统标尺 / 零值集 / 混搭域表 / 字体栈 / 迁移表（叶子模块，仅类型依赖）。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 */

import { RADIUS_SCALE_STEPS, type RadiusScaleStep, type ThemeDomain } from "../../../types/theme";

/* ── E5.8 缝系统：--surface-inset 宿主派生常量。内部缝 = 2×SURFACE_SEAM_INSET_PX（相邻格各半）——
   4px 可拖拽 handle 恰好填满缝（handle 锚 cell 边界 = 缝中心，±2px = 半宽恒等式）。 */
export const SURFACE_SEAM_INSET_PX = 2;

/* ── E5.8#50.6：玻璃/背景/悬浮变量零值——主题不带 surface/background 时写入（= 无玻璃无图无悬浮 = 现状零变化） ──
   --bg-mask 默认 0（rgba 遮罩透明度，0 = 无遮罩）；--surface-shadow 默认 none（无浮起）。 */
export const SURFACE_ZERO: Record<string, string> = {
  "glass-blur": "0px",
  "glass-saturate": "1",
  "glass-tint": "transparent",
  "glass-opacity": "1",
  "glass-specular": "0",
  // E5.8#63 hex 豁免：默认色数据——高光基色 token 缺省现状值（消费侧 color-mix 基色），主题覆盖才生效
  // eslint-disable-next-line linkdesk/no-hardcoded-hex
  "glass-specular-color": "#ffffff",
  "glass-morph": "0ms",
  "surface-radius": "0px",
  "surface-inset": "0px",
  "surface-shadow": "none",
  /* E5.8#50.28/50.29：per-surface 背景零值——纹理（repeat 平铺）/影像切片（no-repeat + 负偏移）共用。
     --surface-bg-zones: 1 标记 zones 模式（⑭ 影像分区，池侧 preload 按此门控量测本窗切片坐标）。
     E5.8#117：--surface-bg-mirror 已删除——panorama 镜像机制整体废除（cp114 证据：主表面 ::before
     backdrop-filter 能直接采样兄弟 .background-layer，镜像切片多余；#117 用户三连投诉根治）。
     E5.8 Phase 11.15（R3 根治）：--surface-bg-size / --surface-<zone>-bg-position 不在零值集——切片坐标
     由池侧 surface-zones 自写自清（唯一所有者，见 preload-pool/surface-zones.ts），壳引擎不写不广播，
     否则每次重应用覆盖池侧量测值（拖滑杆后切片错位须 resize 才恢复）。CSS 消费端 var(--…, fallback) 兜底。 */
  "surface-bg-image": "none",
  "surface-bg-repeat": "no-repeat",
  "surface-bg-opacity": "1",
  "surface-bg-zones": "0",
};

export const BACKGROUND_ZERO: Record<string, string> = {
  "bg-image": "none",
  "bg-opacity": "1",
  "bg-mask": "0",
  // E5.8#63 hex 豁免：默认色数据——遮罩基色 token 缺省现状值（消费侧 color-mix 基色），主题覆盖才生效
  // eslint-disable-next-line linkdesk/no-hardcoded-hex
  "bg-mask-color": "#000000",
};

/* ── E5.8#50.16：scale 乘算 token 集 + 引擎管理 token 全集 ── */

/** 圆角六档尺寸 token 键——形态值（--radius-pill/--radius-full）排除不缩放（08 §3 边界，2026-08-24 审视补）。
 *  E5.8#122 单一源派生：档名权威在 types/theme.ts RADIUS_SCALE_STEPS（schema 档名），本表从它 map 派生
 *  token 键（radius-${s}），防两份六档清单漂移（同一概念两层表达）。 */
export type RadiusScaleKey = `radius-${RadiusScaleStep}`;

export const RADIUS_SCALE_KEYS: readonly RadiusScaleKey[] = RADIUS_SCALE_STEPS.map(
  (s) => `radius-${s}` as const
);

/** E5.8#85：圆角系统标尺上限——所有绝对 px 圆角 token 统一 clamp 进 [0, 32]（radius-full 相对几何值排除）。
 *  clampRadiusPx 内部使用；3c 起导出供外观 schema 对齐（app.surfaceRadius/zoneRadiusScale maximum，
 *  appearance.ts 同源常量——滑杆上限 = 引擎 clamp 上限，单一权威）。 */
export const RADIUS_MAX_PX = 32;

/** E5.8#85：clamp 绝对 px 圆角进系统标尺——NaN/负 → 0，>32 → 32（四舍五入整数 px） */
export function clampRadiusPx(v: number): number {
  return Number.isFinite(v) ? Math.min(RADIUS_MAX_PX, Math.max(0, Math.round(v))) : 0;
}

/** clamp 进系统标尺后拼 px 串——「圆角数值 → CSS token 值」唯一写法（3d 归一：flattenRadiusTokens /
 *  surfaceVariables / applyRadiusAbsolute / applyOverrides zone+pill / recipe / mix 全路径共用，每个概念
 *  只有一种写法）。与 config 数值形态区分（seeds/migration 用 clampRadiusPx→String 存 schema 值，非 px token）。 */
export function radiusTokenPx(v: number): string {
  return `${clampRadiusPx(v)}px`;
}

/* ── E5.8 Phase 11.16：玻璃系统标尺化——表面合成白名单 + 派生键 + 系统默认 alpha。
   玻璃 = 系统表面层（非主题材质域）：任意主题玻璃滑杆激活 → 表面配色键合成半透明
   （color-mix 缩 alpha），半透明面透出背景/图，backdrop-filter 磨砂显形；未激活 = 零变化回主题原生。
   主题玻璃 = 起始预设（--bg-* 原值 = 素材）。必须白名单禁止 bg- 前缀匹配——
   bg-image/bg-opacity/bg-mask 是背景图/不透明度/遮罩，不参与表面合成。 */

/** 参与表面合成的表面配色键——synthesizeGlassSurfaces 只碰这 8 键（主题没写的不合，CSS :root 壳默认不碰） */
export const SURFACE_COLOR_KEYS = [
  "bg-window", "bg-titlebar", "bg-status", "bg-icon-bar", "bg-side-panel", "bg-toolbar", "bg-card", "bg-input",
] as const;

/** 表面合成派生键全集——solid 原值键（恒写）+ 合成透明度键（激活时 color-mix 引用源）+
 *  zone 切片图合成透明度（E5.8#125：玻璃激活时 = surface-bg-opacity × alpha，CSS ::after 消费回退原值）。
 *  随 variables 广播给池（池侧 color-mix 串两 var 引用齐）；激活→关闭 stale 清理由 lastCommittedKeys 差集承担。
 *  模块内私有——仅 MANAGED_TOKEN_KEYS 消费（getEffectiveTokens 读合成键）；外部无独立消费方。 */
const GLASS_SURFACE_KEYS: readonly string[] = [
  ...SURFACE_COLOR_KEYS.map((k) => `${k}-solid`),
  "glass-surface-alpha",
  "glass-surface-bg-opacity",
];

/** 玻璃激活但未显式动不透明度 → 表面默认半透明 0.5（拍板——保证全不透明主题只拖 blur 也立刻见玻璃） */
export const GLASS_SURFACE_DEFAULT_ALPHA = 0.5;

/* ── E5.8 Phase 12：字号档位单一源（度量体系归一化——全局 UI 字号缩放） ── */

/** 字号档名数组——shell 独有轴（主题不规定字号，零贡献点零 schema），对标 RADIUS_SCALE_STEPS（types/theme.ts:70）先例 */
export const FONT_SIZE_STEPS = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const;
export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

/** 档名 → 基准 px 映射——**100% 渲染值 = 新设计默认（⑤ 拍板 VS Code 对齐，非现状收敛值）**：
 *  sm 13（UI 主文本对齐 VS Code）/ md 14（文件树 name 比 VS Code 资源管理器大 1px）/ lg 16（文件树 icon）/
 *  xl 18（圆钮箭头+区标题）/ 2xl 22 / 3xl 28 / 4xl 30。引擎 JS 侧算 `${base × ratio}px` 写 --font-size-*。 */
export const FONT_SIZE_BASE_PX: Record<FontSizeStep, number> = {
  "2xs": 11, xs: 12, sm: 13, md: 14, lg: 16, xl: 18, "2xl": 22, "3xl": 28, "4xl": 30,
};

/** 字号 token 键全集（--font-size-<档>）——从 FONT_SIZE_STEPS 单一源派生（对标 RADIUS_SCALE_KEYS）。
 *  非导出（无外部消费者——MANAGED_TOKEN_KEYS 同文件消费；外部需迭代用 FONT_SIZE_STEPS 派生）。 */
const FONT_SIZE_KEYS: readonly string[] = FONT_SIZE_STEPS.map((s) => `font-size-${s}`);

/** 全局字号比例默认 ratio = 1（app.uiFontScale 100% = 新设计默认基线）——applyOverrides ④ 消费。 */
export const UI_FONT_SCALE_DEFAULT = 1;

/** 引擎管理的 token 键全集（去 -- 前缀）——getEffectiveTokens 读当前生效值（含壳默认继承） */
export const MANAGED_TOKEN_KEYS: string[] = [
  ...Object.keys(SURFACE_ZERO),
  ...Object.keys(BACKGROUND_ZERO),
  ...RADIUS_SCALE_KEYS,
  "radius-pill", "radius-full",
  "font-ui", "font-mono",
  "ui-scale", ...FONT_SIZE_KEYS,
  ...GLASS_SURFACE_KEYS,
];

/* ── E5.8#50.26：混搭域常量（10-混搭设计 §1/§3——按域换来源，引擎按域合并） ── */

/** 混搭来源「跟随主题」哨兵值——与 app.mix* 默认值对齐（10 §1/§3 定稿） */
export const MIX_FOLLOW_THEME = "followTheme";

/** 混搭域 → 来源配置 key——getMixProfile 读配置（单真源，startup.ts/settings 命令 import 本表）。
 *  E5.8#82：colors 域来源并入 app.themeColor（app.mixColor 删除）——六域来源 key 对称；
 *  recipe 模式下 themeColor 是配方内配色变体 id，仅 mix 模式作为 colors 域来源被本表消费。
 *  E5.8#90：外观模型合并——startup.ts 原本地 MIX_SOURCE_KEYS 常量改 import 本表（单一来源）。
 *  E5.8#97：数值域来源删键——radius/glass 域来源（app.mixRadius/app.mixGlass）随 #85/#86 圆角/玻璃
 *  绝对化成为死键（数值域表达系统标尺绝对 px，混搭另一配方多键集无意义）——设置面两域来源行删除，
 *  混搭键表收缩为四域（colors/font/background/surface）。MIX_DOMAIN_ORDER 仍遍历六域：radius/glass
 *  域 profile 缺省 → resolveDomainSource 回退基础配方（域不空窗，见 mergeMixDomains）。 */
export const MIX_DOMAIN_KEYS: Partial<Record<ThemeDomain, string>> = {
  colors: "app.themeColor",
  font: "app.mixFont",
  background: "app.mixBackground",
  surface: "app.mixSurface",
};

/** E5.8#90：混搭来源配置 key 全集——外观复位/重置命令批量复位用（theme.resetMix、appearanceMode→followTheme 级联） */
export const MIX_SOURCE_KEYS: readonly string[] = Object.values(MIX_DOMAIN_KEYS);

/** 混搭域应用顺序——颜色→字体→圆角→玻璃→背景→表面（10 §2 mockup 行序；碰撞后者覆盖）。
 *  E5.8#97：六域恒在——radius/glass 来源键已删，但基础配方 radius/glass token 仍须经本顺序合并
 *  （profile 缺省 → resolveDomainSource 回退基础配方），删任一域会漏合基础配方圆角/玻璃 token。
 *  E5.8 Phase 11.15 归一化：域清单单一权威——ThemeDomain（theme.ts 类型层）= 域权威，本表声明
 *  ThemeDomain[] 逐元素类型检查（元素漂移编译报错）；穷尽性（全 6 域必在）不设编译期哨兵——
 *  试做 knip 哨兵遭三重工具链摩擦（noUnusedLocals/knip/i18n），按健壮原则撤，欠域症状即时可见
 *  （merge 域被跳过）。MIX_DOMAIN_KEYS 经 Partial<Record<ThemeDomain,string>> 同源，MIX_SOURCE_KEYS
 *  经 Object.values(MIX_DOMAIN_KEYS) 派生——域表无第二份字面量。 */
export const MIX_DOMAIN_ORDER: ThemeDomain[] = ["colors", "font", "radius", "glass", "background", "surface"];

/** glass 域 token 键——SURFACE_ZERO 玻璃键派生（单一权威，删重复静态表）；surfaceVariables 产物中归玻璃域
 *  （glass-*；surface-* 归表面域）。mix.ts domainTokens case "glass" 只碰这组键。 */
export const GLASS_TOKEN_KEYS: readonly string[] = Object.keys(SURFACE_ZERO).filter((k) => k.startsWith("glass-"));

/** E5.8#87：配置「绝对无」哨兵值——app.backgroundImage/zoneBackgroundImage/fontFamily 显式无 = 不跟随主题（真无图/系统字体）。
 *  空值 "" = 跟随主题（presence 门控既有语义不变）；非空非哨兵 = 用户值覆盖。与设置插件侧字面量同契约
 *  （插件不能 import @src/core——config 值契约，对标 "followTheme" 哨兵）。 */
export const CONFIG_NONE_SENTINEL = "__none__";

/** E5.8#87：系统默认字栈——fontFamily="__none__"（系统字体）覆盖写此栈（index.css :root --font-ui 同栈）。
 *  绝对系统默认 = 不跟随主题字体资产。 */
export const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** E5.8#95：系统默认等宽栈——fontFamilyMono="__none__"（系统字体）覆盖写此栈（index.css :root --font-mono 同栈）。 */
export const SYSTEM_MONO_FONT_STACK = "'JetBrains Mono', Consolas, monospace";

/** E5.8#91：系统双字系标尺——亮字系（深底）/ 暗字系（浅底），稳定跨主题不锚主题值（14-档案 #91 §六 6）。
 *  三级文字同比例保层级：primary 实心 / secondary 0.82·0.75 / muted 0.60·0.55。 */
// eslint-disable-next-line linkdesk/no-hardcoded-hex -- 系统标尺数据（用户可选值，非样式硬编码）
export const FONT_TONE_LIGHT_TEXT = ["#FFFFFF", "rgba(255, 255, 255, 0.82)", "rgba(255, 255, 255, 0.60)"] as const;
// eslint-disable-next-line linkdesk/no-hardcoded-hex
export const FONT_TONE_DARK_TEXT = ["#1A1A1A", "rgba(26, 26, 26, 0.75)", "rgba(26, 26, 26, 0.55)"] as const;
/** 文字极性覆盖目标——colorway colors 域三键（app.fontTone 显式选档写这三个 --text-*） */
export const FONT_TONE_TEXT_KEYS = ["text-primary", "text-secondary", "text-muted"] as const;

/** 强调色三键——applyAccentColor 写 :root + 广播载荷剔除共用（#84：accent 唯一来源 = accent:changed，
 *  theme:changed 载荷剔除这三键防跨帧振荡）。对齐 FONT_TONE_TEXT_KEYS 先例。 */
export const ACCENT_TOKEN_KEYS = ["accent", "accent-hover", "accent-light"] as const;

/**
 * E5.8#50.21：app.theme 旧值归一化表（08 §4 迁移表）——旧 flat 主题名 → 壳内置配方 id。
 * "Dark"→"dark" / "Light"→"light"；其余（配方 id / 未迁移 json 名）恒等。迁移逻辑在 migration.ts normalizeThemeValue。
 */
const THEME_VALUE_MIGRATIONS: Record<string, string> = {
  Dark: "dark",
  Light: "light",
};
export { THEME_VALUE_MIGRATIONS };
