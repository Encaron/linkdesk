/**
 * ColorPicker 归一化调色器——对标 VS Code ColorPicker。
 * E3f #59e：二维饱和度面板 + 色相条 + hex 输入 + 预设色。
 *
 * 接口：{ open, value, onChange, onClose, presets? }
 * 交互：拖动取色 / hex 输入 / 点击预设 / Enter 确认 / Esc 取消
 *
 * VS Code 对标：src/vs/editor/contrib/colorPicker/browser/colorPickerParts.ts
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import OverlayPortal from "../overlay-portal/OverlayPortal";
import "./ColorPicker.css";

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
  const dragging = useRef<"sv" | "hue" | null>(null);
  const hsvRef = useRef<Hsv>(hsv); // 🔥 拖拽时用 ref 避回调闭包过期

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

  // E5#96n: Esc 关闭 → OverlayPortal onClose 处理
  if (!open) return null;

  const pureHueColor = hsvToHex(hsv.h, 1, 1);
  const posLeft = `${Math.round(hsv.s * 100)}%`;
  const posTop = `${Math.round((1 - hsv.v) * 100)}%`;
  const hueLeft = `${Math.round((hsv.h / 360) * 100)}%`;

  return (
    <OverlayPortal onClose={onClose}>
      {/* 遮罩 */}
      <div className="colorpicker-overlay" />
      <div
        className="colorpicker-panel"
        style={anchor ? { left: anchor.x, top: anchor.y } : undefined}
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
