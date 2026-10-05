/**
 * 「能力落位」六条门禁腿（R1–R6）的**共用扫描底座**——判据出处
 * `docs/04-软件更新/已落地/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三。
 *
 * ── 为什么要有这个文件（先例是血）──
 *   六条腿里有四条（R1/R2/R3/R4）扫的是**同一片源树**（插件容器 `src/**` ＋ 壳 `src/**`）、
 *   判的是**同一类形状**（「谁的命令 id」「宿主声明被谁渲染」）。各写一份 = 六把尺子必然漂移
 *   ——同一只仓在一把尺里在场、在另一把里缺席，而没有任何灯会亮（见 memory `two-rulers-one-caliber`）。
 *   故仓发现、源码枚举、字面量提取、形状判据、例外账本判定，**各只在这里写一遍**。
 *
 * ── 三条边界（写在这里免得下一棒四处找）──
 *   ① **测试不算生产**：`__tests__/`、`__mocks__/`、`*.test.*`、`*.spec.*` 一律不进域
 *      （测试里出现别的仓的 id 是**夹具**，正是硬约束 21 要求写虚构值的地方，不是耦合）。
 *   ② **注释不算代码**：一律先走 `stripComments`（字符串感知，保留换行 ⇒ 行号不漂）。
 *      🔴 这不是洁癖——实测：纠正案 4.5 之后，插件里 `OverlayPortal` 的**全部**出现都只剩注释
 *      （「原为…迁入」「整段删除」），不剥注释的判据会把**已修好的**地方重新报红。
 *   ③ **第三方仓只报告不判红**：官方名单唯一真相源 = `sync-plugin-agents.mjs` 的 FACTS 表
 *      （经 `plugin-repos.mjs`）；不在表里的仓按第三方处置——如实报出，⛔ 不代改、⛔ 不判红
 *      （硬约束 10 的同一条道理：跳过一律按现场数据认，⛔ 不写名单）。
 */
import fs from "node:fs";
import path from "node:path";
import { discoverPluginRepos, officialPluginIds, readManifestJson } from "./plugin-repos.mjs";
import { stripComments } from "./strip-comments.mjs";

/** 下钻时跳过的目录（构建产物/依赖/版本库）——与 `plugin-repos.mjs` 的口径一致。 */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "release", "resources", "scratch"]);

/** 测试/夹具路径：不进任何生产域。 */
export const TEST_PATH_RE = /(^|[\\/])(__tests__|__mocks__)([\\/]|$)|\.(test|spec)\.[cm]?[jt]sx?$/;

/** 壳的「仓 id」——出现在 ownership 里时，表示「这条命令 id 归壳」。 */
export const SHELL_ID = "@shell";

/** 插件容器默认位（与 `audit-plugin-commands.mjs` / `audit-plugin-tests.mjs` 同款，可被环境变量覆盖）。 */
const DEFAULT_CONTAINER = "E:/linkdesk-plugins";

/**
 * 容器落点：`node <腿> [容器目录]` ＞ `LINKDESK_PLUGIN_CONTAINER` ＞ 默认位。
 * 🔴 容器**可以不在场**——本组腿必须能在没有插件容器的机器上跑（先例
 * `check-gate-health.mjs` 的 EXEMPT 注释：check 必须能在没有插件容器的机器上跑）。
 * 不在场时**插件域跳过并高声说明**（⛔ 不静默），壳域照常判。
 * @returns {{dir: string, present: boolean}}
 */
export function resolveContainer(argv = process.argv.slice(2), env = process.env) {
  const fromArgv = argv.find((a) => !a.startsWith("--"));
  const dir = fromArgv || env.LINKDESK_PLUGIN_CONTAINER || DEFAULT_CONTAINER;
  let present = false;
  try {
    present = fs.statSync(dir).isDirectory();
  } catch {
    present = false;
  }
  return { dir, present };
}

/**
 * 递归枚举源码文件（`src/**` 的非测试 `.ts/.tsx`）。
 * @param {string} root
 * @returns {string[]} 绝对路径，字典序
 */
export function listSourceFiles(root, exts = [".ts", ".tsx"]) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (exts.some((x) => e.name.endsWith(x)) && !TEST_PATH_RE.test(p)) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out.sort();
}

