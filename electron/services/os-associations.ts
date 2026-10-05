/**
 * 插件声明的「打开方式」候选 → OS 注册表（**动态半**）——第 5 波 T6 件 2。
 *
 * ── 它解决什么 ──
 * 插件装上后声明了 `.pdf`，用户在资源管理器右键 `.pdf` →「打开方式」里**应该**能看见 LinkDesk；
 * 卸载后这条候选**应该**消失。安装器只能写死一批（静态半 = 随包件声明，见
 * `os-associations-static.generated.ts` / 引导器 `lk-assoc-exts.generated.h`），
 * 用户后装插件带来的类型只能由软件在**装/卸/激活**时同步 ⇒ 本模块。
 *
 * ── 🔴 边界（E24：OS 的主权在用户）──
 *   ① 只写 `HKCU\Software\Classes\<ext>\OpenWithProgids` 里**自家 ProgId 的那一个值**
 *      （写 = `reg add … /v LinkDesk.Document /t REG_NONE`，撤 = `reg delete … /v LinkDesk.Document`）。
 *   ② ⛔ **永不写 `UserChoice`**——默认程序是用户的决定（E15：别的软件抢了默认，壳不抢回来）。
 *   ③ ⛔ 不动扩展名键本身、不动别的程序的候选值（撤的时候只删自家那一个值，不是删 `OpenWithProgids` 键）。
 *   ④ ⛔ **不碰静态清单里的扩展名**——那批由安装器 / `registry-integration.ts` 的「文件关联」开关管，
 *      两边都写就是互相打架（用户关掉「文件关联」后，插件腿又把值写回去 = 开关失效）。
 *   ⑤ 落盘一份「我们写过哪些」——撤的时候只撤写过的（⛔ 不靠猜测反推，避免误删用户/别人的东西）。
 *   ⑥ ⛔ **可执行类永不登记**（T6 判据 ③「exe 永不登记」）——`.exe`/`.msi`/`.dll`/`.lnk` 这类
 *      不是「可编辑的文档」，登记进「打开方式」＝把 LinkDesk 摆成它们的候选。禁列取自生成物
 *      （`DENIED_ASSOC_EXTENSIONS`，与构建期收割侧**同一条**：构建期见了判红，运行期直接跳过）。
 *
 * ── 与「文件关联」总开关的关系（实现决定，写在明面上）──
 *   本模块的生效条件 = `app.osAssociations.followPlugins` **且** ProgId 树已注册
 *   （`progIdRegistered`，来自注册表事实）。后者不是多余条件：用户关掉「文件关联」开关时
 *   `registry-integration` 会删掉 `LinkDesk.Document` 整树，此时若还留着一堆 `OpenWithProgids`
 *   指向一个不存在的 ProgId，资源管理器的「打开方式」列表里就会挂出**僵尸候选**。
 *
 * 选哪些扩展名是**纯函数**（`selectDynamicExtensions`，单测钉住）；写注册表是薄壳（exec 注入）。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { CLS, PROGID, REG, defaultRegExec, type RegExec } from './reg-exec.js';
import { DENIED_ASSOC_EXTENSIONS, STATIC_ASSOC_EXTENSIONS } from './os-associations-static.generated.js';

/** 归一化：去前导点、去空白、小写（与 `FileAssociationService.normalizeExtension` 同口径） */
function normalizeExt(raw: string): string {
  return typeof raw === 'string' ? raw.trim().replace(/^\.+/, '').toLowerCase() : '';
}

/** ⑥ 禁列（可执行类，归一化小写）——模块级建一次；数据源 = 生成物，⛔ 本文件不另抄 */
const DENIED_EXT_SET = new Set<string>(DENIED_ASSOC_EXTENSIONS);

export interface DynamicSelectionInput {
  /** 当前**活跃**插件声明的扩展名（带点不带点都行，内部归一） */
  declared: readonly string[];
  /** 静态清单（默认 = 生成物；测试可注） */
  staticExts?: readonly string[];
  /** 总开关：关 ⇒ 一条都不写（already-写的会被撤，由调用方 diff 出来） */
  followPlugins: boolean;
  /** 稀疏例外表：`{".pdf": false}` = 这一个类型不跟随（v1 无 UI，只有手工改配置能到） */
  overrides?: Readonly<Record<string, boolean>>;
}

