/**
 * E4V#40d: language-map 单元测试。
 * 扩展名→Monaco 语言 ID 映射——决定了每个打开文件的语法高亮。
 */

import { describe, it, expect } from "vitest";
import { getLanguageFromPath } from "../services/language-map";

describe("getLanguageFromPath", () => {
  /* ── 已知扩展名 ── */

  it(".ts → typescript", () => {
    expect(getLanguageFromPath("/src/app.ts")).toBe("typescript");
    expect(getLanguageFromPath("E:/test/foo.tsx")).toBe("typescript");
  });

  it(".js → javascript", () => {
    expect(getLanguageFromPath("app.js")).toBe("javascript");
    expect(getLanguageFromPath("lib.mjs")).toBe("javascript");
  });

  it(".py → python", () => {
    expect(getLanguageFromPath("main.py")).toBe("python");
  });

  it(".c/.h → c, .cpp/.hpp → cpp", () => {
    expect(getLanguageFromPath("firmware.c")).toBe("c");
    expect(getLanguageFromPath("header.h")).toBe("c");
    expect(getLanguageFromPath("main.cpp")).toBe("cpp");
    expect(getLanguageFromPath("lib.hpp")).toBe("cpp");
  });

  it(".json → json", () => {
    expect(getLanguageFromPath("package.json")).toBe("json");
  });

  it(".css/.scss/.less → css", () => {
    expect(getLanguageFromPath("style.css")).toBe("css");
    expect(getLanguageFromPath("theme.scss")).toBe("css");
  });

  it(".md → markdown", () => {
    expect(getLanguageFromPath("README.md")).toBe("markdown");
  });

  /* ── 大小写 ── */

  it("大小写不敏感——.TS → typescript", () => {
    expect(getLanguageFromPath("App.TS")).toBe("typescript");
    expect(getLanguageFromPath("App.Tsx")).toBe("typescript");
  });

  /* ── 未知扩展名 → plaintext 兜底 ── */

  it("未知扩展名 → plaintext", () => {
    expect(getLanguageFromPath("Dockerfile")).toBe("plaintext");
    expect(getLanguageFromPath("Makefile")).toBe("plaintext");
    expect(getLanguageFromPath("file.xyz")).toBe("plaintext");
  });

  /* ── 无扩展名 → plaintext ── */

  it("无扩展名 → plaintext", () => {
    expect(getLanguageFromPath("README")).toBe("plaintext");
    expect(getLanguageFromPath("/usr/bin/script")).toBe("plaintext");
  });
});
