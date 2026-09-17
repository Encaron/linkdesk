/**
 * v7 改名迁移测试**共用夹具**——E6#111m／1.41。
 *
 * 为什么单独一个模块：`schemaMigrations.v7rename.test.ts`（真链组）与
 * `schemaMigrations.v7rename.negative.test.ts`（手搓负控组）必须**分文件**跑
 * （各要一个干净的模块实例，否则真盘与桩盘会互相串味），但两边的
 * fixture（mocks / schema 描述符 / 种子助手）**是同一样东西**——
 * 复制第二份就是本轴花了一整格（1.15）在灭的病。⇒ 提取到这里，两边 import。
 *
 * ⚠️ **本模块必须最先 import**（mock 工厂要在被测模块加载前装好）——
 *    两个测试文件都在自己文件头 `import "./__fixtures__/v7renameFixture"` 拉它，
 *    那时 vitest 的 mock 提升已生效。
 */
import { vi } from "vitest";

/* ── 模块级 mock ── */

// ⚠️ **不要**把 `StorageService.write` 桩成 no-op：`_persistUser()` 落盘走的正是
//    `StorageService.write`（内部再 `_filePath(key)` → `FileService.writeFile`）。
//    桩掉它 = 生产代码一辈子没写过盘 ⇒ 「落盘顺序」那组用例**测的东西压根没被执行**
//    （本格首版就栽在这：盘上永远空，判据在原版与打坏版上**都绿**——1.40 说的假负控）。
//    ⇒ 只桩 `getFilePath`（把路径确定性钉成宿主口径），`write` 留真。
vi.mock("../StorageService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../StorageService")>();
  return {
    ...mod,
    getFilePath: vi.fn(async () => "C:/userData/settings.json"),
  };
});

// ⚠️ 默认「干净盘」：`readFile` 一律 ENOENT（**不是** `""`——空串会让 `_persistUser` 的自愈写
//    在**每一条**用例里莫名触发，把盘搅浑）。真链组自己再按需覆写成内存盘。
vi.mock("../../files/FileService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../files/FileService")>();
  const noExist = async (p: string) => {
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
  };
  return {
    ...mod,
    readFile: vi.fn(noExist),
    exists: vi.fn(async () => false),
    // 这三个也必须是 mock：真链组要按用例覆写它们（`vi.mocked(...).mockImplementation`）
    appDataDir: vi.fn(mod.appDataDir),
    joinPath: vi.fn(mod.joinPath),
    writeFile: vi.fn(mod.writeFile),
  };
});

import { beforeEach } from "vitest";
import type { ConfigurationContribution } from "../../../registry/ConfigurationRegistry";
import { clearConfigurationRegistrations } from "../../../registry/ConfigurationRegistry";
import {
  setConfigurationValueBatch,
  clearConfigurationCache,
} from "../ConfigurationService";
import {
  SCHEMA_VERSION_KEY,
  clearConfigMigrations,
  registerConfigMigration,
  NAMESPACE_RENAME_MIGRATION,
} from "../schemaMigrations";

/**
 * 两个 v7 测试文件**共用的 `beforeEach`**——每例都从「干净注册表 + 干净缓存 + 真 v7 在位」起跑。
 *
 * 🔴 为什么必须把真 v7 **重新登记**：`clearConfigMigrations()` 一清，模块级 `_migrations` 就空了，
 *    而真 v7 只在 `schemaMigrations.ts` 顶层登记过**那一次**——清了**没人再装**
 *    ⇒ 编排手里是空表 ⇒ 一条迁移都不跑（本格首版 `ver=8 / seq=[]` 的假绿就是这么来的）。
 *    这里用生产导出的 `NAMESPACE_RENAME_MIGRATION` **原物件**重登记——
 *    复制一份同形代码会在生产实现改动后静默变绿，那就不是判据了。
 *
 * ⚠️ 调用方**还要自己** `registerConfiguration(...)` 它要的 schema（那是各组的自变量）。
 */
export function resetV7RenameTestState(): void {
  beforeEach(() => {
    clearConfigurationRegistrations();
    clearConfigurationCache();
    vi.clearAllMocks();
    clearConfigMigrations();
    registerConfigMigration(NAMESPACE_RENAME_MIGRATION);
  });
}


/** 版本 7 之前的那一版——种子设在这里，让编排里只有 v7 待执行（模块内部用） */
const PRE_RENAME_VERSION = 6;

/** 内存盘里 settings.json 的路径（与上面 `getFilePath` 的桩**必须同串**） */
export const SETTINGS_PATH = "C:/userData/settings.json";

/**
 * 🔴 门禁开关的**唯一旋钮**：schema 里有没有「新名」。
 * 一个描述符函数造两组 fixture：改名**已落地**（新名在册）与**未落地**（只有旧名在册）。
 */
export function fileTreeConfig(opts: { renamed: boolean }): ConfigurationContribution {
  // ⚠️ 锚点键必须**不叫 app.***——`app.*` 是宿主保留面，插件身份注册它会当场被
  //    ConfigurationRegistry 拒（1.34 起的保留面门禁；本格首版用 app.surfaceRadius 做锚，
  //    结果整个 file-tree 配置注册被拒 ⇒ schema 里没有新名 ⇒ 门禁永远不过 ⇒ 用例假红/假绿）。
  //    ⇒ 用一条 file-tree 自有的非改名键做「schema 非空」的锚。
  const props: ConfigurationContribution["properties"] = {
    // ⚠️ 描述文案一律用 **ASCII**：中文串会被 `audit-i18n` 当成「待翻译的用户可见文案」
    //    而它是一条**测试夹具**，不该进翻译面（本格首版用了中文描述，i18n 门禁当场判红）。
    "file-tree.anchor": { type: "number", default: 0, description: "test-only anchor key" },
  };
  if (opts.renamed) {
    // 改名后：新名进 schema（旧名**不再声明**——这正是改名的定义）
    props["file-tree.confirmDelete"] = { type: "boolean", default: true, description: "confirm before delete" };
    props["file-tree.exclude"] = { type: "string", default: "", description: "exclude globs" };
  } else {
    props["explorer.confirmDelete"] = { type: "boolean", default: true, description: "confirm before delete" };
    props["files.exclude"] = { type: "string", default: "", description: "exclude globs" };
  }
  return { title: "File Tree", properties: props };
}

/** 预置一份「旧名时代的用户 settings.json」——用 batch 直写 user scope + 版本标志压到 6 */
export async function seedOldSettings(entries: Record<string, unknown>): Promise<void> {
  await setConfigurationValueBatch([
    ...Object.entries(entries).map(([key, value]) => ({ key, value })),
    { key: SCHEMA_VERSION_KEY, value: PRE_RENAME_VERSION },
  ]);
}
