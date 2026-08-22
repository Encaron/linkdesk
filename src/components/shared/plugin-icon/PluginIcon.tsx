/**
 * PluginIcon — 统一插件图标渲染组件。
 * E2c #19j：图标栏 / 标签栏 / 欢迎页 / [+] 菜单 共用同一个图标来源（plugin.json icon 字段）。
 * E5#100：Lucide 优先 → codicon → img → emoji（@deprecated）。
 *
 * 消费端用法：
 *   <PluginIcon pluginId="terminal" className="my-icon-class" />
 *   组件自动查 viewRegistry → resolvePluginIcon → 渲染 Lucide / codicon / img / emoji
 */
import { getViewPlugin } from "../../../pluginLoader/viewRegistry";
import { resolvePluginIcon } from "../../../core/utils/plugin/iconUtils";
import { ComponentType } from "react";
import {
  File, Folder, FolderOpen, FolderTree, Package, ShoppingBag,
  Monitor, Settings, BookOpen, BarChart3, Lightbulb, Lock,
} from "lucide-react";

interface PluginIconProps {
  pluginId: string;
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

export function PluginIcon({ pluginId, className, alt = "" }: PluginIconProps) {
  const plugin = getViewPlugin(pluginId);
  const resolved = plugin ? resolvePluginIcon(pluginId, plugin.manifest) : { emoji: FALLBACK };

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
      <img src={resolved.src} alt={alt} className={`plugin-icon plugin-icon--img ${className ?? ""}`} />
    );
  }
  // @deprecated E5#100：emoji 回退——保留一个月后删除。新图标优先走 Lucide。
  return (
    <span className={`plugin-icon plugin-icon--emoji ${className ?? ""}`}>{resolved.emoji ?? FALLBACK}</span>
  );
}
