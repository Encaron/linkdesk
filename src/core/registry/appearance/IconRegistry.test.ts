/**
 * IconRegistry 归属仲裁单测——E6#111f／1.36（五处仲裁点里的**图标主题**与**共享图标**两处）。
 * 判据出处 = 1.36 §二.2/§二.3；纯判据在 appearanceOwnership.test.ts，本文件只钉**接线**：
 * 「拒 ⇒ 不进登记本 ＋ 返 no-op disposer ＋ console.error 一次」。
 *
 * ⚠️ E6#111n／1.47 **改判**：图标主题 id 本轮随主题族一起改名（`ld-iconset-pastel` →
 *   `theme-iconset-pastel.ld-iconset-pastel`；[00 §〇c.1] 撤 [1.35 §12.3] 的「本轮不改」）。
 *   🔴 改的是 **id**，`label`（设置页可见文字）一个字不动——两张面别混。
 *   本文件只用**账里真有的**保底 id `default` 与虚构值（硬约束 21），故不受改名影响。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { IconRegistry, iconThemeEnumOptions, ICON_THEME_FALLBACK_ID } from "./IconRegistry";
import { rollback } from "../registrationTracker";
import type { IconThemeContribution, IconContribution } from "../../api/types";

const ICON: IconContribution = { description: "demo icon", default: { fontCharacter: "\\ea01" } };

function iconTheme(id: string, label = "Demo"): IconThemeContribution {
  return { id, label, path: "icons.json" };
}

/**
 * 两族（图标主题 / 共享图标）共用的清场：回收本用例登记的 disposer ＋ 回滚登记本 ＋ 还原 spy。
 * 每族各调一次（`afterEach` 在收集期登记，调它的函数必须写在 `describe` 体内）。
 */
function useArbitrationCleanup(): Array<() => void> {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    for (const d of disposers.splice(0)) d();
    // 跨用例清场（仲裁在残留状态上判红 ⇒ 不留脏局面）＋ 还原 spy（断言中途失败也不污染下一条）
    rollback("demo-plugin");
    rollback("other-plugin");
    vi.restoreAllMocks();
  });
  return disposers;
}

describe("IconRegistry — 图标主题 id 归属仲裁", () => {
  const disposers = useArbitrationCleanup();

  it("跨插件同 id ⇒ 先者保留 ＋ 拒后者 ＋ console.error 点名双方（判据③）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(IconRegistry.register(iconTheme("demo-plugin.demo-icons"), "demo-plugin"));
    const rejected = IconRegistry.register(iconTheme("demo-plugin.demo-icons"), "other-plugin");
    expect(IconRegistry.get("demo-plugin.demo-icons")?.pluginId).toBe("demo-plugin");
    expect(err).toHaveBeenCalledTimes(1);
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain("demo-plugin");
    expect(line).toContain("other-plugin");
    rejected(); // no-op disposer
    expect(IconRegistry.get("demo-plugin.demo-icons")?.pluginId).toBe("demo-plugin");
    err.mockRestore();
  });

  it("插件的图标主题占宿主保底 `default` ⇒ 拒 ＋ 出声（判据②）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const rejected = IconRegistry.register(iconTheme("default"), "demo-plugin");
    expect(IconRegistry.has("default")).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    rejected();
    err.mockRestore();
  });

  it("反向负控：同 pluginId 重注册 ⇒ 第二次生效且零日志", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(IconRegistry.register(iconTheme("demo-plugin.demo-icons", "One"), "demo-plugin"));
    disposers.push(IconRegistry.register(iconTheme("demo-plugin.demo-icons", "Two"), "demo-plugin"));
    expect(IconRegistry.get("demo-plugin.demo-icons")?.label).toBe("Two");
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("IconRegistry — 共享图标 id 归属仲裁", () => {  const disposers = useArbitrationCleanup();

  it("共享图标**没有**宿主保留面 ⇒ 空位注册恒接受（账 sharedIcon 栏为空）", () => {
    disposers.push(IconRegistry.registerIcon("demo-icon", ICON, "demo-plugin"));
    expect(IconRegistry.getIcon("demo-icon")?.pluginId).toBe("demo-plugin");
  });

  it("跨插件同 id ⇒ 先者保留 ＋ 拒后者 ＋ console.error（判据③——本空间唯一那条判据）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(IconRegistry.registerIcon("demo-icon", ICON, "demo-plugin"));
    const rejected = IconRegistry.registerIcon("demo-icon", ICON, "other-plugin");
    expect(IconRegistry.getIcon("demo-icon")?.pluginId).toBe("demo-plugin");
    expect(err).toHaveBeenCalledTimes(1);
    rejected();
    expect(IconRegistry.getIcon("demo-icon")?.pluginId).toBe("demo-plugin");
    err.mockRestore();
  });

  it("同 pluginId 重注册 ⇒ 第二次生效且零日志（反向负控）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(IconRegistry.registerIcon("demo-icon", ICON, "demo-plugin"));
    disposers.push(IconRegistry.registerIcon("demo-icon", { ...ICON, description: "v2" }, "demo-plugin"));
    expect(IconRegistry.getIcon("demo-icon")?.description).toBe("v2");
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

/**
 * 2026-10-01 接线：`app.iconTheme` 下拉的**显示名**。
 * 病灶（此前）：枚举只推 id ⇒ 下拉里是裸 id，插件在 `contributes.iconThemes[].label` 声明的名字零消费方。
 * 本组钉装配口径：保底项恒在首位（值 `default` ＋ 壳声明中文原文）＋ 插件项取 label 原样
 * （**不在这里翻译**——显示期由设置页 `t()` 解析，E6#165 同口径）。
 * ⚠️ 断言走 indexOf 而非固定下标：IconRegistry 是全局单例，别的用例可能已登记条目。
 */
describe("iconThemeEnumOptions — 枚举与显示名同源装配", () => {
  const disposers = useArbitrationCleanup();

  it("保底项恒在首位：值 = 壳哨兵 `default`、显示名 = 壳声明中文原文", () => {
    const { values, descriptions } = iconThemeEnumOptions();
    expect(values[0]).toBe(ICON_THEME_FALLBACK_ID);
    expect(descriptions[0]).toBe("内置图标集");
  });

  it("插件项：显示名取 label 原文（未译——译名住插件本仓字典）", () => {
    disposers.push(IconRegistry.register(iconTheme("demo-plugin.demo-icons", "薄荷苏打"), "demo-plugin"));
    const { values, descriptions } = iconThemeEnumOptions();
    const i = values.indexOf("demo-plugin.demo-icons");
    expect(i).toBeGreaterThan(0);
    expect(descriptions[i]).toBe("薄荷苏打");
    expect(values.length).toBe(descriptions.length); // 一一对应——错位会让下拉整体串名
  });

  it("负控：label 缺失（手写 manifest）⇒ 显示名退 id，不出 undefined / 空串", () => {
    disposers.push(IconRegistry.register({ id: "demo-plugin.ld-x", label: "", path: "icons.json" }, "demo-plugin"));
    const { values, descriptions } = iconThemeEnumOptions();
    const i = values.indexOf("demo-plugin.ld-x");
    expect(descriptions[i]).toBe("demo-plugin.ld-x");
  });
});
