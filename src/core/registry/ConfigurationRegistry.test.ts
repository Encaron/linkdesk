/**
 * ConfigurationRegistry 单元测试——register/unregister/updateEnum/merge/request+consumeSettingsGroup
 * ＋ 键归属仲裁（E6#111d／1.34：保护区 ／ 首撞保留）。
 * #36l2：核心 Registry/Service 层 vitest 覆盖。
 *
 * ⚠️ fixture 的键名自 E6#111d 起是 `test-plugin.*`（原为 `app.theme` 等宿主键）：1.34 的保护区对
 * **所有非宿主身份**生效，若继续用 `test-plugin` 注册宿主键，这些机制用例会被归属仲裁拦掉（测的就不是机制了）。
 * 宿主键的正/反向用例见文件末尾「键归属仲裁」describe（N1–N9）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle/lifecycle-events";
import { clearRegistrationLayers } from "./registrationTracker";
import {
  registerConfiguration,
  updateConfigurationEnum,
  getPluginConfiguration,
  getMergedSchema,
  getDefaults,
  registerConfigurationDefaults,
  getConfigurationDefaults,
  requestSettingsGroup,
  consumeSettingsGroup,
  onRequestSettingsGroup,
  clearConfigurationRegistrations,
} from "./ConfigurationRegistry";
import type { ConfigurationContribution } from "./ConfigurationRegistry";

const MOCK_CONFIG: ConfigurationContribution = {
  title: "测试设置",
  properties: {
    "test-plugin.theme": {
      type: "string",
      default: "Dark",
      enum: ["Dark", "Light"],
      description: "颜色主题",
    },
    "test-plugin.fontSize": {
      type: "number",
      default: 14,
      description: "字体大小",
    },
  },
};

describe("ConfigurationRegistry — register / unregister", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearConfigurationRegistrations();
  });

  it("registerConfiguration — 注册后 getPluginConfiguration 返回", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    const contrib = getPluginConfiguration("test-plugin");
    expect(contrib).toBeDefined();
    expect(contrib!.title).toBe("测试设置");
  });

  it("registerConfiguration — 注册后 getMergedSchema 含配置项", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    const merged = getMergedSchema();
    expect(merged["test-plugin.theme"]).toBeDefined();
    expect(merged["test-plugin.theme"].default).toBe("Dark");
  });

  it("registerConfiguration — 同一 pluginId 合并属性", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    registerConfiguration("test-plugin", {
      title: "测试设置",
      properties: { "test-plugin.extra": { type: "boolean", default: true, description: "额外" } },
    });
    const contrib = getPluginConfiguration("test-plugin");
    expect(Object.keys(contrib!.properties)).toContain("test-plugin.theme");
    expect(Object.keys(contrib!.properties)).toContain("test-plugin.extra");
  });

  // E5.8#12：unregisterConfiguration 已删——卸载清理由 fire onWillUninstall → tracker 逆序回滚
  // 深拷贝——回滚 disposer 从 contribution.properties 原地删键，不污染共享 MOCK_CONFIG
  it("卸载回滚 — fire onWillUninstall → getPluginConfiguration 返回 undefined", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    PluginLifecycle.onWillUninstall.fire({ pluginId: "test-plugin", reason: "uninstall" });
    expect(getPluginConfiguration("test-plugin")).toBeUndefined();
  });

  it("卸载回滚 — fire 未注册 pluginId → 不抛错", () => {
    expect(() => PluginLifecycle.onWillUninstall.fire({ pluginId: "nonexistent", reason: "uninstall" })).not.toThrow();
  });

  it("卸载回滚 — getMergedSchema 不含该配置项", () => {
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    PluginLifecycle.onWillUninstall.fire({ pluginId: "test-plugin", reason: "uninstall" });
    const merged = getMergedSchema();
    expect(merged["test-plugin.theme"]).toBeUndefined();
  });
});

describe("ConfigurationRegistry — updateEnum / defaults", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    // 深拷贝——updateConfigurationEnum 原地修改 properties，避免跨测试污染
    registerConfiguration("test-plugin", JSON.parse(JSON.stringify(MOCK_CONFIG)));
  });

  it("updateConfigurationEnum — 更新 enum 值", () => {
    updateConfigurationEnum("test-plugin.theme", ["Dark", "Light", "Sunset"]);
    const merged = getMergedSchema();
    expect(merged["test-plugin.theme"].enum).toEqual(["Dark", "Light", "Sunset"]);
  });

  it("updateConfigurationEnum — 可同时更新 default", () => {
    updateConfigurationEnum("test-plugin.theme", ["Sunset"], "Sunset");
    const merged = getMergedSchema();
    expect(merged["test-plugin.theme"].default).toBe("Sunset");
  });

  it("getDefaults — 返回所有配置项默认值", () => {
    const defaults = getDefaults();
    expect(defaults["test-plugin.theme"]).toBe("Dark");
    expect(defaults["test-plugin.fontSize"]).toBe(14);
  });
});

describe("ConfigurationRegistry — configurationDefaults", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
  });

  it("registerConfigurationDefaults — 注册弱默认值", () => {
    registerConfigurationDefaults("test-plugin", { "editor.fontSize": 12 });
    const merged = getConfigurationDefaults();
    expect(merged["editor.fontSize"]).toBe(12);
  });

  it("getConfigurationDefaults — 合并多个插件的弱默认值", () => {
    registerConfigurationDefaults("plugin-a", { a: 1 });
    registerConfigurationDefaults("plugin-b", { b: 2 });
    const merged = getConfigurationDefaults();
    expect(merged.a).toBe(1);
    expect(merged.b).toBe(2);
  });
});

describe("ConfigurationRegistry — register 返 disposer（E5.8#10）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearConfigurationRegistrations();
  });

  it("registerConfiguration 注册→dispose→getPluginConfiguration 为空", () => {
    // 深拷贝——disposer 从 contribution.properties 删键（merge 语义），不污染共享 MOCK_CONFIG
    const dispose = registerConfiguration("disposer-test", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    expect(getPluginConfiguration("disposer-test")).toBeDefined();

    dispose();

    expect(getPluginConfiguration("disposer-test")).toBeUndefined();
    expect(getMergedSchema()["test-plugin.theme"]).toBeUndefined();
  });

  it("merge 部分——dispose 只删本次 contribution 的属性，先前保留", () => {
    registerConfiguration("disposer-test", JSON.parse(JSON.stringify(MOCK_CONFIG))); // app.theme + app.fontSize
    const dispose = registerConfiguration("disposer-test", {
      title: "测试设置",
      properties: { "test-plugin.extra": { type: "boolean", default: true, description: "额外" } },
    });

    dispose();

    const contrib = getPluginConfiguration("disposer-test")!;
    expect(contrib.properties["test-plugin.theme"]).toBeDefined();  // 先前注册的属性保留
    expect(contrib.properties["test-plugin.extra"]).toBeUndefined(); // 本次新增的属性已删
  });

  it("registerConfigurationDefaults 注册→dispose→查询为空", () => {
    const dispose = registerConfigurationDefaults("disposer-test", { "editor.fontSize": 12 });
    expect(getConfigurationDefaults()["editor.fontSize"]).toBe(12);

    dispose();

    expect(getConfigurationDefaults()["editor.fontSize"]).toBeUndefined();
  });

  it("fire onWillUninstall → 配置 + 弱默认值自动逆序回滚（机械保障）", () => {
    registerConfiguration("disposer-test", JSON.parse(JSON.stringify(MOCK_CONFIG)));
    registerConfigurationDefaults("disposer-test", { "editor.fontSize": 12 });

    PluginLifecycle.onWillUninstall.fire({ pluginId: "disposer-test", reason: "uninstall" });

    expect(getPluginConfiguration("disposer-test")).toBeUndefined();
    expect(getConfigurationDefaults()["editor.fontSize"]).toBeUndefined();
  });
});

describe("ConfigurationRegistry — group 组内二级标题（E5.8#78）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
  });

  it("registerConfiguration — group 字段随注册透传 getMergedSchema", () => {
    registerConfiguration("group-test", {
      title: "分组测试",
      properties: {
        "test-plugin.theme": { type: "string", default: "dark", description: "主题", group: "整体配方" },
        "test-plugin.accentColor": { type: "string", default: "#0078d4", description: "强调色", group: "强调色" },
        "test-plugin.plain": { type: "boolean", default: true, description: "无分组" },
      },
    });
    const merged = getMergedSchema();
    expect(merged["test-plugin.theme"].group).toBe("整体配方");
    expect(merged["test-plugin.accentColor"].group).toBe("强调色");
    // 未声明 group → 字段缺省（平铺原样，SettingsView 渲染端按 "" 处理）
    expect(merged["test-plugin.plain"].group).toBeUndefined();
  });

  it("getConfigurationContributions — group 随插件配置贡献保留（SettingsView IPC 消费面）", () => {
    registerConfiguration("group-test", {
      title: "分组测试",
      properties: {
        "test-plugin.themeColor": { type: "string", default: "", description: "配色", group: "配色" },
      },
    });
    const contrib = getPluginConfiguration("group-test")!;
    expect(contrib.properties["test-plugin.themeColor"].group).toBe("配色");
  });
});

describe("ConfigurationRegistry — requestSettingsGroup / consumeSettingsGroup", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
  });

  it("requestSettingsGroup — consumeSettingsGroup 返回目标 pluginId", () => {
    requestSettingsGroup("my-plugin");
    expect(consumeSettingsGroup()).toBe("my-plugin");
  });

  it("consumeSettingsGroup — 消费后清空，再次调用返回 null", () => {
    requestSettingsGroup("my-plugin");
    consumeSettingsGroup();
    expect(consumeSettingsGroup()).toBeNull();
  });

  it("onRequestSettingsGroup — Emitter 在 request 时 fire", () => {
    let fired = "";
    onRequestSettingsGroup.event((id) => { fired = id; });
    requestSettingsGroup("target-plugin");
    expect(fired).toBe("target-plugin");
  });
});

/* ── E6#111d（1.34）：键归属仲裁——保护区 ＋ 首撞保留 ──
 * 判据出处：1.33 §11.1 裁决 =（丙）=（甲）保护区 ＋（乙）首撞保留；任务书 04 §三（N1–N9）。
 * ⚠️ N2 的 `app.schemaVersion` **只注册、不写值**——真去 setConfigurationValue 会往真 settings.json
 *    写迁移标志（污染本机），本用例断言的是"注册这一步就被拒"。 */
