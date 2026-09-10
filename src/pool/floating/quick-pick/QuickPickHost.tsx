/**
 * QuickPickHost——E5.7#15。池侧 QuickPick 哑渲染器（浮层归一化设计.md §5）。
 *
 * 双数据源（E5.7#63）：
 *   ① 壳推送——QuickPickService 把 items 序列化成 PoolQuickPickData DTO 推送
 *     （显示文本铁律——标签/分类/快捷键全部壳侧 t() 解析后以字符串到达，池原样渲染）；
 *     动作（select/highlight/close/itemAction）按 key 回传壳重解析执行。
 *   ② 插件请求——linkdesk.quickPick.show(opts) 经 preload contextBridge 函数代理
 *     （quickPickHost.registerHost）到达：池本地渲染 + 选择/取消时按 key 回传 settle——
 *     preload 侧（Promise 所在地）映射条目对象。contextBridge 每跳结构化克隆，插件最终
 *     收到结构化副本（非 === 原对象——VS Code IPC 同款语义，2026-08-15 验收实证订正）。
 *     零 IPC——过滤/键盘导航/动作解析全在池侧（插件数据本就完整，壳侧注册表无参与）。
 *
 * 仲裁规则（单例显示，last-wins——VS Code 同款）：
 *   - 插件请求顶掉旧插件请求（旧 settle(null) → preload 映射 undefined）
 *   - 壳推送 open:true 顶掉插件请求（settle(null)）
 *   - 插件请求结束时回落到壳数据（若壳仍在展示）
 *   - 壳推送 open:false 只清壳数据——插件请求展示期间不影响（回落后自然消失）
 *
 * 状态闭环：壳 push {open:false} 驱动退场动画——池不本地关闭（哑）。
 * Path B：不 import @src/core 运行时模块——类型 import type OK，Z_INDEX 走 constants。
 */

import { useState, useRef, useEffect, useMemo, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Z_INDEX } from "../../../constants";
import { getScrimTarget } from "../../../components/shared/overlay-portal/OverlayPortal"; // E5.8#107 浮层权威：遮罩归 scrim-plane
import { OVERLAY_LAYER_ATTR, isTopmostOverlay } from "../../../components/shared/overlay-portal/overlayLayer"; // E6#73b ④ Esc 分层
import type { PoolQuickPickData, PoolQuickPickItem, PluginQuickPickItem, PluginQuickPickRequest } from "../../../core/types/pool/poolQuickPick";
import "./QuickPickHost.css";

/* ── 模糊搜索（E2c #18 同款——壳 QuickPick.tsx 副本；#18 删壳组件后此处归一为唯一实现） ── */

/**
 * 对标 VS Code fuzzyScore——首字母连续匹配→高分，中间连续匹配→中分，跳跃匹配→低分。
 * 返回值 = 0 表示不匹配。
 */
function fuzzyScore(query: string, target: string): number {
  query = query.toLowerCase();
  target = target.toLowerCase();
  let score = 0;
  let qi = 0;
  let consecutive = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      qi++;
      consecutive++;
      // 首字母 / 空格后 / 点后 → 权重高
      if (ti === 0 || target[ti - 1] === " " || target[ti - 1] === ".") score += 10;
      if (consecutive > 1) score += 5;
      else score += 1;
    } else {
      consecutive = 0;
    }
  }
  return qi === query.length ? score : 0;
}

/* ── 池 API 形状——global.d.ts 的 window.linkdesk 是宽松类型，此处收窄到精确形状 ── */

interface PoolQuickPickApi {
  /** E5.7#63：注册插件请求渲染入口——mount 时注册（主世界函数经 contextBridge 代理进 preload 存储）。
   *  settle(key)：key = 条目原数组 index 字符串，null = 取消——preload 侧按 key 映射条目对象。返回 unsubscribe */
  registerHost: (fn: (req: PluginQuickPickRequest, settle: (key: string | null) => void) => void) => () => void;
  onShow: (cb: (data: PoolQuickPickData) => void) => () => void;
  select: (key: string) => void;
  highlight: (key: string) => void;
  close: () => void;
  itemAction: (key: string, actionId: string) => void;
}

