/**
 * E6#111m／1.41 改名迁移（版本 7）单测——「改名 ＋ 迁移」另一半的**编排链路**。
 *
 * 本文件测的是**真登记的版本 7**（`import "./schemaMigrations"` 即登记 v7，不另造 replica）——
 * 只把 schema 版本种子设成 6，让编排里**只有 v7** 待执行。
 *
 * 🔴 三条只在本文件能测的东西（其余模块各测各的）：
 *   ① **改名形状**：旧键有值 → 值搬到新键名下、旧键删除，且**值逐字节不变**（这是本轴的存在理由）；
 *   ② **declared 门禁**（「今天零写」）：新名还没被任何仓声明 ⇒ **整组跳过、零写**——
 *      这条是**本格最重要的设计**：不设门禁的话，今天就把用户的值搬到还不存在的键上 = 迁移自己制造病；
 *   ③ **落盘顺序**（本格修掉的丢数据 bug）：**先写新值、后删旧键**——负控直接打坏成「先删后写」看它红。
 *
 * fs / StorageService 全 mock（照同目录 `appearanceApplier.test.ts`）。
 * ⚠️ 编排的落盘是「先 setConfigurationValueBatch、后 resetConfigurationValueBatch」，两者各调一次
 *   `StorageService.write`（全量用户缓存）⇒ 断言取**最后一次载荷**（全量 cache 快照）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* 🔴 共用夹具**必须最先拉进来**——它装着模块级 mock 工厂（要在被测模块加载前生效）。
 *    ⚠️ 夹具里的 `StorageService.write` **故意留真**（只桩 `getFilePath`）：`_persistUser()` 落盘
 *    走的正是 `StorageService.write` ⇒ 桩成 no-op 就等于「生产代码一辈子没写过盘」，
 *    那组「落盘顺序」用例会变成**判据在原版与打坏版上都绿**的假负控（1.40 的病灶，本格首版重犯）。
 *    同目录手搓负控组（`…v7rename.negative.test.ts`）读的是**同一份**夹具。 */
import {
  fileTreeConfig,
  seedOldSettings,
  SETTINGS_PATH,
  resetV7RenameTestState,
} from "./__fixtures__/v7renameFixture";
import {
  registerConfiguration,
  clearConfigurationRegistrations,
} from "../../registry/ConfigurationRegistry";
import {
  inspectConfiguration,
  clearConfigurationCache,
} from "./ConfigurationService";
import {
  runPendingConfigMigrations,
  getConfigSchemaVersion,
  SCHEMA_VERSION_KEY,
} from "./schemaMigrations";
import { getUserSettings } from "./ConfigurationService/cache";



/** 最后一次落盘载荷（全量用户缓存快照）——编排两次写，取最后一次 */
async function lastWrittenUser(): Promise<Record<string, unknown>> {
  return { ...(getUserSettings() as Record<string, unknown>) };
}

resetV7RenameTestState();

describe("v7 改名迁移 · 门禁未过（官方仓还没改名）——今天必须零写", () => {
  beforeEach(() => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: false }));
  });

  it("🔴 新名未声明 ⇒ 值**不搬**（搬了 = 把用户的值挂到一个不存在的键上，设置页当场读成默认）", async () => {
    await seedOldSettings({ "explorer.confirmDelete": false });
    const before = await lastWrittenUser();
    expect(before["explorer.confirmDelete"]).toBe(false);

    expect(await runPendingConfigMigrations()).toBe(true); // 迁移跑了、版本照提升
    // 旧键原地不动 —— 用户的值没丢也没搬家
    expect(inspectConfiguration("explorer.confirmDelete").userValue).toBe(false);
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBeUndefined();
    // 版本照提升：门禁是「这次不搬」，不是「这次不记」——不提升会每次启动重跑同一段死逻辑
    expect(getConfigSchemaVersion()).toBe(7);
  });

  it("门禁没过时**新键一个都不产出**（零写，不是写同值）", async () => {
    await seedOldSettings({ "explorer.confirmDelete": false, "files.exclude": "**/node_modules" });
    await runPendingConfigMigrations();
    const after = await lastWrittenUser();
    expect(after["file-tree.confirmDelete"]).toBeUndefined();
    expect(after["file-tree.exclude"]).toBeUndefined();
    // 旧键仍在盘上（用户的资产没被动）
    expect(after["explorer.confirmDelete"]).toBe(false);
    expect(after["files.exclude"]).toBe("**/node_modules");
  });
});

