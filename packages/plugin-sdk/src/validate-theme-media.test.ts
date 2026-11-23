/**
 * validateThemeJson —— 媒体遮罩可读性语义校验（2026-11-23 商店 Hero 深字压深遮罩实机案）。
 * schema 只管字段形状；`surface-ink` 与 `surface-media-scrim` 的对比关系是第二类判据。
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateThemeJson } from "./validate";

const dir = mkdtempSync(join(tmpdir(), "ldk-theme-validate-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function recipe(colors: Record<string, string>): string {
  const path = join(dir, `theme-${Object.keys(colors).length}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({
    id: "test.theme",
    name: "Test",
    type: "light",
    colorways: [{ id: "test.theme.a", name: "A", colors }],
  }), "utf8");
  return path;
}

describe("validateThemeJson — surface-ink / surface-media-scrim", () => {
  it("深遮罩 ＋ 深墨 ⇒ 判红并给出对比度", () => {
    const r = validateThemeJson(recipe({
      "surface-media-scrim": "rgba(26,16,7,0.72)",
      "surface-ink": "#1F160D",
    }));
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain("对比度仅");
    expect(r.errors[0]).toContain("surface-ink");
  });

  it("深遮罩 ＋ 亮墨 ⇒ 通过", () => {
    const r = validateThemeJson(recipe({
      "surface-media-scrim": "rgba(26,16,7,0.72)",
      "surface-ink": "#FFF7E6",
    }));
    expect(r.valid).toBe(true);
  });

  it("亮遮罩 ＋ 深墨 ⇒ 通过（反向也成立）", () => {
    const r = validateThemeJson(recipe({
      "surface-media-scrim": "rgba(255,255,255,0.86)",
      "surface-ink": "#1A2A2D",
    }));
    expect(r.valid).toBe(true);
  });

  it("var()/color-mix() 解析不了 ⇒ 不判（不误伤）", () => {
    const r = validateThemeJson(recipe({
      "surface-media-scrim": "var(--scrim)",
      "surface-ink": "color-mix(in srgb, #fff 80%, transparent)",
    }));
    expect(r.valid).toBe(true);
  });
});
