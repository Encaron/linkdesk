/**
 * ColorPicker 归一化调色器——对标 VS Code ColorPicker。
 * 2026-11-23 ColorPicker 2：SV + 色相 + **alpha** + 小预览 + 文本输入 + 预设；hex/rgb(a)/hsl(a) 通吃。
 * 几何与交互稿 `docs/04-软件更新/待抉择池/色彩选择器-RGBA/color-picker-preview.html` 逐项对齐
 * （260 宽、滑杆 1fr+40 数值列、输入 30 高、预设 22、取消/应用 24 右对齐）。
 *
 * 能力档 `allowAlpha`（默认 false）：
 *   - false：alpha 行不渲染、输出恒 hex（旧调用零变化——强调色等参与对比度的颜色）；
 *   - true ：alpha 行渲染、输出 rgba（alpha=1 仍输出 hex，旧值零变化）。
 * 解析/格式化唯一实现 = `../color/colorUtils`（与 ColorField/校验共用，⛔ 不在本文件另写一套）。
 *
 * 交互：拖 SV；色相/alpha 原生 range（键盘可达）；输入框即时校验；点预设；应用提交 / 取消关闭；
 * Esc 关闭交给 OverlayPortal（只关最上层浮层，⛔ 不在这里重复挂监听）。
 * 命令：`showColorPicker`（`color-picker.pick`）——支持 RGBA；直接设值仍走 `configuration.set`。
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import OverlayPortal, { getScrimTarget } from "../overlay-portal/OverlayPortal";
import {
  formatColor,
  hsvToHex,
  hsvToRgb,
  isCssVariableExpression,
  parseColor,
  rgbToHsv,
  type Hsv,
  type Rgba,
} from "../color/colorUtils";
import "./ColorPicker.css";

/* ── E5.8#83 根因 A：视口边界碰撞 ──
   面板固定宽 260px；高随 alpha 行 / presets 有无变化。首帧估算 clamp，挂载后实测校正。
   基线来自交互稿实测：260×277（无 alpha、无预设）＋ alpha 22 ＋ 预设 30。 */

export const PANEL_WIDTH = 260;
const PANEL_BASE_HEIGHT = 277;
const PANEL_ALPHA_HEIGHT = 22;
const PANEL_PRESETS_HEIGHT = 30;
const PANEL_MARGIN = 8;

export interface PanelPos {
  left: number;
  top: number;
}

function estimatePanelHeight(allowAlpha: boolean, hasPresets: boolean): number {
  return PANEL_BASE_HEIGHT
    + (allowAlpha ? PANEL_ALPHA_HEIGHT : 0)
    + (hasPresets ? PANEL_PRESETS_HEIGHT : 0);
}

/** 纯函数——锚点右上角 + 视口 → 面板落点（右/下方放不下翻到左/上 + clamp 收拢入视口）。 */
export function resolvePanelPosition(
  anchor: { x: number; y: number },
  panelWidth: number,
  panelHeight: number,
  viewport: { width: number; height: number },
  margin = PANEL_MARGIN,
): PanelPos {
  const maxLeft = Math.max(margin, viewport.width - panelWidth - margin);
  const maxTop = Math.max(margin, viewport.height - panelHeight - margin);
  const left = Math.min(Math.max(
    anchor.x + panelWidth + margin <= viewport.width ? anchor.x : anchor.x - panelWidth - margin,
    margin,
  ), maxLeft);
  const top = Math.min(Math.max(
    anchor.y + panelHeight + margin <= viewport.height ? anchor.y : anchor.y - panelHeight - margin,
    margin,
  ), maxTop);
  return { left, top };
}

/* ── 命令面：当前打开调色器的结构化操作（硬约束 26）──
   一个 GUI 动作 = 一个 action，⛔ 不散成七条命令。AI 路径：
   `color-picker.session {action:"open"}` → setHsv/setHue/setAlpha/setValue/applyPreset
   → `apply`（返回最终值，落盘仍走 `configuration.set`）/ `cancel`。 */

