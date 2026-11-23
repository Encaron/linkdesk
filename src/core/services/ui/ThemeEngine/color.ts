/**
 * 颜色串工具——两用：E5.8#151 tint 强制半透明（玻璃系统表面层，21-档案 §三）＋ 墨色极性亮度（第 1 刀 C 腿 9.4）。
 * 单一权威：颜色串解析只在此写（parseColor 私有）——seeds.ts 用户 glassTint 路径 + tokens.ts 配方 tint 路径共用，
 * 禁止两处各手写解析（同概念单写法）。消费侧 CSS color-mix 无法自适应封顶（朝透明混合会乘自身 alpha）→
 * 必须生产者封。
 */

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

/** 解析颜色串 → {r,g,b,alpha}——hex（3/4/6/8 位）+ rgb()/rgba()（逗号/空格 + 可选 / alpha，通道/alpha 支持 %）。
 *  未解析出 → null（named/hsl/var/url 等不猜——21-档案 范围仅 hex+rgb，未知名颜色保持原样防误伤）。 */
function parseColor(color: string): ParsedColor | null {
  const t = color.trim();
  if (t.startsWith("#")) {
    const hex = t.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), alpha: 1 };
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      return {
        r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16),
        alpha: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), alpha: 1 };
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16),
        alpha: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
    return null;
  }
  const m = /^rgba?\(([^)]*)\)$/i.exec(t);
  if (!m) return null;
  const inner = m[1];
  let rgbStr = inner;
  let alphaStr: string | undefined;
  if (inner.includes("/")) {
    const [rgb, a] = inner.split("/");
    rgbStr = rgb;
    alphaStr = a.trim();
  }
  const parts = rgbStr.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (s: string): number => (s.endsWith("%") ? Math.round(255 * (parseFloat(s) / 100)) : Number(s));
  const r = channel(parts[0]);
  const g = channel(parts[1]);
  const b = channel(parts[2]);
  if (![r, g, b].every(Number.isFinite)) return null;
  let alpha = 1;
  const aStr = alphaStr ?? parts[3];
  if (aStr !== undefined) {
    const av = aStr.endsWith("%") ? parseFloat(aStr) / 100 : parseFloat(aStr);
    if (Number.isFinite(av)) alpha = av;
  }
  return { r, g, b, alpha };
}

/** 去掉 alpha、保留 RGB——内容面可读性下限的基色（主题可能把 bg-card 本身写成 rgba，不能当作 solid）。 */
export function opaqueColor(color: string): string | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  return `rgb(${parsed.r},${parsed.g},${parsed.b})`;
}

/**
 * 合成实色：把带 alpha 的面色压到基色上——`*-solid` 的真义是「这层玻璃若变成实色会是什么」。
 * 2026-11-24 实机：整窗主视觉的 `bg-card` 是 `rgba(255,255,255,0.10)`（提亮叠层），
 * 旧实现只去 alpha → solid = 纯白，暗色玻璃主题下补全框/悬浮框变白块。
 * 解析不出 → null（调用方回退去 alpha 的旧语义）；基色不可解析 → 同 opaqueColor。
 */
export function compositeColor(color: string, backing: string): string | null {
  const fg = parseColor(color);
  if (!fg) return null;
  const bg = parseColor(backing);
  if (!bg) return `rgb(${fg.r},${fg.g},${fg.b})`;
  const a = Math.min(1, Math.max(0, fg.alpha));
  const mix = (f: number, b: number) => Math.round(f * a + b * (1 - a));
  return `rgb(${mix(fg.r, bg.r)},${mix(fg.g, bg.g)},${mix(fg.b, bg.b)})`;
}

function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 选择内容面基色：优先用第一个与前景色对比达 4.5 的候选（通常是 bg-card，保留主题卡片色）；
 * 卡片本身是「白色 10%」这类高亮叠层时（整窗主视觉），它的实色与白字对比≈1 → 退到 bg-window 深底。
 * 主题色可能本身带 alpha，先 opaqueColor 去 alpha 再比较；解析不出 → 第一个可解析候选/原样回落。
 */
