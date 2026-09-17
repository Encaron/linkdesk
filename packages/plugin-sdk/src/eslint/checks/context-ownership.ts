/**
 * check-context-ownership 腿·**上下文旗子归属判据**（E6#111h · 轮次 1.38）。
 *
 * ── 为什么（本件立项的那条轴）──
 * context key 是**宿主的运行时状态面**：`contextKey.set(name, value)` 把名字**当 map 键**写进
 * `ContextKeyService` 的 `_state`，宿主（和任何人）的命令/菜单 `when` 再按名字去读——
 * **写入时零归属校验、读取时零编译期校验**（`matches()` 就是一次 map 查表）。
 * 插件用宿主的旗子名 ⇒ 宿主菜单/命令面板的显隐条件被外部改写（**两边都不报错**，用户只看到
 * 「菜单项莫名其妙不见了」）；插件用别人的旗子名 ⇒ 后写者静默胜出。
 * 1.37 实测：官方 18 仓 **23 个**插件旗子不带本仓归属，另有一处 `inputFocus` 是**借共享组件**来的。
 *
 * ── 账分两段（🔴 本腿读的就是这两段，与壳仓 `scripts/gen-host-reserved.mjs` 的账同源）──
 *   · **`contextKeysHostOnly`**（宿主专用 ⇒ 判据① 🔴 红）：宿主内核/壳自己写的状态旗子
 *     （`activeEditor` / `editorCount` / `inputFocus` / `sidebarPosition` / `updateActionable` …）。
 *   · **`contextKeysPublic`**（宿主公开约定面 ⇒ **不判**）：宿主 `when` 读、**写的人是插件**
 *     （今天 = 官方 `settings` 的齿轮菜单 4 个 `setting*`）。它们**事实上已是谁都能设、谁都能读**的
 *     公开约定面（`MenuId` 是开放字符串 ⇒ 第三方可加入 `settingItemGear` 槽）⇒
 *     **第三方设它不判**（1.37 §13.5 裁决：登记 ＋ 出声，不拦）。
 * 🔴 **两段不许合并**：合成一栏 ⇒ 官方 `settings` 拿这 4 个约定面名字当"占用宿主旗子"⇒ **当场假红**
 *   （它恰恰是约定面的正当使用方）——与 1.36「外观账一栏混两空间 ⇒ 官方 theme-defaults 假红」同一种病。
 *
 * ── 两条判据 ──
 *   ① **宿主专用旗子**（🔴 红）：源码字符串字面量 `contextKey.set("<contextKeysHostOnly 中的名字>")`
 *      ⇒ 占用宿主状态面。判据出处 = 1.37 §10.2 ＋ §12.2。
 *   ③ **本仓归属**（🔴 红 · **1.49 收紧**）：`contextKey.set("<name>")` 的 name **不以本仓 `pluginId` ＋ `.` 开头**
 *      ⇒ 改成 `<pluginId>.<你的名字>`（只换第一段、词干零变化）。
 *      ⚠️ 归属段用 **`.`** 而非 `-`：旗子是 **map 键**（`when` 里的标识符），
 *      命令 id / 配置键 / 外观 id 用的都是 `.`——`-` 在 `when` 表达式里会被当成减号。
 *      🕐 **收紧史**：1.38 落地时按轴上排序纪律只判黄（官方仓当时还没改名）；1.49 清账完成后兑现为红。
 *      🔴 **`contextKeysPublic`（约定面）仍然不判**——它**不是**「还没收紧的黄」，是**已裁决的豁免**
 *      （1.46 丙路线：登记 ＋ 出声，不拦；第三方设约定面合法）。收紧只动「不带本仓归属的裸名」，
 *      ⛔ 别把约定面一起收成红（那会让官方 `settings` 当场假红）。
 *
 * ── 🔴 射程（1.37 §15.1 登记的边界，别当成 bug）──
 *   只扫**源码字符串字面量**。三种看不见（**登记为残余边界**，负控 ⑦ 断言它们**不被抓**）：
 *   ① `` contextKey.set(`exp${x}`, 1) `` 模板字符串拼名（名字运行时才成形）；
 *   ② 常量写入（`const K = "..."` 再 `set(K)`）；③ `_state.set` 直写。
 *   ②③ 两项宿主侧已由生成器手工补齐，插件侧两方都扫不到。
 *
 * ── 🔴 分工：判据① 运行时也报（但语义完全不同）──
 * 壳运行时在 `contextKey:set` 的过桥处对宿主专用名**出声 ＋ 放行**（`IpcBridgeHandler/ui.ts`）——
 * 那是**第二道网**，且它**拿不到写入者身份**（IPC 通道不带 pluginId ⇒ 「先者保留」结构上做不到）。
 * ⇒ **保护主力在本腿**：这里能在作者仓里、**带身份**地提前把同一件事报出来。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.contextOwnership`）。⚠️ **fail-closed 不参与豁免**：
 * 拿不到 `pluginId` 说的不是「你的旗子怎么写」，而是「你的身份读不到」——那是工程根的问题。
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePluginIdForCss, type PluginIdSource } from "./plugin-prefix.js";
import { HOST_RESERVED_FILE, loadHostReserved, type HostReservedNames } from "./command-ownership.js";
import { collectFiles, isTestOrMockRel, readSource, relPath, type CheckViolation } from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

/** 判据命中的两种形态（与 `CommandIdCode` / `ConfigKeyCode` 同词表：红 = 占别人的面；黄 = 不带本仓归属） */
export type ContextKeyCode = "host-reserved" | "no-plugin-prefix";

