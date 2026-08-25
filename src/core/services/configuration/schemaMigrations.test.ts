/**
 * schemaMigrations 单元测试——版本编排：过滤/升序/幂等/失败跳过/标志提升。
 * E5.8#85 补课（用户 2026-08-25：「归一化没做好」）：存量 settings.json 旧值迁移到新参考系。
 * 迁移公式本身的单测在 ThemeEngine.test.ts（deriveRadiusAbsoluteMigration）——本文件测编排骨架。
 *
 * 同 ConfigurationService.test：mock StorageService.write + FileService.readFile/exists——
 * setConfigurationValueBatch 持久化不触真实 fs。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerConfiguration,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";

vi.mock("./StorageService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./StorageService")>();
  return {
    ...mod,
    write: vi.fn(async () => {}),
    getFilePath: vi.fn(async () => "C:/linkdesk/settings.json"),
  };
});
vi.mock("../files/FileService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../files/FileService")>();
  return { ...mod, readFile: vi.fn(async () => ""), exists: vi.fn(async () => true) };
});
import {
  getConfigurationValue,
  inspectConfiguration,
  setConfigurationValueBatch,
  clearConfigurationCache,
} from "./ConfigurationService";
import {
  registerConfigMigration,
  clearConfigMigrations,
  getConfigSchemaVersion,
  runPendingConfigMigrations,
  SCHEMA_VERSION_KEY,
} from "./schemaMigrations";
import type { ConfigurationContribution } from "../../registry/ConfigurationRegistry";

// 虚构 fixture（硬约束 21）：radius 键注册同生产 schema（startup.ts 外观组），schemaVersion 保持未注册（设置 UI 不可见）
const RADIUS_CONFIG: ConfigurationContribution = {
  title: "外观",
  properties: {
    "app.surfaceRadius": { type: "number", default: 0, description: "组件圆角" },
    "app.zoneRadiusScale": { type: "number", default: 0, description: "分区圆角" },
    "app.glassOpacity": { type: "number", default: 0.5, description: "玻璃面不透明度" }, // E5.8#86：v3 迁移目标键
  },
};

describe("schemaMigrations — 版本编排（E5.8#85 补课）", () => {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    clearConfigMigrations();
    registerConfiguration("test", RADIUS_CONFIG);
  });

  it("getConfigSchemaVersion——无标志 → SCHEMA_VERSION_INITIAL；写标志 → 读回", async () => {
    expect(getConfigSchemaVersion()).toBe(1);
    await setConfigurationValueBatch([{ key: SCHEMA_VERSION_KEY, value: 3 }]);
    expect(getConfigSchemaVersion()).toBe(3);
  });

  it("有待执行迁移 → 跑 + 单次 batch 落盘 + 标志提升到目标版本；再跑 = 零变更零写（版本已到）", async () => {
    const seen: string[] = [];
    registerConfigMigration({
      version: 2,
      name: "radius-absolute",
      migrate: async ({ setMany }) => {
        seen.push("v2");
        setMany({ "app.surfaceRadius": 7 });
      },
    });

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(seen).toEqual(["v2"]);
    expect(getConfigurationValue("app.surfaceRadius")).toBe(7);
    expect(getConfigSchemaVersion()).toBe(2);

    // 再跑——无待执行迁移，migrate 不调（幂等约定由迁移作者负责，编排只保证不重跑）
    expect(await runPendingConfigMigrations()).toBe(false);
    expect(seen).toEqual(["v2"]);
  });

  it("version 过滤——只跑 version > 当前；升序执行；标志提升到最高成功版本", async () => {
    const order: number[] = [];
    registerConfigMigration({
      version: 3,
      name: "v3",
      migrate: async ({ setMany }) => {
        order.push(3);
        setMany({ "app.glassBlur": 9 });
      },
    });
    registerConfigMigration({
      version: 2,
      name: "v2",
      migrate: async ({ setMany }) => {
        order.push(2);
        setMany({ "app.surfaceRadius": 7 });
      },
    });

    // 从 v1 起跑：v2 → v3 升序
    expect(await runPendingConfigMigrations()).toBe(true);
    expect(order).toEqual([2, 3]);
    expect(getConfigSchemaVersion()).toBe(3);
  });

  it("失败语义（原子）——任一迁移抛错 → 零写零提升（后续也不跑），下次启动全量重试", async () => {
    let v3ran = 0;
    registerConfigMigration({
      version: 3,
      name: "v3",
      migrate: async ({ setMany }) => {
        v3ran += 1;
        setMany({ "app.glassBlur": 9 });
      },
    });
    registerConfigMigration({
      version: 2,
      name: "v2-broken",
      migrate: async () => {
        throw new Error("boom");
      },
    });

    // v2（升序先跑）抛错 → 原子中止：v3 不跑、glassBlur 不写、版本不提升
    expect(await runPendingConfigMigrations()).toBe(false);
    expect(v3ran).toBe(0);
    expect(getConfigurationValue("app.glassBlur")).toBeUndefined();
    expect(getConfigSchemaVersion()).toBe(1);
    // 下次启动仍全量重试（v2 被修正前 v3 永远不跑——不越版本）
  });

  it("零产出（presence 全 skip）→ 迁移通过即写版本标志（全新安装标记已迁，不重复跑）", async () => {
    let ran = 0;
    registerConfigMigration({
      version: 2,
      name: "radius-absolute",
      migrate: async ({ setMany }) => {
        ran += 1;
        setMany({}); // presence 自查全 skip——零产出
      },
    });

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(ran).toBe(1);
    // 成功即标记——settings.json 增一行未注册内部键（设置 UI 不可见），下次启动不再跑
    expect(inspectConfiguration(SCHEMA_VERSION_KEY).userValue).toBe(2);
    expect(await runPendingConfigMigrations()).toBe(false);
    expect(ran).toBe(1);
  });

  it("registerConfigMigration 幂等——同 version 后登记覆盖（Map.set，只跑最后登记）", async () => {
    registerConfigMigration({ version: 2, name: "old", migrate: async () => {} });
    registerConfigMigration({ version: 2, name: "new", migrate: async () => {} });
    expect(await runPendingConfigMigrations()).toBe(true); // 新版 migrate 通过 → 标记
    expect(getConfigSchemaVersion()).toBe(2);
    expect(await runPendingConfigMigrations()).toBe(false); // 无待执行
  });

  it("E5.8#86 v3 glass 迁移——存量 wash 语义 ×0.5 → 绝对透明度 + 版本升 3；未写零变更仍标记（编排骨架，公式单测在 ThemeEngine.test）", async () => {
    // 用户旧 settings.json 显式写过 wash 语义值（v2 时代 schema default 1，用户拖到 1）
    await setConfigurationValueBatch([{ key: "app.glassOpacity", value: 1 }]);
    registerConfigMigration({
      version: 3,
      name: "glass-opacity-wash-to-absolute",
      migrate: async ({ setMany }) => {
        const opacity = inspectConfiguration<number>("app.glassOpacity").userValue;
        if (typeof opacity === "number") setMany({ "app.glassOpacity": opacity * 0.5 });
      },
    });

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(getConfigurationValue("app.glassOpacity")).toBe(0.5); // 旧 1 → 绝对 0.5
    expect(getConfigSchemaVersion()).toBe(3);
    // 再跑零变更——版本已到，迁移不重跑（值不被二次 ×0.5）
    expect(await runPendingConfigMigrations()).toBe(false);
    expect(getConfigurationValue("app.glassOpacity")).toBe(0.5);
  });

  it("E5.8#86 v3 glass 迁移——未写过（presence skip）→ 零变更零写但仍标记已迁（全新安装不重复跑）", async () => {
    let ran = 0;
    registerConfigMigration({
      version: 3,
      name: "glass-opacity-wash-to-absolute",
      migrate: async ({ setMany }) => {
        ran += 1;
        const opacity = inspectConfiguration<number>("app.glassOpacity").userValue;
        if (typeof opacity === "number") setMany({ "app.glassOpacity": opacity * 0.5 });
      },
    });

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(ran).toBe(1);
    expect(inspectConfiguration("app.glassOpacity").userValue).toBeUndefined(); // 零变更——跟随新 schema 默认 0.5
    expect(getConfigSchemaVersion()).toBe(3);
  });
});