/** 容器里 `src/` 存在的官方仓（`{id, dir, official}`）。容器不在场 ⇒ 空表。 */
export function loadOfficialRepos(container, agentsScriptPath) {
  if (!container) return [];
  const official = officialPluginIds(agentsScriptPath);
  return discoverPluginRepos(container)
    .filter((r) => fs.existsSync(path.join(r.dir, "src")))
    .map((r) => ({ ...r, official: official ? official.has(r.id) : true }));
}

/**
 * 字符串字面量扫描（**先剥注释再打**）——返回 `{value, index, line}`。
 * 状态机过 `'` / `"` / `` ` ``（模板串算字面量：它同样会送去 `executeCommand`）。
 *
 * ⚠️ 与 `check-manual-surface.mjs` 里那份**不是**同一件事：那份要的是「字面量内偏移折回源行列」
 *   （为运行期文案里的工单编号定位）；这里只要「值 ＋ 起始行」（为 id 比对）。两份都**字符串感知**，
 *   共用的前提是 `strip-comments.mjs` 这一处实现——⛔ 别在这里再写一份注释剥离。
 * @param {string} src 已 `stripComments` 过的源码
 */
export function scanLiterals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const startLine = line;
      let j = i + 1;
      let val = "";
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") {
          val += src[j + 1] ?? "";
          if (src[j + 1] === "\n") line++;
          j += 2;
          continue;
        }
        if (d === quote) break;
        if (d === "\n") line++;
        val += d;
        j++;
      }
      out.push({ value: val, index: i, line: startLine });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/** 读文件 → 剥注释（读不到 ⇒ `null`，调用方按「跳过并报告」处理，⛔ 不静默当干净）。 */
export function readStripped(absPath) {
  try {
    return stripComments(fs.readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}

/** 命令 id 形状（`段.段`，允许 `-`/`_`；`when` 旗子这类无点串天然落选）。 */
const COMMAND_ID_RE = /^[A-Za-z][\w-]*\.[\w.-]+$/;

/**
 * 本仓源码里**注册过的**命令 id（运行期面）。
 *
 * 为什么要认别名：注册 API 在真身里**不总是以 `registerCommand(` 出现**——实测
 * `marketplace` 是 `const reg = lk().commands?.registerCommand;` 之后 `reg("marketplace.enable", …)`。
 * 只认 `registerCommand("…")` 一种写法 ⇒ 那 5 条注册命令全被判「查无此命令」= **假红**
 * （门禁的第一杀手是假红：假红一多，真红就没人看了）。
 *
 * 三条采集形状（并集）：
 *   ① 直接调用：`registerCommand("id"` / `registerShellLocalCommand("id"` / 任何 callee 含 `register` 的调用
 *      （`registerItems("editorContext", …)` 这类首参不是 id 形状 ⇒ 由 `COMMAND_ID_RE` 挡掉）；
 *   ② **别名调用**：`const X = …registerCommand` ⟹ `X("id"`；
 *   ③ **解构别名**：`const { registerCommand: X } = …` ⟹ `X("id"`。
 * @returns {Set<string>}
 */
function collectRegisteredIds(src) {
  const ids = new Set();
  const aliases = new Set();
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*registerCommand\b/g)) aliases.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{\s*[^}]*\bregisterCommand\s*:\s*(\w+)[^}]*\}/g)) aliases.add(m[1]);
  const callee = (name) => new RegExp(`\\b${name}\\s*\\(\\s*"([^"]+)"`, "g");
  for (const m of src.matchAll(/\b(\w*[Rr]egister\w*)\s*\(\s*"([^"]+)"/g)) if (COMMAND_ID_RE.test(m[2])) ids.add(m[2]);
  for (const a of aliases) for (const m of src.matchAll(callee(a))) if (COMMAND_ID_RE.test(m[1])) ids.add(m[1]);
  return ids;
}

/**
 * 命令 id 归属表：`Map<命令 id, Set<仓 id>>`。
 *
 * 两个来源**并集**（缺任一都会漏）：
 *   ① `plugin.json` 的 `contributes.commands[].id`（声明面）；
 *   ② 本仓 `src/**` 里注册调用的字面量（运行期面——file-tree 的 `file-tree.openWith` 兼容转发
 *      就只活在这一层，声明面里根本没有它；别名写法见 `collectRegisteredIds`）。
 *
 * 🔴 **只收插件仓，⛔ 不收壳**：插件调用宿主命令（`workbench.action.openWith` 一族）是**正解**而非耦合
 *   ——壳侧命令若也算「外仓」，正解会被自己的尺子打红（这是本表设计上最容易写反的一处）。
 * @param {{id: string, dir: string}[]} repos
 */
