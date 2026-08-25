/**
 * 主题数据模型纯类型——05 schema（Recipe + Colorway）落地。
 * 壳目录规范 §1：types/ 放跨模块共享纯类型（src / electron / contracts 三端同引）。
 *
 * 设计依据：docs/02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md（决策 A-F 冻结）。
 * 一句话：主题文件 = 一个配方 Recipe = 风格域 appearance（单值稀疏）+ 配色变体 colorways[]（颜色域多值）；
 * 稀疏覆盖，缺的域继承 :root 壳默认。新主题一律 colorways[]（决策 F 单写法）。
 */

/** 颜色 token 集——键 = 变量契约 token 名去 `--`（--bg-window → "bg-window"） */
export interface ThemeColors {
  [key: string]: string;
}

/** E5.8#50.6：玻璃 + 悬浮面板质感字段——主题 JSON `surface`（缺省 = 无玻璃无悬浮）。
 * 纹理 texture 与 glass 正交（⑬ 纸纹分区不带玻璃也能用 per-surface 纹理）。 */
export interface ThemeSurface {
  /** 玻璃配方——缺省 = 无玻璃 */
  type?: "glass";
  /** backdrop blur px——0 = 关 */
  blur?: number;
  /** 饱和度增强——1 = 关 */
  saturate?: number;
  /** 玻璃面叠加色 */
  tint?: string;
  /** 玻璃面不透明度——1 = 不透明 */
  opacity?: number;
  /** 液态玻璃顶部高光强度——0 = 关 */
  specular?: number;
  /** E5.8#63：顶部高光基色（发丝光边颜色）——缺省 = 白；alpha 仍走 specular */
  specularColor?: string;
  /** 形变过渡 ms——0 = 关 */
  morph?: number;
  /** 悬浮圆角 px——0 = 直角贴边 */
  radius?: number;
  /** 投影浮起——true = 悬浮投影（引擎映射 --shadow-lift） */
  shadow?: boolean;
  /** E5.8#50.28：可平铺纹理图资产路径（⑬ 纸纹分区）——应用全部 5 zone 表面，与 glass 正交独立生效 */
  texture?: string;
  /** 纹理不透明度——1 = 不透明 */
  textureOpacity?: number;
}

/** E5.8#50.6：图片背景质感字段——主题 JSON `background`（缺省 = 无图） */
export interface ThemeBackground {
  /** 图片路径——作者提供可解析 URL，引擎写入 `--bg-image` 时 url() 包裹 */
  image?: string;
  /** 图片层不透明度——1 = 不透明 */
  opacity?: number;
  /** 图片遮罩明暗（0-1 rgba 透明度）——0 = 无遮罩 */
  mask?: number;
  /** E5.8#63：遮罩基色（暗化层颜色）——缺省 = 黑；alpha 仍走 mask。仅 panorama 生效（同 mask） */
  maskColor?: string;
  /** E5.8#50.29：切片模式——"panorama"（默认）= 现全窗语义零变化；"zones" = 同图连续切片挂 5 zone 表面（⑭ 影像分区） */
  mode?: "panorama" | "zones";
}

/** 字体域——系统字体族名字符串 or 资产相对路径（#50.17 两步机制：资产 → @font-face → 族名） */
interface ThemeFont {
  /** UI 字体（--font-ui） */
  ui?: string;
  /** 等宽字体（--font-mono） */
  mono?: string;
}

/** 圆角域——八档语义 token 名（02 §2.2，偏门值归并就近档） */
type RadiusTokenKey = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "pill" | "full";

/**
 * 05 schema appearance 域——风格域（单值，稀疏覆盖，缺的域/键继承 :root 壳默认）。
 * 键 = 变量契约 token 名去 `--`；值 = 裸值（引擎写入 :root 时拼回）。
 * glass 复用 ThemeSurface 全字段（材质 + 悬浮形态 + 纹理）——与 #50.6 引擎 surfaceVariables 语义一致。
 */
export interface ThemeAppearance {
  /** 圆角八档（键 = 档位名，值 = px） */
  radius?: Partial<Record<RadiusTokenKey, number>>;
  /** 玻璃 + 悬浮面板 + 纹理——05 §2 appearance.glass */
  glass?: ThemeSurface;
  /** 字体域 */
  font?: ThemeFont;
  /** 背景域（panorama 全窗 / zones 切片） */
  background?: ThemeBackground;
  /** 表面精调域——per-surface 键映射（05 §2：menu-blur: 12、menu-radius: "lg" 引用档位名），预留暂无 CSS 消费者；
   *  引擎 flatten 为 `surface-<key>` token 透传。注意与顶层 glass 域的 ThemeSurface 形态字段不同源。 */
  surface?: Record<string, number | string>;
}

/** 05 schema 配色变体——颜色域一组具体取值（稀疏，未写的颜色 token 继承 :root） */
export interface ThemeColorway {
  /** 配色变体 id——全局唯一（app.themeColor 动态 enum 存此） */
  id: string;
  /** 配色显示名 */
  name: string;
  /** 颜色 token 集（--bg-* / --text-* / --accent 等，键去 -- 前缀） */
  colors?: ThemeColors;
}

/**
 * 05 schema 配方 = 一个主题文件 = 风格域共享 + 配色变体列表。
 * id 全局唯一（惯例 = 插件短名）——app.theme 存这个；name = 主题选择器标题。
 * 新主题一律 colorways[]（决策 F：单写法，引擎只读新格式）。
 */
export interface ThemeRecipe {
  id: string;
  name: string;
  type: "light" | "dark";
  /** 风格域（单值稀疏）——缺的域继承 :root 壳默认 */
  appearance?: ThemeAppearance;
  /** 配色变体列表（至少 1 项；颜色域多值） */
  colorways: ThemeColorway[];
}

/** 配方贡献域——theme 元数据 domains（混搭来源过滤）+ theme:changed 载荷（域级细粒度刷新）共用（06 §2/§6.2）。
 *  六域：colors（配色，colorways 恒贡献） + appearance 五风格域（radius/glass/font/background/surface）。 */
export type ThemeDomain = "colors" | "font" | "radius" | "glass" | "background" | "surface";