/** 一处不合规站点（探针与腿共用同一份数据） */
export interface ContextKeySite {
  /** 工程相对路径（正斜杠） */
  file: string;
  line: number;
  /** 旗子名 */
  key: string;
  code: ContextKeyCode;
  /** 应改成什么：**只换第一段**（`<pluginId>.` ＋ 原名第一段之后的全部）——词干零变化 */
  suggested: string;
  /** code = host-reserved 时：撞上的那条宿主专用旗子名 */
  reserved?: string;
}

export interface ContextOwnershipReport {
  root: string;
  pluginId: string | null;
  pluginIdSource: PluginIdSource | null;
  pluginIdNote: string | null;
  /** fail-closed：非 null ⇒ 本腿报红（拿不到身份就无从判归属） */
  error: string | null;
  /** 🔴 必须改的（进腿报点）——1.49 收紧后 = 占用宿主专用旗子 ＋ 不带本仓归属 */
  red: ContextKeySite[];
  /** 🟡 建议改的——🔴 **1.49 起恒空**（归属判据已升红）；字段保留只为探针输出形状不塌 */
  yellow: ContextKeySite[];
  /** 🟠 **宿主公开约定面**的写点——**不报点、不拦、不进任何退出码**（登记用：让"谁在设约定面"可见） */
  publicFace: ContextKeySite[];
  /** 扫到的**全部**旗子名（合规 ＋ 不合规，按出现顺序去重）——探针的读数面（口径：名数，非站点数） */
  keys: string[];
  /** 账的加载实况（账没读到 ⇒ 判据① 空转，报告里必须能看出来） */
  hostLedger: { file: string; found: boolean; contextKeysHostOnly: number; contextKeysPublic: number };
  /** 腿报点 = fail-closed ＋ 全部红 */
  violations: CheckViolation[];
  /** 黄灯建议——🔴 **1.49 起恒空**（归属判据已升红）；保留字段＝探针/渲染器的输出形状不变 */
  advisories: CheckViolation[];
}

/**
 * 一个 context key 的裁决（纯函数——单测与探针共用，别在别处再写一份判据）。
 *
 * 🔴 建议名的形状 = **只替换第一段**（`explorerFocus` → `file-tree.explorerFocus`，词干零变化），
 *    与 `judgeCommandId` / `judgeConfigKey` 同形。
 * ⚠️ **约定面（`contextKeysPublic`）在这里返回 null**——它既不是红的，也**不判黄**：
 *    约定面是**名册里已登记的名字**，谁设都合法（1.37 §13.5）；它的写点由 `publicFace` 单独登记。
 */
export function judgeContextKey(
  key: string,
  pluginId: string,
  reserved: HostReservedNames,
): { code: ContextKeyCode; suggested: string; reserved?: string } | null {
  const dot = key.indexOf(".");
  const suggested = `${pluginId}.${dot > 0 ? key.slice(dot + 1) : key}`;
  // ① 宿主专用（比**全等**——保留面是一张逐个列出的名字清单，不是前缀面）
  if (reserved.contextKeysHostOnly.includes(key)) return { code: "host-reserved", suggested, reserved: key };
  // ② 宿主公开约定面 ⇒ **不判**（登记在 publicFace 里，见 run 函数）
  if (reserved.contextKeysPublic.includes(key)) return null;
  // ③ 本仓前缀
  if (!key.startsWith(`${pluginId}.`)) return { code: "no-plugin-prefix", suggested };
  return null;
}

/**
 * 扫描面：源码里 `contextKey.set("<字面量>", …)` 与 `ContextKeyService.setValue("<字面量>", …)`。
 * 🔴 两支**都要扫**：前者是插件侧惯用写法（`contextKey` 是注入的 API 对象），后者是壳侧写法——
 * 同一件事的两张脸，只扫一支 = 漏一半（1.37 §十七 的复现命令就是按这两支取读数的）。
 * ⚠️ `` ` `` 定界符保留，但**分两种**：
 *   · **无插值**的模板（`` set(`myFlag`, 1) ``）= 字面量 ⇒ **扫得到**（能扫到就是收益）。
 *   · **带插值**的（`` set(`exp${x}`, 1) ``）⇒ 名字在运行时才拼出来，**扫不到**——§15.1 登记的残余边界。
 *     实现上由 `(?![\s\S]*?\$\{)` 挡：模板体里出现 `${` 一律不匹配（**不是**匹配出一个
 *     `exp${x}` 这种不存在的名字——那会变成假红，比漏报更坏）。
 */
