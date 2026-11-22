/**
 * mediaResolve 单测（批次 D5）——作者 dry-run 的选帧/报错必须与市场渲染同口径：
 *   海报 → cover → 静帧、去重、上限 3；非 https / 视频越位 / 多视频 → error（退出码 1）。
 */

import { describe, expect, it } from "vitest";
import { MEDIA_MAX_FRAMES, formatMediaResolve, mediaResolve } from "./mediaResolve.js";

const entry = (patch: Record<string, unknown>): Record<string, unknown> => ({
  id: "demo-plugin",
  name: "Demo",
  version: "1.0.0",
  downloadUrl: "https://example.invalid/a.zip",
  versions: [{ version: "1.0.0", downloadUrl: "https://example.invalid/a.zip", publishedAt: "2026-11-20T00:00:00.000Z" }],
  ...patch,
});

describe("mediaResolve", () => {
  it("视频 + cover + 静帧：海报优先、去重、上限 3", () => {
    const r = mediaResolve({
      plugins: [
        entry({
          cover: "https://example.invalid/cover.png",
          screenshots: [
            { type: "video", url: "https://example.invalid/a.mp4", poster: "https://example.invalid/p.jpg" },
            "https://example.invalid/1.png",
            "https://example.invalid/2.png",
            "https://example.invalid/3.png",
          ],
        }),
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.entries[0]).toEqual({
      id: "demo-plugin",
      kind: "video",
      frames: ["https://example.invalid/p.jpg", "https://example.invalid/cover.png", "https://example.invalid/1.png"],
      video: { url: "https://example.invalid/a.mp4", poster: "https://example.invalid/p.jpg" },
    });
    expect(MEDIA_MAX_FRAMES).toBe(3);
  });

  it("无媒体 → generated（作者能一眼看出会走生成式封面）", () => {
    const r = mediaResolve({ plugins: [entry({})] });
    expect(r.entries[0]).toEqual({ id: "demo-plugin", kind: "generated", frames: [], video: null });
    expect(r.errors).toEqual([]);
  });

  it("相对 URL / http 明文 → error（与 validate 同一套错误码）", () => {
    const r = mediaResolve({
      plugins: [entry({ cover: "resources/c.png", screenshots: ["http://example.invalid/1.png"] })],
    });
    expect(r.errors.map((e) => e.code)).toEqual(["screenshot-url-invalid", "screenshot-url-invalid"]);
    expect(formatMediaResolve(r)).toContain("期望：以 https:// 开头的绝对 URL");
  });

  it("视频越位/多视频 → error", () => {
    const late = mediaResolve({
      plugins: [entry({ screenshots: ["https://example.invalid/1.png", { type: "video", url: "https://example.invalid/a.mp4" }] })],
    });
    expect(late.errors.some((e) => e.code === "screenshot-video-restricted")).toBe(true);
    const two = mediaResolve({
      plugins: [entry({ screenshots: [
        { type: "video", url: "https://example.invalid/a.mp4", poster: "https://example.invalid/p.jpg" },
        { type: "video", url: "https://example.invalid/b.mp4", poster: "https://example.invalid/q.jpg" },
      ] })],
    });
    expect(two.errors.some((e) => e.code === "screenshot-video-restricted")).toBe(true);
  });

  it("id 过滤；id 不存在 → error", () => {
    const catalog = { plugins: [entry({ id: "demo-a" }), entry({ id: "demo-b" })] };
    expect(mediaResolve(catalog, "demo-b").entries.map((e) => e.id)).toEqual(["demo-b"]);
    const missing = mediaResolve(catalog, "demo-z");
    expect(missing.errors[0]!.code).toBe("screenshot-entry-missing");
  });
});
