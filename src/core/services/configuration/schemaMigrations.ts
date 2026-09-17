/**
 * 配置 schema 版本迁移——对标 VS Code 配置迁移机制（configurationRegistry 版本化）。
 * E5.8#85 补课（用户 2026-08-25：「归一化没做好」）：#85 圆角绝对化建好了新参考系（发射/播种/clamp），
 * 但存量 settings.json 的旧值（倍数 1.15/1.36）没迁——升级即被新参考系读成 ~1px。
 *
 * 为什么需要版本号而非值检测：旧语义值域（圆角倍数 [0,2]）与新语义值域（绝对 px [0,32]）重叠，
 * `1.15` 本身无法自判新旧——必须靠一次性版本标志（app.schemaVersion）区分「已迁」与「未迁」。
 * 标志为未注册内部键：不进 getMergedSchema → 设置 UI 不可见；setConfigurationValue 对未注册键零门槛。
 *
 * 形态（AI 友好第 3 层——AI 加迁移不需要追踪）：
 *   未来任何语义切换（#86 glass 绝对化 / #87 清除语义 / #91 fontTone / #90 外观模型合并）只需在
 *   数据所在层调用 registerConfigMigration({ version, name, migrate }) 登记一步；编排/版本过滤/落盘
 *   全部本模块处理，禁止再手写 startup.ts 一次性迁移块（#82 themeColorMode 是迁移机制落位前的历史一次性先例）。
 *
 * 幂等约定：迁移函数对「已迁值」重跑必须零变化（本模块不强制，迁移作者负责——#85 圆角迁移采用
 *   「读迁移时刻有效 token 冻结为绝对 px」公式，天然幂等：新语义下重跑覆写同值）。
 * 失败语义（原子）：任一待执行迁移抛错 → 本次不落盘不提升（下次启动全量重试）——防部分迁移后
 *   版本越过未成功迁移（其旧键永久停留旧格式）。迁移作者修正后自动恢复。
 * 成功语义：全部迁移通过即写版本标志（含零产出——presence 全 skip 的全新安装也标记已迁，
 *   避免每次启动重复跑；settings.json 增一行未注册内部键，设置 UI 不可见）。
 *
 * E5.8#90 键删除扩展：迁移可调 ctx.deleteMany(keys) 删除废弃内部键（合并语义后不再注册的旧枚举键，
 *   如 app.mixMode/app.accentMode）——残留不删会在 getConfigurationValue 的 _validateEnum 对未注册键
 *   直通返回（陈旧值可能被未来代码静默读回）。⚠️ E6#111m／1.41 修正了落盘顺序为「**先写新值、再删旧键**」
 *   （原为「先删后写」——对**改名迁移**会丢用户数据，详见 runPendingConfigMigrations 内注释）。
 *   删除与写入同原子：任一失败 → 不提升版本（下次启动全量重试；迁移须幂等——已删键重跑 deleteMany 空操作、
 *   setMany 重写同值零变化）。
 */
import { inspectConfiguration, resetConfigurationValueBatch, setConfigurationValueBatch } from "./ConfigurationService";
import { takeLastFileWriteFailed } from "./StorageService";
import { getMergedSchema } from "../../registry/ConfigurationRegistry";
import { flattenRenameRounds, settingNewToOld } from "./renameMigrations";
import { migrateUserKeybindings } from "./keybindingMigration";

/** schema 版本标志键——settings.json 顶层内部键，未注册（设置 UI 不可见，见模块头注释） */
export const SCHEMA_VERSION_KEY = "app.schemaVersion";
/** 初始版本——无标志的 settings.json 视为 1（首个迁移从 2 起） */
const SCHEMA_VERSION_INITIAL = 1;

/** 迁移上下文——迁移作者从 migrate(ctx) 解构 setMany/deleteMany 使用，无需命名类型（结构性匹配）。 */
interface ConfigMigrationContext {
  /** 入队一批配置变更（Record<key, value>）——编排后统一 setConfigurationValueBatch（单次持久化 + 单次 applier，#59 先例）。 */
  setMany: (values: Record<string, unknown>) => void;
  /** E5.8#90：入队一批废弃键删除（去重收集）——编排后统一 resetConfigurationValueBatch（删除与写入同原子，见模块头）。 */
  deleteMany: (keys: string[]) => void;
}

