/**
 * @vitest-environment jsdom
 *
 * 2026-10-04 安装版立案「左下角齿轮不见了（dev 正常）」——根因：图标栏支路把 src 写进自定义属性
 * `--icon-url`，而**相对** url() 在自定义属性里由**消费它的样式表**作基准解析（打包后 =
 * `dist/assets/pool-*.css`），⛔ 不是声明它的文档。壳齿轮 src 经 `getAssetPath` 随 vite `base: './'`
 * 产出 `./assets/icons/gear.svg` ⇒ 安装版被解析成 `dist/assets/assets/icons/gear.svg`（404）⇒ mask
 * 落空、整块不画；dev 的池 CSS 由 Vite 内联在文档根、基准正好是文档 ⇒ 只有安装版瞎。
 *
 * 本档钉两件事：① 写进 `--icon-url` 的 url **必为绝对**（相对串 = 本 bug 复发）；② 已带 scheme 的
 * 绝对 URL 与 <img> 回退路径**逐字节不变**（插件图标走 resolvePluginIcon 本就是绝对 URL，
 * 标签栏等非图标栏调用留给第 4 刀）。
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import PoolPluginIcon from "./PoolPluginIcon";

afterEach(cleanup);

const ICON_BAR_CLASS = "ldk-icon-bar-plugin-icon";

/** 读回内联 style 里的 --icon-url（直接读 style 属性串——不经 jsdom 的 CSS 解析最稳）。 */
function readIconUrl(el: Element): string {
  const style = el.getAttribute("style") ?? "";
  const m = /--icon-url:\s*url\("([^"]*)"\)/.exec(style);
  if (!m) throw new Error(`style 属性里没有 --icon-url：${style}`);
  return m[1];
}

function renderImg(src: string, className = ICON_BAR_CLASS): { container: HTMLElement } {
  return render(<PoolPluginIcon icon={{ kind: "img", src }} className={className} alt="t" />);
}

describe("PoolPluginIcon · img 支路 --icon-url 绝对化（2026-10-04 安装版齿轮不可见回归）", () => {
  it("相对 src ⇒ 绝对 url（相对串就是本 bug：安装版基准 = 消费样式表目录）", () => {
    const { container } = renderImg("./assets/icons/gear.svg");
    const url = readIconUrl(container.firstElementChild!);
    expect(url.startsWith("./")).toBe(false);
    const parsed = new URL(url);
    expect(parsed.origin).toBe(new URL(document.baseURI).origin);
    expect(parsed.pathname.endsWith("/assets/icons/gear.svg")).toBe(true);
  });

  it("裸相对（无 ./ 前缀）同样绝对化", () => {
    const { container } = renderImg("icons/gear.svg");
    const url = readIconUrl(container.firstElementChild!);
    expect(new URL(url).pathname.endsWith("/icons/gear.svg")).toBe(true);
  });

  it("linkdesk:// 插件图标原样透传（resolvePluginIcon 产物，逐字节不变）", () => {
    const src = "linkdesk://plugin-x/resources/icon.svg";
    const { container } = renderImg(src);
    expect(readIconUrl(container.firstElementChild!)).toBe(src);
  });

  it("data: 图标原样透传", () => {
    const src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";
    const { container } = renderImg(src);
    expect(readIconUrl(container.firstElementChild!)).toBe(src);
  });

  it("空 src ⇒ 回退 <img>（⛔ 不写空 url——mask 落空会画成纯色方块）", () => {
    const { container } = renderImg("   ");
    const el = container.firstElementChild!;
    expect(el.tagName).toBe("IMG");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("非图标栏类名 ⇒ 仍走 <img>（第 4 刀边界，本刀不动）", () => {
    const { container } = renderImg("./assets/icons/gear.svg", "ldk-tab-icon");
    expect(container.firstElementChild!.tagName).toBe("IMG");
  });
});
