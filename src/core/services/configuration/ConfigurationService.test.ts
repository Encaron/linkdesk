/**
 * ConfigurationService 单元测试——三层合并/get/set/defaults/fallback。
 * #36l3：核心 Registry/Service 层 vitest 覆盖。
 *
 * 注意：setConfigurationValue 需要持久化到文件系统（StorageService/FileService），
 * 纯 vitest 环境无 FS——此处聚焦纯内存逻辑：三层合并、enum 验证、变更订阅。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerConfiguration,
  registerConfigurationDefaults,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";

// E5.8#61 审计#6：持久化串行性测试——mock write 记录起止序列，验证并发 setConfigurationValue 不交错写文件
const persistProbe = vi.hoisted(() => ({ sequence: [] as string[], failOn: -1 as number }));
// 审计#6 reload 防回滚测试：mock FileService.readFile 供 reloadUserSettings 读文件内容
const fileProbe = vi.hoisted(() => ({ readFile: vi.fn(async () => ""), exists: vi.fn(async () => true) }));
vi.mock("./StorageService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./StorageService")>();
  return {
    ...mod,
    write: vi.fn(async (key: string) => {
      persistProbe.failOn -= 1;
      if (persistProbe.failOn === 0) throw new Error("write failed");
      persistProbe.sequence.push(`${key}:start`);
      await new Promise((r) => setTimeout(r, 5));
      persistProbe.sequence.push(`${key}:end`);
    }),
    // reloadUserSettings 走 getFilePath → readFile——非 Electron 测试环境默认无路径，mock 出可读路径
    getFilePath: vi.fn(async () => "C:/linkdesk/settings.json"),
  };
});
vi.mock("../files/FileService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../files/FileService")>();
  return { ...mod, readFile: fileProbe.readFile, exists: fileProbe.exists };
});
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
  reloadUserSettings,
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

/**
 * E6#111d（1.34）：MOCK_CONFIG 用的是**宿主键**（`app.*`）——注册身份必须是宿主身份之一
 * （`app`/`appearance`/`update`），否则归属仲裁的**保护区**会拒掉这些键（该判据对所有非宿主身份生效）。
 * 生产里 `app.theme` 正是 `appearance` 注册的（src/App/config/appearance.ts），故取 "appearance"。
 */
const HOST_CFG_ID = "appearance";

describe("ConfigurationService — getConfigurationValue 三层合并", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration(HOST_CFG_ID, freshConfig());
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
    registerConfiguration(HOST_CFG_ID, freshConfig());
  });

  it("getConfigurationValue — configurationDefaults 优先级高于 schema default", () => {
    // E6#111d：原先这个用例用宿主键 app.theme 演示——1.34 起**非宿主身份对宿主键的弱默认值被保护区拒绝**
    // （判据见 ConfigurationRegistry 头部），故改用一条普通插件键演示同一条优先级（default false → true）。
    registerConfigurationDefaults("other-plugin", { "editor.wordWrap": true });
    // configurationDefaults > schema default
    expect(getConfigurationValue("editor.wordWrap")).toBe(true);
    rollback("other-plugin");
  });

  it("getConfigurationValue — 注销 configurationDefaults 后退回 schema default", () => {
    registerConfigurationDefaults("other-plugin", { "editor.wordWrap": true });
    rollback("other-plugin");
    expect(getConfigurationValue("editor.wordWrap")).toBe(false);
  });
});

describe("ConfigurationService — enum 验证", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration(HOST_CFG_ID, freshConfig());
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
    registerConfiguration(HOST_CFG_ID, freshConfig());
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
    registerConfiguration(HOST_CFG_ID, freshConfig());
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

describe("ConfigurationService — 持久化串行队列 + 尾沿去抖（E5.8#61 审计#6 + E5.8#89 E3）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration(HOST_CFG_ID, freshConfig());
    persistProbe.sequence.length = 0;
    persistProbe.failOn = -1;
  });

  it("并发 set → 尾沿去抖合并为单次 write（E5.8#89 E3 拖拽连发收敛）", async () => {
    await Promise.all([
      setConfigurationValue("app.theme", "Light", "user"),
      setConfigurationValue("app.fontSize", 16, "user"),
    ]);
    // 80ms 窗口内两次 set 合并为一次持久化——拖拽逐 tick 写不再逐次落盘；
    // 串行队列仍保留：fire 后排队写，防与 reload/自愈写并发交错（审计#6）
    expect(persistProbe.sequence).toEqual(["settings:start", "settings:end"]);
  });

  it("合并写失败 → 链不断，后续写仍执行", async () => {
    persistProbe.failOn = 1; // 合并后唯一的 write 抛错（写失败经 waiters 传播给 await set 的调用方）
    await Promise.allSettled([
      setConfigurationValue("app.theme", "Light", "user"),
      setConfigurationValue("app.fontSize", 16, "user"),
    ]);
    // 两次 set 合并为单次写、该次写抛错——write 在 push start 前 throw → 序列空（未合并则会 [start,end]）
    expect(persistProbe.sequence).toEqual([]);
    // 链不断——紧接着的一次 set 正常写（task.catch 吞错防断链）
    await setConfigurationValue("editor.wordWrap", true, "user");
    expect(persistProbe.sequence).toEqual(["settings:start", "settings:end"]);
  });
});

describe("ConfigurationService — reload 防陈旧文件回滚（E5.8#61 审计#6）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration(HOST_CFG_ID, freshConfig());
    // 文件内容 = 死 id——陈旧文件（启动期清扫前磁盘仍是幽灵值）
    fileProbe.readFile.mockResolvedValue(JSON.stringify({ "app.theme": "ghost-theme-404" }));
    persistProbe.sequence.length = 0;
    persistProbe.failOn = -1;
  });

  it("持久化队列未排空 → reload 跳过（不把内存清扫值回滚成陈旧文件）", async () => {
    // 未 await 的 set——队列排空前的窗口（write 5ms 延迟），内存 app.theme=Sunset
    const pending = setConfigurationValue("app.theme", "Sunset", "user");
    // 队列未排空时 reload——应跳过：陈旧文件 ghost 不得覆盖内存 Sunset（否则清扫静默失效）
    await reloadUserSettings();
    expect(inspectConfiguration("app.theme").userValue).toBe("Sunset");
    await pending;
  });

  it("持久化队列排空 → reload 正常应用文件变更（外部编辑生效语义）", async () => {
    await setConfigurationValue("app.theme", "Sunset", "user");
    await reloadUserSettings();
    // 队列排空后 reload 读陈旧文件 → 应用 ghost（文件是外部编辑真相源——只在无自写冲突时生效）
    expect(inspectConfiguration("app.theme").userValue).toBe("ghost-theme-404");
  });
});