export interface ConfigMigration {
  /** 目标 schema 版本——settings.json 当前版本 < 此值时才执行（升序） */
  version: number;
  /** 可读名——档案/调试/失败日志 */
  name: string;
  /** 迁移函数——只向 ctx.setMany 推变更不落盘（编排统一落盘）；presence 自查：旧值不存在则不加（零变更零写）。 */
  migrate: (ctx: ConfigMigrationContext) => Promise<void>;
}

const _migrations = new Map<number, ConfigMigration>();

/** 登记一个 schema 迁移——未来语义切换的唯一入口（见模块头注释） */
export function registerConfigMigration(migration: ConfigMigration): void {
  _migrations.set(migration.version, migration);
}

/** 测试/重登记用——清空全部迁移登记 */
export function clearConfigMigrations(): void {
  _migrations.clear();
}

/**
 * 读出**已登记**的迁移（按版本升序）——供「生产装配点是否真的存在」这类判据直接点名。
 *
 * 🔴 **为什么需要它**（1.43 本格实测出来的假负控，见 `__negctl__/v8-assembly.test.ts` 文件头）：
 *   v9/v10/v11 **共用同一个迁移体**，而 `runPendingConfigMigrations` 把版本标志**一步推到
 *   「待执行里的最高目标版本」** ⇒ 盘在 v8 时摘掉 v9 的登记行，仍会被 v10/v11 推到 11
 *   ⇒ 「跑完后版本 ≥ 9」**照样成立**。**「终值够大」证明不了「某一步存在」。**
 *   ⇒ 判「某个装配点存在」必须**直接问登记表**，不能靠终值推断。
 *
 * ⚠️ 只读快照（调用方拿到的是副本数组，改它不影响内部表）。不进任何门禁判定路径。
 */
export function inspectConfigMigrations(): ConfigMigration[] {
  return [..._migrations.values()].sort((a, b) => a.version - b.version);
}

/* ── E6#111m／1.41：**改名迁移**（版本 7）——「改名 ＋ 迁移」的另一半 ──
 *
 * 背景：1.31–1.40 把五件（命令 id / 设置键 / 外观族 id / 上下文旗子 / i18n）的**登记与判据**做完了；
 *   1.42–1.48 要**真改官方仓**。改名一旦落地，用户**已经存下来的旧名**就再也读不到了 ⇒
 *   本迁移负责在**版本提升前一次性**把它们搬成新名。**迁移没做 = 静默丢用户数据**（本轴最重的伤害）。
 *
 * 三处落点（[11 号任务书 §1.1] 逐条）：
 *   ① **`settings.json` 的键名**（user ＋ workspace 两 scope）——旧键有值 ⇒ 搬到新名下、删旧键；
 *   ② **`keybindings.json`**（🔴 最容易漏、也最值钱的一条）——`command` 与 `when` 子句；
 *   ③ **外观 id**（`app.theme` / `app.themeColor` / `app.mixFont` / `app.mixBackground`）——
 *      **1.36 已在版本 6 做完**，本步**不重做**（重做 = 第二套 id 归一逻辑，归一口径禁止）。
 *
 * 🔴 **映射表只有一份**：`renameMigrations.ts` 的 `RENAME_ROUNDS`——本步与 1.42–1.48 的改名执行器
 *   **读同一份数据**（执行器没有自己的表）。⛔ 别在这里内联 if 链或第二张表。
 *
 * 🔴 **今天零写（不是没做）**：官方仓还没改名 ⇒ 新名在宿主 schema 里**不存在** ⇒
 *   若此刻硬把 `explorer.confirmDelete` 改成 `file-tree.confirmDelete`，设置页会当场把用户的值读成默认
 *   ——**迁移自己制造出它要消灭的那个病**。⇒ 与 1.36 的「解析器门控」同一条思路，但**判据不同**：
 *     · 外观 id（1.36）判的是「**解析器**认不认得新名」（`ThemeRegistry` 是运行时可问的）；
 *     · 设置键**没有**这类运行时注册本可问（schema 是**静态声明**，插件加载完才有）——
 *       判据只能取「**新名已经被声明了**」，即 `getMergedSchema()` 里有它。
 *   ⇒ 改名轮落地、插件重新加载后，下一次启动判据自然翻真 ⇒ 迁移照常改写。
 *   ⚠️ **presence 门控 ＋ 幂等**：键不存在 ⇒ 不产出该组；已迁后旧键已删 ⇒ 再跑零写。
 *   ⚠️ **`app.schemaVersion` 已越过 7 的用户不会重跑**（版本门禁）——这是**已知且有意**的边界：
 *     改名轮发版时若需补跑，由那一格**补一个新版本号**（表是纯数据，搬过去即可，1.36 先例写明）。
 */

