/**
 * 词表正典运行时值单测（「设置控件-词表正典与共享化」阶段 3.3 · 判据 B）。
 *
 * 钉四样：① 哨兵字面量与壳/仓旧处一字不差（E4 同步门禁的运行时侧）；② 14 hint 名单无重复、
 * 守卫对表内为真对表外为假（E2「无 uiHint ≠ 未知 uiHint」靠它区分）；③ renderHint 三值（E4d）；
 * ④ 隐藏位名单（C2b）是子集、与 uiHint 守卫**不是互斥**（先问顺序即契约）。
 * fixture 全虚构（硬约束 21）。
 */
import { describe, it, expect } from "vitest";
import {
  CONFIG_NONE_SENTINEL,
  MIX_FOLLOW_THEME_SENTINEL,
  SETTINGS_HIDDEN_HINTS,
  SETTINGS_RENDER_HINTS,
  SETTINGS_UI_HINTS,
  isSettingsHiddenHint,
  isSettingsUiHint,
} from "./settingsHints";
import type { SettingsUiHint } from "@linkdesk/contracts";

describe("哨兵字面量", () => {
  it("与既有私有常量同字面量（换字面量 = 破壳/设置仓契约）", () => {
    expect(CONFIG_NONE_SENTINEL).toBe("__none__");
    expect(MIX_FOLLOW_THEME_SENTINEL).toBe("followTheme");
  });
});

describe("uiHint 名单与守卫", () => {
  it("14 条正典 hint，无重复", () => {
    expect(SETTINGS_UI_HINTS).toHaveLength(14);
    expect(new Set(SETTINGS_UI_HINTS).size).toBe(14);
  });

  it("表内每个值守卫为真", () => {
    for (const hint of SETTINGS_UI_HINTS) expect(isSettingsUiHint(hint)).toBe(true);
  });

  it("表外值守卫为假（含空串 / 非字符串 / 未定义）", () => {
    for (const bad of ["__no_such_hint__", "", "Slider", 0, null, undefined, {}]) {
      expect(isSettingsUiHint(bad)).toBe(false);
    }
  });

  it("renderHint 三值（readonly / action / color —— 1.1 对账补的第 3 值）", () => {
    expect([...SETTINGS_RENDER_HINTS]).toEqual(["readonly", "action", "color"]);
  });

  it("名单可赋给契约联合类型（编译期对表）", () => {
    const asUnion: readonly SettingsUiHint[] = SETTINGS_UI_HINTS;
    expect(asUnion.length).toBe(SETTINGS_UI_HINTS.length);
  });
});

describe("隐藏位 hint 名单与守卫（C2b：挂载键不画行）", () => {
  it("名单非空且每一项都在 uiHint 正典里（子集——漏登记 uiHint 就是死的判定）", () => {
    expect(SETTINGS_HIDDEN_HINTS.length).toBeGreaterThan(0);
    for (const hint of SETTINGS_HIDDEN_HINTS) expect(SETTINGS_UI_HINTS).toContain(hint);
  });

  it("挂载键 `fileAssociationsManager` 在名单里，守卫为真", () => {
    expect(isSettingsHiddenHint("fileAssociationsManager")).toBe(true);
  });

  it("🔴 两守卫**不是互斥**——隐藏位同时在 uiHint 正典里为真（渲染器必须先问隐藏位）", () => {
    expect(isSettingsUiHint("fileAssociationsManager")).toBe(true);
    expect(isSettingsHiddenHint("fileAssociationsManager")).toBe(true);
  });

  it("普通行内控件不落隐藏位（隐藏是具名例外，⛔ 不是「未知就藏」）", () => {
    for (const hint of ["slider", "select", "themePicker", "image"]) {
      expect(isSettingsHiddenHint(hint)).toBe(false);
    }
  });

  it("表外值／非字符串守卫为假（含未声明 uiHint 的 undefined）", () => {
    for (const bad of ["__no_such_hint__", "", "FileAssociationsManager", 0, null, undefined, {}]) {
      expect(isSettingsHiddenHint(bad)).toBe(false);
    }
  });
});
