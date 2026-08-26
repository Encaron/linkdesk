/**
 * ThemeEngine/tokens 单元测试——surface/background 玻璃机制（E5.8#50.6）：
 * 玻璃/背景/悬浮变量零值缺省、全机制写入、zones 切片、纹理正交、陈旧变量清理。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, getThemeVariables } from "../ThemeEngine";
import { MOCK_THEME, MOCK_THEME2 } from "./testFixtures.mock";

describe("ThemeEngine — surface/background 玻璃机制（E5.8#50.6）", () => {
  // 玻璃/背景/悬浮零值变量——applyTheme 每次全量写入，测试间清理防残留
  const GLASS_VARS = [
    "glass-blur", "glass-saturate", "glass-tint", "glass-opacity",
    "glass-specular", "glass-morph", "bg-image", "bg-opacity", "bg-mask",
    "surface-radius", "surface-inset", "surface-shadow",
  ];
  beforeEach(() => {
    const root = document.documentElement;
    for (const key of GLASS_VARS) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
  });

  it("无 surface/background 的主题 → 写入玻璃零值（无玻璃无图无悬浮）", () => {
    applyTheme(MOCK_THEME);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
    expect(root.style.getPropertyValue("--glass-saturate")).toBe("1");
    expect(root.style.getPropertyValue("--glass-tint")).toBe("transparent");
    expect(root.style.getPropertyValue("--glass-opacity")).toBe("1");
    expect(root.style.getPropertyValue("--glass-specular")).toBe("0");
    expect(root.style.getPropertyValue("--glass-morph")).toBe("0ms");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none");
    expect(root.style.getPropertyValue("--bg-opacity")).toBe("1");
    expect(root.style.getPropertyValue("--bg-mask")).toBe("0");
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-shadow")).toBe("none");
  });

  it("带 glass surface → 写入玻璃六键", () => {
    applyTheme({
      ...MOCK_THEME,
      surface: { type: "glass", blur: 18, saturate: 1.5, tint: "rgba(0,0,0,0.2)", opacity: 0.9, specular: 0.6, morph: 400 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("18px");
    expect(root.style.getPropertyValue("--glass-saturate")).toBe("1.5");
    expect(root.style.getPropertyValue("--glass-tint")).toBe("rgba(0,0,0,0.2)");
    expect(root.style.getPropertyValue("--glass-opacity")).toBe("0.9");
    expect(root.style.getPropertyValue("--glass-specular")).toBe("0.6");
    expect(root.style.getPropertyValue("--glass-morph")).toBe("400ms");
  });

  it("带 specularColor glass → 写入 glass-specular-color（E5.8#63 高光基色契约化）", () => {
    applyTheme({
      ...MOCK_THEME,
      surface: { type: "glass", specular: 0.6, specularColor: "#ffe08a" },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-specular")).toBe("0.6");
    expect(root.style.getPropertyValue("--glass-specular-color")).toBe("#ffe08a");
    // 缺省（无 specularColor）→ SURFACE_ZERO 白
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", specular: 0.4 } });
    expect(root.style.getPropertyValue("--glass-specular-color")).toBe("#ffffff");
  });

  it("带悬浮面板 surface → 写入 radius/shadow（shadow:true → 映射 --shadow-lift）；inset 宿主派生 2px（缝法则）", () => {
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", radius: 10, shadow: true } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("10px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("2px");
    expect(root.style.getPropertyValue("--surface-shadow")).toBe("var(--shadow-lift)");
  });

  it("带 background → 写入 bg-image（url 包裹）/opacity/mask", () => {
    applyTheme({ ...MOCK_THEME, background: { image: "assets/aurora.jpg", opacity: 0.9, mask: 0.88 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-image")).toBe('url("assets/aurora.jpg")');
    expect(root.style.getPropertyValue("--bg-opacity")).toBe("0.9");
    expect(root.style.getPropertyValue("--bg-mask")).toBe("0.88");
  });

  it("带 maskColor background → 写入 bg-mask-color（E5.8#63 遮罩基色契约化）；zones 模式不写（同 mask）", () => {
    applyTheme({ ...MOCK_THEME, background: { image: "bg.png", mask: 0.3, maskColor: "#0a1e3f" } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-mask")).toBe("0.3");
    expect(root.style.getPropertyValue("--bg-mask-color")).toBe("#0a1e3f");
    // zones 模式——mask/maskColor 均不写（切片挂 zone 表面，遮罩不适用）
    applyTheme({ ...MOCK_THEME, background: { image: "bg.png", mode: "zones", mask: 0.3, maskColor: "#0a1e3f" } });
    expect(root.style.getPropertyValue("--bg-mask")).not.toBe("0.3");
    expect(root.style.getPropertyValue("--bg-mask-color")).toBe("#000000"); // 回到 BACKGROUND_ZERO 默认
  });

  it("玻璃主题切回无质感主题 → 玻璃变量清零不残留", () => {
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 18, radius: 10 }, background: { image: "bg.png" } });
    applyTheme(MOCK_THEME2);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none");
  });

  it("getThemeVariables — 键不带 -- 前缀（与广播/池侧 --${k} 注入惯例一致）", () => {
    const vars = getThemeVariables({
      ...MOCK_THEME,
      surface: { type: "glass", blur: 12 },
      background: { image: "bg.png" },
    });
    expect(vars["glass-blur"]).toBe("12px");
    expect(vars["bg-image"]).toBe('url("bg.png")');
    expect(vars.bg).toBe("#000");
    expect(vars["--bg"]).toBeUndefined();
  });

  it("带 surface.texture → 写 per-surface 纹理变量（repeat + opacity，无 glass 也可用）", () => {
    applyTheme({
      ...MOCK_THEME,
      surface: { texture: "linkdesk://demo-zones/paper.svg", textureOpacity: 0.45, radius: 8 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("linkdesk://demo-zones/paper.svg")');
    expect(root.style.getPropertyValue("--surface-bg-repeat")).toBe("repeat");
    expect(root.style.getPropertyValue("--surface-bg-opacity")).toBe("0.45");
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    // glass 变量仍零值——纹理与 glass 正交
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
  });

  it("无 glass 的 surface（⑬⑭ 分区）→ radius 生效；inset 宿主派生 2px（悬浮形态与玻璃材质正交）", () => {
    applyTheme({ ...MOCK_THEME, surface: { texture: "tile.svg", radius: 8 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("8px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("2px");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("tile.svg")');
    // 玻璃键仍零值——无 glass type 不写玻璃
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
  });

  it("background.mode=zones → 写 per-surface 切片变量（no-repeat + zones 标记），不铺全窗 bg-image", () => {
    applyTheme({
      ...MOCK_THEME,
      background: { mode: "zones", image: "linkdesk://demo-zones/bg.svg", opacity: 0.95 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("linkdesk://demo-zones/bg.svg")');
    expect(root.style.getPropertyValue("--surface-bg-repeat")).toBe("no-repeat");
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("1");
    expect(root.style.getPropertyValue("--surface-bg-opacity")).toBe("0.95");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none");
  });

  it("background 无 mode（默认 panorama）→ 全窗底图 + 表面镜像切片（E5.8#102 玻璃磨砂复权）", () => {
    applyTheme({ ...MOCK_THEME, background: { image: "bg.png", opacity: 0.9 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-image")).toBe('url("bg.png")');
    // 镜像：surface-bg-image 镜像全景 + surface-bg-mirror 独立标记（zones 保持 0——不误报分区背景）
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("bg.png")');
    expect(root.style.getPropertyValue("--surface-bg-repeat")).toBe("no-repeat");
    expect(root.style.getPropertyValue("--surface-bg-mirror")).toBe("1");
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    expect(root.style.getPropertyValue("--surface-bg-opacity")).toBe("0.9");
  });

  it("无 surface 无 background → per-surface 背景零值（zones 0 / image none）；切片坐标键不写（池侧自持）", () => {
    applyTheme(MOCK_THEME);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe("none");
    // E5.8 Phase 11.15（R3 根治）：size/position 归池侧 surface-zones 自写自清，壳引擎不写不广播
    expect(root.style.getPropertyValue("--surface-bg-size")).toBe("");
    expect(root.style.getPropertyValue("--surface-main-zone-bg-position")).toBe("");
    expect(root.style.getPropertyValue("--surface-status-bar-bg-position")).toBe("");
  });

  it("zones 主题切回无质感主题 → per-surface 变量清零不残留（坐标键不写，池侧退出自清）", () => {
    applyTheme({ ...MOCK_THEME, background: { mode: "zones", image: "bg.svg" } });
    applyTheme(MOCK_THEME2);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe("none");
    // R3 根治：引擎不再写坐标键（池侧量测值不残留、不覆盖）
    expect(root.style.getPropertyValue("--surface-titlebar-bg-position")).toBe("");
  });

  it("R3 防回归——getThemeVariables 产物不含 surface-bg-size 与 5 个 position 键（引擎不碰池侧坐标）", () => {
    const vars = getThemeVariables({ ...MOCK_THEME, background: { mode: "zones", image: "bg.svg", opacity: 0.9 } });
    expect(vars["surface-bg-zones"]).toBe("1");
    expect(vars["surface-bg-image"]).toBe('url("bg.svg")');
    expect("surface-bg-size" in vars).toBe(false);
    for (const zone of ["titlebar", "icon-bar", "side-panel", "main-zone", "status-bar"]) {
      expect(`surface-${zone}-bg-position` in vars).toBe(false);
    }
  });

  describe("E5.8#105 gateMirrorVisibility — panorama 镜像 blur=0 不可见（前景不上图）", () => {
    it("panorama 无玻璃（blur 0）→ 镜像不透明度 0（回归修复——不再前景双图）", () => {
      applyTheme({ ...MOCK_THEME, background: { image: "bg.png", opacity: 0.9 } });
      const root = document.documentElement;
      expect(root.style.getPropertyValue("--surface-bg-mirror")).toBe("1");
      expect(root.style.getPropertyValue("--surface-bg-mirror-opacity")).toBe("0");
    });

    it("panorama + 玻璃 blur>0 → 镜像 = 背景不透明度（磨砂采样源可见）", () => {
      applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 12 }, background: { image: "bg.png", opacity: 0.9 } });
      const root = document.documentElement;
      expect(root.style.getPropertyValue("--surface-bg-mirror")).toBe("1");
      expect(root.style.getPropertyValue("--surface-bg-mirror-opacity")).toBe("0.9");
    });

    it("zones 切片（surface-bg-mirror=0）→ 不写 mirror-opacity（恒显不受门控）", () => {
      applyTheme({ ...MOCK_THEME, background: { mode: "zones", image: "bg.svg", opacity: 0.9 } });
      const root = document.documentElement;
      expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("1");
      expect(root.style.getPropertyValue("--surface-bg-mirror")).toBe("0");
      expect(root.style.getPropertyValue("--surface-bg-mirror-opacity")).toBe("");
    });

    it("无背景（无镜像）→ 不写 mirror-opacity", () => {
      applyTheme(MOCK_THEME);
      const root = document.documentElement;
      expect(root.style.getPropertyValue("--surface-bg-mirror")).toBe("0");
      expect(root.style.getPropertyValue("--surface-bg-mirror-opacity")).toBe("");
    });
  });
});
