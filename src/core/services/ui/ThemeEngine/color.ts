/**
 * 颜色串工具——E5.8#151 tint 强制半透明（玻璃系统表面层，21-档案 §三）。
 * 单一权威：tint alpha 封顶只在此写——seeds.ts 用户 glassTint 路径 + tokens.ts 配方 tint 路径共用，
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
