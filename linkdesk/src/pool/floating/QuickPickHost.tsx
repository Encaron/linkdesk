/**
 * QuickPickHost——E5.7#15。池侧 QuickPick 哑渲染器（浮层归一化设计.md §5）。
 *
 * 聪慧→哑数据流：壳 QuickPickService 把 items 序列化成 PoolQuickPickData DTO 推送
 * （显示文本铁律——标签/分类/快捷键全部壳侧 t() 解析后以字符串到达，池原样渲染）。
 * 池只做三件事：
 *   1. 本地模糊过滤（150ms 防抖，不 IPC——items 已在池侧）
 *   2. 键盘导航 + 选中变化回传（壳按 key 重解析 item 执行 onHighlight）
 *   3. 动作回传（select/highlight/close/itemAction——壳按 key 重解析后执行原始回调）
 *
 * 状态闭环：壳 push {open:false} 驱动退场动画——池不本地关闭（哑）。
 * Path B：不 import @src/core 运行时模块——类型 import type OK，Z_INDEX 走 constants。
 */

import { useState, useRef, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Z_INDEX } from "../../constants";
import type { PoolQuickPickData } from "../../core/types/poolQuickPick";
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
  onShow: (cb: (data: PoolQuickPickData) => void) => () => void;
  select: (key: string) => void;
  highlight: (key: string) => void;
  close: () => void;
  itemAction: (key: string, actionId: string) => void;
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
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState(0);
  // E3.5 #CP03: 退场动画——closing 期间保留旧 data 渲染，100ms 后卸载
  const [closing, setClosing] = useState(false);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 退场竞态守卫——退场计时器内若已重新打开则跳过卸载（对标 E3 缝 bug 教训）
  const closingRef = useRef(false);

  // ── 池 API 引用（E5#89 约定：window.linkdesk 直接访问，不做 (window as any) 断言） ──
  const apiRef = useRef<PoolQuickPickApi | null>(null);
  if (!apiRef.current) {
    apiRef.current = window.linkdesk?.quickPick ?? null;
  }
  const api = apiRef.current;

  // ── 订阅壳推送（preload 缓冲+回放——硬约束 20 消费侧） ──
  useEffect(() => {
    if (!api) return;
    const unsub = api.onShow((d: PoolQuickPickData) => {
      if (d.open) {
        closingRef.current = false;
        setData(d);
        setClosing(false);
        setQuery("");
        setDebouncedQuery("");
        setSelected(0);
        // 聚焦输入框——对标壳 QuickPick 50ms 延迟等 DOM 就绪
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
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

  // E3.5 #CP03a: 入场动画——渲染后下一帧加 .show 触发 CSS transition
  useEffect(() => {
    if (!data || closing) return;
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, [data, closing]);

  // ── 150ms 防抖（设计 §5.1——输入过滤不 IPC） ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // 模糊搜索 + 排序——匹配度高的排前面
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!debouncedQuery) return data.items;
    const scored = data.items
      .map((item) => ({ item, score: fuzzyScore(debouncedQuery, item.searchText) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [data, debouncedQuery]);

  // 选中项自动滚入可视区
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  // 高亮回传——选中项变化时触发（壳侧 onHighlight 无则 no-op；主题预览用）
  useEffect(() => {
    if (!data || closing || filtered.length === 0) return;
    const idx = Math.min(selected, filtered.length - 1);
    api?.highlight(filtered[idx].key);
  }, [data, closing, selected, filtered, api]);

  // 窗口失焦关闭——对标壳 QuickPick
  useEffect(() => {
    if (!data || closing) return;
    const onBlur = () => api?.close();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [data, closing, api]);

  if (!data) return null;

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      api?.close();
      return;
    }
    if (e.key === "Enter" && filtered.length > 0) {
      const idx = Math.min(selected, filtered.length - 1);
      api?.select(filtered[idx].key);
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
      {/* Backdrop——zIndex quickPick-1，点击关闭 */}
      <div
        className={`quick-pick-backdrop${show && !closing ? " show" : ""}${closing ? " closing" : ""}`}
        style={{ zIndex: Z_INDEX.quickPick - 1 }}
        onClick={() => api?.close()}
      />
      {/* Panel——设计 §5.1：top 15vh 居中，400px 宽，max 60vh 高 */}
      <div
        className={`quick-pick-panel${show && !closing ? " show" : ""}${closing ? " closing" : ""}`}
        style={{ zIndex: Z_INDEX.quickPick }}
        role="dialog"
        aria-modal="true"
      >
        {/* E3.5 #CP10: input 行——prefix + input + clear */}
        <div className="quick-pick-input-row">
          {data.prefix && <span className="quick-pick-prefix">{data.prefix}</span>}
          <input
            ref={inputRef}
            className="quick-pick-input"
            type="text"
            placeholder={data.placeholder}
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
              {debouncedQuery ? t("未找到匹配命令") : t("输入命令名称搜索…")}
            </div>
          ) : (
            filtered.map((item, i) => {
              const isSelected = i === selected;
              return (
                <div
                  key={item.key}
                  className={`quick-pick-item${isSelected ? " selected" : ""}`}
                  onClick={() => api?.select(item.key)}
                  onMouseEnter={() => setSelected(i)}
                >
                  {/* 两排布局——rows(column) > row(flex)（E3f #53b） */}
                  <div className="quick-pick-item-content">
                    <div className="quick-pick-item-row">
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
          {/* E3.5 #CP16: 结果计数 */}
          {filtered.length > 0 && (
            <div className="quick-pick-count">{filtered.length} {t("个命令")}</div>
          )}
        </div>
      </div>
    </>
  );
}
