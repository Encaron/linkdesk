/**
 * E5.8#64：受控外观图片协议 URL 纯函数单元测试。
 * getUserDataImageUrl（importImage 返回 / 持久化值）+ resolveBackgroundImageUrl（引擎写 --bg-image 前转换）。
 * 验证：受控协议 URL 构建编码、旧版 plain 路径映射、协议 URL/相对路径原样、空值 null。
 */

import { describe, it, expect } from "vitest";
import { getUserDataImageUrl, resolveBackgroundImageUrl } from "./userDataImagePath";

describe("userDataImagePath — getUserDataImageUrl（受控协议 URL 构建）", () => {
  it("普通文件名 → linkdesk-userdata://appearance/<名>", () => {
    expect(getUserDataImageUrl("bg.png")).toBe("linkdesk-userdata://appearance/bg.png");
  });

  it("空格/中文/括号 → encodeURIComponent 编码进路径", () => {
    expect(getUserDataImageUrl("背景 图 (1).png"))
      .toBe("linkdesk-userdata://appearance/%E8%83%8C%E6%99%AF%20%E5%9B%BE%20(1).png");
  });
});

describe("userDataImagePath — resolveBackgroundImageUrl（配置值 → 可加载 URL）", () => {
  it("空 / 纯空白 → null", () => {
    expect(resolveBackgroundImageUrl("")).toBeNull();
    expect(resolveBackgroundImageUrl("   ")).toBeNull();
  });

  it("受控协议 URL → 原样（幂等）", () => {
    expect(resolveBackgroundImageUrl("linkdesk-userdata://appearance/bg.png"))
      .toBe("linkdesk-userdata://appearance/bg.png");
  });

  it("旧版 plain Windows 绝对路径 → basename 映射受控协议", () => {
    expect(resolveBackgroundImageUrl("C:\\Users\\feng\\AppData\\Roaming\\linkdesk\\appearance\\bg.png"))
      .toBe("linkdesk-userdata://appearance/bg.png");
  });

  it("旧版 plain Windows 路径（正斜杠 + 空格中文 basename）→ 编码映射", () => {
    expect(resolveBackgroundImageUrl("C:/AppData/linkdesk/appearance/背景 图.png"))
      .toBe("linkdesk-userdata://appearance/%E8%83%8C%E6%99%AF%20%E5%9B%BE.png");
  });

  it("POSIX 绝对路径 → basename 映射受控协议", () => {
    expect(resolveBackgroundImageUrl("/home/user/.config/linkdesk/appearance/bg.png"))
      .toBe("linkdesk-userdata://appearance/bg.png");
  });

  it("已 url() 包裹的受控协议 → 解包后原样", () => {
    expect(resolveBackgroundImageUrl('url("linkdesk-userdata://appearance/bg.png")'))
      .toBe("linkdesk-userdata://appearance/bg.png");
  });

  it("主题资产 linkdesk:// 协议 → 原样", () => {
    expect(resolveBackgroundImageUrl("linkdesk://demo-theme/assets/bg.png"))
      .toBe("linkdesk://demo-theme/assets/bg.png");
  });

  it("http(s):// 外部图 → 原样", () => {
    expect(resolveBackgroundImageUrl("https://example.com/bg.png")).toBe("https://example.com/bg.png");
  });

  it("相对路径（作者主题内资源）→ 原样", () => {
    expect(resolveBackgroundImageUrl("assets/bg.png")).toBe("assets/bg.png");
  });
});
