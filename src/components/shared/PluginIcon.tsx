/**
 * PluginIcon — 统一插件图标渲染组件。
 * E2c #19j：图标栏 / 标签栏 / 欢迎页 / [+] 菜单 共用同一个图标来源（plugin.json icon 字段）。
 *
 * 消费端用法：
 *   <PluginIcon pluginId="terminal" className="my-icon-class" />
 *   组件自动查 viewRegistry → resolvePluginIcon → 渲染 <img> / <span codicon> / <span emoji>
 */
import { getViewPlugin } from "../../pluginLoader/viewRegistry";
import { resolvePluginIcon } from "../../pluginLoader/iconUtils";

interface PluginIconProps {
  pluginId: string;
  className?: string;
  alt?: string;
}

/** 无 pluginId 或未注册插件时的回退 emoji */
const FALLBACK = "📄";

export function PluginIcon({ pluginId, className, alt = "" }: PluginIconProps) {
  const plugin = getViewPlugin(pluginId);
  const resolved = plugin ? resolvePluginIcon(pluginId, plugin.manifest) : { emoji: FALLBACK };

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
  return (
    <span className={`plugin-icon plugin-icon--emoji ${className ?? ""}`}>{resolved.emoji ?? FALLBACK}</span>
  );
}
