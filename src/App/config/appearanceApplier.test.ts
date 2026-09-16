/**
 * appearanceApplier 配置迁移单测——E6#111f／1.36 外观族 id 归属改名「版本 6」那条腿
 * （[1.35 §14.2] ①：把盘上旧值**改写落盘**）。负控 13（跑两遍 ⇒ 第二遍零写）· 负控 14（键不存在 ⇒ 不产出该键）。
 *
 * 本文件测的是**真迁移**（import 本模块即登记 v2–v6，不另造 fixture 迁移）——只把 schema 版本种子设成 5，
 * 让编排里**只有 v6** 待执行（其余待执行迁移与本节无关）。因此**不能** `clearConfigMigrations()`（会连真登记一起清掉）。
 *
 * 🔴 与 ThemeEngine/migration.test.ts 的分工：那里测**归一函数**（解析器门控的两问判据），这里测**编排与落盘**
 * （presence 门控 / 门禁放行 / 幂等 / 四键处置）——两条腿各测各的，别互相重复。
 *
 * 同 schemaMigrations.test：mock StorageService.write + FileService.readFile/exists——持久化不触真实 fs。
 * 读盘侧断言取 `write("settings", userCache)` 的**最后一次载荷**（全量用户缓存），故用「键子集快照比对」而不是
 * 「载荷全等」——版本标志本身每次都会写（那是编排的记账，不是迁移的写出）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../core/services/configuration/StorageService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../core/services/configuration/StorageService")>();
  return { ...mod, write: vi.fn(async () => {}), getFilePath: vi.fn(async () => "C:/linkdesk/settings.json") };
});
vi.mock("../../core/services/files/FileService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../core/services/files/FileService")>();
  return { ...mod, readFile: vi.fn(async () => ""), exists: vi.fn(async () => true) };
});

import {
  registerConfiguration,
  clearConfigurationRegistrations,
} from "../../core/registry/ConfigurationRegistry";
import {
  inspectConfiguration,
  setConfigurationValueBatch,
  clearConfigurationCache,
} from "../../core/services/configuration/ConfigurationService";
import {
  runPendingConfigMigrations,
  getConfigSchemaVersion,
  SCHEMA_VERSION_KEY,
} from "../../core/services/configuration/schemaMigrations";
import { write } from "../../core/services/configuration/StorageService";
import { ThemeRegistry } from "../../core/registry/appearance/ThemeRegistry";
import type { ConfigurationContribution } from "../../core/registry/ConfigurationRegistry";
import "./appearanceApplier"; // ← 副作用导入：登记 v2–v6（本节的被测对象 v6 在内）

/* ── fixture：照生产 schema 注册（硬约束 21）——键与默认值抄 src/App/config/appearance.ts
 *    （外观组，宿主配置 id "appearance"）；`enum` 同时列旧名与新名：改名期两边都得写进盘，
 *    写死在注册表的枚举若只留一边，setConfigurationValueBatch 的 enum 校验会把迁移要写的值挡在门外。 ── */
const APPEARANCE_TEST_CONFIG: ConfigurationContribution = {
  title: "外观",
  properties: {
    "app.theme": {
      type: "string",
      default: "dark",
      // 显示名也在枚举里：它是**值**不是 id（判据⑧），legacy flat 写入路径今天仍走 app.theme（决策 F 迁移期退路）
      enum: ["dark", "light", "薄荷苏打 Mint Soda", "mint-soda", "pill-bubble", "panorama", "theme-mint-soda.mint-soda", "theme-pill.pill-bubble", "theme-panorama.panorama"],
      description: "主题配方",
    },
    "app.themeColor": {
      type: "string",
      default: "",
      enum: ["", "mint-soda", "theme-mint-soda.mint-soda"],
      description: "配色变体（双语义：配色 id / 配方 id）",
    },
    "app.mixFont": {
      type: "string",
      default: "followTheme",
      enum: ["followTheme", "pill-bubble", "theme-pill.pill-bubble"],
      description: "字体域来源",
    },
    "app.mixBackground": {
      type: "string",
      default: "followTheme",
      enum: ["followTheme", "panorama", "theme-panorama.panorama"],
      description: "背景域来源",
    },
    "app.iconTheme": {
      type: "string",
      default: "default",
      enum: ["default", "ld-iconset-pastel"],
      description: "图标主题（本轮留位——不改名）",
    },
  },
};

