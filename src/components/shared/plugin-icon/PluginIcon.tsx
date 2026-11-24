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
import { resolvePluginIcon, type ManifestIconShape, type SharedIconDefault } from "./iconUtils";
import { ComponentType, useState } from "react";
import {
  File, Folder, FolderOpen, FolderTree, Package, ShoppingBag,
  Monitor, Settings, BookOpen, BarChart3, Lightbulb, Lock,
  // E6#30e：目录/市场图标接线——catalog icon 走显式 descriptor，lucide 名须在此白名单内才渲染
  // （fixture/设计档引用的 puzzle/Smile + 市场常见品类图标；未列入的 lucide 名静默 emoji 兜底；
  //   想保证渲染的目录作者用 codicon（@vscode/codicons 全字集）或 url <img>——见 06-图标.md）
  Download, Globe, Plug, Puzzle, Rocket, Smile, Sparkles, Star, Zap,
} from "lucide-react";

interface PluginIconProps {
  pluginId: string;
  /** 插件 manifest（或其含 icon/iconSource 的子集）——图标唯一裁决来源；缺省 → emoji 兜底 */
  manifest?: ManifestIconShape;
  /** 共享图标定义快照（iconSource: "shared" 按名查——04 内置配置组图标 2026-11-18）。
   *  数据源 = iconTheme:changed 广播的 sharedIcons（宿主默认项 app.group-* ＋ 插件 contributes.icons）。
   *  缺省 / 名字缺省 → emoji 兜底；image 默认项按 **ink 剪影**渲染（mask ＋ --icon-ink 随主题）。 */
  sharedIcons?: Record<string, SharedIconDefault>;
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
  Download,
  Globe,
  Plug,
  Puzzle,
  Rocket,
  Smile,
  Sparkles,
  Star,
  Zap,
};

/** 无 pluginId 或未注册插件时的回退 emoji（@deprecated E5#100——Lucide 优先） */
const FALLBACK = "📄";

export function PluginIcon({ pluginId, manifest, sharedIcons, className, alt = "" }: PluginIconProps) {
  const resolved = manifest ? resolvePluginIcon(pluginId, manifest) : { emoji: FALLBACK };
  // 图片加载失败记录——挂在 src 上而不是布尔，换图标后自动重试
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

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
  // 04 内置配置组图标（2026-11-18）：共享图标按名查——image 默认项 = ink 剪影
  // （mask ＋ --icon-ink 随主题墨色；VS Code product-icon 语义，彩色身份图不走本面）
  if (resolved.sharedName) {
    const def = sharedIcons?.[resolved.sharedName];
    if (def?.url) {
      const mask = `url("${def.url}")`;
      return (
        <span
          className={`plugin-icon plugin-icon--ink ${className ?? ""}`}
          style={{
            backgroundColor: "var(--icon-ink)",
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            maskSize: "contain",
          }}
        />
      );
    }
    return (
      <span className={`plugin-icon plugin-icon--emoji ${className ?? ""}`}>{FALLBACK}</span>
    );
  }
  if (resolved.src) {
    /* 远程图可能 404/断网（目录条目的 icon 是 raw.githubusercontent 地址）——加载失败退回 FALLBACK，
     * ⛔ 不留一张「破图」占位（用户实机：批量卡上两个条目就是破图块）。 */
    if (failedSrc !== resolved.src) {
      return (
        <img
          src={resolved.src}
          alt={alt}
          className={`plugin-icon plugin-icon--img ${className ?? ""}`}
          draggable={false}
          onError={() => setFailedSrc(resolved.src!)}
        />
      );
    }
    return <span className={`plugin-icon plugin-icon--emoji ${className ?? ""}`}>{FALLBACK}</span>;
  }
  // @deprecated E5#100：emoji 回退——保留一个月后删除。新图标优先走 Lucide。
  return (
    <span className={`plugin-icon plugin-icon--emoji ${className ?? ""}`}>{resolved.emoji ?? FALLBACK}</span>
  );
}