export interface ColorPickerSnapshot {
  open: boolean;
  /** 格式化后的当前值（allowAlpha=false 或 a=1 ⇒ hex；a<1 ⇒ rgba） */
  value: string;
  format: "hex" | "rgba";
  alpha: number;
  allowAlpha: boolean;
  readonly: boolean;
  invalid: boolean;
}

interface ColorPickerSession {
  snapshot(): ColorPickerSnapshot;
  setHsv(h: number, s: number, v: number): ColorPickerSnapshot;
  setHue(h: number): ColorPickerSnapshot;
  setAlpha(a: number): ColorPickerSnapshot;
  setValue(value: string): ColorPickerSnapshot;
  applyPreset(index: number): ColorPickerSnapshot;
  apply(): ColorPickerSnapshot;
  cancel(): void;
}

let activeSession: ColorPickerSession | null = null;

export function getColorPickerSession(): ColorPickerSession | null {
  return activeSession;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * 命令实现——`color-picker.session` 的唯一入口（注册在 `src/App/startup.ts`）。
 * `open` 不等待用户：立即返回 `{open:true}`，后续 action 操作同一实例；
 * 其余 action 必须有打开的调色器，否则抛错（命令失败 = 结构化错误，不静默）。
 */
export function runColorPickerSessionAction(
  action: string,
  payload: Record<string, unknown> = {},
): ColorPickerSnapshot | { open: boolean } {
  if (action === "open") {
    const initialColor = typeof payload.initialColor === "string" ? payload.initialColor : undefined;
    const presets = Array.isArray(payload.presets) ? payload.presets as string[] : undefined;
    const allowAlpha = payload.allowAlpha === true;
    void showColorPicker({ initialColor, presets, allowAlpha });
    return { open: true };
  }
  const s = activeSession;
  if (!s) throw new Error("当前没有打开的调色器——先执行 color-picker.session { action: \"open\" }");
  switch (action) {
    case "setHsv":
      return s.setHsv(
        num(payload.h, 0),
        clamp01(num(payload.s, 1)),
        clamp01(num(payload.v, 1)),
      );
    case "setHue":
      return s.setHue(num(payload.h, 0));
    case "setAlpha":
      return s.setAlpha(clamp01(num(payload.a, 1)));
    case "setValue":
      if (typeof payload.value !== "string") throw new Error("setValue 需要字符串参数 value");
      return s.setValue(payload.value);
    case "applyPreset":
      return s.applyPreset(Math.max(0, Math.trunc(num(payload.index, 0))));
    case "apply":
      return s.apply();
    case "cancel":
      s.cancel();
      return { open: false };
    default:
      throw new Error(`未知的调色器动作：${action}`);
  }
}

/* ── Props ── */

export interface ColorPickerProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  presets?: string[];
  /** 弹出位置——null 时居中 */
  anchor?: { x: number; y: number } | null;
  /** 能力档：true = 可调 alpha、输出 rgba；false（默认）= 不透明、输出 hex */
  allowAlpha?: boolean;
}

interface PickerState {
  hsv: Hsv;
  a: number;
}

function stateFromValue(value: string): PickerState {
  const c = parseColor(value);
  if (!c) return { hsv: rgbToHsv(31, 120, 212), a: 1 }; // 兜底 = 旧默认 #0078d4
  return { hsv: rgbToHsv(c.r, c.g, c.b), a: c.a };
}

function rgbaFromState(state: PickerState, allowAlpha: boolean): Rgba {
  const [r, g, b] = hsvToRgb(state.hsv.h, state.hsv.s, state.hsv.v);
  return { r, g, b, a: allowAlpha ? state.a : 1 };
}

/* ── 组件 ── */