describe("ConfigurationRegistry — 键归属仲裁（E6#111d：保护区 / 首撞保留）", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRegistrationLayers();
    clearConfigurationRegistrations();
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  /** 探针 property（只有 default 参与断言，其余字段给足以免类型抱怨） */
  const probe = (value: unknown): { type: "string"; default: unknown; description: string } => ({
    type: "string",
    default: value,
    description: "探针",
  });

  it("N1 — 插件声明宿主键 app.theme ⇒ 该键被拒（不进注册表）＋ 一条 console.error", () => {
    registerConfiguration("probe-plugin", { title: "探针", properties: { "app.theme": probe("Dark") } });
    expect(getPluginConfiguration("probe-plugin")).toBeUndefined();
    expect(getMergedSchema()["app.theme"]).toBeUndefined();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("app.theme");
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("probe-plugin");
  });

  it("N2 — 插件声明 app.schemaVersion（宿主**从不注册**的键）⇒ 只有静态保留面常量拦得住：被拒 ＋ error", () => {
    registerConfiguration("probe-plugin", { title: "探针", properties: { "app.schemaVersion": probe(9) } });
    expect(getPluginConfiguration("probe-plugin")).toBeUndefined();
    // 宿主从不注册它 ⇒「看谁先注册」这条顺序事实在这里够不着——拦住它的是 host-reserved.generated.ts 的静态清单
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("app.schemaVersion");
  });

  it("N3（壳侧半）— 无前缀、非保留键 files.ghost ⇒ 壳**不拒**（黄灯在作者侧 lint，不在运行时）", () => {
    registerConfiguration("probe-plugin", { title: "探针", properties: { "files.ghost": probe("x") } });
    expect(getMergedSchema()["files.ghost"]).toBeDefined();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("N4 — alpha 注册 x.y、beta 注册 x.y ⇒ 首撞保留：值仍属 alpha，beta 该键被拒 ＋ error 点名两侧", () => {
    registerConfiguration("alpha", { title: "A", properties: { "x.y": probe("alpha-value") } });
    registerConfiguration("beta", { title: "B", properties: { "x.y": probe("beta-value") } });

    expect(getMergedSchema()["x.y"].default).toBe("alpha-value"); // 所有权没转移 = 值没被顶掉
    expect(getPluginConfiguration("beta")).toBeUndefined();       // beta 整份只有这一个键 ⇒ 不建空分组
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("alpha");
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("beta");
  });

  it("N4 补 — beta 被拒后 dispose ⇒ **不摘** alpha 的键（disposer 只删本次被接受的键）", () => {
    registerConfiguration("alpha", { title: "A", properties: { "x.y": probe("alpha-value") } });
    const disposeBeta = registerConfiguration("beta", { title: "B", properties: { "x.y": probe("beta-value") } });

    disposeBeta();

    expect(getMergedSchema()["x.y"].default).toBe("alpha-value"); // 仍在
    expect(getPluginConfiguration("alpha")).toBeDefined();
  });

  it("N4 补二 — alpha dispose 后键被腾出 ⇒ beta 可以重新注册同一个键（不残留所有权）", () => {
    const disposeAlpha = registerConfiguration("alpha", { title: "A", properties: { "x.y": probe("alpha-value") } });
    disposeAlpha();
    registerConfiguration("beta", { title: "B", properties: { "x.y": probe("beta-value") } });

    expect(getMergedSchema()["x.y"].default).toBe("beta-value");
    expect(errSpy).not.toHaveBeenCalled(); // 旧主人的所有权随 dispose 一起消失 = 不报假冲突
  });

  it("N5（反向负控）— 同一 pluginId 注册 {a,b} 再注册 {b,c} ⇒ 仍合法 merge 成 {a,b,c}，**零日志输出**", () => {
    registerConfiguration("merge-plugin", { title: "M", properties: { "mp.a": probe("1"), "mp.b": probe("1") } });
    registerConfiguration("merge-plugin", { title: "M", properties: { "mp.b": probe("2"), "mp.c": probe("1") } });

    const props = getPluginConfiguration("merge-plugin")!.properties;
    expect(Object.keys(props).sort()).toEqual(["mp.a", "mp.b", "mp.c"]);
    expect(getMergedSchema()["mp.b"].default).toBe("2"); // 同插件内部 Object.assign 后者胜——合法语义，1.34 未动
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("N6（反向负控）— 宿主身份（app / appearance）注册自己的 app.* ⇒ 全部正常进、零输出", () => {
    registerConfiguration("app", { title: "壳通用", properties: { "app.language": probe("zh") } });
    registerConfiguration("appearance", {
      title: "外观",
      properties: { "app.theme": probe("Dark"), "app.surfaceRadius": probe(8) },
    });

    const merged = getMergedSchema();
    expect(merged["app.language"].default).toBe("zh");
    expect(merged["app.theme"].default).toBe("Dark");
    expect(merged["app.surfaceRadius"].default).toBe(8);
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("N6b — 退役宿主身份 \"update\"（04 设置页通用归类，两键已并入 app 二次注册）现按非宿主 pluginId 对待 ⇒ 注册 app.* 被保护区拒", () => {
    registerConfiguration("update", { title: "更新", properties: { "app.update.mode": probe("stable") } });

    expect(getMergedSchema()["app.update.mode"]).toBeUndefined(); // 被拒
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("app.update.mode");
  });

  it("N8 — 非宿主插件的 configurationDefaults 建议 app.theme ⇒ 不登记 ＋ error（A7 对称面，不是 A3）", () => {
    registerConfigurationDefaults("probe-plugin", { "app.theme": "Light", "editor.fontSize": 12 });

    expect(getConfigurationDefaults()["app.theme"]).toBeUndefined(); // 被拒
    expect(getConfigurationDefaults()["editor.fontSize"]).toBe(12);  // 同一次调用里的合规键照常登记（拒键不拒整份）
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("app.theme");
  });

  it("N9 — 两插件 configurationDefaults 建议同一个插件侧键 ⇒ 黄：warn 出声、**两边都登记**（不拒）", () => {
    registerConfigurationDefaults("plugin-a", { "editor.fontSize": 12 });
    registerConfigurationDefaults("plugin-b", { "editor.fontSize": 14 });

    expect(getConfigurationDefaults()["editor.fontSize"]).toBe(14); // 插入顺序后写者胜出（既有语义）
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
