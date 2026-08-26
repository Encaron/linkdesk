/**
 * ThemeEngine 跨模块集成——真实极限壳主题端到端裁决（E5.8#50.27）+ 旧格式主题迁移新格式（E5.8#74）。
 */

import { describe, it, expect } from "vitest";
import { mergeDomains } from "../ThemeEngine";
import { loadRealRecipe } from "./testFixtures.mock";

/* ── E5.8#50.27：真实极限壳主题端到端裁决——gallery ①⑨⑩ 壳真实落地。
   读取 plugins/user/theme-{songti,terminal,pill} 真实主题 JSON（#50.27 验收「制作真实主题插件做端到端最终裁决」）。
   例外依据：验证真实接线而必须用真 id/真数据（硬约束 21 豁免区）——虚构 fixture 无法裁决「gallery 配方 ↔ 引擎」契约。 */
describe("ThemeEngine — 真实极限壳主题（E5.8#50.27，gallery 端到端裁决）", () => {
  it("songti-print — 宋体印刷体 font 域（ui=SimSun 全 UI 宋体；形制现状直角 isolate 字族轴）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-songti/themes/songti-print.json",
      "songti-print", "宋体印刷体 Songti Print", "light",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.type).toBe("light");
    expect(recipe!.appearance?.font).toEqual({ ui: "SimSun", mono: "Cascadia Mono" });
    const tokens = mergeDomains(recipe!);
    expect(tokens["font-ui"]).toBe("SimSun");
    expect(tokens["font-mono"]).toBe("Cascadia Mono");
    expect(tokens["radius-sm"]).toBeUndefined(); // 形制零值——不写 --radius-*（继承现状直角）
    expect(tokens["bg-window"]).toBe("#FBF8F2"); // 纸白墨黑
    expect(tokens["accent"]).toBe("#4A463E");
  });

  it("terminal-monofont — 终端机 font 域（ui+mono 全 Cascadia Mono 等宽族；形制现状直角）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-terminal/themes/terminal-monofont.json",
      "terminal-monofont", "终端机 Terminal Mono", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.appearance?.font).toEqual({ ui: "Cascadia Mono", mono: "Cascadia Mono" });
    const tokens = mergeDomains(recipe!);
    expect(tokens["font-ui"]).toBe("Cascadia Mono");
    expect(tokens["font-mono"]).toBe("Cascadia Mono");
    expect(tokens["radius-sm"]).toBeUndefined();
    expect(tokens["bg-window"]).toBe("#0C0C0C"); // 终端黑底
    expect(tokens["accent"]).toBe("#00E676"); // 磷光绿
    expect(tokens["status-connected"]).toBe("#00E676");
  });

  it("pill-bubble — 全胶囊 radius 域（七档 999px 绝对圆角 + radius-full 去键继承 :root 50% + 悬浮形态 radius999/shadow + 泡泡糖）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-pill/themes/pill-bubble.json",
      "pill-bubble", "全胶囊 Pill Bubble", "light",
    );
    expect(recipe).not.toBeNull();
    // E5.8#85：radius-full 相对几何值 50%（:root 继承）——配方不写绝对 px（去键即继承）
    expect(recipe!.appearance?.radius).toEqual({
      xs: 999, sm: 999, md: 999, lg: 999, xl: 999, "2xl": 999, pill: 999,
    });
    expect(recipe!.appearance?.radius?.full).toBeUndefined();
    const tokens = mergeDomains(recipe!);
    expect(tokens["radius-md"]).toBe("999px"); // tab 胶囊
    expect(tokens["radius-pill"]).toBe("999px");
    expect(tokens["surface-radius"]).toBe("999px"); // zone 胶囊化
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则宿主派生——主题 inset 数据已废弃，radius≠0 → 每格半缝
    expect(tokens["surface-shadow"]).toBe("var(--shadow-lift)"); // 投影浮起
    expect(tokens["glass-specular"]).toBe("0.4"); // 发丝光边（gallery surface.border 意图 = specular 派生）
    expect(tokens["bg-window"]).toBe("#FFF0F5");
    expect(tokens["accent"]).toBe("#D6336C"); // 泡泡糖
  });

  it("panorama — 整窗主视觉 background 域（mode:panorama 全窗铺图 + 低遮罩 0.15 + zone 半透明让位，chrome 让位给影像）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-panorama/themes/panorama.json",
      "panorama", "整窗主视觉 Main Visual", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.type).toBe("dark");
    expect(recipe!.appearance?.background).toEqual({
      mode: "panorama",
      image: "linkdesk://theme-panorama/resources/sailor-moon.jpg",
      opacity: 1,
      mask: 0.15,
    });
    const tokens = mergeDomains(recipe!);
    expect(tokens["bg-image"]).toBe('url("linkdesk://theme-panorama/resources/sailor-moon.jpg")'); // 全窗铺图
    expect(tokens["bg-opacity"]).toBe("1");
    expect(tokens["bg-mask"]).toBe("0.15"); // 低遮罩——图几乎全露
    expect(tokens["bg-mask-color"]).toBe("#000000"); // 遮罩基色缺省黑
    expect(tokens["radius-sm"]).toBeUndefined(); // 形制现状直角——不写 --radius-*（继承现状）
    expect(tokens["font-ui"]).toBeUndefined(); // 字体系统默认——不写 --font-ui
    expect(tokens["bg-window"]).toBe("rgba(10, 14, 20, 0.30)"); // zone 半透明让位给图
    expect(tokens["accent"]).toBe("#FFB85C"); // 月夜暖光
  });
});

