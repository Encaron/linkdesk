/**
 * FeaturesTab——详情「功能」tab 的宿主（E6#30.6d，mockup 帧 9）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `views/DetailFeaturesTab.tsx` 迁入改名（私有子件归位宿主
 * 同名字夹），零行为变更；四组解析移 `contribs.ts`、四组内容移 `features-groups.tsx`。
 *
 * 本件只管三件事：contributes 解析、复制反馈的时窗、四组并排 + 空态措辞分档；
 * 组的画法与逐项交互全在 `features-groups.tsx`。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseContribs } from "./contribs";
import { CommandGroup, ConfigGroup, KeybindingGroup, MenuGroup } from "./features-groups";

const lk = () => window.linkdesk;

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

export default function FeaturesTab({ pluginId, contributes, hasContribSource, installed }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const { commands, configs, keybindings, menuRows } = useMemo(() => parseContribs(contributes), [contributes]);

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

  return (
    <div className="mpd-fc">
      <CommandGroup commands={commands} copied={copied} onCopy={handleCopy} />
      <ConfigGroup configs={configs} onJump={handleJumpConfig} />
      <KeybindingGroup keybindings={keybindings} />
      <MenuGroup menuRows={menuRows} />
    </div>
  );
}
