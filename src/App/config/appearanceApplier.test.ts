/**
 * appearanceApplier 配置迁移单测——E6#111f／1.36 外观族 id 归属改名「版本 6」那条腿
 * （[1.35 §14.2] ①：把盘上旧值**改写落盘**）。负控 13（跑两遍 ⇒ 第二遍零写）· 负控 14（键不存在 ⇒ 不产出该键）。
 *
 * 本文件测的是**真迁移**（import 本模块即登记 v2–v6，不另造 fixture 迁移）——只把 schema 版本种子设成 5，
 * 让编排里**只有 v6** 待执行（其余待执行迁移与本节无关）。因此**不能** `clearConfigMigrations()`（会连真登记一起清掉）。
 *
 * ⚠️ E6#111m／1.41 新增 v7（改名迁移）后，本节必须把 v7 **临时摘掉**（见 `withoutV7()`）：
 *   本节的判据是「v6 做了什么」，而 v7 会顺手把版本从 6 再抬到 7
 *   ⇒ 断言 `getConfigSchemaVersion() === 6` 会红（那不是 v6 出错，是**多跑了一步不属于本节的迁移**）。
 *   摘掉 = 本节只留 v2–v6，与 1.36 写下这些用例时的世界一致；跑完原样装回（`afterEach`）。
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
  inspectConfigRepairs,
  SCHEMA_VERSION_KEY,
} from "../../core/services/configuration/schemaMigrations";
import { write } from "../../core/services/configuration/StorageService";
import { ThemeRegistry } from "../../core/registry/appearance/ThemeRegistry";
import { IconRegistry } from "../../core/registry/appearance/IconRegistry";
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
      // E6#111n／1.47：图标主题 id 本轮**也改名了**（`theme-iconset-pastel.ld-iconset-pastel`）
      //   ⇒ 枚举两代都列（改名前/后两种盘面都要能种进来，否则 enum 校验会把迁移要写的值挡在门外）
      enum: ["default", "ld-iconset-pastel", "theme-iconset-pastel.ld-iconset-pastel"],
      description: "图标主题",
    },
  },
};

const HOST_CFG_ID = "appearance";

/** 迁移改写的五键（负控 14 的「不产出」按这组断言）
 *  ⚠️ 1.47 起 `app.iconTheme` 从「留位」转正：图标主题 id 本轮随主题族一起改名（[00 §〇c.1] 撤 [1.35 §12.3]）。 */
const MIGRATED_KEYS = ["app.theme", "app.themeColor", "app.mixFont", "app.mixBackground", "app.iconTheme"];
const ALL_KEYS = [...MIGRATED_KEYS];

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

/** 图标主题的贡献桩——`IconRegistry` 是**独立注册本**（与 ThemeRegistry 互不相干） */
function registerIconTheme(id: string, disposers: Array<() => void>): void {
  disposers.push(IconRegistry.register({ id, label: "粉彩图标集", path: "icons/pastel.json" }, "theme-iconset-pastel"));
}

/** 改名前的盘面：旧图标主题 id 是真注册名 */
function registerPreRenameIconTheme(disposers: Array<() => void>): void {
  registerIconTheme("ld-iconset-pastel", disposers);
}

/** 改名轮落地后的盘面：新名是真注册名，旧名无人认领 */
function registerPostRenameIconTheme(disposers: Array<() => void>): void {
  registerIconTheme("theme-iconset-pastel.ld-iconset-pastel", disposers);
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
  await seedSchemaVersionAt(5);
}

/** 种子版本号（v12 用例种 11 ⇒ 编排里只有 v12 待执行）——1.47 参数化 */
async function seedSchemaVersionAt(version: number) {
  await setConfigurationValueBatch([{ key: SCHEMA_VERSION_KEY, value: version }]);
}

/** 五键当前 `userValue` —— v12 用例的读数口（一处收口，不逐键抄 v6 正控那五行） */
function fiveKeyPlate(): Record<string, unknown> {
  return Object.fromEntries(MIGRATED_KEYS.map((k) => [k, inspectConfiguration(k).userValue]));
}

