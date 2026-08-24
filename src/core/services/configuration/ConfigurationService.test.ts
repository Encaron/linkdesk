/**
 * ConfigurationService 单元测试——三层合并/get/set/defaults/fallback。
 * #36l3：核心 Registry/Service 层 vitest 覆盖。
 *
 * 注意：setConfigurationValue 需要持久化到文件系统（StorageService/FileService），
 * 纯 vitest 环境无 FS——此处聚焦纯内存逻辑：三层合并、enum 验证、变更订阅。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerConfiguration,
  registerConfigurationDefaults,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";
import { rollback } from "../../registry/registrationTracker";
import {
  getConfigurationValue,
  inspectConfiguration,
  onDidChangeConfiguration,
  setConfigurationValue,
  setConfigurationValueBatch,
  resetConfigurationValueBatch,
  registerConfigApplier,
  clearConfigurationCache,
  diffUserSettings,
} from "./ConfigurationService";
import type { ConfigurationContribution } from "../../registry/ConfigurationRegistry";

const MOCK_CONFIG: ConfigurationContribution = {
  title: "测试",
  properties: {
    "app.theme": {
      type: "string",
      default: "Dark",
      enum: ["Dark", "Light", "Sunset"],
      description: "颜色主题",
    },
    "app.fontSize": {
      type: "number",
      default: 14,
      description: "字体大小",
    },
    "editor.wordWrap": {
      type: "boolean",
      default: false,
      description: "自动换行",
    },
  },
};

function freshConfig() { return JSON.parse(JSON.stringify(MOCK_CONFIG)); }

describe("ConfigurationService — getConfigurationValue 三层合并", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration("test", freshConfig());
  });

  it("getConfigurationValue — 返回 schema default（无 user/workspace 设置时）", () => {
    expect(getConfigurationValue("app.theme")).toBe("Dark");
    expect(getConfigurationValue("app.fontSize")).toBe(14);
    expect(getConfigurationValue("editor.wordWrap")).toBe(false);
  });

  it("getConfigurationValue — 未知 key 返回系统 fallback", () => {
    // 未注册 key → 系统 fallback（undefined / 空串 / false 等）
    expect(getConfigurationValue("unknown.key")).toBeUndefined();
  });

  it("inspectConfiguration — 返回三层来源", () => {
    const result = inspectConfiguration("app.theme");
    expect(result.key).toBe("app.theme");
    expect(result.defaultValue).toBe("Dark");
    expect(result.effectiveValue).toBe("Dark");
    // 未设置 user/workspace
    expect(result.userValue).toBeUndefined();
    expect(result.workspaceValue).toBeUndefined();
  });
});

describe("ConfigurationService — configurationDefaults 弱默认值", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration("test", freshConfig());
  });

  it("getConfigurationValue — configurationDefaults 优先级高于 schema default", () => {
    registerConfigurationDefaults("other-plugin", { "app.theme": "Light" });
    // configurationDefaults > schema default
    expect(getConfigurationValue("app.theme")).toBe("Light");
    rollback("other-plugin");
  });

  it("getConfigurationValue — 注销 configurationDefaults 后退回 schema default", () => {
    registerConfigurationDefaults("other-plugin", { "app.theme": "Light" });
    rollback("other-plugin");
    expect(getConfigurationValue("app.theme")).toBe("Dark");
  });
});

describe("ConfigurationService — enum 验证", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration("test", freshConfig());
  });

  it("setConfigurationValue — enum 内的合法值写入成功", async () => {
    // set 会尝试持久化（失败），但内存状态会更新
    try { await setConfigurationValue("app.theme", "Sunset"); } catch { /* persist failed — expected in test */ }
    // 值已在内存中更新
    expect(getConfigurationValue("app.theme")).toBe("Sunset");
  });

  it("setConfigurationValue — enum 外的非法值被拒绝", async () => {
    try { await setConfigurationValue("app.theme", "invalid_theme"); } catch { /* persist failed */ }
    // 非法值不应写入内存——仍然是 default
    expect(getConfigurationValue("app.theme")).toBe("Dark");
  });
});

describe("ConfigurationService — onDidChangeConfiguration 订阅", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration("test", freshConfig());
  });

  it("onDidChangeConfiguration — 返回 unsubscribe 函数", () => {
    let count = 0;
    const unsub = onDidChangeConfiguration(() => { count++; });
    expect(typeof unsub).toBe("function");
    unsub();
    expect(typeof unsub).toBe("function"); // 取消订阅不抛异常
  });
});