/* ── 🔴 1.42 实测抓到的真缺陷：**版本门禁把 v7 提前烧掉了** ──
 *
 * 1.41 交付 v7 时，`RENAME_ROUNDS` 的 `command`/`flag` 两栏是空的、`setting` 也没有任何新名被声明。
 * 而本文件的成功语义是「**含零产出也标记已迁**」（见模块头 §19 行）⇒ v7 在**改名落地之前**
 * 就把用户盘的 `app.schemaVersion` 推到了 **7**。1.42 真改官方仓之后再启动：
 *
 *     pending = migrations.filter(m => m.version > current)   // 7 > 7 = false ⇒ **一条都不跑**
 *
 * ⇒ **设置键永不搬家**：旧键有值、新名读默认 = 用户的设置静默全丢。
 * （同一次启动里 `migrateUserKeybindings` **照跑**——它在 v7 函数体内被无条件调用、没有 schema 门禁
 *  ⇒ 快捷键反而**搬早了**：搬到一个插件还没声明的命令 id 上 = 静默死键。）
 *
 * 🔴 **修法照 v7 注释自己预告的那条**：「改名轮发版时若需补跑，由那一格补一个新版本号」——
 *   本格就是它点名的第一个「那一格」。⇒ 迁移体抽成 `runNamespaceRenameMigration()`，
 *   **v7 与 v8 登记同一个体**（幂等：已迁后旧键已删 ⇒ 再跑零写；这是纯数据复用，不是第二套逻辑）。
 *   ⚠️ 后续 1.43–1.48 每轮清账**若在 v8 之后落地新仓的改名**，同样要**各自再补一个版本号**
 *   （本轮已把这条写进交付说明——否则下一轮会以一模一样的方式静默失败）。 */
async function runNamespaceRenameMigration({ setMany, deleteMany }: ConfigMigrationContext): Promise<void> {
  const maps = flattenRenameRounds();
  const schema = getMergedSchema();

  // ── ① 设置键（user scope） ──
  //     🔴 只在新名**已被声明**时才搬（见上方「今天零写」）——未声明 ⇒ 整组跳过、零写。
  //     🔴 presence 自查：旧键在 user 侧没有值 ⇒ 不产出它。这条同时兜住「全新安装零写」。
  //     ⚠️ **workspace scope 不在本步射程**：`setMany`/`deleteMany` 经
  //        `setConfigurationValueBatch` 落到 **user** scope（编排层固定不传 scope），
  //        而 workspace 侧的搬家需要 scope 参数 —— 如实登记为未覆盖的边界（见本格交付说明
  //        「不做」表第 3 条：壳内**没有任何写入点**往 workspace scope 写设置，
  //        `setWorkspaceRoot` 只读 `.linkdesk/settings.json`）⇒ 今天无实际受害者。
  const declared = Object.entries(maps.setting).filter(([, next]) => next in schema);
  const writes: Record<string, unknown> = {};
  const oldKeys: string[] = [];
  for (const [from, to] of declared) {
    const userValue = inspectConfiguration<unknown>(from).userValue;
    if (userValue === undefined) continue; // presence 门控：没写过 ⇒ 不产出
    writes[to] = userValue;
    oldKeys.push(from);
  }
  if (oldKeys.length > 0) {
    // 🔴 顺序即约定：先写新名（`setMany`），旧键的删除由编排层在**写成功之后**单独执行
    //    （`runPendingConfigMigrations` 先 `resetConfigurationValueBatch(deletes)` 再
    //     `setConfigurationValueBatch(batch)`… 见那边注释；两者同批失败 = 都不落盘、版本不提升）。
    setMany(writes);
    deleteMany(oldKeys);
  }

  // ── ② 用户自定义快捷键（本格最容易漏、也最值钱的一条） ──
  //     它**自己落盘**（keybindings.json 不在 settings.json 里，`inspectConfiguration` 够不着）。
  //     ⚠️ **无 schema 门禁、无版本门禁**（幂等靠「旧名整词命中才改」）⇒ v8 重跑时旧名已换新名，
  //     零命中零写；对 v7 那次「搬早了」的用户，这一步在 v8 里是**幂等的重跑**，不会二次改写。
  await migrateUserKeybindings({
    command: maps.command,
    flag: maps.flag,
    settingNewToOld: settingNewToOld(),
  });
}

