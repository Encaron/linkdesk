/**
 * 🔴 负控专用：**只靠生产装配点**判断 v8…v11 有没有被登记。
 *
 * 为什么另起一份（而不是写在 `schemaMigrations.test.ts` 里）：
 *   `schemaMigrations.test.ts` 里 `import { NAMESPACE_RENAME_MIGRATION_V8 }` 并**自己**调
 *   `registerConfigMigration(...)` ⇒ 摘掉 `schemaMigrations.ts` 顶层的登记行，那些用例**照样绿**
 *   ＝**假负控**（承 1.40 教训）。本文件**故意不 import 迁移符号**，只问生产路径。
 *
 * ⚠️ 1.43–1.45（`#111n-2/-3/-4`）连补 v9/v10/v11 三个版本号，本文件的期望值随之抬到 **11**。
 *
 * ── 🔴🔴 本文件第二版：**首版是假负控，当场被自己的负控抓出来了**（如实留档）──
 *
 *   首版四条用例都写成「盘在 vN ⇒ 跑完断言版本 ≥ N+1」。实测：**把 v9 的登记行摘掉，
 *   v9 那条照样绿**。根因不是用法写错，而是**这条判据的形状根本判不了它要判的东西**：
 *   v9/v10/v11 **共用同一个迁移体**（`runNamespaceRenameMigration`，纯数据复用），
 *   而 `runPendingConfigMigrations` 把版本标志**一步推到「待执行里的最高目标版本」**
 *   ⇒ 盘在 v8 时摘掉 v9，仍会被 v10/v11 推到 **11** ⇒ `≥ 9` 成立 ⇒ **绿**。
 *   ⇒ 教训（承 1.41「迁移真的生效了 ≠ 看起来迁移了」）：**「终值够大」证明不了「某一步存在」**，
 *     当多步共用同一个体时尤其如此。判「某个装配点存在」必须**直接问那个装配点**。
 *
 *   修法 = 改用 `inspectConfigMigrations()` **直接点名**：问生产登记表里**有没有** `version: N` 那一项。
 *   ⚠️ 这仍然满足「不 import 迁移符号」的初衷——本文件 import 的是**查询函数**，不是迁移体本身；
 *     摘掉顶层 `registerConfigMigration(...)` 任一一行 ⇒ 该版本从表里消失 ⇒ 对应断言**必红**。
 *   ⚠️ 同时**保留**终值断言（盘在 vN ⇒ 版本确实被推到 ≥ N+1）：它验的是**编排真会跑到那一步**，
 *     与「登记表里有这一项」是两件事（登记了但被 pending 过滤掉 / 抛错中止，这条会红）。
 */
import { describe, it, expect } from "vitest";
import {
  getConfigSchemaVersion,
  inspectConfigMigrations,
  runPendingConfigMigrations,
  SCHEMA_VERSION_KEY,
  /* ⚠️ E6#111n-4：v9/v10/v11 三条**本来只是模块内部的数据**（生产装配点和查询函数用得着，
   *   外部一个消费者都没有）⇒ `knip` 会把它们报成「未使用的导出」。
   *   这里**故意把它们 import 进来并逐条对照**，而不是去 `knip.json` 加豁免——两条理由：
   *   ① 豁免是**永久**的，而这三条是**一次性的**（本轮用完就不再动）；
   *   ② 加了豁免就再没人盯着它们了 ⇒ 将来谁删掉一个登记行，**门禁不会响**。
   *   本文件是**负控专用**，天然不参与生产路径 ⇒ 在这里消费它们**不会**把「装配点是否真存在」
   *   这一判据弄虚（判据问的仍是 `inspectConfigMigrations()`，不是这些常量本身）。 */
  NAMESPACE_RENAME_MIGRATION_V9,
  NAMESPACE_RENAME_MIGRATION_V10,
  NAMESPACE_RENAME_MIGRATION_V11,
} from "../schemaMigrations";
import { clearConfigurationCache, setConfigurationValueBatch } from "../ConfigurationService";