export function buildCommandOwnership(repos) {
  const own = new Map();
  const add = (id, repoId) => {
    if (typeof id !== "string" || !id) return;
    if (!own.has(id)) own.set(id, new Set());
    own.get(id).add(repoId);
  };
  for (const r of repos) {
    const m = readManifestJson(path.join(r.dir, "plugin.json"));
    if (m.ok) {
      const cmds = m.manifest?.contributes?.commands;
      const list = Array.isArray(cmds) ? cmds : [];
      for (const c of list) add(c?.id, r.id);
    }
    for (const f of listSourceFiles(path.join(r.dir, "src"))) {
      const src = readStripped(f);
      if (src === null) continue;
      for (const id of collectRegisteredIds(src)) add(id, r.id);
    }
  }
  return own;
}

/**
 * 壳「认识」的命令 id 集合（宿主命令面）——壳 `src/**` 里出现过的形态：
 *   ① 命令描述符 `id: "<id>"`（`registerCommand(APP_PLUGIN_ID, { id: … })` 一族）；
 *   ② **常量形** `export const OPEN_AI_MANUAL_COMMAND_ID = "app.openAiManual"` ＋ `id: OPEN_AI_MANUAL_COMMAND_ID`
 *      （实测壳里真有这一处；不认它 ⇒ 壳自己的帮助菜单项会被判「查无此命令」= **假红**）；
 *   ③ `registerCommand("<id>")`；
 *   ④ **映射表键形** `"<id>": value`——壳里真有「命令 id 当键的注册表」：`panelCommands.ts` 的
 *      `PANEL_POSITION_EDGES` / `PANEL_ALIGN_VALUES` 八条命令由 `Object.entries(...)` **循环注册**，
 *      字面量只以**键**存在（不认它 ⇒ 面板右键那 8 项全假红）。
 *
 * ⚠️ 收紧与放宽的两处取舍（都会在 R3 头注里如实登记）：
 *   · **收紧**：①②④ 只在**本文件出现 `registerCommand(`** 时收——免得把配置文件里的设置键
 *     （`"editor.autoSave": {…}`）也算成命令；
 *   · **放宽**：循环注册的命令在静态面**收不干净**（④ 只是把已知的键表捞回来）⇒ 壳域允许漏报，
 *     漏的那部分由 R3 的**运行期半条**（dev 构建 `executeCommand` 遇未注册命令喊 `console.error`）兜底。
 */
export function collectShellCommandIds(shellSrcDir) {
  const sources = [];
  for (const f of listSourceFiles(shellSrcDir)) {
    const src = readStripped(f);
    if (src !== null) sources.push(src);
  }
  return collectShellCommandIdsFromSources(sources);
}

/**
 * 上条的**纯函数**部分（自测注假源码用；IO 由 `collectShellCommandIds` 负责）。
 * @param {string[]} sources 已剥注释的壳源码
 * @returns {Set<string>}
 */