/**
 * 纯函数：算出**该写进注册表**的扩展名清单（**带点**小写、字典序）。
 * 规则 = 声明 ∩ 非静态 ∩ 非禁列 ∩ 未被 overrides 关掉，且总开关为开。
 * 输出带点：注册表键是 `…\Classes\.pdf\OpenWithProgids`（**键名带点**，与安装器一致）；
 * 归一化（去点小写）只在比较时用。
 */
export function selectDynamicExtensions(input: DynamicSelectionInput): string[] {
  if (!input.followPlugins) return [];
  const staticSet = new Set((input.staticExts ?? STATIC_ASSOC_EXTENSIONS).map((e) => normalizeExt(e)));
  const overrides = new Map<string, boolean>();
  for (const [k, v] of Object.entries(input.overrides ?? {})) {
    const ext = normalizeExt(k);
    if (ext) overrides.set(ext, v);
  }
  const out = new Set<string>();
  for (const raw of input.declared) {
    const ext = normalizeExt(raw);
    if (!ext) continue;
    if (staticSet.has(ext)) continue; // ④ 静态半的地盘
    if (DENIED_EXT_SET.has(ext)) continue; // ⑥ 可执行类永不登记（判据 ③）
    if (overrides.get(ext) === false) continue; // 例外表
    out.add(`.${ext}`);
  }
  return [...out].sort();
}

/** 状态文件形状（本模块是该文件的唯一 owner） */
interface DynamicState {
  /** 我们写到注册表里的扩展名（**带点**小写——与键名一致） */
  written: string[];
}

/** 读状态（读不到 / 解析失败 = 空——首次运行常态，不是错误） */
export async function readDynamicState(statePath: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8')) as Partial<DynamicState>;
    return Array.isArray(parsed.written) ? parsed.written.filter((e) => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

export interface SyncOptions extends DynamicSelectionInput {
  /** 状态文件绝对路径（`{userData}/os-associations-dynamic.json`；调用方用 fileService 解析） */
  statePath: string;
  /** ProgId 树是否已注册（注册表事实；假 ⇒ 不写候选，并撤掉已写的） */
  progIdRegistered: boolean;
  exec?: RegExec;
}

export interface SyncResult {
  /** 写完后注册表里应有的候选（带点小写、字典序） */
  active: string[];
  added: string[];
  removed: string[];
}
/**
 * 幂等同步：desired 与「我们写过的」求差 → 增/撤，然后落状态。
 * 只在真正有差时调用 reg.exe（装卸 45 条声明时也只写真正新增的那些）。
 */
export async function syncDynamicAssociations(opts: SyncOptions): Promise<SyncResult> {
  const exec = opts.exec ?? defaultRegExec;
  const desired = selectDynamicExtensions({
    declared: opts.declared,
    staticExts: opts.staticExts,
    // ⑤ 生成侧的门：总开关 ＋ ProgId 树在（见文件头「与文件关联总开关的关系」）
    followPlugins: opts.followPlugins && opts.progIdRegistered,
    overrides: opts.overrides,
  });

  const written = await readDynamicState(opts.statePath);
  // 状态文件里的写法统一成「带点小写」规范形再比（旧文件/手改过的写法都能对上）
  const writtenDotted = [...new Set(written.map((e) => `.${normalizeExt(e)}`).filter((e) => e !== '.'))].sort();
  const writtenSet = new Set(writtenDotted);
  const desiredSet = new Set(desired);

  const added = desired.filter((e) => !writtenSet.has(e));
  const removed = writtenDotted.filter((e) => !desiredSet.has(e));

  for (const ext of added) {
    // 写：只加自家那一个值（REG_NONE，与安装器/静态半写法逐字一致）
    await exec([REG.add, `${CLS}\\${ext}\\OpenWithProgids`, REG.v, PROGID, REG.t, 'REG_NONE', REG.f]);
  }
  for (const ext of removed) {
    // 撤：只删自家那一个值（⛔ 不是删 OpenWithProgids 键——别的程序的候选在里面）
    await exec([REG.delete, `${CLS}\\${ext}\\OpenWithProgids`, REG.v, PROGID, REG.f]);
  }

  if (added.length > 0 || removed.length > 0) {
    await writeFile(opts.statePath, JSON.stringify({ written: desired } satisfies DynamicState, null, 2) + '\n', 'utf8');
  }
  return { active: desired, added, removed };
}