/** 本批新增的三条迁移 —— 版本号 ↔ 常量 ↔ 名字，**一张表**（避免三处各写一遍对不上） */
const ROUNDS_1_43_TO_1_45 = [
  { version: 9, name: "E6-111n-2 namespace-rename-migration-editor", migration: NAMESPACE_RENAME_MIGRATION_V9 },
  { version: 10, name: "E6-111n-3 namespace-rename-migration-serial-monitor", migration: NAMESPACE_RENAME_MIGRATION_V10 },
  { version: 11, name: "E6-111n-4 namespace-rename-migration-marketplace", migration: NAMESPACE_RENAME_MIGRATION_V11 },
] as const;

/** 把用户盘摆到某个版本，再跑一次迁移编排 */
async function runFrom(version: number): Promise<boolean> {
  await setConfigurationValueBatch([{ key: SCHEMA_VERSION_KEY, value: version }]);
  clearConfigurationCache();
  return runPendingConfigMigrations();
}

describe("负控 · v8…v11 生产装配点", () => {
  /* 🔴 判据本体：**逐个版本直接问登记表**。
   *   第一段（4 条）= 名字对得上；第二段（4 条）= 盘在 vN 时编排真会跑到 N+1 以上。
   *   两段都在「摘掉对应登记行」时红（第一段是直接红，第二段靠 vN+1 同体兜住——见文件头第二版说明）。 */
  for (const v of [8, 9, 10, 11] as const) {
    it(`🔴 v${v} 必须在生产登记表里（摘掉顶层 registerConfigMigration(V${v}) ⇒ 本断言红）`, () => {
      const registered = inspectConfigMigrations().map((m) => m.version);
      expect(registered, `生产登记表里没有 v${v}——顶层装配点丢了`).toContain(v);
    });

    it(`🔴 用户盘停在 v${v - 1} ⇒ 生产登记必须能推到 v${v} 以上`, async () => {
      const ran = await runFrom(v - 1);
      expect(ran, `生产里无待执行迁移 ⇒ v${v} 未登记`).toBe(true);
      expect(getConfigSchemaVersion()).toBeGreaterThanOrEqual(v);
    });
  }
});

/* ── 1.43/1.44/1.45 三条的**逐条**点名（版本号 ＋ 名字 ＋ 迁移体复用） ──
 * ⚠️ 这一层是给 `knip` 的「真消费」，也是给下一棒的**对照表**：三格的版本号、name 字符串、
 *   以及「共用同一个迁移体」这个**刻意的纯数据复用**（⛔ 不许为某一格另写第二套搬家逻辑）。 */
describe("负控 · v9/v10/v11 三格逐条点名", () => {
  for (const r of ROUNDS_1_43_TO_1_45) {
    it(`v${r.version}（${r.name}）在册，且版本号与常量一致`, () => {
      expect(r.migration.version, `${r.name} 的 version 被改动了`).toBe(r.version);
      expect(r.migration.name).toBe(r.name);
      const registered = inspectConfigMigrations().find((m) => m.version === r.version);
      expect(registered, `生产登记表里没有 v${r.version}`).toBeDefined();
      expect(registered?.name).toBe(r.name);
    });
  }

  it("🔴 三条 v9/v10/v11 与 v7/v8 共用同一个迁移体（纯数据复用，不是第二套逻辑）", () => {
    // 照 `schemaMigrations.test.ts` 里 v7/v8 那条同款断言——把「复用」这件事在**每一格**上都钉住。
    const bodies = ROUNDS_1_43_TO_1_45.map((r) => r.migration.migrate);
    const first = bodies[0];
    for (const b of bodies) expect(b).toBe(first);
    // 与已登记的任何一条也必须是同一个引用（否则说明有人另写了一套）
    const all = inspectConfigMigrations();
    for (const m of all) expect(m.migrate, `v${m.version} 的迁移体与 v9 不同`).toBe(first);
  });
});