export function readableSurfaceBase(
  textColor: string | undefined,
  candidates: ReadonlyArray<string | undefined>,
): string | null {
  const opaque = candidates
    .map((c) => (c ? opaqueColor(c) : null))
    .filter((c): c is string => !!c);
  if (opaque.length === 0) return null;
  const textL = textColor ? colorLuminance(textColor) : null;
  if (textL == null) return opaque[0];
  for (const c of opaque) {
    const l = colorLuminance(c);
    if (l != null && contrastRatio(l, textL) >= 4.5) return c;
  }
  let best = opaque[0];
  let bestRatio = -1;
  for (const c of opaque) {
    const l = colorLuminance(c);
    if (l == null) continue;
    const ratio = contrastRatio(l, textL);
    if (ratio > bestRatio) {
      best = c;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * tint 强制半透明——alpha > maxAlpha（缺省 0.5）→ 重写 `rgba(r,g,b,maxAlpha)`；已 ≤ maxAlpha / 未解析 → 原串零改动。
 * 21-档案 §三 #151：tint 永不当不透明死盖片（盖死 backdrop-filter 的 blur/saturate）——保留色相、强制 ≥50% 透。
 * aurora 默认 tint alpha 0.35 已 <0.5 → 零触碰；只影响用户/配方的 solid tint（取色器 hex + 配方 rgba = 全部真实用例）。
 */
export function capTintAlpha(color: string, maxAlpha = 0.5): string {
  if (color.trim() === "") return color;
  const parsed = parseColor(color);
  if (!parsed) return color;
  if (parsed.alpha > maxAlpha) return `rgba(${parsed.r},${parsed.g},${parsed.b},${maxAlpha})`;
  return color;
}

/**
 * 墨色极性判据用的 sRGB 相对亮度（WCAG 定义：线性化 0.04045 断点 + 0.2126/0.7152/0.0722 加权）。
 * 未解析出（`color-mix()` / `var()` / named / hsl）→ null——**不猜**，调用方回落既有档位判据。
 * 只用于「亮墨/暗墨」二选一的分界比对（见 constants.INK_POLARITY_CROSSOVER），⛔ 不参与 CR 计算。
 */
export function colorLuminance(color: string): number | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const linear = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(parsed.r) + 0.7152 * linear(parsed.g) + 0.0722 * linear(parsed.b);
}

/** 明暗极性——主题/混搭的**唯一渲染真相**（`light` = 亮底深字；`dark` = 暗底亮字）。
 *
 *  判据：正文墨色 `text-primary` 与表面 `bg-window-solid`（退 `bg-card-solid` / `bg-window` / `bg-card`）
 *  的相对亮度。表面优先取合成后的 `-solid`（已去 alpha、吸收玻璃/tint），所以玻璃、图片遮罩、跨明暗
 *  配色都按“实际生效值”判，而不是作者声明的 type。
 *
 *  解析不出（`var()` / `color-mix()` / 缺键）→ 回落作者 hint；hint 也没有 → `light`（:root 兜底方向）。
 *  相等亮度按 `dark`（亮字压暗面）处理，避免黑底纯黑字被误判成亮色。
 */
export function resolvePolarity(
  tokens: Record<string, string>,
  fallback: "light" | "dark" = "light",
): "light" | "dark" {
  const text = tokens["text-primary"];
  const surface = tokens["bg-window-solid"]
    ?? tokens["bg-card-solid"]
    ?? tokens["bg-window"]
    ?? tokens["bg-card"];
  const textLum = text ? colorLuminance(text) : null;
  const surfaceLum = surface ? colorLuminance(surface) : null;
  if (textLum == null || surfaceLum == null) return fallback;
  return textLum >= surfaceLum ? "dark" : "light";
}