describe("ConfigurationService — 批量写/复位（E5.8#59 播种广播收敛）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration("test", freshConfig());
  });

  it("setConfigurationValueBatch — 全部 key 写入 + 逐 key 监听器 + 单次 applier（末 key 代表性）", async () => {
    const listenerKeys: string[] = [];
    const unsub = onDidChangeConfiguration((key) => { listenerKeys.push(key); });
    const applierKeys: string[] = [];
    registerConfigApplier((key) => { applierKeys.push(key); });
    await setConfigurationValueBatch([
      { key: "app.theme", value: "Sunset" },
      { key: "app.fontSize", value: 16 },
    ], "user");
    expect(getConfigurationValue("app.theme")).toBe("Sunset");
    expect(getConfigurationValue("app.fontSize")).toBe(16);
    expect(listenerKeys).toEqual(["app.theme", "app.fontSize"]); // 逐 key 通知
    expect(applierKeys).toEqual(["app.fontSize"]); // 单次 applier——6 连写收敛为 1 次（原 6 次全量重合并）
    unsub();
  });

  it("setConfigurationValueBatch — 非法 enum key 跳过，合法 key 仍写入", async () => {
    await setConfigurationValueBatch([
      { key: "app.theme", value: "invalid_theme" },
      { key: "app.fontSize", value: 18 },
    ], "user");
    expect(getConfigurationValue("app.theme")).toBe("Dark"); // 非法跳过——仍是 default
    expect(getConfigurationValue("app.fontSize")).toBe(18);
  });

  it("setConfigurationValueBatch — 全非法 → 零写入零 applier", async () => {
    const applierKeys: string[] = [];
    registerConfigApplier((key) => { applierKeys.push(key); });
    await setConfigurationValueBatch([{ key: "app.theme", value: "bad" }], "user");
    expect(applierKeys).toEqual([]);
    expect(getConfigurationValue("app.theme")).toBe("Dark");
  });

  it("resetConfigurationValueBatch — 删除被写 key + 单次 applier；未写 key 跳过", async () => {
    try { await setConfigurationValue("app.theme", "Sunset", "user"); } catch { /* persist ignored */ }
    const applierKeys: string[] = [];
    registerConfigApplier((key) => { applierKeys.push(key); });
    await resetConfigurationValueBatch(["app.theme", "app.fontSize"], "user");
    expect(getConfigurationValue("app.theme")).toBe("Dark"); // 回 default
    expect(applierKeys).toEqual(["app.theme"]); // 仅被写的 key 触发单次 applier
  });

  it("resetConfigurationValueBatch — 无被写 key → 零广播", async () => {
    const applierKeys: string[] = [];
    registerConfigApplier((key) => { applierKeys.push(key); });
    await resetConfigurationValueBatch(["app.theme"], "user");
    expect(applierKeys).toEqual([]);
  });
});

describe("ConfigurationService — diffUserSettings（E5.8#0d.5 settings.json 重读 diff）", () => {
  it("无变更 → 空数组", () => {
    const current = { "app.theme": "Dark", "app.language": "zh" };
    expect(diffUserSettings(current, { ...current })).toEqual([]);
  });

  it("新增 key → 报告变更", () => {
    expect(diffUserSettings({}, { "app.theme": "Light" })).toEqual([
      { key: "app.theme", value: "Light" },
    ]);
  });

  it("修改值 → 报告变更", () => {
    expect(diffUserSettings({ "app.theme": "Dark" }, { "app.theme": "Light" })).toEqual([
      { key: "app.theme", value: "Light" },
    ]);
  });

  it("删除 key → 报告 value=undefined", () => {
    expect(
      diffUserSettings({ "app.theme": "Dark", "app.language": "zh" }, { "app.theme": "Dark" }),
    ).toEqual([{ key: "app.language", value: undefined }]);
  });

  it("混合变更 → 全部报告（顺序无关）", () => {
    const result = diffUserSettings({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining([
      { key: "a", value: undefined },
      { key: "b", value: 3 },
      { key: "c", value: 4 },
    ]));
  });

  it("嵌套对象同内容 → 无变更（E5.8 bug 修复——浅比较曾恒判变更 → 回写无限循环）", () => {
    expect(diffUserSettings({ app: { x: 1 } }, { app: { x: 1 } })).toEqual([]);
  });

  it("嵌套对象真变更 → 报告变更（保守上报不遗漏意图保留）", () => {
    expect(diffUserSettings({ app: { x: 1 } }, { app: { x: 2 } })).toEqual([
      { key: "app", value: { x: 2 } },
    ]);
  });

  it("对象值 key（files.exclude 同款）同内容 → 无变更——防回写死循环", () => {
    const current = {
      "app.theme": "Light",
      "files.exclude": { "**/node_modules": true, "**/.git": true },
    };
    const next = JSON.parse(JSON.stringify(current)); // 模拟 reloadUserSettings 的 file→parse 新引用
    expect(diffUserSettings(current, next)).toEqual([]);
  });
});