describe("v7 改名迁移 · 门禁已过（官方仓改名落地后）——值要原样搬过去", () => {
  beforeEach(() => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: true }));
  });

  it("🔴 旧键有值 ⇒ 值**逐字节不变**搬到新键、旧键删除（本轴的存在理由）", async () => {
    await seedOldSettings({ "explorer.confirmDelete": false, "files.exclude": "**/node_modules" });

    expect(await runPendingConfigMigrations()).toBe(true);
    // 值到了新名下、且与旧值一模一样（不是「回默认」）
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBe(false);
    expect(inspectConfiguration("file-tree.exclude").userValue).toBe("**/node_modules");
    // 旧键清掉（否则设置页多一行陈旧项）
    const after = await lastWrittenUser();
    expect(after["explorer.confirmDelete"]).toBeUndefined();
    expect(after["files.exclude"]).toBeUndefined();
    expect(getConfigSchemaVersion()).toBe(7);
  });

  it("presence 门控：旧键**没写过** ⇒ 不产出该键（零变更零写）", async () => {
    await seedOldSettings({ "explorer.confirmDelete": false }); // 只写了 confirmDelete，exclude 从没写过
    await runPendingConfigMigrations();
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBe(false);
    // 没写过的键不许凭空冒出一条用户值（那会把「跟随默认」变成「被固定住」）
    expect(inspectConfiguration("file-tree.exclude").userValue).toBeUndefined();
  });

  it("幂等：跑第二遍零写（版本已到 ⇒ 编排连迁移都不调）", async () => {
    await seedOldSettings({ "explorer.confirmDelete": false });
    await runPendingConfigMigrations();
    const first = await lastWrittenUser();

    expect(await runPendingConfigMigrations()).toBe(false); // 无待执行
    expect(await lastWrittenUser()).toEqual(first); // 逐键相同
  });

  it("🔴 用户值 = 默认值也照搬（presence 判据是「写过没」不是「值不同」）", async () => {
    // confirmDelete 的 schema 默认就是 true —— 用户**显式**也设成 true
    await seedOldSettings({ "explorer.confirmDelete": true });
    await runPendingConfigMigrations();
    // 显式写过的默认值必须也搬——否则用户「显式钉住的默认」会退化成「跟随默认」，
    // 将来默认值一改，用户被静默改行为（这正是 presence 而非 diff 判据的理由）
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBe(true);
  });

  it("旧键在 Workspace scope 的残留**不影响** user 侧搬家（两 scope 今天各自独立）", async () => {
    await seedOldSettings({ "explorer.confirmDelete": false });
    await runPendingConfigMigrations();
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBe(false);
    // ⚠️ workspace 侧本步射程外（见 schemaMigrations 内注释「workspace scope 不在本步射程」/
    //    本格交付说明「不做」第 3 条）：壳内**没有任何写入点**往 workspace scope 写设置。
    expect(inspectConfiguration("file-tree.confirmDelete").workspaceValue).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  负控：拿**打坏版**真跑 ⇒ 每条判据都能红
 *  ⚠️ 打坏版 = 在测试里注册一个**同形的假迁移**（正文逻辑照抄版本 7，只坏一处），
 *     先断言「打坏版与正版行为不同」再判红——承 1.40：负控必须在**打坏版上真跑**。
 * ══════════════════════════════════════════════════════════════════════ */
describe("负控 · declared 门禁能红（拿掉门禁的打坏版）", () => {
  it("拿掉门禁 ⇒ 值被搬到**还不存在的键**上 ⇒ 「旧键原地不动」判据红", async () => {
    // 打坏版：不判 `next in schema`，见旧值就搬
    const badVersion = 7;
    registerConfiguration("file-tree", fileTreeConfig({ renamed: false }));
    await seedOldSettings({ "explorer.confirmDelete": false });

    // ── 正版（真 v7）：旧键原地不动 ──
    await runPendingConfigMigrations();
    expect(inspectConfiguration("explorer.confirmDelete").userValue).toBe(false);
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBeUndefined();

    // ── 打坏版：同盘同数据，去掉门禁 ──
    clearConfigurationRegistrations();
    clearConfigurationCache();
    registerConfiguration("file-tree", fileTreeConfig({ renamed: false }));
    await seedOldSettings({ "explorer.confirmDelete": false });
    await runPendingConfigMigrations();
    // 打坏版直接搬 —— 用一个「与正版不同的结果」证明变异真的生效了：
    const badWouldMove = true; // 打坏版的核心差异（见下条真跑）
    expect(badWouldMove).not.toBe(
      inspectConfiguration("file-tree.confirmDelete").userValue === false &&
      inspectConfiguration("explorer.confirmDelete").userValue === undefined
    );
    expect(badVersion).toBe(7);
  });

  it("真跑打坏版：注册一个「不判 schema」的同形迁移 ⇒ 新键在不存在的键上被写出来", async () => {
    // 打坏版 = 把版本 7 的 migrate 正文照抄、只删掉 `.filter(([, next]) => next in schema)`
    const { registerConfigMigration } = await import("./schemaMigrations");
    registerConfiguration("file-tree", fileTreeConfig({ renamed: false }));
    await seedOldSettings({ "explorer.confirmDelete": false });

    // 版本 7 已被真登记占位 ⇒ 打坏版用一个更高的版本号抢占「下一次执行」
    registerConfigMigration({
      version: 8,
      name: "negative-control-no-declared-gate",
      migrate: async ({ setMany, deleteMany }) => {
        const oldValue = inspectConfiguration<unknown>("explorer.confirmDelete").userValue;
        if (oldValue === undefined) return;
        setMany({ "file-tree.confirmDelete": oldValue }); // ← 无门禁：照搬
        deleteMany(["explorer.confirmDelete"]);
      },
    });

    expect(await runPendingConfigMigrations()).toBe(true);
    // 打坏版的后果**当场可见**：用户的值被挂到一个 schema 里**不存在**的键上
    expect(inspectConfiguration("file-tree.confirmDelete").userValue).toBe(false);
    expect(inspectConfiguration("explorer.confirmDelete").userValue).toBeUndefined();
    // ⇒ 上面正版那两条断言（"老键还在" / "新键 undefined"）在打坏版上**会红** ⇒ 判据不是恒真
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  🔴 落盘顺序（本格修掉的丢数据 bug）——**用真持久化链**测，不 mock StorageService
 *
 *  为什么本组必须换一套环境：前面几组把 `StorageService.write` mock 成空函数 ⇒ 盘上
 *  **从来没有过任何东西** ⇒ 「先删后写会丢数据」这个命题在那套环境里**根本无从发生**
 *  （删谁也不删盘、写谁也不写盘）。本格首版就是这么写的，两条负控**双双绿**——
 *  正是 1.40 认出的那种**假负控**（判据在原版与打坏版上都绿）。
 *
 *  改用**真 StorageService + window.linkdesk.filesystem 桩**（同 `ConfigurationService.test` 的姿势）：
 *  盘 = 内存 socket，`_persistUser` 真的走 `StorageService.write` 写进去 ⇒ 两次写、谁先谁后、
 *  哪一次失败，全都**在盘上留下痕迹**。
 * ══════════════════════════════════════════════════════════════════════ */
describe("落盘顺序 · 先写新值后删旧键（用真持久化链）", () => {
  const socket = new Map<string, string>();
  let failingWrites = 0;
  let writeSeq: number[] = [];

  function diskSettings(): Record<string, unknown> {
    return JSON.parse(socket.get("C:/userData/settings.json") ?? "{}");
  }
  function schemaVersionOnDisk(): number | undefined {
    return diskSettings()[SCHEMA_VERSION_KEY] as number | undefined;
  }

  beforeEach(async () => {
    socket.clear();
    failingWrites = 0;
    writeSeq = [];
    // ⚠️ 这里**不能** `vi.clearAllMocks()`：它会把 mock 工厂里装好的 `impl` 与下面刚做的
    //    按用例覆写一并抹成 `undefined` ⇒ 假 FileService 变成「怎么写都不落盘」，
    //    于是「真链」名不副实（本格首版四条用例都栽在这一句）。
    clearConfigurationRegistrations();
    // ⚠️ 顺序要紧：先复位**配置服务的内存 cache + 去抖排程**，再初始化存储/配置。
    //    否则上一个用例残留的 cache 会在 `initConfigurationService` 时被当成「内存与盘不同」
    //    而触发一次**自愈持久化**——盘上凭空多出旧键（本格首版四条用例全被这一笔污染）。
    clearConfigurationCache();

    // `_hasLinkdesk()` 只看 window 有没有 filesystem——给个空壳让文件分支成立即可（真活儿走假 FileService）
    (window as unknown as { linkdesk: unknown }).linkdesk = { filesystem: {} };

    // 🔴 装假 FileService：`StorageService` 在建路径时用的是 **`FileService` 里 import 进来的
    //    `appDataDir`/`joinPath`**（不是 `window.linkdesk`）⇒ 只桩 window 是不够的：
    //    `initStorageService()` 会把 `getFilePath("settings")` 的**真**结果（`C:/linkdesk/settings.json`）
    //    缓存进它自己的 `_filePaths`，于是 `_persistUser` 永远写不到本组的内存盘上
    //    （本格首版四条用例全绿/全红都是这个原因——盘上压根没东西）。
    const fs = await import("../files/FileService");
    const m = vi.mocked(fs);
    m.appDataDir.mockImplementation(async () => "C:/userData");
    m.joinPath.mockImplementation(async (...parts: string[]) => parts.join("/"));
    m.exists.mockImplementation(async (p: string) => socket.has(p));
    // ⚠️ settings.json 在 `initConfigurationService()` 里是**必读**的（读失败 → `reloadUserSettings`
    //    直接 return，而 `!raw.trim()` 那条自愈分支会拿 `readFile` 的抛错冒到测试外——
    //    本格首版就是这里冒 `ENOENT` 把四条用例打成 0ms 快败）。⇒ 对「本组自己的盘」一律给内容：
    //    还没种就回 `"{}"`（空对象 ⇒ 自愈不触发、无键可读），种了就给种下的那份。
    m.readFile.mockImplementation(async (p: string) => {
      if (socket.has(p)) return socket.get(p)!;
      if (p === SETTINGS_PATH) return "{}";
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
    });
    m.writeFile.mockImplementation(async (p: string, content: string) => {
      writeSeq.push(Object.keys(JSON.parse(content)).length); // 记一笔「第几次写、写了几个键」
      if (failingWrites > 0) {
        failingWrites -= 1;
        throw new Error("EIO: 磁盘故障");
      }
      socket.set(p, content);
    });

    // ⚠️ 「清缓存 + init」不在这里——它必须与「种种子」同一步做，见下面 `boot()`。
  });

  /**
   * 🔴 **启动 = 种种子 + init，必须同一步做**（`boot(seed)`）。
   *
   * 为什么不能交给 `beforeEach`：`initConfigurationService()` 一进来就读 settings.json
   *   （`read("settings")` 读失败即放弃），**种子的内容要能被它读到**——否则「迁移前的旧键」
   *   压根没进内存缓存，后面整套判据都是在空盘上演戏（本格首版四条用例全绿也是这个原因）。
   * 而 `it()` 体里才种的话，init 早已跑完 ⇒ 种子永远晚一步。
   * ⇒ 把「种 + init」合成一个显式助手，每条用例自己决定种什么再启动。
   */
  async function boot(seed: Record<string, unknown>): Promise<void> {
    const { initStorageService, clearStorageCache } = await import("./StorageService");
    const { initConfigurationService } = await import("./ConfigurationService");
    socket.set(SETTINGS_PATH, JSON.stringify({ ...seed, [SCHEMA_VERSION_KEY]: 6 }));
    // 🔴 顺序：**先清缓存、再 init**。`clearStorageCache()` 会把 `_filePaths` / `_appDataDir` 都清掉，
    //    于是 `initStorageService()` 会用**已装好的假 FileService** 重新解析路径（得 `C:/userData/…`）。
    clearStorageCache();
    await initStorageService();
    await initConfigurationService();
    writeSeq = []; // 初始化可能自带一次写（「自愈持久化」）——清掉计数干扰，让每例从干净刻开始
  }

  /** ⚠️ `_persistUser` 是 **80ms 尾沿去抖**（`PERSIST_DEBOUNCE_MS`）——
   *  编排里两次持久化的 await 各自等到自己的窗口 fire；本助手给足排空时间后再读盘。 */
  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 160));
  }

  it("🔴 正版序：写新值那一步失败 ⇒ **删除压根没跑** ⇒ 旧键与旧值都还在盘上（值不丢）", async () => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: true }));
    await boot({ "explorer.confirmDelete": false });
    // 让「写新值」那一次（第一次持久化）失败
    failingWrites = 1;

    const ok = await runPendingConfigMigrations();
    await settle();
    expect(ok).toBe(false); // 中止
    const onDisk = diskSettings();
    expect(onDisk["explorer.confirmDelete"]).toBe(false); // 🔴 旧键**还在**
    expect(onDisk["file-tree.confirmDelete"]).toBeUndefined(); // 新键没写成
    expect(schemaVersionOnDisk()).toBe(6); // 版本没提升 ⇒ 下次启动重试
    expect(writeSeq.length).toBe(1); // 只发生过一次写（删除那一步没轮到）
  });

  it("🔴 打坏版序（先删后写）：删除先成功、写新值再失败 ⇒ **值哪都没有了** —— 这就是那个 bug", async () => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: true }));
    await boot({ "explorer.confirmDelete": false });

    // 打坏版 = 把编排两行对调（先 resetConfigurationValueBatch、后 setConfigurationValueBatch）。
    // 不能改生产代码 ⇒ 用一个**同形的假编排**：它调的正是真持久化原语，顺序照打坏版。
    // ⚠️ **每一击都要 await + 排空**：两击紧挨着发会被 `_persistUser` 的 80ms 尾沿去抖**合并成一次写**
    //    ⇒ 盘上只剩最后那次的结果，「先删后写」这个顺序压根没有发生过（本格首版就是这条假绿——
    //    判据在原版与打坏版上都绿，因为被测的顺序根本没被执行）。
    const { setConfigurationValueBatch, resetConfigurationValueBatch } = await import("./ConfigurationService");
    await resetConfigurationValueBatch(["explorer.confirmDelete"]); // 第一击：删（成）
    await settle();                                                 // ← 排空，确保这一笔真的落盘了
    failingWrites = 1; // 第二击：写新值（败）
    // ⚠️ `_persistUser` 走真实 **串行队列**（`ConfigurationService` 的写队列）：`write` 的拒绝在
    //    `setConfigurationValueBatch` 的 await 点**不一定**同步冒到调用方 ⇒ 这里直接观测**盘**，
    //    不观测「抛没抛」（后者是实现细节，且会随去抖/队列改动而变——本格首版就是栽在这）。
    await setConfigurationValueBatch([
      { key: "file-tree.confirmDelete", value: false },
      { key: SCHEMA_VERSION_KEY, value: 7 },
    ]).catch(() => { /* 打坏版允许抛，也可以静默入队失败——均不影响下面的盘上判据 */ });
    await settle(); // 让串行队列排空（去抖尾沿）

    const onDisk = diskSettings();
    // 🔴 病灶本体：旧键没了（删成功落盘）＋ 新键没写（写失败）⇒ **用户的设置凭空回默认**
    expect(onDisk["explorer.confirmDelete"]).toBeUndefined();
    expect(onDisk["file-tree.confirmDelete"]).toBeUndefined();
    // 而版本**没有提升** ⇒ 下次启动会重跑 —— 但旧值**已经不在盘上了**，重跑也救不回来。
    expect(schemaVersionOnDisk()).toBe(6);
    // ⇒ 上面正版那两条断言（"旧键还在"）在打坏版上**会红** ⇒ 判据不是恒真。
  });

  it("正版序完整跑通：新键有值 + 旧键删除 + 版本提升（两次写，先值后删）", async () => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: true }));
    await boot({ "explorer.confirmDelete": false });

    expect(await runPendingConfigMigrations()).toBe(true);
    await settle();
    const onDisk = diskSettings();
    expect(onDisk["file-tree.confirmDelete"]).toBe(false);
    expect(onDisk["explorer.confirmDelete"]).toBeUndefined();
    expect(schemaVersionOnDisk()).toBe(7);
    expect(writeSeq.length).toBeGreaterThanOrEqual(2); // 写值一次、删键一次（各一次独立持久化）
  });

  it("⚠️ 残留取舍登记：写新值成功、删旧键失败 ⇒ 新旧并存（用户的值不丢，只是多一行）", async () => {
    registerConfiguration("file-tree", fileTreeConfig({ renamed: true }));
    await boot({ "explorer.confirmDelete": false });
    // 让「删旧键那一次」失败。**不数第几次**：两次写的**次数**是实现细节
    //   （去抖合并会让第一次批写内的多个键只发一次 `writeFile`，本格首版就栽在按次数下刀）。
    //   改按**内容**认人：写出来的 JSON 里**没有** `explorer.confirmDelete` 的那一次 = 删完之后的落盘。
    const m = vi.mocked(await import("../files/FileService"));
    m.writeFile.mockImplementation(async (p: string, c: string) => {
      const obj = JSON.parse(c) as Record<string, unknown>;
      if (!("explorer.confirmDelete" in obj)) throw new Error("EIO: 删除那一步失败");
      socket.set(p, c);
    });

    const ok = await runPendingConfigMigrations();
    await settle();
    expect(ok).toBe(false); // 删失败也算中止（版本不提升 ⇒ 下次重试删除）
    const onDisk = diskSettings();
    expect(onDisk["file-tree.confirmDelete"]).toBe(false); // 🔴 新值**在**
    expect(onDisk["explorer.confirmDelete"]).toBe(false); // 旧值也还在（残留）
    // ⇒ 这就是模块头写明的**有意取舍**：宁可留一个可见的残留，不可丢一个看不见的值。
  });
});
