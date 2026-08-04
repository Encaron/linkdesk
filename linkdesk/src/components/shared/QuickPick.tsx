/**
 * QuickPick——归一化浮动选择面板。
 * E3b #36a：从 CommandPalette 提取公共壳——portal + overlay + input + fuzzy + ↑↓EnterEsc。
 *
 * 对标 VS Code QuickPick——CommandPalette / ThemeBrowser / LanguagePicker 共用一个组件。
 * 每个场景只需提供 items + onSelect + getSearchText，~40 行。
 *
 * 设计依据：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/08-执行清单.md #36a
 * VS Code 对标：src/vs/base/parts/quickinput/browser/quickInput.ts
 */

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { registerCommand } from "../../core/registry/CommandRegistry";

/* ── 模糊搜索（E2c #18）── */

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

/* ── 类型 ── */

export interface QuickPickProps<T> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调——调用方 setState(false) */
  onClose: () => void;
  /** 可选列表 */
  items: T[];
  /** 输入框占位文本 */
  placeholder: string;
  /** 提交选择——Enter 或点击时调用。QuickPick 自动关面板。 */
  onSelect: (item: T) => void;
  /** 高亮预览——↑↓ 或 hover 时调用。主题预览用（即时 apply），可选。 */
  onHighlight?: (item: T) => void;
  /** 提取搜索文本——用于模糊匹配和默认渲染 */
  getSearchText: (item: T) => string;
  /** 提取唯一 React key */
  getKey: (item: T) => string;
  /** 自定义渲染——默认显示 getSearchText(item)。⚠️ 旧 API——新代码用 slot props */
  renderItem?: (item: T, isSelected: boolean) => ReactNode;
  /** E3.5 #CP17：第一行左侧——标题/名称。不传则 fallback 到 getSearchText(item)。 */
  renderLabel?: (item: T) => ReactNode;
  /** E3.5 #CP17：第一行右侧——分类/标签。不传则不显示。 */
  renderCategory?: (item: T) => ReactNode;
  /** E3.5 #CP17：第二行左侧——描述/ID。不传则不显示第二行。 */
  renderDetail?: (item: T) => ReactNode;
  /** E3.5 #CP17：第二行右侧——快捷键/状态。不传则不显示。 */
  renderDetailRight?: (item: T) => ReactNode;
  /** E3.5 #CP09：输入前缀字符——命令面板传 ">" 标明命令模式 */
  prefix?: string;
  /** E3f #53b：每行右侧操作区——命令面板齿轮等。QuickPick 不关心内容，只留位置。 */
  renderItemActions?: (item: T, isSelected: boolean) => ReactNode;
}

/* ── 组件 ── */