export const RE_CONTEXT_KEY_SET =
  /(?:contextKey[?.]*\s*\.\s*set[?.]*|ContextKeyService\s*\.\s*setValue)\s*\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|`((?![\s\S]*?\$\{)[^`\n]*)`)/g;

/**
 * 跑本仓 context key 归属判据。返回结构化报告（探针用）＋ 腿报点（`lint.ts` 用）——**同一份实现**。
 */
export function runContextOwnershipCheck(
  root: string,
  reserved: HostReservedNames = loadHostReserved(),
  reservedFile: string = HOST_RESERVED_FILE,
): ContextOwnershipReport {
  const absRoot = resolve(root);
  const resolution = resolvePluginIdForCss(absRoot);
  const violations: CheckViolation[] = [];
  const report: ContextOwnershipReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    pluginIdSource: resolution.source,
    pluginIdNote: resolution.note,
    error: resolution.error,
    red: [],
    yellow: [],
    publicFace: [],
    keys: [],
    hostLedger: {
      file: reservedFile,
      found: existsSync(reservedFile),
      contextKeysHostOnly: reserved.contextKeysHostOnly.length,
      contextKeysPublic: reserved.contextKeysPublic.length,
    },
    violations,
    advisories: [],
  };

  // ── fail-closed（不可豁免：拿不到身份 = 判据①③ 全部无从谈起）──
  if (resolution.error || !resolution.pluginId) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓 pluginId：${resolution.error}。旗子的归属判据以「本仓身份」为唯一前缀来源——读不到它就无从判` +
        `「这个旗子是不是你的」。在插件工程根修好 plugin.json（或显式声明 pluginId），` +
        `别用 disable 注释绕：这是身份问题，不受豁免注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  const prefix = `${pluginId}.`;

  for (const abs of collectFiles(absRoot, [".ts", ".tsx", ".js", ".jsx"])) {
    const rel = relPath(absRoot, abs);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(abs);
    const idx = buildDisableIndex(src, [CHECK_IDS.contextOwnership]);
    for (const m of src.matchAll(RE_CONTEXT_KEY_SET)) {
      const key = m[1] ?? m[2] ?? m[3];
      const line = src.slice(0, m.index ?? 0).split("\n").length;
      if (!report.keys.includes(key)) report.keys.push(key);
      const verdict = judgeContextKey(key, pluginId, reserved);
      // 约定面：**不报点**，只在报告里登记一行（"谁在设约定面"要可见，但谁设都合法）
      if (!verdict && reserved.contextKeysPublic.includes(key)) {
        report.publicFace.push({ file: rel, line, key, code: "no-plugin-prefix", suggested: key });
        continue;
      }
      if (!verdict) continue;
      const message =
        verdict.code === "host-reserved"
          ? `运行时面（源码里 contextKey.set / ContextKeyService.setValue 的字面量）：旗子 "${key}" 是**宿主专用的状态面**` +
            `（保留清单见包内 schemas/host-reserved.json 的 contextKeysHostOnly）。` +
            `占用它 = 改写宿主菜单/命令面板的显隐条件——宿主那条 when 读到的是**你的值**，` +
            `而**两边都不报错**（用户只看到"菜单项莫名其妙不见了"）。` +
            `改法：改成 "${verdict.suggested}"（只换第一段、词干零变化）。`
          : `运行时面（源码里 contextKey.set / ContextKeyService.setValue 的字面量）：旗子 "${key}" 不带本仓归属` +
            `（本插件 pluginId = "${pluginId}"，新旗子应以 "${prefix}" 开头）——旗子是**全局名册的键**：` +
            `同名旗子被两个插件设时后写者静默胜出（壳运行时只出声、不拦——因为旗子是**状态写**，` +
            `后写者覆盖前写者是正常行为）。改成 "${verdict.suggested}"（只换第一段、词干零变化）。`;
      const site: ContextKeySite = {
        file: rel,
        line,
        key,
        code: verdict.code,
        suggested: verdict.suggested,
        ...(verdict.reserved !== undefined ? { reserved: verdict.reserved } : {}),
      };
      if (verdict.code === "host-reserved" || verdict.code === "no-plugin-prefix") {
        if (isDisabled(idx, line, CHECK_IDS.contextOwnership)) continue;
        report.red.push(site);
        violations.push({ file: rel, line, message });
      } else {
        report.yellow.push(site);
        report.advisories.push({ file: rel, line, message });
      }
    }
  }

  return report;
}
