/**
 * 窗口模式策略表完整性测试——E5.8#43-2。
 *
 * 策略表 = 壳层窗口策略声明层（mode → 初始布局组装/空窗行为/关窗×语义/[+] 供给/标题栏菜单）。
 * 新增窗口类型 = WindowMode 加成员 + 策略表加一行——本测试保证每个模式都有策略且声明齐全，
 * 且 main/detached 按架构语义区分（main 全 zone + 欢迎兜底 + 退出语义 + 标题栏菜单随全局配置；
 * detached 子集 + 空窗自灭 + 关闭 tab + 纯工作区无菜单栏——E5.8#46.15 拍板 7）。
 */

import { describe, it, expect } from "vitest";
import { WINDOW_MODE_STRATEGIES, type WindowMode } from "./windows";

describe("WINDOW_MODE_STRATEGIES 窗口模式策略表", () => {
  it("每个窗口模式都有策略且声明齐全", () => {
    const modes: WindowMode[] = ["main", "detached", "drift"];
    for (const mode of modes) {
      const s = WINDOW_MODE_STRATEGIES[mode];
      expect(s, `策略表缺 ${mode} 声明`).toBeDefined();
      expect(s.zones.length, `${mode} zones 不能为空`).toBeGreaterThan(0);
      expect(["fallback", "autoClose"]).toContain(s.emptyBehavior);
      expect(["quitApp", "closeTabs"]).toContain(s.closeSemantics);
      expect(["provided", "suppressed"]).toContain(s.tabBarCreate);
      expect(typeof s.titleBarMenu, `${mode} titleBarMenu 必须声明布尔`).toBe("boolean");
    }
  });

  it("main 推全 zone（图标栏/侧栏/状态栏/面板全含），detached 只推 titleBar+groups 子集", () => {
    const main = WINDOW_MODE_STRATEGIES.main;
    const detached = WINDOW_MODE_STRATEGIES.detached;
    for (const zone of ["iconBar", "sidebar", "statusBar", "panel"] as const) {
      expect(main.zones).toContain(zone);
      expect(detached.zones).not.toContain(zone);
    }
    expect(main.zones).toContain("titleBar");
    expect(main.zones).toContain("groups");
    expect(detached.zones).toContain("titleBar");
    expect(detached.zones).toContain("groups");
  });

  it("空窗行为/关窗语义/创建菜单/标题栏菜单按模式区分", () => {
    expect(WINDOW_MODE_STRATEGIES.main.emptyBehavior).toBe("fallback");
    expect(WINDOW_MODE_STRATEGIES.detached.emptyBehavior).toBe("autoClose");
    expect(WINDOW_MODE_STRATEGIES.main.closeSemantics).toBe("quitApp");
    expect(WINDOW_MODE_STRATEGIES.detached.closeSemantics).toBe("closeTabs");
    expect(WINDOW_MODE_STRATEGIES.main.tabBarCreate).toBe("provided");
    expect(WINDOW_MODE_STRATEGIES.detached.tabBarCreate).toBe("suppressed");
    // E5.8#46.15 拍板 7：main 有标题栏菜单（随全局配置），detached/drift 纯工作区无菜单栏
    expect(WINDOW_MODE_STRATEGIES.main.titleBarMenu).toBe(true);
    expect(WINDOW_MODE_STRATEGIES.detached.titleBarMenu).toBe(false);
    expect(WINDOW_MODE_STRATEGIES.drift.titleBarMenu).toBe(false);
  });
});
