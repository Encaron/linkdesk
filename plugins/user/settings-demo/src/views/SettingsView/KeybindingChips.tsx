/**
 * KeybindingChips——快捷键键帽卡片（漂亮设置专用，E5.8#41.14 子D 卡片分区大改）。
 * 同一份快捷键数据（window.linkdesk.commands.getCommands + window.linkdesk.keybindings.getKeybindings），
 * 插件作者画成键帽横排，不走内置平铺表格（mockup 帧③「同一份快捷键数据——插件作者自己画」）。
 * 只读展示（搜索 + 键帽 + 冲突 ⚠）——编辑/重置留内置套，本套 UI 的选择。
 * 自己的 .sd-* 类命名空间 + 键帽 .keycap 挂 .settings-demo 根类（零跨插件 CSS 泄漏）。
 *
 * 依赖方向：零 @src/core——数据全走 window.linkdesk.*；被聚合器 SettingsView 消费。
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

/** 契约 Keybinding 线形状的精简本地类型（与内置 KeybindingSettingsView 同款——IPC 序列化后可用字段） */
interface KbRow {
  command: string;
  key: string;
  source: string;
  when?: string;
  pluginId?: string;
}

function KeybindingChips({
  query,
  onQueryChange,
  highlighted,
}: {
  query: string | undefined;
  onQueryChange: (q: string) => void;
  highlighted: boolean;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  const [commands, setCommands] = useState<Array<{ id: string; title?: string }>>([]);
  const [kbs, setKbs] = useState<KbRow[]>([]);

  // IPC 异步数据——getCommands / getKeybindings 是 Promise（E5.5#7-p2 铁律）
  const loadData = useCallback(async () => {
    const [cmds, kbList] = await Promise.all([
      window.linkdesk.commands?.getCommands?.() ?? Promise.resolve([]),
      window.linkdesk.keybindings?.getKeybindings?.() ?? Promise.resolve([]),
    ]);
    setCommands(cmds as Array<{ id: string; title?: string }>);
    setKbs(kbList as KbRow[]);
  }, []);

  useEffect(() => { loadData(); }, [loadData, version]);

  // 快捷键注册表变更 + 插件生命周期 → 刷新（#59-B）
  useEffect(() => {
    const unsub1 = window.linkdesk.keybindings?.onChange?.(() => setVersion((v) => v + 1));
    const unsub2 = window.linkdesk.configuration?.onPluginLifecycleChange?.(() => setVersion((v) => v + 1));
    return () => { unsub1?.(); unsub2?.(); };
  }, []);

  // 冲突检测——同 key 多个绑定 → ⚠（按 key 分组计数）
  const conflictKeys = useMemo(() => {
    const byKey = new Map<string, number>();
    for (const kb of kbs) {
      if (!kb.key) continue;
      byKey.set(kb.key, (byKey.get(kb.key) ?? 0) + 1);
    }
    return new Set([...byKey.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [kbs]);

  // 只画「有绑定」的命令——键帽卡片语义：展示快捷键，不是命令清单
  const rows = useMemo(() => {
    const kbMap = new Map(kbs.map((kb) => [kb.command, kb]));
    const bound = commands
      .map((cmd) => {
        const kb = kbMap.get(cmd.id);
        if (!kb) return null;
        return {
          command: cmd.id,
          title: cmd.title ?? cmd.id,
          key: kb.key,
          source: kb.source,
          when: kb.when,
          _conflict: conflictKeys.has(kb.key),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    bound.sort((a, b) => a.title.localeCompare(b.title, "zh"));
    return bound;
  }, [commands, kbs, conflictKeys]);

  const filtered = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.command.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        (r.when ?? "").toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const sourceLabel = (s: string) => {
    if (s === "user") return t("用户");
    if (s === "plugin") return t("插件");
    if (s === "builtin") return t("内置");
    return "—";
  };

  return (
    <div className={`sd-kb ${highlighted ? "highlight" : ""}`}>
      <div className="sd-kb-search">
        <span className="codicon codicon-search sd-kb-search-icon" />
        <input
          className="sd-kb-input"
          type="text"
          placeholder={t("搜索快捷键")}
          value={query ?? ""}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="sd-kb-empty">{t("无匹配快捷键")}</div>
      ) : (
        <div className="sd-kb-rows">
          {filtered.map((row) => (
            <div className="sd-kb-row" key={row.command}>
              <div className="sd-kb-cmd">
                <span className="sd-kb-cmd-title">{t(row.title)}</span>
                <span className="sd-kb-cmd-id">{row.command}</span>
              </div>
              <div className="sd-kb-key">
                {/* chord "ctrl+k ctrl+t" → 键帽横排（空格拆分） */}
                {row.key.split(" ").map((part) => (
                  <span className="keycap" key={part}>{part}</span>
                ))}
                {row._conflict && (
                  <span
                    className="sd-kb-warn"
                    title={t("快捷键冲突")}
                    role="img"
                    aria-label={t("快捷键冲突")}
                  >⚠</span>
                )}
              </div>
              <div className="sd-kb-src">{sourceLabel(row.source)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default KeybindingChips;
