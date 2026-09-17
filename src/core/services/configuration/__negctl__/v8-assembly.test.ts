/**
 * 🔴 负控专用：**只靠生产装配点**判断 v8 有没有被登记。
 *
 * 为什么另起一份（而不是写在 `schemaMigrations.test.ts` 里）：
 *   `schemaMigrations.test.ts` 里 `import { NAMESPACE_RENAME_MIGRATION_V8 }` 并**自己**调
 *   `registerConfigMigration(...)` ⇒ 摘掉 `schemaMigrations.ts` 顶层的登记行，那些用例**照样绿**
 *   ＝**假负控**（承 1.40 教训）。本文件**故意不 import 迁移符号**，只问生产路径。
 */
import { describe, it, expect } from "vitest";
import {
  getConfigSchemaVersion,
  runPendingConfigMigrations,
  SCHEMA_VERSION_KEY,
} from "../schemaMigrations";
import { clearConfigurationCache, setConfigurationValueBatch } from "../ConfigurationService";

describe("负控 · v8 生产装配点", () => {
  it("🔴 用户盘停在 v7 ⇒ 生产登记必须能推到 v8（摘掉 v8 登记 ⇒ 本断言红）", async () => {
    // 复现 1.42 用户盘状态：v7 已被 1.41 烧掉
    await setConfigurationValueBatch([{ key: SCHEMA_VERSION_KEY, value: 7 }]);
    clearConfigurationCache();

    const ran = await runPendingConfigMigrations();
    expect(ran, "生产里无待执行迁移 ⇒ v8 未登记").toBe(true);
    expect(getConfigSchemaVersion()).toBeGreaterThanOrEqual(8);
  });
});
