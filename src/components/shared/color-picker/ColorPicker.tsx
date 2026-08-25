/**
 * ColorPicker 归一化调色器——对标 VS Code ColorPicker。
 * E3f #59e：二维饱和度面板 + 色相条 + hex 输入 + 预设色。
 *
 * 接口：{ open, value, onChange, onClose, presets? }
 * 交互：拖动取色 / hex 输入 / 点击预设 / Enter 确认 / Esc 取消
 *
 * VS Code 对标：src/vs/editor/contrib/colorPicker/browser/colorPickerParts.ts
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import OverlayPortal from "../overlay-portal/OverlayPortal";
import "./ColorPicker.css";

/* ── E5.8#83 根因 A：视口边界碰撞 ──
   面板固定宽 232px（CSS .colorpicker-panel）；高随 presets 有无 ≈224/263。首帧估算 clamp，
   挂载后实测校正——保证任意滚动位置 OK 键恒在视口内可 hover/点击。 */

export const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 224;
const PANEL_HEIGHT_WITH_PRESETS = 263;
const PANEL_MARGIN = 8;

export interface PanelPos { left: number; top: number; }

/** 纯函数——锚点右上角 + 视口 → 面板落点（右/下方放不下翻到左/上 + clamp 收拢入视口）。
 *  恒在视口内（margin 8px）。抽出纯函数便于单测。 */
export function resolvePanelPosition(
  anchor: { x: number; y: number },
  panelWidth: number,
  panelHeight: number,
  viewport: { width: number; height: number },
  margin = PANEL_MARGIN,
): PanelPos {
  const maxLeft = Math.max(margin, viewport.width - panelWidth - margin);
  const maxTop = Math.max(margin, viewport.height - panelHeight - margin);
  // 水平：优先右排（面板左缘 = 锚点 x）；右侧放不下翻到左侧
  const left = Math.min(Math.max(
    anchor.x + panelWidth + margin <= viewport.width ? anchor.x : anchor.x - panelWidth - margin,
    margin,
  ), maxLeft);
  // 垂直：优先下排（面板顶 = 锚点 y）；下方放不下翻到上方
  const top = Math.min(Math.max(
    anchor.y + panelHeight + margin <= viewport.height ? anchor.y : anchor.y - panelHeight - margin,
    margin,
  ), maxTop);
  return { left, top };
}

/* ── 颜色转换工具（内联——零依赖）── */

