/**
 * 主题配方测试夹具——ThemePicker / select-box DynamicSelect 等 theme 控件单测共享（E5.8#50.23 归一化提取）。
 * 虚构配方名/配色名/色值（硬约束 21 测试卫生——demo-* 前缀 + 英文，非真实插件/UI 文案）。
 * 色值即测试数据（no-hardcoded-hex 豁免类别 4），非样式硬编码。
 */
/* eslint-disable linkdesk/no-hardcoded-hex -- 主题测试夹具：配色 preview 色值即数据（豁免类别 4） */

import { vi } from "vitest";
import type { RecipeMeta } from "@src/core/api/linkdesk-api/types";

/** 多配色配方——颜色/玻璃域（colorways 双配色） */
export const MINT: RecipeMeta = {
  id: "demo-mint",
  name: "Demo Mint",
  type: "light",
  colorways: [
    { id: "dew", name: "Alpha", preview: { accent: "#3E9E8C", bgWindow: "#F7FBF8" } },
    { id: "tea", name: "Beta", preview: { accent: "#A5D8E8", bgWindow: "#F7FBF8" } },
  ],
  domains: ["colors", "glass"],
};

/** 单配色深色配方——颜色域 */
export const FOREST: RecipeMeta = {
  id: "demo-forest",
  name: "Demo Forest",
  type: "dark",
  colorways: [{ id: "pine", name: "Gamma", preview: { accent: "#4C8C6A", bgWindow: "#1B2A23" } }],
  domains: ["colors"],
};

/** 只贡献 font 域的配方——sources 域过滤用例（10 §2 六域互斥） */
export const SERIF: RecipeMeta = {
  id: "demo-serif",
  name: "Demo Serif",
  type: "light",
  colorways: [{ id: "ink", name: "Ink", preview: { accent: "#222222", bgWindow: "#FAFAFA" } }],
  domains: ["font"],
};

/** 注入 window.linkdesk.theme.listRecipes mock（as unknown as 收窄，同 dependencies.test 先例） */
export function mockListRecipes(recipes: RecipeMeta[]): void {
  const lk = window as unknown as {
    linkdesk?: { theme?: { listRecipes: () => Promise<RecipeMeta[]> } };
  };
  if (lk.linkdesk) {
    lk.linkdesk.theme = { listRecipes: vi.fn().mockResolvedValue(recipes) };
  }
}

/** 捕获 configuration.onPluginLifecycleChange 注册的回调——模拟插件热装/卸载（E5.8#60 F1.3，ThemePicker/DynamicSelect 共享） */
export function captureLifecycleChange(): () => void {
  let captured: (() => void) | null = null;
  const lk = window as unknown as {
    linkdesk?: { configuration?: { onPluginLifecycleChange: (cb: () => void) => () => void } };
  };
  if (lk.linkdesk?.configuration) {
    lk.linkdesk.configuration.onPluginLifecycleChange = ((cb: () => void) => {
      captured = cb;
      return () => {};
    }) as typeof lk.linkdesk.configuration.onPluginLifecycleChange;
  }
  return () => { captured?.(); };
}