export default function QuickPick<T>({
  open,
  onClose,
  items,
  placeholder,
  onSelect,
  onHighlight,
  getSearchText,
  getKey,
  renderItem,
  renderLabel,
  renderCategory,
  renderDetail,
  renderDetailRight,
  renderItemActions,
  prefix,
}: QuickPickProps<T>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // E3.5 #CP03: 退场动画——open→false 时先去 .show，等 transition 150ms 再卸载
  const [closing, setClosing] = useState(false);
  const prevOpen = useRef(open);
  useEffect(() => {
    if (prevOpen.current && !open) {
      overlayRef.current?.classList.remove("show");
      paletteRef.current?.classList.remove("show");
      setClosing(true);
      const timer = setTimeout(() => setClosing(false), 150);
      return () => clearTimeout(timer);
    }
    prevOpen.current = open;
  }, [open]);

  // 打开时重置——聚焦输入框，清空搜索和选中
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 窗口失焦关闭——对标 ContextMenu
  useEffect(() => {
    if (!open) return;
    const onBlur = () => onClose();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [open, onClose]);

  // 模糊搜索 + 排序——匹配度高的排前面
  const filtered = useMemo(() => {
    if (!query) return items;
    const scored = items
      .map((item) => ({ item, score: fuzzyScore(query, getSearchText(item)) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [query, items, getSearchText]);

  // 输入变化时重置选中到第一项
  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  // 选中项自动滚入可视区
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  // onHighlight 回调——选中项变化时触发（主题预览）
  useEffect(() => {
    if (!open) return;
    if (onHighlight && filtered.length > 0) {
      const idx = Math.min(selected, filtered.length - 1);
      onHighlight(filtered[idx]);
    }
  }, [open, selected, filtered, onHighlight]);

  // E3.5 #CP03a: 入场动画——首次渲染后下一帧加 .show 触发 CSS transition
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      overlayRef.current?.classList.add("show");
      paletteRef.current?.classList.add("show");
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open && !closing) return null;

  const handleSelect = (item: T) => {
    onSelect(item);
    onClose();
  };

  // E3.5 #CP17: 任一 slot prop 有值 → 使用新结构化布局（消费者填空，壳提供结构）
  const useSlots = renderLabel != null || renderCategory != null || renderDetail != null || renderDetailRight != null;

  return createPortal(
    <>
      <div ref={overlayRef} className="ctx-overlay" onClick={onClose} />
      <div ref={paletteRef} className="palette">
        {/* E3.5 #CP10: input 行——prefix + input + (future: clear) */}
        <div className="palette-input-row">
          {prefix && <span className="palette-prefix">{prefix}</span>}
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
              return;
            }
            if (e.key === "Enter" && filtered.length > 0) {
              const idx = Math.min(selected, filtered.length - 1);
              handleSelect(filtered[idx]);
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
          }}
          />
          {/* E3.5 #CP13: 清除按钮——query 非空时显示 */}
          {query && (
            <button
              className="palette-clear codicon codicon-close"
              onClick={() => { setQuery(""); setSelected(0); inputRef.current?.focus(); }}
              title={t("清除")}
            />
          )}
        </div>
        <div className="palette-list" ref={listRef}>
          {/* E3.5 #CP08: 空态提示——无匹配结果时显示，避免白板 */}
          {filtered.length === 0 ? (
            <div className="palette-empty">
              {query ? t("未找到匹配命令") : t("输入命令名称搜索…")}
            </div>
          ) : (
            filtered.map((item, i) => {
            const isSelected = i === selected;
            return (
            <div
              key={getKey(item)}
              className={`palette-item${isSelected ? " selected" : ""}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelected(i)}
            >
              {useSlots ? (
                /* E3.5 #CP17: 新 API——结构化两行布局，消费者只填槽位 */
                <div className="palette-item-content">
                  <div className="palette-item-row">
                    <span className="palette-item-label">
                      {renderLabel?.(item) ?? getSearchText(item)}
                    </span>
                    {renderCategory?.(item) && (
                      <span className="palette-item-category">{renderCategory(item)}</span>
                    )}
                  </div>
                  {(renderDetail || renderDetailRight) && (
                    <span className="palette-item-detail">
                      <span className="palette-item-detail-id">{renderDetail?.(item)}</span>
                      {renderDetailRight?.(item) && (
                        <span className="palette-item-detail-right">{renderDetailRight(item)}</span>
                      )}
                    </span>
                  )}
                </div>
              ) : (
                /* 旧 API——renderItem 或默认 getSearchText（向后兼容） */
                <span className="palette-item-label">
                  {renderItem ? renderItem(item, isSelected) : getSearchText(item)}
                </span>
              )}
              {renderItemActions && (
                <span className="palette-item-actions">
                  {renderItemActions(item, isSelected)}
                </span>
              )}
            </div>
            );
          })
          )}
          {/* E3.5 #CP16: 结果计数 */}
          {filtered.length > 0 && (
            <div className="palette-count">{filtered.length} {t("个命令")}</div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ── E3j #80：命令入口——Promise 桥接，插件调 commands.execute 弹出浮动列表 ── */

export interface QuickPickItem {
  label: string;
  description?: string;
}

interface ShowQuickPickOptions {
  title?: string;
  items: QuickPickItem[];
}

/**
 * 命令式弹出 QuickPick——对标 VS Code vscode.window.showQuickPick()。
 * 插件调 `linkdesk.commands.executeCommand('quickpick.show', { title, items })`
 * → 浮动列表 → 用户选一项 / Esc → 返回结果 / undefined → 自动清理 DOM。
 */
export function showQuickPick(options: ShowQuickPickOptions): Promise<QuickPickItem | undefined> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = (result?: QuickPickItem) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <QuickPick<QuickPickItem>
        open={true}
        onClose={() => cleanup(undefined)}
        items={options.items}
        placeholder={options.title ?? ""}
        onSelect={(item) => cleanup(item)}
        getSearchText={(item) => item.label}
        getKey={(item) => item.label}
        // E3.5 #CP22: 切 slot props——description 从第一行移到第二行 detail
        renderLabel={(item) => item.label}
        renderDetail={(item) => item.description}
      />,
    );
  });
}

// 注册命令——插件侧调 linkdesk.commands.executeCommand('quickpick.show', { title, items })
registerCommand("linkdesk", {
  id: "quickpick.show",
  title: "QuickPick",
  when: "false",
  handler: async (_token: unknown, ...args: unknown[]) => {
    return showQuickPick(args[0] as ShowQuickPickOptions);
  },
});
