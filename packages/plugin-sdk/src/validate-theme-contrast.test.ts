/**
 * validateThemeJson —— 内容面可读性语义校验（2026-11-24 整窗主视觉「白字压白玻璃」实机案）。
 * schema 只管字段形状；「有底图时内容面必须是实色基」与「字 vs 合成面 4.5/3」是第二类判据。
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateThemeJson } from "./validate";

const dir = mkdtempSync(join(tmpdir(), "ldk-theme-contrast-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function recipe(colors: Record<string, string>, bgImage?: string): string {
  const path = join(dir, `theme-${Math.random().toString(36).slice(2)}.json`);
  const body: Record<string, unknown> = {
    id: "test.theme",
    name: "Test",
    type: "dark",
    colorways: [{ id: "test.theme.a", name: "A", colors }],
  };
  if (bgImage) body.appearance = { background: { mode: "panorama", image: bgImage } };
  writeFileSync(path, JSON.stringify(body), "utf8");
  return path;
}

describe("validateThemeJson — 内容面可读性", () => {
  it("有底图 + 白提亮卡片（白 10%）⇒ 判红（实测整窗主视觉原数据）", () => {
    const r = validateThemeJson(recipe({
      "bg-window": "rgba(10, 14, 20, 0.30)",
      "bg-card": "rgba(255, 255, 255, 0.10)",
      "text-primary": "#FFFFFF",
    }, "linkdesk://theme-panorama/resources/photo.jpg"));
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("bg-card");
    expect(r.errors.join("\n")).toContain("实色基");
  });

  it("有底图 + 实色基 #23262C + 白字 ⇒ 通过", () => {
    const r = validateThemeJson(recipe({
      "bg-window": "rgba(10, 14, 20, 0.42)",
      "bg-card": "#23262C",
      "bg-input": "#2C3035",
      "text-primary": "#FFFFFF",
      "text-muted": "rgba(255, 255, 255, 0.58)",
    }, "linkdesk://theme-panorama/resources/photo.jpg"));
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("无底图 + 浅色面深字（玫瑰窗同款）⇒ 通过", () => {
    const r = validateThemeJson(recipe({
      "bg-window": "rgba(251, 245, 233, 0.46)",
      "bg-card": "rgba(255, 252, 245, 0.46)",
      "text-primary": "#1F160D",
      "text-muted": "#55422B",
    }));
    // 无底图时半透明面是合法玻璃——按最差底色算仍达标
    expect(r.errors).toEqual([]);
  });

  it("text-muted 太暗 ⇒ 判红（< 3:1）", () => {
    const r = validateThemeJson(recipe({
      "bg-window": "#101014",
      "bg-card": "#1B1B20",
      "text-primary": "#FFFFFF",
      "text-muted": "#222228",
    }));
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("text-muted");
  });
});

describe("validateThemeJson — 声明 glass 的主题不受「实色基」契约约束", () => {
  it("有底图 + glass + 半透明暗卡片 ⇒ 通过（极光玻璃同款）", () => {
    const path = join(dir, `theme-glass-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify({
      id: "test.glass",
      name: "Test Glass",
      type: "dark",
      appearance: {
        glass: { type: "glass", blur: 24, opacity: 0.55 },
        background: { image: "assets/bg.svg", opacity: 0.9, mask: 0.3 },
      },
      colorways: [{
        id: "test.glass.a",
        name: "A",
        colors: {
          "bg-window": "rgba(11, 16, 32, 0.55)",
          "bg-card": "rgba(22, 32, 62, 0.55)",
          "text-primary": "#F1F5FF",
          "text-muted": "#B9C7E6",
        },
      }],
    }), "utf8");
    const r = validateThemeJson(path);
    expect(r.errors).toEqual([]);
  });
});
