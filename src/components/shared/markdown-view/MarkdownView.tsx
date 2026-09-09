/**
 * E6#30.6a 壳共享 MarkdownView——README/markdown 渲染**唯一组件**（04-详情页设计.md §三 L108/§4.1）。
 *   消费方：marketplace 详情 README（30.6b 已装读包/未装 fetch readmeUrl）+ 未来发行说明 Release body
 *   （05-发行说明.md §2.4 已同步）——第三方插件经 @linkdesk/ui 复用同一渲染器。
 *
 * 渲染链 = react-markdown + remark-gfm（表格/删除线，30.6a 定案）+ rehype-raw（原生 HTML 入树，VS Code
 *   README 作者常写 <img>/<details>）→ rehype-sanitize（hast schema 消毒，默认 GitHub schema：剥 script/
 *   事件属性/javascript: 等危险 URI——去脚本去事件语义与定案的 DOMPurify 等价）。
 *   🔄 **消毒器选型注（30.6a 定案 DOMPurify → 此处 rehype-sanitize）**：react-markdown 产出 React 树而非
 *   HTML 串，DOMPurify（DOM 串消毒）无法在树内使用；rehype-sanitize 是 react-markdown 官方配套的
 *   hast-schema 消毒器，于 React 建树**之前**剥除危险节点/属性，无 DOM 变异、不破坏 React 协调。
 *   缝隙 E2「去脚本/事件属性」由此硬保证；「img src 限 https」在组件层最后把守（本文件底部 url 门禁）。
 *
 * 安全双闸：① rehype-sanitize 默认 schema——script/事件属性/iframe 等整枝剥除；② <a href>/<img src>
 *   组件级 scheme 白名单（https/http/mailto/相对——javascript:/data: 一律不落 DOM）。纯文本渲染零
 *   dangerouslySetInnerHTML，markdown 内容绝不经 innerHTML 注入。
 *
 * E6#70a（15-详情页说明展示任务档案）：README 媒体相对引用解析到「被查看插件的包内资源」。
 *   说明文本是调用方（marketplace 详情）读出来的纯文本，渲染器不知「这张图相对谁」→ 调用方注入
 *   可选 `assetBase`（如 `linkdesk://{pluginId}/`）：提供了则 `cover.svg`/`resources/cover.svg`/`./x`
 *   等无 scheme 相对引用按基址解析成绝对 URL（详情页说明区显形）；不提供则维持旧行为。基址纯数据
 *   注入，壳共享组件零插件名（硬约束 10）；绝对 https:/linkdesk: 直通，http/data:/javascript:/file: 拒。
 */

