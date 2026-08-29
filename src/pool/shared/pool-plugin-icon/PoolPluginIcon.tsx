/**
 * PoolPluginIcon——池侧统一图标渲染。E5.7#6。
 *
 * 壳侧等价物：components/shared/plugin-icon/PluginIcon.tsx（查 viewRegistry → resolvePluginIcon 后渲染）。
 * Path B：池不 import pluginLoader——壳在 pushLayout 时把 resolvePluginIcon 结果序列化为
 * IconBarIcon 判别联合（lucide/codicon/img/emoji），本组件哑渲染。
 *
 * 🔴 LUCIDE_MAP 与壳 PluginIcon 的映射表保持同步——壳侧加图标名时两处都要加。
 * （池不能 import 壳组件——会拖进 viewRegistry 依赖链。）
 */

import { ComponentType } from "react";
import {
  File, Folder, FolderOpen, FolderTree, Package, ShoppingBag,
  Monitor, Settings, BookOpen, BarChart3, Lightbulb, Lock,
} from "lucide-react";
import type { IconBarIcon } from "../../../core/types/pool/poolLayout";

/** E5#100: Lucide 图标名 → 组件映射（与壳 PluginIcon LUCIDE_MAP 同步）。tree-shakeable。 */
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

interface PoolPluginIconProps {
  icon: IconBarIcon;
  /** 附加类名——消费端 CSS 作用域（如 "icon-bar-plugin-icon"） */
  className?: string;
  alt?: string;
}

/** 哑渲染 IconBarIcon 判别联合。类名与壳 PluginIcon 输出一致（池是独立文档，无冲突）。 */
// E5.8#2：仅保留 default 导出——消费方（IconBarZone）default import，具名导出零消费（死面）
function PoolPluginIcon({ icon, className = "", alt = "" }: PoolPluginIconProps) {
  // switch 判别——eslint E5.5#10 自定义规则拦 `=== "小写字面量"`（防 pluginId 硬编码），
  // 判别联合 tag 用 switch 语义相同且不误报。
  switch (icon.kind) {
    case "lucide": {
      const IconComponent = LUCIDE_MAP[icon.name];
      if (IconComponent) {
        return <IconComponent className={`plugin-icon plugin-icon--lucide ${className}`} />;
      }
      // 未映射的 Lucide 名——回退 emoji（壳 PluginIcon 同款行为）
      return <span className={`plugin-icon plugin-icon--emoji ${className}`}>📄</span>;
    }
    case "codicon":
      return <span className={`codicon ${icon.name} plugin-icon plugin-icon--codicon ${className}`} />;
    case "img":
      // E5.8#46.6：draggable=false 禁原生拖拽——图标栏指针拖拽重排时 img 默认可拖会抢手势（同 GroupTabBar 修）
      return <img src={icon.src} alt={alt} className={`plugin-icon plugin-icon--img ${className}`} draggable={false} />;
    default:
      return <span className={`plugin-icon plugin-icon--emoji ${className}`}>{icon.text}</span>;
  }
}

export default PoolPluginIcon;
