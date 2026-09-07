/**
 * DetailView——插件详情主区渲染面（contributes.views.main["plugin-detail"]，容器 "main" 由壳
 * ShellViewRenderer 在 plugin-detail 标签页消费——E6#30.10b）。
 *
 * 市场 UI 归市场插件所有（10-市场UI拥有权.md §三）：活跃 marketplace 插件贡献此渲染面，壳把 plugin-detail
 * 标签页让给它；缺贡献/加载失败 → 壳 PluginDetailPoolView 保底。数据走 window.linkdesk.* IPC。
 *
 * 运行时 props 契约（池宿主 PluginDetailViewHost 同文各执一份，结构式）：
 *   - pluginId    = 详情目标插件 ID（详情页展示谁——tab.detailPluginId）
 *   - pinned      = 标签页固定态
 *   - isActive    = 标签页当前活跃
 *   - marketEntry = 目录条目——E6#31 数据管道打通后宿主注入（30.11c 起消费）
 *
 * E6#30.11a 将把壳 PluginDetailPoolView 布局整体迁入本文件（@src/core 依赖逐处换 window.linkdesk.*）——
 * 当前为最小占位（结构即未来骨架，先钉死贡献面能通）。
 */

import { useTranslation } from "react-i18next";

/** 壳→插件详情贡献 props——结构式本地声明（池侧 PluginDetailViewHost 各执一份，字符串即契约；30.11a 迁入后消费）。 */
type DetailContributedProps = {
  pluginId?: string;
  pinned?: boolean;
  isActive: boolean;
  marketEntry?: unknown;
};

export default function DetailView({ pluginId }: DetailContributedProps) {
  const { t } = useTranslation();
  if (!pluginId) {
    return (
      <div className="mpd-detail mpd-detail-empty">{t("未指定要查看的插件")}</div>
    );
  }
  return (
    <div className="mpd-detail">
      {/* 30.11a：迁入壳 PluginDetailPoolView 布局 */}
      <div className="mpd-detail-placeholder">{t("插件详情")}：{pluginId}</div>
    </div>
  );
}
