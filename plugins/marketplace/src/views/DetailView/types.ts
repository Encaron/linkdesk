/**
 * types — 详情视图的共享类型与零依赖微工具。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 */

/** 壳→插件详情贡献 props——结构式本地声明（池侧 PluginDetailViewHost 各执一份，字符串即契约） */
export type DetailContributedProps = {
  pluginId?: string;
  pinned?: boolean;
  isActive: boolean;
  marketEntry?: unknown;
};

/** 展示合并对象——list() 全 manifest | getDisabled 子集 | null(未装)
 *  E6#65c：manifest 再挑 icon/iconSource（图标回退链第二环——已装 manifest 无目录条目时详情页头图）
 *  E6#67：manifest 再挑 marketIcon/marketIconSource——已装插件详情展示位读它（list() 投影已带，双图标模型） */
export type DetailInfo = {
  manifest: { name?: string; version?: string; author?: string; description?: string; core?: boolean; icon?: string; iconSource?: "codicon" | "svg" | "url" | "lucide"; marketIcon?: string; marketIconSource?: "codicon" | "svg" | "url" | "lucide" };
  pendingReason?: string;
};

/** requires/contributes 类型缺位（list 子集类型无 requires，载荷实带）——本地收窄，零 any */
export const reqOf = (m?: unknown): string[] =>
  Array.isArray((m as { requires?: unknown })?.requires) ? ((m as { requires: string[] }).requires) : [];

/** 详情 navbar 三 tab（30.6 富展示） */
export type TabId = "overview" | "features" | "changelog";
