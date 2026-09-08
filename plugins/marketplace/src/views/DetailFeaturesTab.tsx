/**
 * DetailFeaturesTab——详情「功能」tab 渲染面（E6#30.6d，mockup 帧 9）。
 *   数据 = list().manifest.contributes（现成字段，壳零新 API）。contributes 只在已装**启用**分支存在
 *   （list() 序列化子集含 contributes；禁用 getDisabled 子集与未装目录均无）→ 无数据走空态引导措辞分档。
 *
 *   四组自动列出（contributes 实际声明才有组）：命令 / 配置项 / 键绑定 / 菜单项。交互（M2，mockup 帧 9）：
 *   - 命令项点击 → 复制命令 ID（linkdesk.clipboard.writeText——既有 API）+ 短暂 ✓ 反馈；
 *   - 配置项点击 → 跳设置页对应 group（壳 core.openSettings {pluginId, scrollTo:key}——settings
 *     useSettingsEvents 消费 scrollTo 滚到 setting-row-<key>，_token 壳命令壳内消费零声明）；
 *   - 键绑定 / 菜单项只读展示。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const lk = () => window.linkdesk;

/* ── contributes Record<string,unknown> 逐 key 收窄（容忍缺省形状，个别坏项不崩整组） ── */

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type CmdItem = { id?: string; title?: string; command?: string };
type KbItem = { key?: string; command?: string };
type MenuItem = { command?: string };

function cmdIdOf(c: CmdItem): string {
  return (c.id ?? c.command ?? "").trim();
}

type Props = {
  /** 被查看插件 id——配置项跳设置页的 pluginId（contributes 拥有者） */
  pluginId: string;
  /** enabled 分支 list() manifest.contributes；无 = 禁用/未装/未声明 */
  contributes?: Record<string, unknown>;
  /** 有 contributes 数据源（enabled 已装）——未声明 vs 数据不可得两种空态措辞分档 */
  hasContribSource: boolean;
  /** 已装（含禁用）——空态措辞：禁用「启用后查看」vs 未装「安装后查看」 */
  installed: boolean;
};

export default function DetailFeaturesTab({ pluginId, contributes, hasContribSource, installed }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  /* 四组解析——有声明才出现（每组 0 项不渲染组壳） */
  const { commands, configs, keybindings, menuRows } = useMemo(() => {
    const commands: CmdItem[] = asList(contributes?.commands)
      .map((c) => c as CmdItem)
      .filter((c) => cmdIdOf(c));
    const configObj = (contributes?.configuration ?? {}) as { properties?: Record<string, { description?: string }> };
    const configs = configObj.properties ? Object.entries(configObj.properties) : [];
    const keybindings: KbItem[] = asList(contributes?.keybindings)
      .map((k) => k as KbItem)
      .filter((k) => k.command || k.key);
    const menusRaw = (contributes?.menus ?? {}) as Record<string, unknown>;
    const menuRows: Array<{ menu: string; command?: string }> = [];
    for (const [menu, items] of Object.entries(menusRaw)) {
      const list = Array.isArray(items) ? items : [];
      for (const it of list as MenuItem[]) {
        if (it?.command) menuRows.push({ menu, command: it.command });
      }
    }
    return { commands, configs, keybindings, menuRows };
  }, [contributes]);

  const handleCopy = (id: string) => {
    const write = lk()?.clipboard?.writeText;
    if (!write) return;
    void write(id)
      .then(() => {
        setCopied(id);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(null), 1400);
      })
      .catch(() => {
        /* clipboard 不可用（预览环境）——静默无反馈 */
      });
  };

  const handleJumpConfig = (key: string) => {
    // 壳 core.openSettings——handler 读 args[0] ctx { pluginId, scrollTo } → requestSettingsGroup + requestScrollToSetting
    void lk()?.commands?.executeCommand?.("core.openSettings", { pluginId, scrollTo: key });
  };

  /* ── 空态：无任何可展示组 ── */
  if (commands.length === 0 && configs.length === 0 && keybindings.length === 0 && menuRows.length === 0) {
    return (
      <div className="mpd-fc-empty">
        <p>
          {hasContribSource
            ? t("该插件未声明功能贡献")
            : installed
              ? t("启用插件后在此查看功能贡献")
              : t("安装插件后在此查看功能贡献")}
        </p>
      </div>
    );
  }

  const copyFeedback = (id: string) =>
    copied === id ? (
      <span className="mpd-fc-copied">
        <span className="codicon codicon-check" /> {t("已复制")}
      </span>
    ) : null;

  return (
    <div className="mpd-fc">
      {commands.length > 0 && (
        <section className="mpd-fc-sec">
          <h3 className="mpd-fc-sec-title">
            {t("命令")} <span className="mpd-fc-count">{commands.length}</span>
          </h3>
          <div className="mpd-fc-rows">
            {commands.map((c, i) => {
              const id = cmdIdOf(c);
              return (
                <button
                  key={id || i}
                  className="mpd-fc-row"
                  onClick={() => handleCopy(id)}
                  title={t("点击复制命令 ID")}
                >
                  <span className="codicon codicon-terminal mpd-fc-row-icon" />
                  <span className="mpd-fc-main">
                    <span className="mpd-fc-title">{c.title || id}</span>
                    {c.title && <span className="mpd-fc-id">{id}</span>}
                  </span>
                  {copyFeedback(id)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {configs.length > 0 && (
        <section className="mpd-fc-sec">
          <h3 className="mpd-fc-sec-title">
            {t("配置项")} <span className="mpd-fc-count">{configs.length}</span>
          </h3>
          <div className="mpd-fc-rows">
            {configs.map(([key, desc]) => (
              <button
                key={key}
                className="mpd-fc-row"
                onClick={() => handleJumpConfig(key)}
                title={t("在设置中打开")}
              >
                <span className="codicon codicon-gear mpd-fc-row-icon" />
                <span className="mpd-fc-main">
                  <span className="mpd-fc-title">{desc?.description || key}</span>
                  <span className="mpd-fc-id">{key}</span>
                </span>
                <span className="codicon codicon-chevron-right mpd-fc-arrow" />
              </button>
            ))}
          </div>
        </section>
      )}

      {keybindings.length > 0 && (
        <section className="mpd-fc-sec">
          <h3 className="mpd-fc-sec-title">
            {t("键绑定")} <span className="mpd-fc-count">{keybindings.length}</span>
          </h3>
          <div className="mpd-fc-rows">
            {keybindings.map((k, i) => (
              <div key={i} className="mpd-fc-row mpd-fc-row-readonly">
                <span className="codicon codicon-keyboard mpd-fc-row-icon" />
                <span className="mpd-fc-main">
                  <span className="mpd-fc-title">{k.command}</span>
                  {k.key && <span className="mpd-fc-kbd">{k.key}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {menuRows.length > 0 && (
        <section className="mpd-fc-sec">
          <h3 className="mpd-fc-sec-title">
            {t("菜单项")} <span className="mpd-fc-count">{menuRows.length}</span>
          </h3>
          <div className="mpd-fc-rows">
            {menuRows.map((m, i) => (
              <div key={i} className="mpd-fc-row mpd-fc-row-readonly">
                <span className="codicon codicon-menu mpd-fc-row-icon" />
                <span className="mpd-fc-main">
                  <span className="mpd-fc-title">{m.command}</span>
                  <span className="mpd-fc-id">{m.menu}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