export const NAMESPACE_RENAME_MIGRATION: ConfigMigration = {
  version: 7,
  name: "E6-111m namespace-rename-migration", // ⚠️ 不写 `#`：CSS 硬编码门禁会把 `#111m` 当 4 位 hex 颜色（假红）
  migrate: runNamespaceRenameMigration,
};

/* ── E6#111n／1.42：**改名迁移补跑**（版本 8）——版本门禁的补救 ──
 *
 * 为什么必须补：见上方「版本门禁把 v7 提前烧掉了」。v7 在映射表还是空的时候就把
 * `app.schemaVersion` 推到了 7 ⇒ 1.42 把官方仓真改成新名之后，v7 **再也不会跑**。
 * 本步与 v7 共用同一个迁移体（`runNamespaceRenameMigration`）：
 *   · 对**已越过 7 的老用户**：本步是那次「没跑成的搬家」的**补跑**；
 *   · 对**全新安装 / 未越过 7 的用户**：v7 与 v8 都会跑，第二次零写（presence 门控 ＋ 幂等）。
 * 🔴 **纯数据复用，不是第二套逻辑**——照本文件 §92–93 行预警的做法。
 * ⚠️ 1.43–1.48 每一轮**在 v8 之后**落地的新仓改名，都要**各自再补一个版本号**（同一坑会重犯）。 */
export const NAMESPACE_RENAME_MIGRATION_V8: ConfigMigration = {
  version: 8,
  name: "E6-111n namespace-rename-migration-rerun", // ⚠️ 同上：不写 `#`
  migrate: runNamespaceRenameMigration,
};

/* ── E6#111n-2／n-3／n-4：**改名迁移再次补跑**（版本 9／10／11）──
 *
 * 🔴 **同一个坑的第 2、3、4 次**（v7 预警 → 1.42 补 v8 → 本格再补三个）。
 * 版本门禁是 `pending = migrations.filter(m => m.version > current)`，而**成功语义含零产出**
 * （见模块头「成功语义」）⇒ 任何一次「迁移跑了但那一轮的官方仓还没改名」都会把版本推过该值，
 * 那一轮之后的改名就**再也不会被搬**。本格（1.43–1.45）连做三个仓 ⇒ 补三个版本号。
 *
 * 为什么一次补三个而不是一个：三轮的改名**同笔发版**（用户装到的壳与插件是同一批），
 * 对用户盘而言就是一个批次。三个独立版本号保留「哪一轮搬的什么」的可追溯性，
 * 且任一格的迁移体改动都仍可单独定位。三者共用同一个迁移体（**纯数据复用，不是第二/三/四套逻辑**）。
 *
 * ⚠️ **幂等前提**：`runNamespaceRenameMigration` 靠 presence 门控（旧键没值就不产出）＋
 *    「命中即恒等」（旧名已换新名 ⇒ 再跑零命中）⇒ 连跑 v7…v11 五次，只有第一次有产出。
 * ⚠️ 1.46–1.48 **若在 v11 之后**落地新仓的改名，照旧**各自再补一个版本号**（本条就是范本）。 */