import { memo, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "./MarkdownView.css";

/** 子 source 里是否有已落 DOM 的媒体（E6#70d `<video><source>` 写法）——video 自身无 src 但子 source 带 src → 不算空壳 */
function childHasMedia(children: ReactNode): boolean {
  const list = Array.isArray(children) ? children : [children];
  return list.some(
    (c): boolean =>
      !!c &&
      typeof c === "object" &&
      "props" in c &&
      typeof (c as { props?: { src?: unknown } }).props?.src === "string"
  );
}

/** 链接 href 白名单——https/http/mailto + 相对（./ ../ / #）+ 无 scheme 片段；javascript:/data:/其他协议拒绝 */
function isSafeLink(href: string | undefined): boolean {
  if (!href) return false;
  const h = href.trim();
  if (!h || h.startsWith("#")) return true;
  // 相对路径（./ ../ /）与无 scheme 纯路径允许（README 站内跳转/锚点）
  if (/^(\.{0,2}\/|(?!\w+:)\/?)/.test(h) && !/^\/\//.test(h)) return true;
  return /^https?:\/\//i.test(h) || /^mailto:/i.test(h);
}

/** 媒体 src 解析（E6#70a img/video/source 共用）——返回可落 DOM 的 src 或 null：
 *  ① 有 scheme：仅 https: / linkdesk:（详情页基址产物）放行；http/data:/javascript:/file: 等拒；
 *  ② 协议相对 `//`：拒（跟随页面 scheme，不可控）；
 *  ③ 相对（裸 `cover.svg` / `resources/x.svg` / `./x` / 前导 `/x`）：assetBase 提供 → 按基址 URL 解析
 *     成绝对 URL——解析结果仍须落 https:/linkdesk:（基址虽来自可信调用方，scheme 白名单不放松）；
 *     无 assetBase → 维持 30.6a 旧行为：仅 ./ ../ / 前缀相对原样透传（裸相对无基址不知指向何处 → 拒）。 */
function resolveMediaSrc(src: string | undefined, assetBase?: string): string | null {
  if (!src) return null;
  const s = src.trim();
  if (!s || s.startsWith("//")) return null;
  // ① 绝对 scheme
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
  if (m) return /^(https|linkdesk)$/i.test(m[1]) ? s : null;
  // ③ 相对——assetBase 存在才解析成绝对（README 相对引用指向被查看插件包内）
  if (assetBase) {
    try {
      const u = new URL(s, assetBase);
      return /^(https|linkdesk):$/.test(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  }
  if (/^(\.{0,2}\/)/.test(s)) return s;
  return null;
}

/**
 * E6#70d：说明区消毒白名单 = 默认 GitHub schema + 页内媒体扩展。
 *   加 video/figure/figcaption（GitLens `<figure><a><img>` 封面壳 / VS Code 更新页 `<video>`）。
 *   source 默认已在但仅 srcSet——补 src/type/srcset/sizes 让 `<video><source>` 多格式写法可用。
 *   🔴 autoplay 刻意不放进白名单 → 消毒层直接剥除（作者写了也无效，页内视频永远手动起播——档案 §五.5）。
 */
const mdvSanitizeSchema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "video", "figure", "figcaption"],
  attributes: {
    ...defaultSchema.attributes,
    video: ["src", "poster", "controls", "loop", "muted", "playsInline", "width", "height", "title", "preload"],
    // 全量重写 source（默认仅 srcSet）——src/type 落 DOM，srcSet 拼写双形态兼容
    source: ["src", "type", "srcset", "srcSet", "sizes"],
  },
};

interface MarkdownViewProps {
  /** markdown 原文；空/undefined 渲染空容器（调用方负责降级文案） */
  markdown?: string | null;
  className?: string;
  /** 媒体资源基址（E6#70a 可选）——README 相对引用解析基准（详情页注入 `linkdesk://{pluginId}/`，
   *  被查看插件的包内资源即此可达）；绝对 https 直通不受影响。不提供 = 旧行为（相对仅透传）。 */
  assetBase?: string;
}

/**
 * E6#70d 修复：components 必须在模块层构造 + 组件内 useMemo 稳定 + 整体 memo。
 *   原实现把 components 字面量写组件体内 → 每次重渲染（父级 DetailView 任意一次重渲染，如窗口 resize
 *   引发布局刷新）都产生新的 video/img/source 等 override **函数引用** → react-markdown 建树时元素 type
 *   变新 → React 判定类型变了 → 卸载旧节点挂新节点 = 页内 `<video>`/`<img>` 被静默重挂（播放/全屏态全丢；
 *   全屏首点的视频正是被这次重挂从 :fullscreen 顶出去 → 「先软件全屏、视频没变」根因之一）。
 *   改为：模块层 makeComponents(assetBase) 单点构造 + useMemo([assetBase]) 缓存 → 父级重渲染不再换函数
 *   引用（React 按 type 协调为原位更新）；外层 memo 让 markdown/className/assetBase 不变时整组件跳过
 *   重渲染（react-markdown 不再重解析）。零行为改变，纯稳定性修复。
 */
function makeComponents(assetBase: string | undefined): Components {
  return {
    a: ({ href, children, ...rest }) =>
      isSafeLink(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      ) : (
        <span {...rest}>{children}</span>
      ),
    img: ({ src, alt, ...rest }) => {
      const resolved = resolveMediaSrc(src, assetBase);
      return resolved ? (
        // E2：外链图只走 https（相对经基址解析落 https/linkdesk）；alt 缺失补空串（a11y——装饰图不读屏）
        <img src={resolved} alt={alt ?? ""} loading="lazy" {...rest} />
      ) : null;
    },
    // E6#70d：页内视频（VS Code 更新页式）——src/poster 与图同走 resolveMediaSrc（相对经 assetBase 落包内）。
    // 安全默认：controls 强制给（无播放条则读者无从起播）；autoplay 消毒层已剥，此处再双保险剥两种拼写
    //   （parse5 会把作者 autoplay 小写化直达 rest——不剥会真透传成 DOM autoplay 属性自动播）；
    // preload 顶格 metadata——绝不在打开说明时整片预下（带宽/体积现实，档案 §五.4/§五.5）。
    video: (props) => {
      const { src, poster, preload, autoPlay, children, ...rest } = props;
      void autoPlay;
      // E6#70d: autoplay 小写拼写（parse5 原样直达、非 React 合法 prop 无法解构）运行时剔除——
      //  消毒层（白名单不含 autoplay）已剥，此处双保险防 {…rest} 透传成 DOM autoplay 属性自动播
      delete (rest as Record<string, unknown>).autoplay;
      const resolved = resolveMediaSrc(src, assetBase);
      // 容器 video 自身无 src（`<video><source>` 多格式写法）→ 只要有子 source 落媒体就不整枝丢
      // （子 source 各自经 source override 消毒/resolve）；自身与子 source 全无 = 空壳 → 弃
      if (!resolved && !childHasMedia(children)) return null;
      const resolvedPoster = poster ? resolveMediaSrc(poster, assetBase) : undefined;
      return (
        <video
          controls
          preload={preload === "none" ? "none" : "metadata"}
          src={resolved ?? undefined}
          poster={resolvedPoster ?? undefined}
          {...rest}
        >
          {children}
        </video>
      );
    },
    // `<video><source src>` 多格式写法——source 的相对 src 同走 resolveMediaSrc（否则子 source 是裸相对、裂）
    source: ({ src, ...rest }) => {
      const resolved = resolveMediaSrc(src, assetBase);
      return resolved ? <source src={resolved} {...rest} /> : null;
    },
  };
}

function MarkdownView({ markdown, className, assetBase }: MarkdownViewProps) {
  const components = useMemo(() => makeComponents(assetBase), [assetBase]);

  return (
    <div className={className ? `mdv ${className}` : "mdv"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, mdvSanitizeSchema]]}
        components={components}
      >
        {markdown ?? ""}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownView);
