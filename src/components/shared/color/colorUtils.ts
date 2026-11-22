/**
 * 颜色解析 / 格式化——ColorPicker / ColorField / 校验共用的一份实现。
 * 2026-11-23：ColorPicker 2（RGBA）立案——把原先散在 ColorPicker 内的 hex↔hsv
 * 与 hex 正则收到这里，杜绝「调色器一套、色块一套、校验一套」的第二份实现（R4）。
 *
 * 输入：`#RGB` / `#RRGGBB` / `#RRGGBBAA` / `rgb()` / `rgba()` / `hsl()` / `hsla()`
 * 输出：alpha=1 或 allowAlpha=false ⇒ hex；alpha<1 ⇒ rgba(r,g,b,a)（2 位小数）。
 * `var(...)` / `color-mix(...)` 不解析——调用方按只读展示（见 isCssVariableExpression）。
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** CSS 变量 / 表达式——调色器解析不了，调用方只读展示 */
export function isCssVariableExpression(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v.startsWith("var(") || v.startsWith("color-mix(");
}

/** 色相扇区 → RGB（HSV/HSL 共用；c = 色度、m = 底色偏移） */
function sectorToRgb(h: number, c: number, m: number): [number, number, number] {
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round(clamp(r + m, 0, 1) * 255),
    Math.round(clamp(g + m, 0, 1) * 255),
    Math.round(clamp(b + m, 0, 1) * 255),
  ];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  return sectorToRgb(h, v * s, v - v * s);
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = 60 * (((g / 255 - b / 255) / d) % 6);
    else if (max === g / 255) h = 60 * ((b / 255 - r / 255) / d + 2);
    else h = 60 * ((r / 255 - g / 255) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** HSL → RGB（与 HSV 不同：L 是亮度的一半，⛔ 不能拿 hsvToRgb 顶替） */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  return sectorToRgb(h, c, l - c / 2);
}

export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

const toByte = (v: string) => clamp(Number.parseFloat(v), 0, 255);
const toAlpha = (v: string | undefined) => {
  if (v == null) return 1;
  return clamp(v.endsWith("%") ? Number.parseFloat(v) / 100 : Number.parseFloat(v), 0, 1);
};

/** 解析颜色字符串——支持 hex/rgb(a)/hsl(a)；失败或变量表达式返回 null */
export function parseColor(raw: string): Rgba | null {
  const v = raw.trim().toLowerCase();
  if (!v || isCssVariableExpression(v)) return null;

  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
    }
    if (h.length === 6) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
    }
    if (h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: clamp(parseInt(h.slice(6, 8), 16) / 255, 0, 1),
      };
    }
    return null;
  }

  const rgb = v.match(/^rgba?\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+(-?[\d.]+)(?:\s*[,/]\s*(-?[\d.]+%?))?\s*\)$/);
  if (rgb) {
    return { r: toByte(rgb[1]), g: toByte(rgb[2]), b: toByte(rgb[3]), a: toAlpha(rgb[4]) };
  }

  const hsl = v.match(/^hsla?\(\s*(-?[\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:\s*[,/]\s*(-?[\d.]+%?))?\s*\)$/);
  if (hsl) {
    const [r, g, b] = hslToRgb(
      ((Number.parseFloat(hsl[1]) % 360) + 360) % 360,
      clamp(Number.parseFloat(hsl[2]) / 100, 0, 1),
      clamp(Number.parseFloat(hsl[3]) / 100, 0, 1),
    );
    return { r, g, b, a: toAlpha(hsl[4]) };
  }

  return null;
}

/** 格式化——唯一的输出口径：不透明或 allowAlpha=false ⇒ hex；半透明 ⇒ rgba */
export function formatColor(color: Rgba, allowAlpha: boolean): string {
  if (!allowAlpha || color.a >= 1) {
    return "#" + [color.r, color.g, color.b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("");
  }
  const a = Math.round(clamp(color.a, 0, 1) * 100) / 100;
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${a})`;
}