export default function ColorPicker({
  open,
  value,
  onChange,
  onClose,
  presets,
  anchor,
  allowAlpha = false,
}: ColorPickerProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PickerState>(() => stateFromValue(value));
  const [input, setInput] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"sv" | null>(null);
  const stateRef = useRef<PickerState>(state); // 拖拽时用 ref 避回调闭包过期
  const readonlyRef = useRef(false);           // 命令面快照同步用（state 异步）
  const invalidRef = useRef(false);
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const allowAlphaRef = useRef(allowAlpha);
  allowAlphaRef.current = allowAlpha;
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const hasPresets = (presets?.length ?? 0) > 0;
  readonlyRef.current = readonly;

  const syncFromValue = useCallback((next: string) => {
    setInput(next);
    setInvalid(false);
    invalidRef.current = false;
    const isVar = isCssVariableExpression(next);
    setReadonly(isVar);
    readonlyRef.current = isVar;
    if (isVar) return;
    const nextState = stateFromValue(next);
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  // 外部 value 变化（含打开）时同步内部状态
  useEffect(() => {
    if (open) syncFromValue(value);
  }, [value, open, syncFromValue]);

  const update = useCallback((next: PickerState) => {
    stateRef.current = next;
    setState(next);
    setInput(formatColor(rgbaFromState(next, allowAlpha), allowAlpha));
  }, [allowAlpha]);

  const commit = useCallback(() => {
    if (readonly) return;
    onChange(formatColor(rgbaFromState(stateRef.current, allowAlpha), allowAlpha));
    onClose();
  }, [allowAlpha, onChange, onClose, readonly]);

  const commitInput = useCallback((raw: string) => {
    setInput(raw);
    if (isCssVariableExpression(raw)) {
      setReadonly(true);
      readonlyRef.current = true;
      setInvalid(false);
      invalidRef.current = false;
      return;
    }
    const c = parseColor(raw);
    if (!c) {
      setInvalid(true);
      invalidRef.current = true;
      return;
    }
    setInvalid(false);
    invalidRef.current = false;
    const next = { hsv: rgbToHsv(c.r, c.g, c.b), a: c.a };
    stateRef.current = next;
    setState(next);
  }, []);

  /* ── 命令面会话：open 期间暴露结构化操作方法（命令 → runColorPickerSessionAction）── */
  useEffect(() => {
    if (!open) return;
    const snapshot = (): ColorPickerSnapshot => {
      const st = stateRef.current;
      const alpha = allowAlphaRef.current ? st.a : 1;
      return {
        open: true,
        value: formatColor(rgbaFromState(st, allowAlphaRef.current), allowAlphaRef.current),
        format: allowAlphaRef.current && alpha < 1 ? "rgba" : "hex",
        alpha,
        allowAlpha: allowAlphaRef.current,
        readonly: readonlyRef.current,
        invalid: invalidRef.current,
      };
    };
    const api: ColorPickerSession = {
      snapshot,
      setHsv: (h, s, v) => {
        update({ hsv: { h: Math.min(360, Math.max(0, h)), s: clamp01(s), v: clamp01(v) }, a: stateRef.current.a });
        return snapshot();
      },
      setHue: (h) => {
        update({ ...stateRef.current, hsv: { ...stateRef.current.hsv, h: Math.min(360, Math.max(0, h)) } });
        return snapshot();
      },
      setAlpha: (a) => {
        update({ ...stateRef.current, a: clamp01(a) });
        return snapshot();
      },
      setValue: (value) => {
        commitInput(value);
        return snapshot();
      },
      applyPreset: (index) => {
        const c = presetsRef.current?.[index];
        const parsed = c ? parseColor(c) : null;
        if (parsed) {
          update({ hsv: rgbToHsv(parsed.r, parsed.g, parsed.b), a: parsed.a });
        }
        return snapshot();
      },
      apply: () => {
        const snap = snapshot();
        commit();
        return snap;
      },
      cancel: () => onClose(),
    };
    activeSession = api;
    return () => {
      if (activeSession === api) activeSession = null;
    };
  }, [open, update, commit, commitInput, onClose]);

  /* ── SV 拖拽（色相/alpha 用原生 range，键盘可达）── */

  const handleSvMouse = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    update({ ...stateRef.current, hsv: { ...stateRef.current.hsv, s: x, v: 1 - y } });
  }, [update]);

  // 全局 mouseup / mousemove——停止 SV 拖拽
  useEffect(() => {
    if (!open || readonly) return;
    const handleUp = () => { dragging.current = null; };
    const handleMove = (e: MouseEvent) => {
      if (dragging.current === "sv") handleSvMouse(e);
    };
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("mousemove", handleMove);
    };
  }, [open, readonly, handleSvMouse]);

  // Esc 关闭由 OverlayPortal 统一处理（只关最上层浮层）——⛔ 不在这里再挂一份，否则一次 Esc 回调两次

  // E5.8#83 根因 A：视口边界碰撞——anchor 时实测面板尺寸 → clamp/翻转落点
  useLayoutEffect(() => {
    if (!open || !anchor) { setPanelPos(null); return; }
    const el = panelRef.current;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pos = el
      ? resolvePanelPosition(anchor, el.offsetWidth, el.offsetHeight, viewport)
      : resolvePanelPosition(anchor, PANEL_WIDTH, estimatePanelHeight(allowAlpha, hasPresets), viewport);
    setPanelPos((prev) => (prev && prev.left === pos.left && prev.top === pos.top ? prev : pos));
  }, [open, anchor, hasPresets, allowAlpha]);

  if (!open) return null;

  const pureHueColor = hsvToHex(state.hsv.h, 1, 1);
  const posLeft = `${Math.round(state.hsv.s * 100)}%`;
  const posTop = `${Math.round((1 - state.hsv.v) * 100)}%`;
  const effectiveAlpha = allowAlpha ? state.a : 1;
  const [r, g, b] = hsvToRgb(state.hsv.h, state.hsv.s, state.hsv.v);
  const previewRgba = `rgba(${r},${g},${b},${Math.round(effectiveAlpha * 100) / 100})`;
  const alphaPercent = Math.round(effectiveAlpha * 100);
  const estPos = anchor && !panelPos
    ? resolvePanelPosition(
        anchor,
        PANEL_WIDTH,
        estimatePanelHeight(allowAlpha, hasPresets),
        { width: window.innerWidth, height: window.innerHeight },
      )
    : null;
  const displayPos = panelPos ?? estPos;

  return (
    <OverlayPortal onClose={onClose}>
      {createPortal(<div className="ldk-colorpicker-overlay" onClick={() => onClose()} />, getScrimTarget())}
      <div
        ref={panelRef}
        className="ldk-colorpicker-panel"
        style={anchor && displayPos ? { left: displayPos.left, top: displayPos.top } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SV 面板 */}
        <div
          ref={svRef}
          className={`ldk-colorpicker-sv${readonly ? " is-readonly" : ""}`}
          style={{ background: pureHueColor }}
          onMouseDown={(e) => {
            if (readonly) return;
            dragging.current = "sv";
            handleSvMouse(e);
          }}
        >
          <div className="ldk-colorpicker-sv-white" />
          <div className="ldk-colorpicker-sv-black" />
          <div className="ldk-colorpicker-sv-cursor" style={{ left: posLeft, top: posTop }} />
        </div>

        {/* 色相行 */}
        <div className="ldk-colorpicker-slider-row">
          <input
            className="ldk-colorpicker-hue ldk-colorpicker-hue-cursor"
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(state.hsv.h)}
            disabled={readonly}
            onChange={(e) => update({
              ...stateRef.current,
              hsv: { ...stateRef.current.hsv, h: Number(e.target.value) },
            })}
            aria-label={t("色相")}
            aria-valuetext={`${Math.round(state.hsv.h)}°`}
          />
          <span className="ldk-colorpicker-num">{Math.round(state.hsv.h)}°</span>
        </div>

        {/* alpha 行——能力档为真才渲染 */}
        {allowAlpha && (
          <div className="ldk-colorpicker-slider-row">
            <input
              className="ldk-colorpicker-alpha"
              type="range"
              min={0}
              max={100}
              step={1}
              value={alphaPercent}
              disabled={readonly}
              onChange={(e) => update({ ...stateRef.current, a: Number(e.target.value) / 100 })}
              style={{
                backgroundImage: `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b})), `
                  + `repeating-conic-gradient(color-mix(in srgb, var(--text-primary) 14%, transparent) 0 25%, transparent 0 50%)`,
                backgroundSize: "auto, 8px 8px",
              }}
              aria-label={t("不透明度")}
              aria-valuetext={`${alphaPercent}%`}
            />
            <span className="ldk-colorpicker-num">{alphaPercent}%</span>
          </div>
        )}

        {/* 取值行：小预览 + 文本输入 */}
        <div className="ldk-colorpicker-field ldk-colorpicker-footer">
          <div className="ldk-colorpicker-preview">
            <span
              className="ldk-colorpicker-preview-fill"
              style={{ background: readonly ? "transparent" : previewRgba }}
            />
          </div>
          <input
            className={`ldk-colorpicker-hex${invalid ? " is-invalid" : ""}`}
            type="text"
            value={input}
            readOnly={readonly}
            onChange={(e) => commitInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !invalid && !readonly) commit();
            }}
            spellCheck={false}
            aria-label={t("颜色值")}
          />
        </div>

        {/* 错误/只读说明——常驻占位，校验时不跳动 */}
        <p className={`ldk-colorpicker-error${readonly ? " is-info" : ""}`}>
          {readonly
            ? t("此值是 CSS 变量/表达式——只读展示，不能在调色器里改。")
            : invalid
              ? t("无效的颜色值")
              : ""}
        </p>

        {/* 预设色 */}
        {hasPresets && (
          <div className="ldk-colorpicker-presets">
            {presets!.map((c) => (
              <button
                key={c}
                type="button"
                className="ldk-colorpicker-preset"
                aria-label={c}
                disabled={readonly}
                data-hint={c}
                data-hint-delay="0"
                onClick={() => {
                  const parsed = parseColor(c);
                  if (!parsed) return;
                  update({ hsv: rgbToHsv(parsed.r, parsed.g, parsed.b), a: parsed.a });
                }}
              >
                <span className="ldk-colorpicker-preset-checker" />
                <span className="ldk-colorpicker-preset-fill" style={{ background: c }} />
              </button>
            ))}
          </div>
        )}

        {/* 底部动作：紧凑右对齐 */}
        <div className="ldk-colorpicker-actions">
          <button className="ldk-colorpicker-cancel" onClick={() => onClose()}>{t("取消")}</button>
          <button className="ldk-colorpicker-ok" onClick={commit} disabled={readonly}>{t("应用")}</button>
        </div>
      </div>
    </OverlayPortal>
  );
}

