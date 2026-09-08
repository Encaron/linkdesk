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
 */

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import "./MarkdownView.css";

/** 链接 href 白名单——https/http/mailto + 相对（./ ../ / #）+ 无 scheme 片段；javascript:/data:/其他协议拒绝 */
function isSafeLink(href: string | undefined): boolean {
  if (!href) return false;
  const h = href.trim();
  if (!h || h.startsWith("#")) return true;
  // 相对路径（./ ../ /）与无 scheme 纯路径允许（README 站内跳转/锚点）
  if (/^(\.{0,2}\/|(?!\w+:)\/?)/.test(h) && !/^\/\//.test(h)) return true;
  return /^https?:\/\//i.test(h) || /^mailto:/i.test(h);
}

/** 图片 src 白名单（缝隙 E2「限 https」）——https + 相对路径；http/data:/javascript: 拒绝（防外链追踪+注入） */
function isSafeImage(src: string | undefined): boolean {
  if (!src) return false;
  const s = src.trim();
  if (!s) return false;
  if (/^https:\/\//i.test(s)) return true;
  // 相对（./ ../ /）允许——已装插件包内 README 相对图（展示时若资源可达则正常，不可达则 broken 兜底）
  if (/^(\.{0,2}\/)/.test(s)) return true;
  return false;
}

interface MarkdownViewProps {
  /** markdown 原文；空/undefined 渲染空容器（调用方负责降级文案） */
  markdown?: string | null;
  className?: string;
}

/** README 渲染唯一组件——壳共享（@linkdesk/ui 分发），不塞进任何业务插件。 */
export default function MarkdownView({ markdown, className }: MarkdownViewProps) {
  const components: Components = {
    a: ({ href, children, ...rest }) =>
      isSafeLink(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      ) : (
        <span {...rest}>{children}</span>
      ),
    img: ({ src, alt, ...rest }) =>
      isSafeImage(src) ? (
        // E2：外链图只走 https；alt 缺失补空串（a11y——装饰图不读屏）
        <img src={src} alt={alt ?? ""} loading="lazy" {...rest} />
      ) : null,
  };

  return (
    <div className={className ? `mdv ${className}` : "mdv"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {markdown ?? ""}
      </ReactMarkdown>
    </div>
  );
}
