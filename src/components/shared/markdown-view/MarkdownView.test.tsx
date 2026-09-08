/**
 * @vitest-environment jsdom
 * E6#30.6a：壳 MarkdownView 单元测试——gfm 渲染 / 危险 URL 剥除（缝隙 E2 双闸）。
 * 测试替身文案 = 虚构值（硬约束 21）。DOMPurify→rehype-sanitize 属渲染内部，黑盒断言行为：
 * javascript: 链接不落 DOM、http 图片（非 https）不渲染、https 图/相对路径正常。
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import MarkdownView from "./MarkdownView";

afterEach(() => cleanup());

const MD = `
# Demo Heading

| A | B |
| - | - |
| 1 | 2 |

\`\`\`ts
const x = 1;
\`\`\`

[ok](https://example.com) [bad](javascript:alert(1))
![img](https://example.com/a.png) ![img2](http://example.com/b.png)
`;

describe("MarkdownView", () => {
  it("渲染 gfm：标题/表格/代码块/行内元素", () => {
    const { container } = render(<MarkdownView markdown={MD} />);
    expect(container.querySelector("h1")?.textContent).toBe("Demo Heading");
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelector("pre code")?.textContent).toContain("const x = 1");
  });

  it("容器类名 = mdv + className 合并", () => {
    const { container } = render(<MarkdownView markdown="# t" className="extra" />);
    expect(container.firstElementChild?.className).toBe("mdv extra");
  });

  it("javascript: href 剥除——链接降级纯文本", () => {
    const { container } = render(<MarkdownView markdown={MD} />);
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("https://example.com");
    expect(links.some((h) => h && h.startsWith("javascript:"))).toBe(false);
    expect(container.textContent).toContain("bad"); // 文本保留、链接能力剥除
  });

  it("http（非 https）图片不渲染（E2 限 https），https/相对正常", () => {
    const { container } = render(<MarkdownView markdown={MD} />);
    const imgs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs).toContain("https://example.com/a.png");
    expect(imgs.some((s) => s && s.startsWith("http://"))).toBe(false);
  });

  it("空/undefined markdown 渲染空容器不崩", () => {
    const { container } = render(<MarkdownView />);
    expect(container.querySelector(".mdv")).toBeTruthy();
  });
});
