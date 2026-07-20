/**
 * 命令面板——对标 VS Code Ctrl+Shift+P。
 * Phase 5c：数据源从硬编码数组改为 CommandRegistry.getCommands()。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：QuickOpen → Show All Commands
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getCommands, executeCommand, type Command } from "../../core/CommandRegistry";
import { ContextKeyService } from "../../core/ContextKeyService";

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

  // Phase 5c+5d：从 CommandRegistry 获取命令 + when 条件过滤——每次打开面板时重新求值（依赖 open trigger），
  //   确保 context key 变更后下次打开能看到正确的命令列表
  const allCommands = useMemo(() => {
    const cmds = getCommands();
    const result = cmds.filter((cmd) => ContextKeyService.matches(cmd.when));
    // 🔍 Phase 5d 诊断：对比过滤前后
    const withWhen = cmds.filter((c) => c.when);
    const excluded = withWhen.filter((c) => !ContextKeyService.matches(c.when));
    const ckSnapshot: Record<string, unknown> = {};
    ["activeEditor", "portOpen", "portName", "editorCount"].forEach((k) => {
      ckSnapshot[k] = ContextKeyService.getValue(k);
    });
    console.log(`[CommandPalette] ${cmds.length}→${result.length} | ctx=`, ckSnapshot,
      `| 过滤掉:`, excluded.map((c) => `${c.id}: ${c.when}→${ContextKeyService.matches(c.when)}`));
    return result;
  }, [open]);

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

  return createPortal(
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
    </>,
    document.body
  );
}

/** 复用 Command 类型 */
export type { Command };
export default CommandPalette;
