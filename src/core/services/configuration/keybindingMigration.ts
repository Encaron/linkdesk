/**
 * E6#111m／1.41：**用户自定义快捷键迁移** —— 「改名 ＋ 迁移」里最容易漏、也最值钱的一条。
 *
 * 🔴 **为什么它单独立模块**（[11 号任务书 §1.1 ③]）：命令 id 改名后，用户 `keybindings.json` 里
 *   引用的旧 `command` **直接失效**——而它
 *     · **不在 `settings.json`**（`registerConfigMigration` 的 `inspectConfiguration` 够不着它）；
 *     · **不在任何 schema 里**、**没有 enum 校验兜底**；
 *   ⇒ 漏了它就是**静默死键**：用户按惯的键**毫无反应，且没有任何提示**——正是本轴最恨的那种无声失效。
 *
 * ── 形状（三个边界逐条照 [11 §2.3]） ──
 *   ① 文件不存在 ⇒ **零动作**（⛔ 不许新建空文件——建了就是替用户「表达」了一个他没做过的决定）；
 *   ② 命令 id / 旗子未命中映射 ⇒ **原样保留**（⛔ 不许删、不许报错——用户可能引用第三方命令）；
 *   ③ **幂等**：跑第二遍逐字节零变化。
 *
 * ── 原子性（照 `schemaMigrations` 的约定，但机制不同——见下） ──
 *   `settings.json` 那边的原子靠「编排统一落盘 ＋ 抛错则不落盘」；本模块**没有编排层可借**
 *   （它写的是另一个文件）⇒ **自己保证原子**，两条：
 *     · **先落盘、后提升版本**：本模块落盘失败（`writeFile` 抛）⇒ 抛 ⇒ `schemaMigrations` 整批中止
 *       ⇒ **版本不提升**（下次启动重试，旧名还在，值不丢）；
 *     · **落盘前重读**（下一段）——防覆盖窗口内别人的改动。
 *   ⚠️ 不采用「临时文件 + rename」：`FileService` 今天没有 `rename` 导出（只有 read / write / exists /
 *     createDir / copy / remove / watch），而它**不该**为这一个消费者扩 preload 契约（那是一次 IPC 面变更）。
 *     剩下的「写坏一半」窗口由「落盘前重读 ＋ 版本不提升」兜——真写坏了，用户手上是半截 JSON，
 *     `KeybindingRegistry` 读它会走它**既有**的 `catch` 分支（warn ＋ 用出厂默认），不会崩。
 *
 * ── 🔴 写盘前的最后一道门：**落盘前重读**（`readUserKeybindingsFile`） ──
 *   「读 → 改 → 写」之间隔着 `await`，而文件有 watcher（用户/别的工具可能在这中间改了它）。
 *   ⇒ 写盘前**再读一次**，若与读到的原文逐字节不同 ⇒ **本次放弃、抛**（宁可下次启动再来，也不覆盖别人的改动）。
 *   ⚠️ 这条不是理论：`schemaMigrations` 那批写的是**内存 cache**（`getUserCache()` 是 live 引用），
 *     天然没有这个问题；**本模块是唯一写外部文件的一处**，所以这道门只有这里需要。
 */
import { exists, readFile, writeFile, joinPath, appDataDir } from "../../services/files/FileService";
import { settingNewToOld } from "./renameMigrations";

const KEYBINDINGS_FILENAME = "keybindings.json";

/** `keybindings.json` 的单条形状——与 `KeybindingRegistry/persistence.ts` 的读写契约逐字一致 */
interface UserKeybinding {
  command: string;
  key: string;
  when?: string;
  [extra: string]: unknown;
}

export interface KeybindingMergeInput {
  /** 命令 id 映射：旧 → 新 */
  command: Record<string, string>;
  /** 上下文旗子映射：旧 → 新 */
  flag: Record<string, string>;
  /**
   * 设置键**反向**映射：新 → 旧（**只有 `when` 子句里可能内嵌设置键名时才需要**）。
   * 由 `renameMigrations.settingNewToOld()` 从同一份数据派生，见那边注释。
   */
  settingNewToOld: Record<string, string>;
}

/**
 * 纯函数：把一份用户键位按映射表改写——**只算不写**（可直测，测试无需文件系统）。
 *
 * 三件事：
 *   ① 顶层 `command` 字段：命中 `command` 映射 ⇒ 改写；
 *   ② `when` 子句里的旗子名：按**词边界**整体替换（`!inputFocus` / `explorerFocus && ...`）；
 *   ③ `when` 子句里的**设置键名**（`settingKey == "explorer."` 形态）：先按旗子表、再按设置键名。
 *
 * 🔴 **未命中一律原样**（边界 ②）：`command` 不认识 ⇒ 整条不动；`when` 里换不出东西 ⇒ 原字符串不动。
 *
 * ⚠️ `when` 的替换用**词边界**（`(?<![\w.-])…(?![\w.-])`）而不是裸 `\b`：
 *   本仓实测的坑（CSS 系列 `css-rename-round-toolkit` §3）——JS 里 `-` 与 `.` 都不是词字符，
 *   `\binputFocus\b` 会命中在 `file-tree.inputFocus` 中间，把已经改好的名字再改一遍。
 */
export function mergeKeybindingEntries(
  entries: readonly UserKeybinding[],
  maps: KeybindingMergeInput,
): UserKeybinding[] {
  return entries.map((entry) => {
    const next: UserKeybinding = { ...entry };
    const mappedCommand = maps.command[entry.command];
    if (mappedCommand) next.command = mappedCommand;
    if (typeof entry.when === "string" && entry.when.length > 0) {
      next.when = rewriteWhenClause(entry.when, maps);
    }
    return next;
  });
}

