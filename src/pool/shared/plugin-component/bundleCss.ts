/**
 * pool 侧 bundle 插件 CSS <link> 管理（E6#15）——池 = 插件视图唯一挂载文档（E5.7 架构实证：
 * loader/lifecycle 宿主壳 shell、视图渲 pool，双文档分离；壳注入的 <link> 到不了 pool）。
 *
 * 对标 VS Code 扩展 css 由宿主 link 的架构模型。SDK 多表面打包把全插件 css 聚合为 zip 根
 * `index.bundle.css`（[02-linkdesk-plugin格式规范.md]）；编译表面（views/*.bundle.js /
 * index.bundle.js）无 style-inject（chunk 无 html 消费方，Vite 不注入）——css 只能由挂载方载入。
 * 本模块 = pool 侧那半：
 *   - `cssUrlForRenderPath(renderPath)`：同步判一个 renderPath 是否编译表面，是则派生根 `index.bundle.css` URL。
 *     dev `/@fs/{abs}/{index.bundle.js | views/X.bundle.js}`、prod `linkdesk://{pluginId}/…` 双形态——
 *     css 恒在插件根（entry 与其同层；views 面去掉 `/views/` 段回根）。
 *   - `retainPluginCss(pluginId, cssUrl)`：首次挂载某插件任一编译面时 `<link rel=stylesheet>` 注入
 *     （幂等——同 id 已在 no-op；css 文件按 URL 解析相对 url()，不用 fetch+<style> 以免破坏字体/图片相对引用）。
 *   - `releasePluginCss(pluginId)`：该插件最后一个视图卸载时移除。引用计数按挂载实例数——
 *     同插件多面（tab 主标签 + sidebar + panel）共享一份 <link>，全卸才移除。
 *
 * 非 bundle 插件（源码 glob / dev 目录源码安装）不调本模块——其 css 由 Vite style-inject 直接进本文档。
 * 无 css 的纯 JSON bundle（theme/lang）无 views 无挂载——天然不触发。
 */

const styleId = (pluginId: string): string => `__linkdesk_bundle_css__${pluginId}`;

/** 挂载实例引用计数——0 清除（防多视图共享一份 link 被提前拆） */
const _retainCounts = new Map<string, number>();

function ensureLink(pluginId: string, cssUrl: string): void {
  if (typeof document === "undefined") return; // node 单测无 DOM——no-op
  if (document.getElementById(styleId(pluginId))) return; // 幂等——同 id 已在则不动（保留首次 href）
  const link = document.createElement("link");
  link.id = styleId(pluginId);
  link.rel = "stylesheet";
  link.href = cssUrl;
  link.dataset.pluginCss = pluginId;
  document.head.appendChild(link);
}

function removeLink(pluginId: string): void {
  if (typeof document === "undefined") return;
  document.getElementById(styleId(pluginId))?.remove();
}

/** renderPath → 根 index.bundle.css URL；非编译表面（源码 .tsx / 无）返回 null */
export function cssUrlForRenderPath(renderPath: string | undefined): string | null {
  if (!renderPath || !renderPath.endsWith(".bundle.js")) return null;
  // 编译表面只有两种落点：entry 在插件根（index.bundle.js，与其同层 = 根）；views/ 在根下一层。
  // css 恒聚合在根 index.bundle.css → 从表面路径回根。
  const viewsAt = renderPath.indexOf("/views/");
  const root = viewsAt !== -1
    ? renderPath.slice(0, viewsAt)
    : renderPath.slice(0, renderPath.lastIndexOf("/"));
  return `${root}/index.bundle.css`;
}

/** 插件某编译面首次挂载——注入 <link>（引用计数 +1） */
export function retainPluginCss(pluginId: string, cssUrl: string): void {
  const count = (_retainCounts.get(pluginId) ?? 0) + 1;
  _retainCounts.set(pluginId, count);
  if (count === 1) ensureLink(pluginId, cssUrl);
}

/** 插件某视图卸载——引用计数 -1，归零移除 <link> */
export function releasePluginCss(pluginId: string): void {
  const count = (_retainCounts.get(pluginId) ?? 1) - 1;
  if (count <= 0) {
    _retainCounts.delete(pluginId);
    removeLink(pluginId);
  } else {
    _retainCounts.set(pluginId, count);
  }
}