export const NAMESPACE_RENAME_MIGRATION_V9: ConfigMigration = {
  version: 9,
  name: "E6-111n-2 namespace-rename-migration-editor", // ⚠️ 不写 `#`
  migrate: runNamespaceRenameMigration,
};

/* 1.44 清账 · serial-monitor —— 只有旗子改名，而旗子是**运行时状态、不落盘**（本格已核实：
 *   `sourceOpen` / `serialSessionFocus` 在 pluginState / StorageService / localStorage / workspace
 *   四类持久化写入口的命中 = 0）⇒ **本步对用户盘零产出**。
 * 🔴 **但仍然必须登记**：`runNamespaceRenameMigration` 的第二段 `migrateUserKeybindings` 是
 *   **跨仓共读**的（`command` / `flag` 两栏摊平后一视同仁）——用户 `keybindings.json` 里的 `when`
 *   子句可能引用本仓改名后的旗子。少了这一步 = 那条自定义键位**静默失效**（不报错、按了没反应）。 */
export const NAMESPACE_RENAME_MIGRATION_V10: ConfigMigration = {
  version: 10,
  name: "E6-111n-3 namespace-rename-migration-serial-monitor", // ⚠️ 不写 `#`
  migrate: runNamespaceRenameMigration,
};

/* 1.45 清账 · marketplace —— 同上（6 个旗子，运行时状态不落盘 ⇒ 对 settings.json 零产出；
 *   登记的意义同样在 `migrateUserKeybindings` 那一段）。 */
export const NAMESPACE_RENAME_MIGRATION_V11: ConfigMigration = {
  version: 11,
  name: "E6-111n-4 namespace-rename-migration-marketplace", // ⚠️ 不写 `#`
  migrate: runNamespaceRenameMigration,
};

/* 顶层即登记（生产路径唯一的装配点）。
 * ⚠️ 测试要「清场再装回」时必须用导出的 `NAMESPACE_RENAME_MIGRATION` **重新登记**——
 *   `clearConfigMigrations()` 清掉之后**没有任何代码会再跑一次本文件的顶层**，
 *   于是编排手里空表 ⇒ 一条迁移都不跑（1.41 本格首版四条用例全被这一条坑到）。 */
registerConfigMigration(NAMESPACE_RENAME_MIGRATION);
registerConfigMigration(NAMESPACE_RENAME_MIGRATION_V8);
registerConfigMigration(NAMESPACE_RENAME_MIGRATION_V9);
registerConfigMigration(NAMESPACE_RENAME_MIGRATION_V10);
registerConfigMigration(NAMESPACE_RENAME_MIGRATION_V11);

/** 读取当前 schema 版本——无标志/非法 → SCHEMA_VERSION_INITIAL */
export function getConfigSchemaVersion(): number {
  const v = inspectConfiguration<number>(SCHEMA_VERSION_KEY).userValue;
  return typeof v === "number" && Number.isFinite(v) ? v : SCHEMA_VERSION_INITIAL;
}

/**
 * 运行所有待执行迁移——version > 当前，升序执行；产出并入统一 batch。
 * 全部通过 → 单次持久化（含变更值 + 版本标志提升到最高目标版本）；任一抛错 → 原子中止（零写零提升）。
 * 返回：true = 本次有待执行迁移且全部通过；false = 无待执行迁移 或 有迁移失败（下次启动重试）。
 */