/* ── E5.8#74：旧格式主题迁移新格式——决策 F「零向后兼容读」兑现。
   极光玻璃/影像分区/纸纹分区 3 主题从旧格式（顶层 colors+surface+background）纯数据迁移到
   { id, name, type, appearance, colorways[] }。本测试断言新格式字段 + mergeDomains token 与迁移前逐键一致（零回归）。 */
describe("ThemeEngine — 旧格式主题迁移新格式（E5.8#74，决策 F）", () => {
  it("aurora-glass — 极光玻璃（appearance.glass 全玻璃+悬浮形态 + background 全窗图，colorway 单配色）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-aurora-glass/aurora-glass.json",
      "aurora-glass", "极光玻璃 Aurora Glass", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("aurora-glass");
    expect(recipe!.type).toBe("dark");
    // 旧顶层 surface → appearance.glass（ThemeSurface 全字段）
    expect(recipe!.appearance?.glass).toEqual({
      type: "glass", blur: 24, saturate: 1.25, tint: "rgba(59, 77, 148, 0.35)",
      opacity: 0.275, specular: 0.6, morph: 200, radius: 12, shadow: true,
    });
    expect(recipe!.appearance?.background).toEqual({
      image: "linkdesk://theme-aurora-glass/resources/aurora-bg.svg", opacity: 0.9, mask: 0.3,
    });
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0].id).toBe("aurora");
    // 旧顶层 colors → colorways[0].colors（半透明紫 bg-titlebar 保留）
    expect(recipe!.colorways[0].colors?.["bg-titlebar"]).toBe("rgba(16, 26, 51, 0.55)");
    const tokens = mergeDomains(recipe!);
    expect(tokens["glass-blur"]).toBe("24px");
    expect(tokens["glass-saturate"]).toBe("1.25");
    expect(tokens["glass-tint"]).toBe("rgba(59, 77, 148, 0.35)");
    expect(tokens["glass-opacity"]).toBe("0.275");
    expect(tokens["glass-specular"]).toBe("0.6");
    expect(tokens["glass-morph"]).toBe("200ms");
    expect(tokens["surface-radius"]).toBe("12px");
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则——主题 inset 数据已废弃，radius≠0 → 每格半缝
    expect(tokens["surface-shadow"]).toBe("var(--shadow-lift)");
    expect(tokens["bg-image"]).toBe('url("linkdesk://theme-aurora-glass/resources/aurora-bg.svg")');
    expect(tokens["bg-opacity"]).toBe("0.9");
    expect(tokens["bg-mask"]).toBe("0.3");
    expect(tokens["bg-window"]).toBe("rgba(11, 16, 32, 0.55)");
    expect(tokens["accent"]).toBe("#7C3AED");
  });

  it("image-zones — 影像分区（appearance.glass 悬浮形态 + background.mode:zones 连续切片）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-zones/image-zones.json",
      "image-zones", "影像分区 Image Zones", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("image-zones");
    expect(recipe!.type).toBe("dark");
    expect(recipe!.appearance?.glass).toEqual({ radius: 8 });
    expect(recipe!.appearance?.background).toEqual({
      mode: "zones", image: "linkdesk://theme-zones/resources/zones-bg.svg", opacity: 0.95,
    });
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0].id).toBe("image");
    const tokens = mergeDomains(recipe!);
    expect(tokens["surface-radius"]).toBe("8px");
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则——radius≠0 → 每格半缝
    // zones 模式——图挂 zone 表面，不写全窗 --bg-image
    expect(tokens["surface-bg-image"]).toBe('url("linkdesk://theme-zones/resources/zones-bg.svg")');
    expect(tokens["surface-bg-repeat"]).toBe("no-repeat");
    expect(tokens["surface-bg-zones"]).toBe("1");
    expect(tokens["surface-bg-opacity"]).toBe("0.95");
    expect(tokens["bg-image"]).toBe("none"); // zones 模式——全窗层零值（图只挂 zone 表面）
    // E5.8 Phase 11.15（R4）：配色半透明化（RGB 不变只加 alpha 0.55）——切片图透出，不再实心棕盖死
    expect(tokens["bg-window"]).toBe("rgba(18, 16, 12, 0.55)");
    expect(tokens["bg-card"]).toBe("rgba(27, 24, 19, 0.55)");
    expect(tokens["accent"]).toBe("#E8923C");
  });

  it("paper-zones — 纸纹分区（appearance.glass texture 平铺纹理 + 悬浮形态，无 background）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-zones/paper-zones.json",
      "paper-zones", "纸纹分区 Paper Zones", "light",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("paper-zones");
    expect(recipe!.type).toBe("light");
    expect(recipe!.appearance?.glass).toEqual({
      texture: "linkdesk://theme-zones/resources/paper-texture.svg", textureOpacity: 0.45,
      radius: 8,
    });
    expect(recipe!.appearance?.background).toBeUndefined(); // 旧无 background
    expect(recipe!.colorways).toHaveLength(1);
    // E5.8 主题过老修正：配色 id 全局唯一契约（theme.ts L92）——kraft 避 songti-print 同款 "paper" 冲突
    expect(recipe!.colorways[0].id).toBe("kraft");
    const tokens = mergeDomains(recipe!);
    expect(tokens["surface-bg-image"]).toBe('url("linkdesk://theme-zones/resources/paper-texture.svg")');
    expect(tokens["surface-bg-repeat"]).toBe("repeat"); // 纹理平铺
    expect(tokens["surface-bg-opacity"]).toBe("0.45");
    expect(tokens["surface-radius"]).toBe("8px");
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则——radius≠0 → 每格半缝
    expect(tokens["bg-window"]).toBe("#ECE7DC");
    expect(tokens["accent"]).toBe("#B45309");
  });
});