const HOST_CFG_ID = "appearance";

/** 迁移动的四键 + 留位的第五键（负控 14 的「不产出」按这组断言） */
const MIGRATED_KEYS = ["app.theme", "app.themeColor", "app.mixFont", "app.mixBackground"];
const ALL_KEYS = [...MIGRATED_KEYS, "app.iconTheme"];

const writeMock = vi.mocked(write);

/** 最后一次 settings 落盘载荷（全量用户缓存） */
function lastPersisted(): Record<string, unknown> {
  const calls = writeMock.mock.calls.filter(([key]) => key === "settings");
  return (calls[calls.length - 1]?.[1] ?? {}) as Record<string, unknown>;
}

/** 载荷里的外观键子集——比对「迁移有没有写出」，不含 app.schemaVersion（编排的记账每跑必写） */
function appearanceSnapshot(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALL_KEYS) if (key in payload) out[key] = payload[key];
  return out;
}

function recipeStub(id: string, name: string, colorwayIds: string[]) {
  return {
    id,
    name,
    type: "dark" as const,
    colorways: colorwayIds.map((cwId) => ({ id: cwId, name: cwId, colors: { bg: "#000" } })),
  };
}

/** 今天的盘面：官方 9 仓**还没改名**（25 条改名归 1.42–1.48）⇒ 旧名是真配方 */
function registerPreRenameRecipes(disposers: Array<() => void>) {
  disposers.push(ThemeRegistry.registerRecipe(recipeStub("mint-soda", "薄荷苏打", ["mint-soda"]), "theme-mint-soda"));
  disposers.push(ThemeRegistry.registerRecipe(recipeStub("pill-bubble", "气泡", ["pill-bubble"]), "theme-pill"));
  disposers.push(ThemeRegistry.registerRecipe(recipeStub("panorama", "全景", ["panorama"]), "theme-panorama"));
}

/** 改名轮落地后的盘面：新名是真配方，旧名无人认领 */
function registerPostRenameRecipes(disposers: Array<() => void>) {
  disposers.push(ThemeRegistry.registerRecipe(recipeStub("theme-mint-soda.mint-soda", "薄荷苏打", ["theme-mint-soda.mint-soda"]), "theme-mint-soda"));
  disposers.push(ThemeRegistry.registerRecipe(recipeStub("theme-pill.pill-bubble", "气泡", ["theme-pill.pill-bubble"]), "theme-pill"));
  disposers.push(ThemeRegistry.registerRecipe(recipeStub("theme-panorama.panorama", "全景", ["theme-panorama.panorama"]), "theme-panorama"));
}

const OLD_PLATE: Record<string, unknown> = {
  "app.theme": "mint-soda",
  "app.themeColor": "mint-soda",
  "app.mixFont": "pill-bubble",
  "app.mixBackground": "panorama",
  "app.iconTheme": "ld-iconset-pastel",
};

async function seed(values: Record<string, unknown>) {
  await setConfigurationValueBatch(Object.entries(values).map(([key, value]) => ({ key, value })));
}

/** schema 版本种子设为 5 ⇒ 编排里只有 v6 待执行（其余真迁移与本节点无关） */
async function seedSchemaVersionAt5() {
  await setConfigurationValueBatch([{ key: SCHEMA_VERSION_KEY, value: 5 }]);
}

