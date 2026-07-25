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

/** 取命令的搜索目标——title + category + id，category 权重略低 */
function searchText(cmd: Command): string {
  return `${cmd.title} ${cmd.category ?? ""} ${cmd.id}`;
}

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
    return cmds.filter((cmd) => ContextKeyService.matches(cmd.when));
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

  // E2c #18：模糊搜索——fuzzyScore 排序，匹配度高的排前面
  const filtered = useMemo(() => {
    if (!query) return allCommands;
    const scored = allCommands
      .map((cmd) => ({ cmd, score: fuzzyScore(query, searchText(cmd)) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.cmd);
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