describe("appearanceApplier — E6#111f 版本 6 迁移（外观族 id 归属改名）", () => {
  const disposers: Array<() => void> = [];
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    // 🔴 E6#111m／1.41：本节的判据是「**v6 做了什么**」，v7（改名迁移）会顺手把版本再抬一格
    //    ⇒ 断言里凡是 `getConfigSchemaVersion()` 都按「**至少到 6**」判（见 `expectV6Landed`），
    //      版本具体停在 6 还是 7 是**编排的记账**，不是 v6 的产出。详见文件头注释。
    registerConfiguration(HOST_CFG_ID, APPEARANCE_TEST_CONFIG);
    writeMock.mockClear();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    for (const r of ThemeRegistry.getRecipes()) ThemeRegistry.unregisterRecipe(r.id);
    consoleError.mockRestore();
  });

  /** v6 确实落地了——版本**至少**到 6（1.41 起 v7 会再抬一格，不影响「v6 跑过了」这个判断） */
  function expectV6Landed(): void {
    expect(getConfigSchemaVersion()).toBeGreaterThanOrEqual(6);
  }

  it("负控 13 前置（今天的盘面）——改名未落地：门禁放行、迁移执行，四键**零写**", async () => {
    registerPreRenameRecipes(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt5();

    const before = appearanceSnapshot(lastPersisted());
    expect(before["app.theme"]).toBe("mint-soda"); // 种子真进了盘（否则本节空转）

    expect(await runPendingConfigMigrations()).toBe(true);
    // 迁移**真跑过**——版本从 5 抬到 6（不是被门禁跳过 ⇒ 零写不是因为没执行）
    expectV6Landed();
    // 零写：解析器两问判「新名解析不出 ⇒ 恒等」⇒ 盘上旧值原样（此刻硬映会当场弄坏正在用的主题）
    expect(appearanceSnapshot(lastPersisted())).toEqual(before);
    expect(inspectConfiguration("app.theme").userValue).toBe("mint-soda");
    expect(inspectConfiguration("app.themeColor").userValue).toBe("mint-soda");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("正控（与上条配对）——改名落地后同一盘面：五键改写落盘（证明本夹具**判得出写**）", async () => {
    registerPostRenameRecipes(disposers);
    registerPostRenameIconTheme(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt5();

    expect(await runPendingConfigMigrations()).toBe(true);
    expectV6Landed();
    expect(inspectConfiguration("app.theme").userValue).toBe("theme-mint-soda.mint-soda"); // legacy 名 → 归属名（经 normalizeThemeValue 串联）
    expect(inspectConfiguration("app.themeColor").userValue).toBe("theme-mint-soda.mint-soda"); // 双语义：先配色表后配方表
    expect(inspectConfiguration("app.mixFont").userValue).toBe("theme-pill.pill-bubble");
    expect(inspectConfiguration("app.mixBackground").userValue).toBe("theme-panorama.panorama");
    // 第五键（1.47 转正）：图标主题走**自己那张表**（单语义，不串配方表）
    expect(inspectConfiguration("app.iconTheme").userValue).toBe("theme-iconset-pastel.ld-iconset-pastel");
    expect(appearanceSnapshot(lastPersisted())).toEqual({
      "app.theme": "theme-mint-soda.mint-soda",
      "app.themeColor": "theme-mint-soda.mint-soda",
      "app.mixFont": "theme-pill.pill-bubble",
      "app.mixBackground": "theme-panorama.panorama",
      "app.iconTheme": "theme-iconset-pastel.ld-iconset-pastel",
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
    expectV6Landed();
    expect(appearanceSnapshot(lastPersisted())).toEqual(before); // 新名不在表里 ⇒ 归一恒等 ⇒ 零写
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("负控 14——键不存在（全新安装）：不产出该键（零变更零写出）", async () => {
    registerPostRenameRecipes(disposers); // 解析器说「该映」也不动——presence 门控在前
    await seedSchemaVersionAt5();

    expect(await runPendingConfigMigrations()).toBe(true);
    expectV6Landed(); // 零产出仍标记已迁（编排既有语义：不每次启动重跑）
    for (const key of MIGRATED_KEYS) {
      expect(inspectConfiguration(key).userValue).toBeUndefined();
    }
    expect(appearanceSnapshot(lastPersisted())).toEqual({}); // 盘上不出现这四键
  });

  /* ── 版本 12（E6#111n／1.47）：主题族 id 真的落地了 —— v6 早烧掉，补漏只能靠新版本号 ── */
  it("v12 正控——种 11：五键改写（含 `app.iconTheme`，v6 那次它还叫旧名、没得改）", async () => {
    registerPostRenameRecipes(disposers);
    registerPostRenameIconTheme(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt(11); // 1.46 交棒时的真机读数：v11 之后盘上仍是旧名

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(getConfigSchemaVersion()).toBeGreaterThanOrEqual(12);
    expect(fiveKeyPlate()).toEqual({
      "app.theme": "theme-mint-soda.mint-soda",
      "app.themeColor": "theme-mint-soda.mint-soda",
      "app.mixFont": "theme-pill.pill-bubble",
      "app.mixBackground": "theme-panorama.panorama",
      "app.iconTheme": "theme-iconset-pastel.ld-iconset-pastel",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("🔴 v12 恒真负控——图标主题新名**未**注册（插件还是旧的）：那一键零写，其余四键照写", async () => {
    // 只把图标主题留在旧盘面（新名解析不出 ⇒ 单语义那张表判「恒等」）
    registerPostRenameRecipes(disposers);
    registerPreRenameIconTheme(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt(11);

    expect(await runPendingConfigMigrations()).toBe(true);
    const plate = fiveKeyPlate();
    expect(plate["app.theme"]).toBe("theme-mint-soda.mint-soda"); // 四键确实写了
    // ⇒ 改写**不是恒真**：同一轮里图标那一键被按住了（否则「迁移跑过」这个读数就说明不了任何事）
    expect(plate["app.iconTheme"]).toBe("ld-iconset-pastel");
  });

  it("图标主题哨兵 `default` 原样放行——它不是 id（两侧都不进表）", async () => {
    registerPostRenameRecipes(disposers);
    registerPostRenameIconTheme(disposers);
    await seed({ "app.iconTheme": "default" });
    await seedSchemaVersionAt(11);

    expect(await runPendingConfigMigrations()).toBe(true);
    expect(inspectConfiguration("app.iconTheme").userValue).toBe("default");
  });

  it("哨兵与显示名原样放行——followTheme / flat 显示名不进改写（哨兵不是 id）", async () => {
    registerPostRenameRecipes(disposers);
    await seed({ "app.theme": "薄荷苏打 Mint Soda", "app.mixFont": "followTheme", "app.mixBackground": "followTheme" });
    await seedSchemaVersionAt5();

    expect(await runPendingConfigMigrations()).toBe(true);
    expectV6Landed();
    expect(inspectConfiguration("app.theme").userValue).toBe("薄荷苏打 Mint Soda"); // flat 显示名不在两张表里 ⇒ 恒等
    expect(inspectConfiguration("app.mixFont").userValue).toBe("followTheme");
    expect(inspectConfiguration("app.mixBackground").userValue).toBe("followTheme");
  });

  /* ── 🔴 E6#111k／1.49：外观 id 的**补跑通道**（治 v12「空烧」）──────────────────────────────
   * 病：先更壳、后更插件的机器上，v6/v12 在它唯一那次运行里「解析器两问」不成立 ⇒ 零产出，
   *   而版本记账**含零产出也照样提升** ⇒ `pending = version > current` 永假 ⇒ 五键永不搬。
   * 🔴 本节的种子是 **v12 已过**（不是 v11）——那正是空烧之后的盘面。 */

  it("🔴 空烧正控——版本已烧到 12 的机器：**编排一步不跑**，补跑通道照样把五键搬过去", async () => {
    registerPostRenameRecipes(disposers);
    registerPostRenameIconTheme(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt(12); // ← 空烧现场：v6/v12 永不重跑

    // 返回 false = 「无待执行迁移」（步骤 ① 一步没跑）——⚠️ 不等于「什么都没做」（见总入口注释）
    expect(await runPendingConfigMigrations()).toBe(false);
    // 🔴 五键照样搬到新名：这就是补跑通道的全部意义（改前这里是原样旧值——交接段 ⑷ 第 4 条的实测形态）
    expect(fiveKeyPlate()).toEqual({
      "app.theme": "theme-mint-soda.mint-soda",
      "app.themeColor": "theme-mint-soda.mint-soda",
      "app.mixFont": "theme-pill.pill-bubble",
      "app.mixBackground": "theme-panorama.panorama",
      "app.iconTheme": "theme-iconset-pastel.ld-iconset-pastel",
    });
    // 🔴 **版本标志不动**——补跑不是记账（若它把版本再抬一格，就等于又替未来烧掉一次门禁）
    expect(getConfigSchemaVersion()).toBe(12);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("🔴 空烧负控（与上条配对）——插件**还没到**时补跑零写：改名未落地不许硬映", async () => {
    registerPreRenameRecipes(disposers); // 旧名才是真注册名（插件还是旧版）
    registerPreRenameIconTheme(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt(12);

    const before = appearanceSnapshot(lastPersisted());
    expect(await runPendingConfigMigrations()).toBe(false);
    // 解析器两问的第二问不成立 ⇒ 恒等 ⇒ 盘上一个字节都不动（硬映会当场弄坏正在用的主题）
    expect(appearanceSnapshot(lastPersisted())).toEqual(before);
    expect(fiveKeyPlate()).toEqual(OLD_PLATE);
  });

  it("🔴 「先更壳、后更插件」全流程——插件到位后**下一次启动**就搬（顺序不再是判据）", async () => {
    // 第 1 次启动：新壳 ＋ 旧插件。壳把版本抬到 12（v12 真跑过，但零产出=空烧）
    const stage1Icon: Array<() => void> = [];
    registerPreRenameRecipes(disposers);
    registerPreRenameIconTheme(stage1Icon);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt(11);
    expect(await runPendingConfigMigrations()).toBe(true); // v12 记账（本步就是"把版本烧掉"的那一下）
    expect(getConfigSchemaVersion()).toBeGreaterThanOrEqual(12);
    expect(fiveKeyPlate()).toEqual(OLD_PLATE); // 零产出（新名还没注册）

    // 第 2 次启动：插件更新到位（注册本换新名）。**版本门禁此刻是关的**（12 已过）
    //   ⚠️ 旧名的注册项**必须真下线**：两问判据的第二问是「旧名解析不出」——旧名还在册 = 新旧并存的过渡态 ⇒ 恒等
    for (const r of ThemeRegistry.getRecipes()) ThemeRegistry.unregisterRecipe(r.id);
    for (const dispose of stage1Icon.splice(0)) dispose();
    registerPostRenameRecipes(disposers);
    registerPostRenameIconTheme(disposers);
    expect(await runPendingConfigMigrations()).toBe(false); // 门禁空烧：一条迁移都不跑
    expect(fiveKeyPlate()).toEqual({
      "app.theme": "theme-mint-soda.mint-soda",
      "app.themeColor": "theme-mint-soda.mint-soda",
      "app.mixFont": "theme-pill.pill-bubble",
      "app.mixBackground": "theme-panorama.panorama",
      "app.iconTheme": "theme-iconset-pastel.ld-iconset-pastel",
    });
  });

  it("补跑幂等——搬完之后再跑一辈子也零写（presence 门控 ＋ 命中即恒等）", async () => {
    registerPostRenameRecipes(disposers);
    registerPostRenameIconTheme(disposers);
    await seed({ ...OLD_PLATE });
    await seedSchemaVersionAt(12);
    expect(await runPendingConfigMigrations()).toBe(false);

    const after = appearanceSnapshot(lastPersisted());
    expect(await runPendingConfigMigrations()).toBe(false); // 第二次
    expect(await runPendingConfigMigrations()).toBe(false); // 第三次
    expect(appearanceSnapshot(lastPersisted())).toEqual(after); // 值不变（且没有多写）
  });

  it("接线判据——`appearance-id-reconcile` 真在补跑登记表里（防「体写了没人登记」）", () => {
    // 出处 = memory `gate-selftest-must-be-wired`：光有函数、没有登记点 = 静默不跑。
    // 这里按**名字点验登记表**（不是 grep 源码里有没有这个字符串）。
    expect(inspectConfigRepairs().map((r) => r.name)).toContain("appearance-id-reconcile");
  });
});
