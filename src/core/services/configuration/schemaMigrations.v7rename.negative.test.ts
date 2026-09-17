/**
 * v7 改名迁移——**手搓负控组**（E6#111m／1.41）。
 *
 * 为什么单独一个文件（而不是塞进 `schemaMigrations.v7rename.test.ts`）：
 *   本组的两条用例**打坏版是手搓的**（不走真 v7，而是临时 `registerConfigMigration({version: 8, …})`
 *   登记一条「同形的坏迁移」），并且要往真盘上写。同文件里那组「用真持久化链」的用例与之共用
 *   模块级 mock 与真盘会互相串味（谁先跑谁决定盘上剩什么）⇒ 分文件 = 各自一个干净模块实例。
 *
 * 测什么（1.40「负控必须真跑打坏版」的落地）：
 *   · 打坏版**不看 presence** ⇒ 把从没写过的旧键也「搬」成一条 undefined 的新键
 *     → 正版那条 `expect(inspectConfiguration("file-tree.exclude").userValue).toBeUndefined()` 会红。
 *   判据必须在本组**真的红**过才算数（只写在注释里的「能红」不算——1.40 验出过两个假负控）。
 *
 * 夹具与 mock 来自 `__fixtures__/v7renameFixture.ts`（**与主测试同一份**，见该文件头注释）。
 */
import { describe, it, expect } from "vitest";

import {
  fileTreeConfig,
  seedOldSettings,
  resetV7RenameTestState,
} from "./__fixtures__/v7renameFixture";
import { registerConfiguration } from "../../registry/ConfigurationRegistry";
import { inspectConfiguration } from "./ConfigurationService";
import {
  runPendingConfigMigrations,
  registerConfigMigration,
} from "./schemaMigrations";
import { getUserSettings } from "./ConfigurationService/cache";

/** 用户缓存快照——本组只看「内存里有没有这个键」，不落盘（打坏版判据在缓存上就能红） */
async function lastWrittenUser(): Promise<Record<string, unknown>> {
  return { ...(getUserSettings() as Record<string, unknown>) };
}

resetV7RenameTestState();

describe("负控 · presence 门控能红（不看 presence 照搬的打坏版）", () => {
  it("打坏版不看 presence ⇒ 没写过的键也被造出一条用户值", async () => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: true }));
    await seedOldSettings({ "explorer.confirmDelete": false });

    registerConfigMigration({
      version: 8,
      name: "negative-control-no-presence",
      migrate: async ({ setMany }) => {
        // 打坏版：不管有没有旧值，一律把「读到的值」写过去（undefined 也写）
        const schemaValues: Record<string, unknown> = {
          "file-tree.confirmDelete": inspectConfiguration<unknown>("explorer.confirmDelete").userValue,
          "file-tree.exclude": inspectConfiguration<unknown>("files.exclude").userValue,
        };
        setMany(schemaValues);
      },
    });

    // 正版：files.exclude 从没写过 ⇒ 新键不产生
    // 打坏版：setMany 里带上了 undefined ⇒ 用户缓存里出现了这个键
    expect(await runPendingConfigMigrations()).toBe(true);
    expect("file-tree.exclude" in (await lastWrittenUser())).toBe(true); // ← 打坏版造出了这条
    // ⇒ 正版那条 `expect(inspectConfiguration("file-tree.exclude").userValue).toBeUndefined()` 会红
  });
});
