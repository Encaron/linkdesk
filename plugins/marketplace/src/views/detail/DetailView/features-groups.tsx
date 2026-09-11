/**
 * features-groups——详情「功能」tab 的四组内容（命令 / 配置项 / 键绑定 / 菜单项，mockup 帧 9）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `views/DetailFeaturesTab.tsx` 原样搬出（迁入同名夹
 * 见 `FeaturesTab.tsx`），零行为变更——宿主因此只剩「状态 + 空态 + 四组并排」。
 *
 * 交互（M2，mockup 帧 9）：
 *   - 命令项点击 → 复制命令 ID（linkdesk.clipboard.writeText——既有 API）+ 短暂 ✓ 反馈；
 *   - 配置项点击 → 跳设置页对应 group（壳 core.openSettings {pluginId, scrollTo:key}——settings
 *     useSettingsEvents 消费 scrollTo 滚到 setting-row-<key>，_token 壳命令壳内消费零声明）；
 *   - 键绑定 / 菜单项只读展示。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cmdIdOf, type CmdItem, type ConfigItem, type KbItem } from "./contribs";

/** 组壳——四组同构（标题 + 计数 + 行容器）；0 项整组不渲染 */
function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="mpd-fc-sec">
      <h3 className="mpd-fc-sec-title">
        {title} <span className="mpd-fc-count">{count}</span>
      </h3>
      <div className="mpd-fc-rows">{children}</div>
    </section>
  );
}

/** 命令组——点击复制命令 ID；`copied`（哪条刚复制过）与超时清理归宿主持有 */
export function CommandGroup({
  commands,
  copied,
  onCopy,
}: {
  commands: CmdItem[];
  copied: string | null;
  onCopy: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Section title={t("命令")} count={commands.length}>
      {commands.map((c, i) => {
        const id = cmdIdOf(c);
        return (
          <button key={id || i} className="mpd-fc-row" onClick={() => onCopy(id)} title={t("点击复制命令 ID")}>
            <span className="codicon codicon-terminal mpd-fc-row-icon" />
            <span className="mpd-fc-main">
              <span className="mpd-fc-title">{c.title || id}</span>
              {c.title && <span className="mpd-fc-id">{id}</span>}
            </span>
            {copied === id ? (
              <span className="mpd-fc-copied">
                <span className="codicon codicon-check" /> {t("已复制")}
              </span>
            ) : null}
          </button>
        );
      })}
    </Section>
  );
}

/** 配置组——点击跳设置页对应 group（判据在宿主 `handleJumpConfig`） */
export function ConfigGroup({ configs, onJump }: { configs: ConfigItem[]; onJump: (key: string) => void }) {
  const { t } = useTranslation();
  return (
    <Section title={t("配置项")} count={configs.length}>
      {configs.map(([key, desc]) => (
        <button key={key} className="mpd-fc-row" onClick={() => onJump(key)} title={t("在设置中打开")}>
          <span className="codicon codicon-gear mpd-fc-row-icon" />
          <span className="mpd-fc-main">
            <span className="mpd-fc-title">{desc?.description || key}</span>
            <span className="mpd-fc-id">{key}</span>
          </span>
          <span className="codicon codicon-chevron-right mpd-fc-arrow" />
        </button>
      ))}
    </Section>
  );
}

/** 键绑定组——只读展示 */
export function KeybindingGroup({ keybindings }: { keybindings: KbItem[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t("键绑定")} count={keybindings.length}>
      {keybindings.map((k, i) => (
        <div key={i} className="mpd-fc-row mpd-fc-row-readonly">
          <span className="codicon codicon-keyboard mpd-fc-row-icon" />
          <span className="mpd-fc-main">
            <span className="mpd-fc-title">{k.command}</span>
            {k.key && <span className="mpd-fc-kbd">{k.key}</span>}
          </span>
        </div>
      ))}
    </Section>
  );
}

/** 菜单项组——只读展示 */
export function MenuGroup({ menuRows }: { menuRows: Array<{ menu: string; command: string }> }) {
  const { t } = useTranslation();
  return (
    <Section title={t("菜单项")} count={menuRows.length}>
      {menuRows.map((m, i) => (
        <div key={i} className="mpd-fc-row mpd-fc-row-readonly">
          <span className="codicon codicon-menu mpd-fc-row-icon" />
          <span className="mpd-fc-main">
            <span className="mpd-fc-title">{m.command}</span>
            <span className="mpd-fc-id">{m.menu}</span>
          </span>
        </div>
      ))}
    </Section>
  );
}
