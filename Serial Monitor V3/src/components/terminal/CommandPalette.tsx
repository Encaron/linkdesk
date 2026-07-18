import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface Command {
  id: string;
  label: string;
  action: () => void;
}

interface Props {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

function CommandPalette({ open, commands, onClose }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  // 输入变化时重置选中
  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelected(0);
  };

  const execute = (cmd: Command) => {
    onClose();
    cmd.action();
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
            if (e.key === "Escape") { onClose(); return; }
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
              {cmd.label}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export type { Command };
export default CommandPalette;