export async function runPendingConfigMigrations(): Promise<boolean> {
  const current = getConfigSchemaVersion();
  const pending = [..._migrations.values()]
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return false;

  // 🔴 开跑先清「上次文件写失败」标志——它是**模块级一次性状态**，
  //    上一次运行（或上一个用例）留下的 true 会把本次**成功的写**误判成失败。
  takeLastFileWriteFailed();

  const batch: Array<{ key: string; value: unknown }> = [];
  /** 删除请求——**已按迁移声明序记下**，但真正删要等新值写成功（见下方落盘段） */
  const deletes: string[] = [];
  for (const migration of pending) {
    try {
      await migration.migrate({
        setMany: (values) => {
          for (const [key, value] of Object.entries(values)) batch.push({ key, value });
        },
        // E5.8#90：废弃键删除收集（去重）——与写入同原子（见模块头「键删除扩展」）
        deleteMany: (keys) => {
          for (const key of keys) if (!deletes.includes(key)) deletes.push(key);
        },
      });
    } catch (e) {
      // 原子失败——本次不落盘不提升，下次启动全量重试（防版本越过未成功迁移）
      console.error(`[ConfigMigration] "${migration.name}"（v${migration.version}）失败，本次中止（下次启动重试）：`, e);
      return false;
    }
  }
  /* 全部通过 → 落盘。**顺序 = 先写新值、再删旧键**（任一失败 → 不提升，下次启动重试；迁移须幂等）。
   *
   * 🔴 E6#111m／1.41 修正了这里的顺序 —— 原先是「先删后写」，对**改名迁移**是**会丢用户数据**的：
   *   本轴禁区明写「任何清旧键必须在**新值确实写成功之后**」。两次调用各是一次独立持久化，
   *   删成功、写失败（磁盘满 / 权限 / 进程被杀）⇒ **旧键没了、新键没写** ⇒ 用户的设置凭空回默认，
   *   而版本**没有提升**（`return false` 在写失败分支）⇒ 下次启动重跑，但旧值**已经不在盘上了**。
   *   ⚠️ 对 #85/#86/#90 那几步（旧键与新键**同名**或旧键本就是废弃键）这个顺序无差别——
   *     所以这个缺陷在 1.41 之前**一直没有受害者**，是**改名迁移**第一次让它变成真害。
   *   ⚠️ 代价：正常路径多一次「写后删」的序，而不是「删后写」——两条路都是两次持久化，零额外成本。
   *   ⚠️ 残留风险（如实登记）：若「写新值」成功而「删旧键」失败 ⇒ 新旧并存一版（旧键仍在盘上）。
   *     后果 = 设置页多一行陈旧项，**用户的值不丢**（读的是新键）⇒ 下次启动重试删除。
   *     这是**有意的取舍**：宁可留一个可见的残留，不可丢一个看不见的值。 */
  try {
    // 统一写新值 + 版本标志（含零产出——全新安装也标记已迁，见模块头注释）
    batch.push({ key: SCHEMA_VERSION_KEY, value: pending[pending.length - 1].version });
    await setConfigurationValueBatch(batch);
    /* 🔴 1.41：**写「成功」要问一句真的落盘了没**。
     *   `StorageService.write` 对文件写失败是 **catch 掉只 warn**（调用方多半不需要知道），
     *   于是磁盘满 / 权限 / 进程被杀时 `setConfigurationValueBatch` 照样 resolve
     *   ⇒ 编排以为写成了、接着去删旧键 ⇒ **新值没写、旧值被删** = 本轴定义的最重伤害。
     *   `takeLastFileWriteFailed()` 一次性读清那个标志，读到 true 就按「写失败」走同一条中止路径
     *   （不删键、不提升版本、下次启动全量重试）。 */
    if (takeLastFileWriteFailed()) {
      throw new Error("settings.json 文件写入失败（StorageService 已吞掉原始错误，见其 warn 日志）");
    }
    // 新值确已落盘，这才轮到清旧键。删除单独走 resetConfigurationValueBatch
    // （批量复位单次持久化 + 单次 applier，#59 先例）；
    // 对未注册键 applier 读 schema 无 onApply → 零副作用（ConfigurationApplier 容错）。
    if (deletes.length) {
      await resetConfigurationValueBatch(deletes);
      /* 🔴 同理：删旧键那一次的文件写也可能被 `StorageService.write` 吞掉。
       *   这一步失败**不丢数据**（新值已在上一步落盘，只是旧键残留一行），
       *   但版本**不能提升**——否则残留的旧键永久留下，而下次启动不会再来重试删除。
       *   ⇒ 按「本次中止」处理：下次启动重跑（迁移幂等，重跑写同值、再删一次）。 */
      if (takeLastFileWriteFailed()) {
        throw new Error("settings.json 删键落盘失败（StorageService 已吞掉原始错误，见其 warn 日志）");
      }
    }
  } catch (e) {
    console.error("[ConfigMigration] 迁移落盘/删键失败，本次中止（下次启动重试）：", e);
    return false;
  }
  return true;
}
