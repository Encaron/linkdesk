/**
 * PluginIcon — 统一插件图标渲染组件（@linkdesk/ui）。
 * E2c #19j：图标栏 / 标签栏 / 欢迎页 / [+] 菜单 共用同一个图标来源（plugin.json icon 字段）。
 * E5#100：Lucide 优先 → codicon → img → emoji（@deprecated）。
 *
 * E6#54b 解耦（审计 §三 项 1）：manifest 数据注入取代 viewRegistry 特权查询——
 * 原实现 import getViewPlugin（壳 viewRegistry 查询 = 特权假设，池内空 loader → 恒 emoji）+
 * resolvePluginIcon（core）。现在纯 props 契约：图标只由 `manifest` 声明字段裁决
 * （硬约束 11 插件身份 = manifest 声明字段），谁有 manifest 谁传，无 manifest → emoji 兜底。
 *
 * 消费端用法（作者持 manifest 时传 manifest，如插件列表/详情条目）：
 *   <PluginIcon pluginId="terminal" manifest={plugin.manifest} className="my-icon-class" />
 *   manifest 缺省 → emoji 兜底（池内无 manifest 的历史条目沿用现状）。
 */
import { resolvePluginIcon, type ManifestIconShape } from "./iconUtils";
import { ComponentType } from "react";
import {
  File, Folder, FolderOpen, FolderTree, Package, ShoppingBag,
  Monitor, Settings, BookOpen, BarChart3, Lightbulb, Lock,
} from "lucide-react";

interface PluginIconProps {
  pluginId: string;
  /** 插件 manifest（或其含 icon/iconSource 的子集）——图标唯一裁决来源；缺省 → emoji 兜底 */
  manifest?: ManifestIconShape;
  className?: string;
  alt?: string;
}

/** E5#100: Lucide 图标名 → 组件映射。tree-shakeable——未映射的图标不会打包。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LUCIDE_MAP: Record<string, ComponentType<any>> = {
  File,
  Folder,
  FolderOpen,
  FolderTree,
  Package,
  ShoppingBag,
  Monitor,
  Settings,
  BookOpen,
  BarChart3,
  Lightbulb,
  Lock,
};

/** 无 pluginId 或未注册插件时的回退 emoji（@deprecated E5#100——Lucide 优先） */
const FALLBACK = "📄";

export function PluginIcon({ pluginId, manifest, className, alt = "" }: PluginIconProps) {
  const resolved = manifest ? resolvePluginIcon(pluginId, manifest) : { emoji: FALLBACK };

  // E5#100: Lucide 优先
  if (resolved.lucide) {
    const IconComponent = LUCIDE_MAP[resolved.lucide];
    if (IconComponent) {
      return <IconComponent className={`plugin-icon plugin-icon--lucide ${className ?? ""}`} />;
    }
  }
  if (resolved.codicon) {
    return (
      <span className={`codicon ${resolved.codicon} plugin-icon plugin-icon--codicon ${className ?? ""}`} />
    );
  }
  if (resolved.src) {
    return (
      <img src={resolved.src} alt={alt} className={`plugin-icon plugin-icon--img ${className ?? ""}`} draggable={false} />
    );
  }
  // @deprecated E5#100：emoji 回退——保留一个月后删除。新图标优先走 Lucide。
  return (
    <span className={`plugin-icon plugin-icon--emoji ${className ?? ""}`}>{resolved.emoji ?? FALLBACK}</span>
  );
}
