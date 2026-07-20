/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * Phase 5c：数据源从硬编码数组改为 CommandRegistry.getCommands()。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：QuickOpen → Show All Commands
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getCommands, executeCommand, type Command } from "../../core/CommandRegistry";

interface Props {
  open: boolean;
  onClose: () => void;
}

function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Phase 5c：从 CommandRegistry 获取所有已注册命令
  const allCommands = useMemo(() => getCommands(), []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.category?.toLowerCase().includes(q) ?? false) ||
        c.id.toLowerCase().includes(q)
    );
  }, [query, allCommands]);

  // 输入变化时重置选中
  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  const execute = (cmd: Command) => {
    onClose();
    executeCommand(cmd.id);
  };

  // 选中项滚入可视区
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  if (!open) return null;

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} />
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder={t("输入命令…")}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
              return;
            }
            if (e.key === "Enter" && filtered.length > 0) {
              const idx = Math.min(selected, filtered.length - 1);
              execute(filtered[idx]);
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
        <div className="palette-list" ref={listRef}>
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`palette-item${i === selected ? " selected" : ""}`}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="palette-item-label">{cmd.title}</span>
              {cmd.category && (
                <span className="palette-item-category">{cmd.category}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** 复用 Command 类型 */
export type { Command };
export default CommandPalette;