/** `when` 子句改写——旗子 + 设置键名，两种名都按词边界整体替换 */
function rewriteWhenClause(when: string, maps: KeybindingMergeInput): string {
  let out = when;
  // 旗子：旧 → 新（先做，因为旗子名比设置键名短，先长后短会互相吃；两张表的键集在本轴实测无交集）
  for (const [from, to] of Object.entries(maps.flag)) out = replaceWholeWord(out, from, to);
  // 设置键名：**新 → 旧**（用户在 `when` 里写的是**旧键名**，要把它换成…）
  // 🔴 方向说明：`when` 子句里出现的是**用户当年写的旧键名**；改名后设置插件的 `settingKey` 值
  //   会变成新名 ⇒ 要让旧 `when` 继续匹配，得把 `when` 里的**旧名改成新名**。
  //   而 `settingNewToOld` 给的是「新 → 旧」——所以这里用它的**反向**（旧的键 → 新的值）。
  for (const [newName, oldName] of Object.entries(maps.settingNewToOld)) {
    out = replaceWholeWord(out, oldName, newName);
  }
  return out;
}

/** 整词替换——`-` 与 `.` 都算词内容（见上方注释：裸 `\b` 会在 `file-tree.inputFocus` 中间命中） */
function replaceWholeWord(text: string, from: string, to: string): string {
  if (from === to || from.length === 0) return text;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, "g"), to);
}

/** `keybindings.json` 的完整路径——与 `KeybindingRegistry/persistence.ts` 同一条算法（appDataDir + 文件名）。
 *  ⚠️ 模块内部用（`readUserKeybindingsFile`）——**不导出**：外部没有第二个调用点，
 *     导出只会变成 knip 账上的死接口，还会让「归一逻辑只有一个入口」这条看着像有两处。 */
async function getUserKeybindingsPath(): Promise<string | null> {
  const dir = await appDataDir();
  if (!dir) return null;
  return joinPath(dir, KEYBINDINGS_FILENAME);
}

/** 落盘前重读用的原文快照——`null` = 文件不存在（模块内部用，理由同上） */
async function readUserKeybindingsFile(): Promise<string | null> {
  const p = await getUserKeybindingsPath();
  if (!p) return null;
  if (!(await exists(p))) return null;
  return readFile(p);
}

export interface KeybindingMigrationResult {
  /** 是否真的写过盘——**判据 ③「零动作」直接读它**，别去比字节（同值重写的字节是相同的） */
  wrote: boolean;
  /** 实际改写的条目数（诊断用；0 ＝ 命中 0 条） */
  changed: number;
}

/**
 * 用户自定义快捷键迁移——**幂等 / presence 自查 / 未命中保留 / 文件不存在零动作 / 原子**。
 *
 * 调用点 = `schemaMigrations` 的版本 7 那一步（与配置键迁移**同一批、同一原子约定**：
 *   本函数抛 ⇒ 那一步抛 ⇒ `runPendingConfigMigrations` 整批中止 ⇒ **版本不提升**）。
 */
export async function migrateUserKeybindings(
  maps: KeybindingMergeInput,
): Promise<KeybindingMigrationResult> {
  // 边界 ①：文件不存在 ⇒ 零动作（**不新建**）——`readUserKeybindingsFile` 返回 null 即「没有这个文件」
  const before = await readUserKeybindingsFile();
  if (before === null) return { wrote: false, changed: 0 };

  const filePath = await getUserKeybindingsPath();
  if (!filePath) return { wrote: false, changed: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(before);
  } catch (e) {
    // 用户手改坏了 JSON ⇒ **不碰**（这是「未命中一律原样保留」的极端形态：连结构都读不懂就别动）
    console.warn("[keybindingMigration] keybindings.json 不是合法 JSON，本次不动它:", e);
    return { wrote: false, changed: 0 };
  }
  if (!Array.isArray(parsed)) return { wrote: false, changed: 0 };

  const merged = mergeKeybindingEntries(parsed as UserKeybinding[], maps);
  const changed = merged.filter((e, i) => {
    const prev = parsed![i] as UserKeybinding;
    return e.command !== prev.command || e.when !== prev.when;
  }).length;

  // 边界 ③ 幂等 / presence 自查：零命中 ⇒ **一个字节都不写**（不是「写同值」——是**没写过**）
  if (changed === 0) return { wrote: false, changed: 0 };

  // 落盘前重读——「读→改→写」之间隔着 await，且这个文件有 watcher（见文件头）
  const current = await readFile(filePath);
  if (current !== before) {
    throw new Error("[keybindingMigration] keybindings.json 在迁移窗口内被改动——本次放弃（下次启动重试）");
  }

  // 写盘——走 FileService（与 KeybindingRegistry/persistence.ts 的 saveUserKeybindings 同一条通道），
  // 保持既有 2 空格缩进形态。⚠️ 不用「临时文件 + rename」：FileService 今天没有 rename 导出，
  // 而窗口内「写坏一半」的兜底另有其人——落盘前重读（上一段）＋ 版本号不提升（失败即重试）。
  await writeFile(filePath, JSON.stringify(merged, null, 2));
  return { wrote: true, changed };
}

/**
 * 装配给 `schemaMigrations` 的地图（把三张表拼成一个入参）。
 * ⚠️ 每次调用**重新派生**（不缓存）——表是纯数据，缓存只会制造「改了表但迁移还用旧表」的假绿窗口。
 */
export function keybindingMergeInput(
  command: Record<string, string>,
  flag: Record<string, string>,
): KeybindingMergeInput {
  return { command, flag, settingNewToOld: settingNewToOld() };
}