/* ── 命令入口——Promise 桥接，插件调 commands.execute 弹出浮层 ── */

export interface ShowColorPickerOptions {
  initialColor?: string;
  presets?: string[];
  anchor?: { x: number; y: number } | null;
  /** 能力档：true = 可调 alpha、返回 rgba；false（默认）= 不透明、返回 hex */
  allowAlpha?: boolean;
}

/**
 * 命令式弹出 ColorPicker——对标 QuickPick show() 模式。
 * 插件调 `linkdesk.commands.execute('color-picker.pick', { initialColor, allowAlpha })`
 * → 浮层挂到 #overlay-root（E5.8#107 浮层权威；壳 DOM 无此 root 回退 body）→ 应用 → resolve(value) → 自动清理 DOM。
 * 取消/遮罩/Esc ⇒ resolve(undefined)。
 */
export function showColorPicker(options: ShowColorPickerOptions = {}): Promise<string | undefined> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    (document.getElementById("overlay-root") ?? document.body).appendChild(container);
    const root = createRoot(container);
    let settled = false;

    const cleanup = (color?: string) => {
      if (settled) return; // onChange → onClose 连发：只清一次（重复 unmount 会炸）
      settled = true;
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
        allowAlpha={options.allowAlpha}
        onChange={(next) => cleanup(next)}
        onClose={() => cleanup(undefined)}
      />
    );
  });
}