describe("appearanceApplier — E6#111f 版本 6 迁移（外观族 id 归属改名）", () => {
  const disposers: Array<() => void> = [];
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration(HOST_CFG_ID, APPEARANCE_TEST_CONFIG);
    writeMock.mockClear();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    for (const r of ThemeRegistry.getRecipes()) ThemeRegistry.unregisterRecipe(r.id);
    consoleError.mockRestore();
  });

  it("负控 13 前置（今天的盘面）——改名未落地：门禁放行、迁移执行，四键**零写**", async () => {
    registerPreRenameRecipes(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt5();

    const before = appearanceSnapshot(lastPersisted());
    expect(before["app.theme"]).toBe("mint-soda"); // 种子真进了盘（否则本节空转）

    expect(await runPendingConfigMigrations()).toBe(true);
    // 迁移**真跑过**——版本从 5 抬到 6（不是被门禁跳过 ⇒ 零写不是因为没执行）
    expect(getConfigSchemaVersion()).toBe(6);
    // 零写：解析器两问判「新名解析不出 ⇒ 恒等」⇒ 盘上旧值原样（此刻硬映会当场弄坏正在用的主题）
    expect(appearanceSnapshot(lastPersisted())).toEqual(before);
    expect(inspectConfiguration("app.theme").userValue).toBe("mint-soda");
    expect(inspectConfiguration("app.themeColor").userValue).toBe("mint-soda");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("正控（与上条配对）——改名落地后同一盘面：四键改写落盘（证明本夹具**判得出写**）", async () => {
    registerPostRenameRecipes(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt5();

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(getConfigSchemaVersion()).toBe(6);
    expect(inspectConfiguration("app.theme").userValue).toBe("theme-mint-soda.mint-soda"); // legacy 名 → 归属名（经 normalizeThemeValue 串联）
    expect(inspectConfiguration("app.themeColor").userValue).toBe("theme-mint-soda.mint-soda"); // 双语义：先配色表后配方表
    expect(inspectConfiguration("app.mixFont").userValue).toBe("theme-pill.pill-bubble");
    expect(inspectConfiguration("app.mixBackground").userValue).toBe("theme-panorama.panorama");
    // 第五键留位：`app.iconTheme` 本轮不改名 ⇒ 一个字节都不碰
    expect(inspectConfiguration("app.iconTheme").userValue).toBe("ld-iconset-pastel");
    expect(appearanceSnapshot(lastPersisted())).toEqual({
      "app.theme": "theme-mint-soda.mint-soda",
      "app.themeColor": "theme-mint-soda.mint-soda",
      "app.mixFont": "theme-pill.pill-bubble",
      "app.mixBackground": "theme-panorama.panorama",
      "app.iconTheme": "ld-iconset-pastel",
    });
    // 不弹窗不重置——静默改写（迁移不打日志；未走 resetConfigurationValue ⇒ userValue 仍在）
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("负控 13 主体——跑两遍：第二遍**零写**（命中即恒等；盘上已是新名）", async () => {
    registerPostRenameRecipes(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt5();
    expect(await runPendingConfigMigrations()).toBe(true);

    // 第二遍：把版本门禁退回 5（模拟下次启动 / 或将来 1.47 补新版本号重跑同一张表）⇒ v6 会**再执行一次**
    await seedSchemaVersionAt5();
    const before = appearanceSnapshot(lastPersisted());
    expect(await runPendingConfigMigrations()).toBe(true);
    expect(getConfigSchemaVersion()).toBe(6);
    expect(appearanceSnapshot(lastPersisted())).toEqual(before); // 新名不在表里 ⇒ 归一恒等 ⇒ 零写
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("负控 14——键不存在（全新安装）：不产出该键（零变更零写出）", async () => {
    registerPostRenameRecipes(disposers); // 解析器说「该映」也不动——presence 门控在前
    await seedSchemaVersionAt5();

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(getConfigSchemaVersion()).toBe(6); // 零产出仍标记已迁（编排既有语义：不每次启动重跑）
    for (const key of MIGRATED_KEYS) {
      expect(inspectConfiguration(key).userValue).toBeUndefined();
    }
    expect(appearanceSnapshot(lastPersisted())).toEqual({}); // 盘上不出现这四键
  });

  it("哨兵与显示名原样放行——followTheme / flat 显示名不进改写（哨兵不是 id）", async () => {
    registerPostRenameRecipes(disposers);
    await seed({ "app.theme": "薄荷苏打 Mint Soda", "app.mixFont": "followTheme", "app.mixBackground": "followTheme" });
    await seedSchemaVersionAt5();

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(getConfigSchemaVersion()).toBe(6);
    expect(inspectConfiguration("app.theme").userValue).toBe("薄荷苏打 Mint Soda"); // flat 显示名不在两张表里 ⇒ 恒等
    expect(inspectConfiguration("app.mixFont").userValue).toBe("followTheme");
    expect(inspectConfiguration("app.mixBackground").userValue).toBe("followTheme");
  });
});