/* ── E5.7#63：插件条目 → 池渲染 DTO ── */

/**
 * key = 原数组 index 字符串——过滤重排后仍能稳定回传（preload 侧按 key 映射条目对象）。
 * searchText = 三字段合并（对标 VS Code 匹配 label + description + detail）。
 * description → category（第一行右），detail → detail（第二行左）。
 */
export function pluginItemToDto(item: PluginQuickPickItem, index: number): PoolQuickPickItem {
  return {
    key: String(index),
    searchText: [item.label, item.description, item.detail].filter(Boolean).join(" "),
    label: item.label,
    category: item.description,
    detail: item.detail,
  };
}

/* ── 快捷键 pill——壳已解析 "ctrl+shift+p" 字符串，池拆分成 keycap 哑渲染 ── */

function renderKeybinding(keybinding: string) {
  const parts = keybinding.split("+");
  return (
    <span className="keybinding-pill">
      {parts.map((k, i) => (
        <span key={`${k}-${i}`}>
          {i > 0 && <span className="keybinding-sep">+</span>}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export default function QuickPickHost() {
  const { t } = useTranslation();

  const [data, setData] = useState<PoolQuickPickData | null>(null);
  // E5.7#63：插件请求（池内本地桥）——opts 由 preload 代理到达，settle(key) 在选择/取消时调用
  const [pluginReq, setPluginReq] = useState<(PluginQuickPickRequest & { settle: (key: string | null) => void }) | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // E3.5 #CP03: 退场动画——closing 期间保留旧 data 渲染，100ms 后卸载
  const [closing, setClosing] = useState(false);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** E6#73b ④：面板本体——浮层表面标记 + Esc 分层判据的载体 */
  const panelRef = useRef<HTMLDivElement>(null);
  // 退场竞态守卫——退场计时器内若已重新打开则跳过卸载（对标 E3 缝 bug 教训）
  const closingRef = useRef(false);
  // E5.7#63：插件请求 ref 镜像——事件回调（keydown/blur/backdrop）读最新值，免 effect 重订阅。
  // 渲染镜像滞后一个渲染周期——同一事件循环内连续 show() 的仲裁读值靠 registerHost 内同步写（见下）。
  const pluginReqRef = useRef(pluginReq);
  pluginReqRef.current = pluginReq;

  // ── 池 API 引用（E5#89 约定：window.linkdesk 直接访问，不做 (window as any) 断言） ──
  const apiRef = useRef<PoolQuickPickApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = window.linkdesk?.quickPickHost ?? null;
  }
  const api = apiRef.current;

  /** 归一关闭入口——插件请求本地 settle(null)（preload 映射 undefined）；壳推送则回传 close（两态同一条路径） */
  const closeCurrent = useCallback(() => {
    const p = pluginReqRef.current;
    if (p) {
      p.settle(null);
      setPluginReq(null);
    } else {
      api?.close();
    }
  }, [api]);

  /** 归一选择入口——插件请求回传 key（preload 按 key 映射条目对象）；壳推送回传 select */
  const selectCurrent = useCallback((key: string) => {
    const p = pluginReqRef.current;
    if (p) {
      p.settle(key);
      setPluginReq(null);
    } else {
      api?.select(key);
    }
  }, [api]);

  // E5.7#63：注册插件请求渲染入口——preload 缓冲回放的消费端（硬约束 20）
  useEffect(() => {
    if (!api) return;
    const unsub = api.registerHost((req, settle) => {
      // last-wins——新请求顶掉旧请求（VS Code 语义：新 quick input 令旧 Promise resolve(undefined)）
      pluginReqRef.current?.settle(null);
      // ref 同步写——渲染镜像（下一行渲染时才更新）跟不上同一事件循环内的连续 show()：
      // React 批处理两次调用间无渲染，读渲染镜像则旧请求漏 settle（2026-08-15 用户验收实证）
      const next = { ...req, settle };
      pluginReqRef.current = next;
      closingRef.current = false;
      setPluginReq(next);
      setClosing(false);
      setQuery("");
      setDebouncedQuery("");
      setSelected(0);
      // 聚焦输入框——对标壳推送同款 50ms 延迟等 DOM 就绪
      setTimeout(() => inputRef.current?.focus(), 50);
    });
    return unsub;
  }, [api]);

  // ── 订阅壳推送（preload 缓冲+回放——硬约束 20 消费侧） ──
  useEffect(() => {
    if (!api) return;
    const unsub = api.onShow((d: PoolQuickPickData) => {
      if (d.open) {
        // E5.7#63：壳推送（命令面板等）顶掉插件请求——settle(null) 后渲染壳数据
        pluginReqRef.current?.settle(null);
        setPluginReq(null);
        closingRef.current = false;
        setData(d);
        setClosing(false);
        setQuery("");
        setDebouncedQuery("");
        setSelected(0);
        // 聚焦输入框——对标壳 QuickPick 50ms 延迟等 DOM 就绪
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        // E5.7#63：插件请求展示期间壳推 close——只清壳数据，退场动画跳过（面板正渲染插件内容，
        // setClosing/setShow 会把插件面板的 .show 类也打掉）
        if (pluginReqRef.current) {
          setData(null);
          return;
        }
        closingRef.current = true;
        setClosing(true);
        setShow(false);
        setTimeout(() => {
          if (closingRef.current) {
            closingRef.current = false;
            setClosing(false);
            setData(null);
          }
        }, 100);
      }
    });
    return unsub;
  }, [api]);

  // E5.7#63：插件请求 → 渲染 DTO（惰性序列化——请求变化才重算）。渲染源归一：插件请求优先于壳推送。
  const pluginData: PoolQuickPickData | null = useMemo(() => {
    if (!pluginReq) return null;
    return {
      open: true,
      placeholder: pluginReq.opts.placeholder ?? "",
      prefix: pluginReq.opts.prefix,
      items: pluginReq.opts.items.map(pluginItemToDto),
    };
  }, [pluginReq]);
  const renderData = pluginData ?? data;
  const isPlugin = pluginData !== null;

  // E3.5 #CP03a: 入场动画——渲染后下一帧加 .show 触发 CSS transition
  useEffect(() => {
    if (!renderData || closing) return;
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, [renderData, closing]);

  // ── 150ms 防抖（设计 §5.1——输入过滤不 IPC） ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // 模糊搜索 + 排序——匹配度高的排前面
  const filtered = useMemo(() => {
    if (!renderData) return [];
    if (!debouncedQuery) return renderData.items;
    const scored = renderData.items
      .map((item) => ({ item, score: fuzzyScore(debouncedQuery, item.searchText) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [renderData, debouncedQuery]);

  // 选中项自动滚入可视区
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  // 高亮回传——选中项变化时触发（壳侧 onHighlight 无则 no-op；主题预览用）。插件请求本地解析，不回传壳。
  useEffect(() => {
    if (!renderData || closing || filtered.length === 0 || isPlugin) return;
    const idx = Math.min(selected, filtered.length - 1);
    api?.highlight(filtered[idx].key);
  }, [renderData, closing, selected, filtered, isPlugin, api]);

  // 窗口失焦关闭——对标壳 QuickPick（插件请求本地 settle(null)，壳推送回传 close）
  useEffect(() => {
    if (!renderData || closing) return;
    const onBlur = () => closeCurrent();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [renderData, closing, closeCurrent]);

  // 窗口重获焦点 → 输入框重聚焦——show 于窗口失焦时被调用（插件定时器触发等），50ms 焦点
  // 定时器拿不到真实焦点，键盘动作（Enter/Escape/输入）全部落空；重聚焦补齐（2026-08-15 验收实证）
  useEffect(() => {
    if (!renderData || closing) return;
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [renderData, closing]);

  if (!renderData) return null;

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // E6#73b ④：只关最上层浮层（输入框自己收键盘事件，但面板底下压着的通知面板
      // 会走窗口级监听器一起被关掉——非顶层就放行，不吞这一发）
      if (isTopmostOverlay(panelRef.current)) closeCurrent();
      return;
    }
    if (e.key === "Enter" && filtered.length > 0) {
      const idx = Math.min(selected, filtered.length - 1);
      selectCurrent(filtered[idx].key);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  return (
    <>
      {/* Backdrop——E5.8#107 浮层权威：归 #ld-scrim-plane（遮罩平面，无磨砂）——满屏遮罩与 surface
          分离后结构隔离地板 :not(#ld-scrim-plane) 天然不碰它。zIndex quickPick-1，点击关闭。 */}
      {createPortal(
        <div
          className={`quick-pick-backdrop${show && !closing ? " show" : ""}${closing ? " closing" : ""}`}
          style={{ zIndex: Z_INDEX.quickPick - 1 }}
          onClick={() => closeCurrent()}
        />,
        getScrimTarget()
      )}
      {/* Panel——设计 §5.1：top 15vh 居中，400px 宽，max 60vh 高 */}
      <div
        ref={panelRef}
        className={`quick-pick-panel${show && !closing ? " show" : ""}${closing ? " closing" : ""}`}
        {...{ [OVERLAY_LAYER_ATTR]: "" }}
        style={{ zIndex: Z_INDEX.quickPick }}
        role="dialog"
        aria-modal="true"
      >
        {/* E3.5 #CP10: input 行——prefix + input + clear */}
        <div className="quick-pick-input-row">
          {renderData.prefix && <span className="quick-pick-prefix">{renderData.prefix}</span>}
          <input
            ref={inputRef}
            className="quick-pick-input"
            type="text"
            placeholder={renderData.placeholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              className="quick-pick-clear codicon codicon-close"
              onClick={() => { setQuery(""); setSelected(0); inputRef.current?.focus(); }}
              title={t("清除")}
            />
          )}
        </div>

        <div className="quick-pick-list" ref={listRef}>
          {/* E3.5 #CP08: 空态提示 */}
          {filtered.length === 0 ? (
            <div className="quick-pick-empty">
              {isPlugin ? t("未找到匹配项") : debouncedQuery ? t("未找到匹配命令") : t("输入命令名称搜索…")}
            </div>
          ) : (
            filtered.map((item, i) => {
              const isSelected = i === selected;
              return (
                <div
                  key={item.key}
                  className={`quick-pick-item${isSelected ? " selected" : ""}`}
                  onClick={() => selectCurrent(item.key)}
                  onMouseEnter={() => setSelected(i)}
                >
                  {/* 两排布局——rows(column) > row(flex)（E3f #53b） */}
                  <div className="quick-pick-item-content">
                    <div className="quick-pick-item-row">
                      {/* E5.8#32：已激活项勾选标记——label 左侧 ✓。checked true/false（视图选择器）恒渲染占位保对齐；undefined（通用 QuickPick/插件请求）不渲染零回归 */}
                      {item.checked !== undefined && (
                        <span className={`quick-pick-item-check${item.checked ? " checked" : ""}`}>
                          {item.checked ? <span className="codicon codicon-check" /> : null}
                        </span>
                      )}
                      <span className="quick-pick-item-label">{item.label}</span>
                      {item.category && (
                        <span className="quick-pick-item-category">{item.category}</span>
                      )}
                    </div>
                    {(item.detail || item.keybinding) && (
                      <span className="quick-pick-item-detail">
                        <span className="quick-pick-item-detail-id">{item.detail}</span>
                        {item.keybinding && (
                          <span className="quick-pick-item-detail-right">
                            {renderKeybinding(item.keybinding)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {/* 行内操作按钮——回传 actionId，壳按 key 重解析执行 */}
                  {item.buttons && item.buttons.length > 0 && (
                    <span className="quick-pick-item-actions">
                      {item.buttons.map((b) => (
                        <button
                          key={b.actionId}
                          className={`quick-pick-item-btn codicon codicon-${b.icon}`}
                          title={b.tooltip}
                          onClick={(e) => {
                            e.stopPropagation();
                            api?.itemAction(item.key, b.actionId);
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              );
            })
          )}
          {/* E3.5 #CP16: 结果计数——插件请求不显示（VS Code showQuickPick 无计数） */}
          {!isPlugin && filtered.length > 0 && (
            <div className="quick-pick-count">{filtered.length} {t("个命令")}</div>
          )}
        </div>
      </div>
    </>
  );
}
