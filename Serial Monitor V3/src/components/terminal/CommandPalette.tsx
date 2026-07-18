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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const execute = (cmd: Command) => {
    onClose();
    cmd.action();
  };

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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && filtered.length > 0) execute(filtered[0]);
          }}
        />
        <div className="palette-list">
          {filtered.map((cmd) => (
            <div key={cmd.id} className="palette-item" onClick={() => execute(cmd)}>
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