export function collectShellCommandIdsFromSources(sources) {
  const ids = new Set();
  // ⓪ **壳命令常量表的值**（`shellCommands.ts` 的 `SHELL_COMMANDS = { openWith: "workbench.action.openWith" }`）
  //    ——注册点写作 `id: SHELL_COMMANDS.openWith`（**成员表达式**，静态拿不到字面量），
  //    故必须**先收表值**，否则「打开方式」这条宿主命令会被判「查无此命令」= 假红。
  //    这张表同时是 R5 的判据对象（与 SDK 镜像逐字对账）。
  for (const src of sources) {
    const table = src.match(/SHELL_COMMANDS\s*=\s*\{([\s\S]*?)\}\s*as const/);
    if (!table) continue;
    for (const m of table[1].matchAll(/["']?[\w$]+["']?\s*:\s*"([^"]+)"/g)) if (COMMAND_ID_RE.test(m[1])) ids.add(m[1]);
  }
  for (const src of sources) {
    if (!/\bregisterCommand\s*\(/.test(src)) continue;
    const consts = new Map();
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]+)"/g)) {
      if (COMMAND_ID_RE.test(m[2])) consts.set(m[1], m[2]);
    }
    for (const m of src.matchAll(/\bid:\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))/g)) {
      const id = m[1] ?? consts.get(m[2]);
      if (id && COMMAND_ID_RE.test(id)) ids.add(id);
    }
    for (const m of src.matchAll(/\bregisterCommand\s*\(\s*"([^"]+)"/g)) ids.add(m[1]);
    for (const m of src.matchAll(/["']([A-Za-z][\w-]*\.[\w.-]+)["']\s*:/g)) ids.add(m[1]);
  }
  return ids;
}

/**
 * 菜单/快捷键**引用面**（R3 的输入）——两个来源：
 *   ① **声明面**：`plugin.json` 的 `contributes.menus.*[].command`（**递归 `children`**：壳里真有
 *      「`command: ""` ＋ `children`」的分组头形状，不递归就漏掉整棵子树）＋ `contributes.keybindings[].command`；
 *   ② **源码面**：`src/**` 里的 `command: "…"` 字面量（`registerItems(slot, …, [{command}])` 形状）。
 *
 * `id: ""` **不进表**——它是分组头（成员在 `children` 里），不是「指向某条命令的项」。
 * 声明面里「空 id ＋ 无 `children` 键」另算一类（`kind: "empty-menu-item"`：空壳分组头 = 死项）。
 *
 * @returns {{id: string, kind: string, rel: string, line: number}[]}
 */
export function collectManifestRefs(manifest, fileRel = "plugin.json") {
  const out = [];
  const push = (id, kind, line) => out.push({ id, kind, rel: fileRel, line });
  const menus = manifest?.contributes?.menus;
  const walk = (item) => {
    if (!item || typeof item !== "object") return;
    const id = typeof item.command === "string" ? item.command : "";
    const hasChildren = Array.isArray(item.children);
    if (id) push(id, "menu", 0);
    else if (!hasChildren) push("", "empty-menu-item", 0);
    if (hasChildren) for (const c of item.children) walk(c);
  };
  for (const group of Object.values(menus && typeof menus === "object" ? menus : {})) {
    for (const item of Array.isArray(group) ? group : []) walk(item);
  }
  const kbs = manifest?.contributes?.keybindings;
  for (const kb of Array.isArray(kbs) ? kbs : []) {
    if (kb && typeof kb.command === "string" && kb.command) push(kb.command, "keybinding", 0);
  }
  return out;
}

/**
 * 源码面的 `command: "<id>"` 引用（`registerItems` 项 / 键位表项——壳 `shellKeybindings.ts` 即此形）。
 *
 * ⚠️ `id: ""`（分组头）**不进表**：源码面**看不见 `children`**（它是调用参数里的另一个属性，
 * 与 `command` 之间隔着几十行注释），于是「有意分组头」与「空壳死项」在这一面**分不开** ⇒
 * 分不开就不判（判了就全是假红——壳里 7 处分组头会当场全红）。空 id 的判定只做在**清单面**
 * （`collectManifestRefs`，那里 `children` 就在同一个对象里）。
 */
export function collectSourceCommandRefs(repoId, files) {
  const out = [];
  for (const f of files) {
    for (const m of f.text.matchAll(/\bcommand:\s*"([^"]*)"/g)) {
      if (!m[1]) continue;
      out.push({ id: m[1], kind: "menu", repo: repoId, rel: f.rel, line: lineOf(f.text, m.index) });
    }
  }
  return out;
}

/** dev 预览/样本目录（`src/pool/dev/**`）——**fixture 扮演壳**，不是生产面（R3 用，见其头注边界④）。 */
export const SAMPLE_PATH_RE = /(^|[\\/])pool[\\/]dev([\\/]|$)/;

/** 1 起行号（在已剥注释文本上按偏移数换行——剥注释保留换行 ⇒ 与源文件行号一致）。 */
export function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

/* ─────────────────── 形状判据：宿主声明 × 自绘弹层（R2/R4 共用一份） ─────────────────── */

/** 「我自己画了一个浮层」——共享件 `OverlayPortal` 或自建 `position:fixed` 弹层。 */
export const OVERLAY_RE = /OverlayPortal|position:\s*["']?fixed|position:\s*fixed/;

/**
 * 「我在读宿主声明（清单/关联表）」。⚠️ 刻意**不含** `pluginManager.install/uninstall/enable`
 * 一族——那是**调用宿主动作**（任何插件都该能做），不是**读声明来自己画 UI**；
 * 混进来会把「市场插件能装卸插件」判成住错层（市场插件本来就该干这个）。
 */
const HOST_DECL_RE =
  /listHandlersFor|plugins\.listAll|pluginManager\.list\b|getCompatibility|contributes\.fileAssociations/;

/** 插件 import 壳内部路径——插件只许经 `@linkdesk/ui` / `@linkdesk/plugin-sdk` / `window.linkdesk`。 */
export const SHELL_INTERNAL_IMPORT_RE = /from\s+["']@\/core|from\s+["']@\/components\/shared|from\s+["']@src\//;

/**
 * 逐文件跑「**自绘浮层 × 宿主声明**」形状（R2 判据① ＋ R4 判据①② 共用**一份**）。
 *
 * 为什么是**同文件**而不是同插件：住错层的形状是「**一个组件**既去读宿主声明、又自己画浮层」
 * ——读在 `model.ts`、画在 `View.tsx` 的分工是正常分层；把两件事都塞进同一个渲染件才是病。
 * （实测依据：纠正案 4.5 之后 settings/marketplace 各有一处「浮层」与「声明读取」，
 *   但**分属不同文件**，按同插件判会把两个**正确**的地方判红。）
 *
 * @param {{rel: string, text: string}[]} files 已剥注释的源码
 * @returns {{rel: string, line: number}[]} 命中文件 ＋ 浮层那行的行号
 */
export function findPlacementShapes(files) {
  const out = [];
  for (const f of files) {
    if (!OVERLAY_RE.test(f.text) || !HOST_DECL_RE.test(f.text)) continue;
    const i = f.text.search(OVERLAY_RE);
    out.push({ rel: f.rel, line: lineOf(f.text, i) });
  }
  return out;
}

/* ─────────────────────────── 例外账本（白名单）判定 ─────────────────────────── */

/**
 * 例外账本（**文件级 ＋ 到期条件必填**）——判据出处：案 05 §三 R1「例外白名单……白名单必须带到期说明」。
 *
 * 形状：`{id, why, until}`——`id` ＝ 被放行的字符串（`"*"` = 整个文件）。
 *
 * 三条纪律（与 `check-gate-health.mjs` 的 EXEMPT 同源）：
 *   ① **只允许文件级**（⛔ 不是按判据内容逐条豁免）；
 *   ② `why` 与 `until` **都必填**——`until` 写「**什么条件下这条该删**」，⛔ 不许写「以后再删」；
 *   ③ **反向核对（防账本腐烂）**：条目今天若**一条违规也没放行** ⇒ 报「过期例外」红
 *      （逼人删条目，而不是让白名单越积越宽——那正是「白名单吃掉门禁」的死法）。
 * @param {{file: string, id: string, why: string, until: string}[]} entries
 * @param {{rel: string, id: string}[]} hits 本次全部原始命中（未扣除例外）
 * @returns {{kept: any[], passed: any[], violations: any[]}}
 */
export function applyExceptions(entries, hits) {
  const violations = [];
  const passed = [];
  const kept = [];
  for (const e of entries) {
    for (const f of ["file", "id", "why", "until"]) {
      if (!e[f] || !String(e[f]).trim()) {
        violations.push({ kind: "exception-incomplete", msg: `例外条目「${e.file}」缺 \`${f}\`——例外必须挂账（文件级 ＋ 理由 ＋ 到期条件）` });
      }
    }
  }
  for (const h of hits) {
    const hit = entries.find((e) => e.file === h.rel && (e.id === "*" || e.id === h.id));
    if (hit) passed.push({ ...h, why: hit.why, until: hit.until });
    else kept.push(h);
  }
  for (const e of entries) {
    if (!hits.some((h) => h.rel === e.file && (e.id === "*" || e.id === h.id))) {
      violations.push({
        kind: "stale-exception",
        msg: `例外条目「${e.file}」（id=${e.id}）今天**一条违规也没放行** ⇒ 过期例外，删掉它（到期条件：${e.until}）`,
      });
    }
  }
  return { kept, passed, violations };
}