interface Hsv { h: number; s: number; v: number; }

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = 60 * (((g / 255 - b / 255) / d) % 6);
    else if (max === g / 255) h = 60 * (((b / 255 - r / 255) / d) + 2);
    else h = 60 * (((r / 255 - g / 255) / d) + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

/* ── Props ── */

export interface ColorPickerProps {
  open: boolean;
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  presets?: string[];
  /** 弹出位置——null 时居中 */
  anchor?: { x: number; y: number } | null;
}

/* ── 颜色输入文本——用户输入时实时校验 ── */

function normalizeHexInput(raw: string): string {
  let h = raw.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
  if (h.length > 0) h = "#" + h;
  return h;
}

/* ── 组件 ── */

export default function ColorPicker({ open, value, onChange, onClose, presets, anchor }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"sv" | "hue" | null>(null);
  const hsvRef = useRef<Hsv>(hsv); // 🔥 拖拽时用 ref 避回调闭包过期
  // E5.8#83：面板落点（anchor 时）。首帧用估算尺寸 clamp，挂载后实测校正。
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);

  // 外部 value 变化时同步内部状态
  useEffect(() => {
    if (open) {
      const next = hexToHsv(value);
      hsvRef.current = next;
      setHsv(next);
      setHexInput(value);
    }
  }, [value, open]);

  // hexInput 校验：合法 → 同步 hsv；不合法 → 保持旧值
  const commitHex = useCallback((raw: string) => {
    const hex = normalizeHexInput(raw);
    setHexInput(hex);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const newHsv = hexToHsv(hex);
      hsvRef.current = newHsv;
      setHsv(newHsv);
      return hex;
    }
    return null;
  }, []);

  /* ── 鼠标交互——SV 面板 + 色相条（读 ref 避 closure 过期）── */

  const handleSvMouse = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const cur = hsvRef.current;
    const next: Hsv = { ...cur, s: x, v: 1 - y };
    hsvRef.current = next;
    setHsv(next);
    setHexInput(hsvToHex(next.h, next.s, next.v));
  }, []);

  const handleHueMouse = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cur = hsvRef.current;
    const next: Hsv = { ...cur, h: x * 360 };
    hsvRef.current = next;
    setHsv(next);
    setHexInput(hsvToHex(next.h, next.s, next.v));
  }, []);

  // 全局 mouseup——停止拖拽
  useEffect(() => {
    if (!open) return;
    const handleUp = () => { dragging.current = null; };
    const handleMove = (e: MouseEvent) => {
      if (dragging.current === "sv") handleSvMouse(e);
      else if (dragging.current === "hue") handleHueMouse(e);
    };
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("mousemove", handleMove);
    };
  }, [open, handleSvMouse, handleHueMouse]);

  // E5.8#83 根因 A：视口边界碰撞——anchor 时实测面板尺寸 → clamp/翻转落点
  // （首帧渲染已用估算 clamp，此处校正精确高度——presets 有无影响面板高）
  useLayoutEffect(() => {
    if (!open || !anchor) { setPanelPos(null); return; }
    const el = panelRef.current;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pos = el
      ? resolvePanelPosition(anchor, el.offsetWidth, el.offsetHeight, viewport)
      : resolvePanelPosition(anchor, PANEL_WIDTH, presets?.length ? PANEL_HEIGHT_WITH_PRESETS : PANEL_HEIGHT, viewport);
    setPanelPos((prev) => (prev && prev.left === pos.left && prev.top === pos.top ? prev : pos));
  }, [open, anchor, presets]);

  // E5#96n: Esc 关闭 → OverlayPortal onClose 处理
  if (!open) return null;

  const pureHueColor = hsvToHex(hsv.h, 1, 1);
  const posLeft = `${Math.round(hsv.s * 100)}%`;
  const posTop = `${Math.round((1 - hsv.v) * 100)}%`;
  const hueLeft = `${Math.round((hsv.h / 360) * 100)}%`;
  // 首帧兜底——layout effect 实测校正前用估算尺寸 clamp（避免 anchor 时闪居中再跳位）
  const estPos = anchor && !panelPos
    ? resolvePanelPosition(
        anchor,
        PANEL_WIDTH,
        presets?.length ? PANEL_HEIGHT_WITH_PRESETS : PANEL_HEIGHT,
        { width: window.innerWidth, height: window.innerHeight },
      )
    : null;
  const displayPos = panelPos ?? estPos;

  return (
    <OverlayPortal onClose={onClose}>
      {/* 遮罩——E5.8#83 根因 B：overlay 全屏拦截背景控件（modal 预期），但需点背景可关闭（对标 VS Code modal）——
          绑 onClick→onClose，打破「只能 Escape/OK 退、OK 又屏外」的死锁 */}
      <div className="colorpicker-overlay" onClick={() => onClose()} />
      <div
        ref={panelRef}
        className="colorpicker-panel"
        style={anchor && displayPos ? { left: displayPos.left, top: displayPos.top } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SV 面板 */}
        <div
          ref={svRef}
          className="colorpicker-sv"
          style={{ background: pureHueColor }}
          onMouseDown={(e) => {
            dragging.current = "sv";
            handleSvMouse(e);
          }}
        >
          <div className="colorpicker-sv-white" />
          <div className="colorpicker-sv-black" />
          <div className="colorpicker-sv-cursor" style={{ left: posLeft, top: posTop }} />
        </div>

        {/* 色相条 */}
        <div
          ref={hueRef}
          className="colorpicker-hue"
          onMouseDown={(e) => {
            dragging.current = "hue";
            handleHueMouse(e);
          }}
        >
          <div className="colorpicker-hue-cursor" style={{ left: hueLeft }} />
        </div>

        {/* 底部：预览 + hex 输入 */}
        <div className="colorpicker-footer">
          <div className="colorpicker-preview" style={{ background: hexInput }} />
          <input
            className="colorpicker-hex"
            type="text"
            value={hexInput}
            onChange={(e) => {
              const hex = commitHex(e.target.value);
              if (hex) onChange(hex);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const hex = commitHex(hexInput);
                if (hex) onChange(hex);
              }
            }}
            spellCheck={false}
          />
          <button className="colorpicker-ok" onClick={() => { onChange(hexInput); onClose(); }}>OK</button>
        </div>

        {/* 预设色 */}
        {presets && presets.length > 0 && (
          <div className="colorpicker-presets">
            {presets.map((c) => (
              <div
                key={c}
                className="colorpicker-preset"
                style={{ background: c }}
                title={c}
                onClick={() => {
                  const next = hexToHsv(c);
                  hsvRef.current = next;
                  setHsv(next);
                  setHexInput(c);
                  onChange(c);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </OverlayPortal>
  );
}

/* ── E3f #59e2：命令入口——Promise 桥接，插件调 commands.execute 弹出浮层 ── */

export interface ShowColorPickerOptions {
  initialColor?: string;
  presets?: string[];
  anchor?: { x: number; y: number } | null;
}

/**
 * 命令式弹出 ColorPicker——对标 QuickPick show() 模式。
 * 插件调 `linkdesk.commands.execute('color-picker.pick', { initialColor: '#f00' })`
 * → 浮层挂到 document.body → 选色 → resolve(hex) → 自动清理 DOM。
 */
export function showColorPicker(options: ShowColorPickerOptions = {}): Promise<string | undefined> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.className = "colorpicker-command-root";
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = (color?: string) => {
      root.unmount();
      container.remove();
      resolve(color);
    };

    root.render(
      <ColorPicker
        open={true}
        value={options.initialColor ?? "#0078d4"}
        presets={options.presets}
        anchor={options.anchor}
        onChange={(hex) => cleanup(hex)}
        onClose={() => cleanup(undefined)}
      />
    );
  });
}
