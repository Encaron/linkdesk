/**
 * 机械检查：命名空间矩阵漂移（E6#41 顺带立案，2026-09-12）。
 *
 * ## 为什么需要它
 *
 * `docs/02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md` 是**手维护**的表，而
 * [01-插件API契约.md §二] 把它定为插件作者面的「**唯一真相源**…这里不再手写第二份清单」。
 * 手维护清单 + 无人对账 = 必然过期。实证：2026-09-12 查出该表停在 2026-08-20，自称「契约 40 命名空间」，
 * 而契约实为 **45**——**少 6 个**（`appearance`/`floatingPanelHost`/`panel`/`settings`/`factorySlots`/`app`，
 * 全是 E6 期间新增的作者可见面）、**多 1 个**（`toast`，命名空间已整删，被 `notifications` 取代）；
 * 且三面注入列也各有漏项。人对的入口指向一张过期一个月的表 ⇒ 作者照不存在的面写代码。
 *
 * 这正是本仓库第 ① 类 bug（手维护清单缺对账门禁）的标准修法：**给手维护清单配一个对着真相源的机械门禁**。
 *
 * ## 门禁内容（五条）
 *
 *   1. 契约里每个命名空间，矩阵必须有行（漏登记 = 少）
 *   2. 矩阵每行的命名空间，契约里必须存在（死行 = 多）
 *   3. **三面注入列逐名对真实注入源**——pool / shell / mock 每格的 ✅/—— 都要与源文件一致
 *      （只查行集不够：单元格填错后顺手改统计数字就能悄悄通过，所以必须对源）
 *   4. §2 表尾「覆盖统计」那行的四个数字必须与实际相符，且「唯一缺 X」的 X 必须真的是唯一缺的
 *   5. §1 速览表 A/B/C/D 四行的数字（含「N 域接口」）必须与实际相符
 *
 * ## 三面注入的真相源（不是矩阵自己，也不是契约）
 *
 * | 列 | 真相源 | 取法 |
 * |:--|:--|:--|
 * | pool | `electron/preload-pool.ts` → `poolExposed` | 对象相对深度 1 的键 |
 * | shell | `electron/preload-shell.ts` → `shellExposed` | 同上 |
 * | mock | `src/pool/dev/mockLinkdesk.ts` → `mockLinkdesk` | 同上（`Partial<LinkDeskAPI>`，刻意残缺） |
 * 命名空间清单本身来自 `scripts/lib/contract-parse.mjs`（读 `contracts/linkdesk.d.ts`）——与
 * `generate-api-cheatsheet.mjs` **同一份判定**。⚠️ 同族的 `check-api-contracts.mjs` 读的是源码
 * `src/core/api/linkdesk-api/*.ts`，方向相反（那边管「文档引用的命名空间是否假」，本脚本管
 * 「清单行集与列值是否与真相源一致」），两者互补、不重复。
 *
 * ⚠️ 源文件被重构（如壳侧 exposes 拆成子模块）时本脚本会**响亮报错**要求更新锚点常量，
 * 而不是静默按 0 命中放行——静默放行正是本脚本要消灭的东西。
 *
 * ## 明确不管的事（残余缺口，已登记清单，不是遗忘）
 *
 * - **契约标法 / IPC 通道组 / 备注** 三列是人脑知识（如「D3 已修（#20-b 壳补 openFile）」），
 *   无法机械生成 ⇒ 本脚本不校验其措辞。**这几列的内容错了仍需人读出来。**
 * - ~~§3「IPC channel 双端表」的组数/通道数与 channels.ts 的机械对账尚未做~~
 *   → ✅ **2026-09-13 已做**（见下方 §3 计数器，第六条检查；修 E6 清单 5.1 登记项）。
 *   旧数字「32 组 / 127 通道」停在 2026-08 且**通道总数是平扫下界**（嵌套组与工厂形状漏计）。
 *
 * 用法：node scripts/check-namespace-matrix.mjs（已挂 npm run check）
 *       node scripts/check-namespace-matrix.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有漂移（打印到 stderr）。
 *
 * ── 🔴 E6#109p-b（1.28b）补自测：五条判据几乎全是纯函数 ⇒ 内存夹具即可正负控，零工作区副作用 ──
 *   1.27 对 34 道 `check-*.mjs` 做全量体检时，本脚本被判为「**全批最该补也最好补**」——判据几乎全是纯的
 *   （矩阵解析 / 漏登记 / 死行 / 三面注入列 / 统计数字 / IPC 通道计数），只是原先**散在 main() 里**
 *   与读盘、`process.exit` 搅在一起。现在把纯部件导出（`parseMatrix` / `judge*` / `topLevelKeysFromSource`
 *   / `countIpcChannels`），`--self-test` 只吃**内存字符串夹具**：不读仓库文件、不写任何文件。
 *   ⚠️ 判据语义一字未改——这次是**搬家**不是重写，违规文案 / 输出 / 退出码照旧（自测里逐例实跑断言）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, parseContract } from "./lib/contract-parse.mjs";
import { stripComments } from "./lib/strip-comments.mjs";

const MATRIX = "docs/02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md";
/** §2 表头——表被重构时要响，不能静默 0 命中后「全部通过」 */
const HEADER = "| 命名空间 | 契约域 | 契约标法 | pool | shell | mock |";

/** 三面注入源：锚点 = 暴露对象的起始行；键 = 该对象相对深度 1 的属性名。 */
const SOURCES = {
  pool: { file: "electron/preload-pool.ts", anchor: /const poolExposed = \{/ },
  shell: { file: "electron/preload-shell.ts", anchor: /const shellExposed = \{/ },
  mock: { file: "src/pool/dev/mockLinkdesk.ts", anchor: /const mockLinkdesk = \{/ },
};
/** 域接口真相源（§1「+ N 域接口」） */
const API_DIR = "src/core/api/linkdesk-api";

/** §2 表行：`| 命名空间 | XxxAPI | 契约标法 | pool | shell | mock | IPC 组 | 备注 |` */
const ROW_RE = /^\| (\w+) \| (\w+API) \| [^|]+ \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/;

/** §2 表尾统计行（数字两侧的 `**` 加粗可有可无——排版自由，不该让门禁变脆） */
const STATS_RE =
  /契约 \*{0,2}(\d+)\*{0,2} 命名空间——pool 注入 \*{0,2}(\d+)\*{0,2}(?:（([^）]*)）)?；shell 注入 \*{0,2}(\d+)\*{0,2}；mock 注入 \*{0,2}(\d+)\*{0,2}/;

/** §1 速览表行：`| **A. preload-pool** | 文件 | **39**（…） | 角色 |` */
const OVERVIEW_RE = /^\| \*\*([A-D])\. [^|]+ \| [^|]+ \| \*\*(\d+)\*\*/;
/** §1 里「+ N 域接口」的域接口数（只在 C 行） */
const DOMAIN_IFACE_RE = /\+ (\d+) 域接口/;

/** §3「IPC channel 双端表」表头（组数/通道数写在这一行里） */
const IPC_SECTION_RE = /^## 3\. IPC channel 双端表/;
/** §3 逐组行：`| files | 3 | …`（组名 + 通道数） */
const IPC_ROW_RE = /^\| (\w+) \| (\d+) \|/;

/**
 * 从源文件里抽出暴露对象的顶层键——**读盘那一半**（判定见 `topLevelKeysFromSource`）。
 * 拆开只为自测能喂夹具：算法一字未改。
 */
function exposedKeys({ file, anchor }) {
  return topLevelKeysFromSource(readFileSync(resolve(ROOT, file), "utf-8"), anchor, file);
}

/**
 * 🔵 纯函数：从**源码文本**里抽出暴露对象的顶层键（`exposedKeys` 与 `--self-test` 共用同一份判定）。
 * 用括号深度跟踪而不是缩进匹配——嵌套对象的成员不会被误收，源文件缩进变化也不影响。
 * @param {string} src 源码文本（内存夹具即可）
 * @param {RegExp} anchorRe 暴露对象的起始行锚点
 * @param {string} [label] 报错里指认来源（读盘时传文件名；缺省「源码」）
 * 找不到锚点 ⇒ 抛错（响亮），不返回空集（静默放行）；锚点在但抽不到键 ⇒ 同样抛错（形状变了）。
 */
export function topLevelKeysFromSource(src, anchorRe, label = "源码") {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => anchorRe.test(l));
  if (start === -1) throw new Error(`${label} 里找不到锚点 ${anchorRe}`);
  const keys = [];
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    if (depth === 1) {
      const m = /^ {4}([A-Za-z_]\w*)\s*[,:]/.exec(lines[i]);
      if (m) keys.push(m[1]);
    }
    // 剥行尾注释再数括号——注释里的括号不该影响深度
    for (const ch of lines[i].replace(/\/\/.*$/, "")) {
      if ("({[".includes(ch)) depth++;
      else if (")}]".includes(ch)) depth--;
    }
    if (depth === 0 && i > start) break;
  }
  if (keys.length === 0) throw new Error(`${label} 的暴露对象解析出 0 个键（锚点或形状变了？）`);
  return keys;
}

/** 域接口数 = linkdesk-api/ 下的 `export interface XxxAPI {` 个数（与契约解析独立，双源互证）。 */
function domainInterfaceCount() {
  const dir = resolve(ROOT, API_DIR);
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts")) continue;
    const src = readFileSync(resolve(dir, f), "utf-8");
    n += (src.match(/^export interface \w+API \{/gm) ?? []).length;
  }
  return n;
}


/* ── §3「IPC channel 双端表」机械对账（2026-09-13，修 E6 清单 5.1 登记项）──────────────
 *
 * 手维护的 §3 表头（组数/通道数）与逐组行（组名/通道数）对照 channels.ts 现场计数。
 * 旧数字「32 组 / 127 通道」停在 2026-08：组数已 34、通道总数当时是**平扫下界**（嵌套组与
 * 工厂形状漏计）——第 ① 类 bug（手维护数字无对账门禁）。
 *
 * 计数口径（**递归下降 + 认字符串**，注释先剥）：
 *   · 组 = `IPC` 对象深度 1 的键（值是对象的才算组；值是字符串的属上一个组）。
 *   · 通道 = 组内**任意深度**的字符串字面量叶子（嵌套子对象展开计入顶层组）。
 *   · 动态工厂（`filesystemChanged(watcherId)` 等，IPC 对象外的 export function）**不计入**
 *     ——它们没有固定通道名，矩阵 §3 表脚注如实登记为「另有动态工厂」。
 */

/** 从剥离注释后的 channels.ts 源码数出 [{group, count}]——递归展开嵌套子对象到顶层组。
 *  深度语义：IPC 体内的**组键在 0 层**（值是对象）；叶子字符串在 ≥1 层，计入所在顶层组。
 *  动态工厂（`filesystemChanged(watcherId)` 等，IPC 对象外的 export function）**不计入**
 *  ——它们没有固定通道名（矩阵 §3 表脚注如实登记「另有动态工厂」）。
 *  ⚠️ 入参必须是**已剥注释**的源码（`stripComments` 由调用方负责，本函数是纯的、只吃字符串）；
 *     字符串感知（`"files://read"` 的 `//`、`"files:{nested}"` 的括号都不算结构）由本函数自己保证。 */
export function countIpcChannels(stripped) {
  const marker = stripped.indexOf("export const IPC = {");
  if (marker === -1) throw new Error("channels.ts 未找到 'export const IPC = {'");
  const start = stripped.indexOf("{", marker);
  if (start === -1) throw new Error("channels.ts IPC 对象起点异常");

  // 先定位 IPC 对象的闭合括号（字符串感知）——**只走体内**，`as const` 之后的词不是组
  let d = 0;
  let q = null;
  let ipcEnd = -1;
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i];
    if (q) {
      if (c === "\\") { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) { ipcEnd = i; break; } }
  }
  if (ipcEnd === -1) throw new Error("channels.ts IPC 对象括号不闭合");

  const groups = new Map();
  let depth = 0;          // 0 = IPC 顶层（组键层）；≥1 = 组内/嵌套内
  let group = null;       // 当前所在的顶层组
  let inString = null;
  let buf = "";           // 正在积累的标识符（键）
  let pending = null;     // 深度 0 上刚见过的键（等看到 `{` 才确认是组）

  const flush = () => { if (buf) { pending = buf; } buf = ""; };

  const body = stripped.slice(start + 1, ipcEnd);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === inString) {
        inString = null;
        if (depth >= 1 && group) groups.set(group, (groups.get(group) ?? 0) + 1);
      }
      continue;
    }
    if (ch === "'" || ch === '"') { flush(); inString = ch; continue; }
    if (/\w/.test(ch)) { buf += ch; continue; }
    flush();
    if (ch === "{") {
      if (depth === 0) {
        if (!pending) throw new Error("channels.ts IPC 顶层出现无键对象");
        group = pending;
        groups.set(group, groups.get(group) ?? 0);
        pending = null;
      }
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) group = null;
      continue;
    }
    // 其他分隔符（: , ;）——flush 已处理
  }
  if (depth !== 0) throw new Error("channels.ts IPC 对象括号不闭合");
  return [...groups.entries()].map(([g, c]) => ({ group: g, count: c })).sort((a, b) => a.group.localeCompare(b.group));
}

/** 对 §3 表头数字与逐组行做机械对账——漂移即进 problems。
 *  文档侧的「表头行 + 逐组行」由 `parseMatrix` 抽出（同一份正则，不手抄第二份）。 */
function checkIpcSection(parsed, problems) {
  const headerLine = parsed.ipcHeaderLine;
  if (!headerLine) {
    problems.push({ what: "§3 双端表表头找不到（文档被重构？）", detail: "——", fix: "恢复 `## 3. IPC channel 双端表（N 组 / M 通道）` 表头" });
    return;
  }
  const src = stripComments(readFileSync(resolve(ROOT, "electron", "ipc", "channels.ts"), "utf-8"));
  const counted = countIpcChannels(src);
  const total = counted.reduce((a, b) => a + b.count, 0);
  const m = headerLine.match(/（(\d+) 组 \/ (\d+) 通道）/);
  if (!m) {
    problems.push({ what: "§3 表头数字格式不可解析", detail: headerLine.trim(), fix: "表头写 `（N 组 / M 通道）`（全角括号 + ` 组 / ` 分隔）" });
    return;
  }
  if (Number(m[1]) !== counted.length || Number(m[2]) !== total) {
    problems.push({
      what: `§3 表头数字过期：文档写 ${m[1]} 组 / ${m[2]} 通道，channels.ts 现场计数 = **${counted.length} 组 / ${total} 通道**`,
      detail: `实测各组：${counted.map((g) => `${g.group} ${g.count}`).join("、")}`,
      fix: "用上列实测数字回填 §3 表头（脚本每次 check 自动对账，手改对不上会红）",
    });
  }
  // 逐组行对账
  const docRows = parsed.ipcRows;
  const counterSet = new Set(counted.map((g) => g.group));
  for (const [g, c] of docRows) {
    if (!counterSet.has(g)) {
      problems.push({ what: `§3 表多出组 \`${g}\`（channels.ts 无此组）`, detail: `——`, fix: `删该行或核实组名` });
    } else if (docRows.get(g) !== counted.find((x) => x.group === g).count) {
      problems.push({ what: `§3 组 \`${g}\` 通道数过期：文档 ${c}，实测 ${counted.find((x) => x.group === g).count}`, detail: "——", fix: "按实测回填" });
    }
  }
  for (const g of counterSet) {
    if (!docRows.has(g)) {
      problems.push({ what: `§3 表缺组 \`${g}\`（channels.ts 有此组 ${counted.find((x) => x.group === g).count} 通道）`, detail: "——", fix: "补一行" });
    }
  }
}

/* ── 矩阵文档的解析与五条判据的**纯函数**部分（E6#109p-b · 1.28b 从 main() 里抽出来）────────
 *
 * 原先这段与读盘、`process.exit` 搅在 main() 里，没法单独喂夹具。拆成两层之后：
 *   `parseMatrix(md)` = 文本 → 结构；`judge*()` = 结构 + 真相源 → **违规清单**（只返回，不打印）。
 * ⚠️ 判定语义一字未改（这次是搬家，不是重写）——违规文案与 problems 的拼装仍在 main()，
 *    这样 `--self-test` 才能往内存夹具上**真跑判据并断言实得结果**，而不是只打印「应该红」。
 */

/**
 * 🔵 纯函数：矩阵 markdown 文本 → 解析结构。
 * @returns {{headerFound: boolean,
 *            rows: Array<{name: string, iface: string, cell: {pool: boolean, shell: boolean, mock: boolean}}>,
 *            stats: RegExpExecArray|null, overview: Array<{row: string, claim: number, line: string}>,
 *            ifaceClaim: RegExpExecArray|null, ipcHeaderLine: string|undefined, ipcRows: Map<string, number>}}
 */
export function parseMatrix(md) {
  const lines = md.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const m = ROW_RE.exec(line);
    if (!m) continue;
    rows.push({
      name: m[1],
      iface: m[2],
      cell: { pool: m[3].includes("✅"), shell: m[4].includes("✅"), mock: m[5].includes("✅") },
    });
  }
  const overview = [];
  for (const line of lines) {
    const m = OVERVIEW_RE.exec(line);
    if (m) overview.push({ row: m[1], claim: Number(m[2]), line });
  }
  const ipcRows = new Map();
  for (const l of lines) {
    const rm = l.match(IPC_ROW_RE);
    if (rm) ipcRows.set(rm[1], Number(rm[2]));
  }
  return {
    headerFound: md.includes(HEADER),
    rows,
    stats: STATS_RE.exec(md),
    overview,
    ifaceClaim: DOMAIN_IFACE_RE.exec(md),
    ipcHeaderLine: lines.find((l) => IPC_SECTION_RE.test(l)),
    ipcRows,
  };
}

/** ① 契约有、矩阵缺（漏登记）——返回漏登名单（空 = 合规） */
export function judgeMissing(contractNames, rows) {
  return contractNames.filter((n) => !rows.some((r) => r.name === n));
}

/** ② 矩阵有、契约无（死行）——返回死行名单（空 = 合规） */
export function judgeDead(contractNames, rows) {
  const contractSet = new Set(contractNames);
  return rows.filter((r) => !contractSet.has(r.name)).map((r) => r.name);
}

/**
 * ③ 单面注入列逐名对源——三笔账分开返回（空数组 = 合规）：
 *   · `wrong`   表标 ✅ 但源未注入
 *   · `omitted` 源已注入但表未标 ✅（或整行缺；只算契约里定义的）
 *   · `unknown` 注入源里有契约未定义的命名空间
 */
export function judgeFaceInjection(face, keys, contractNames, rows) {
  const contractSet = new Set(contractNames);
  const actual = new Set(keys);
  const claimed = new Set(rows.filter((r) => r.cell[face]).map((r) => r.name));
  return {
    wrong: rows.filter((r) => r.cell[face] && !actual.has(r.name)).map((r) => r.name),
    omitted: keys.filter((k) => contractSet.has(k) && !claimed.has(k)),
    unknown: keys.filter((k) => !contractSet.has(k)),
  };
}

/**
 * ④ §2 表尾「覆盖统计」——返回不符清单（每条形如「pool 注入：表写 44，实为 45」；空 = 合规）。
 * 四个数字 + 「唯一缺 X」的 X 都要对得上；`poolNote` 里没有「唯一缺」措辞就不判那一条。
 * @param {RegExpExecArray} stats `STATS_RE` 的命中结果
 * @param {Record<string, string[]>} injected 三面真实注入键（pool/shell/mock）
 */
export function judgeStats(stats, contractNames, injected) {
  const contractSet = new Set(contractNames);
  const [, claimTotal, claimPool, poolNote, claimShell, claimMock] = stats;
  const actualCount = (face) => injected[face].filter((k) => contractSet.has(k)).length;
  const mismatches = [];
  if (Number(claimTotal) !== contractNames.length) {
    mismatches.push(`契约命名空间：表写 ${claimTotal}，实为 ${contractNames.length}`);
  }
  for (const [face, claim] of [
    ["pool", claimPool],
    ["shell", claimShell],
    ["mock", claimMock],
  ]) {
    if (Number(claim) !== actualCount(face)) {
      mismatches.push(`${face} 注入：表写 ${claim}，实为 ${actualCount(face)}`);
    }
  }
  if (poolNote) {
    const um = /唯一缺 (\w+)/.exec(poolNote);
    if (um) {
      const notPool = contractNames.filter((n) => !injected.pool.includes(n));
      if (notPool.length !== 1 || notPool[0] !== um[1]) {
        mismatches.push(
          `表写「唯一缺 ${um[1]}」，但实际未注入 pool 的是：[${notPool.join("、") || "无"}]`,
        );
      }
    }
  }
  return mismatches;
}

/**
 * ⑤ §1 速览表 A/B/C/D 四行——返回**有序**的 `{kind:"missing"|"mismatch", row, claim?, real?}`（空 = 合规）。
 * 顺序照旧按 A→D 走（原先就是按行序 push 的，抽出来后不许乱序）。
 */
export function judgeOverview(overview, expect) {
  const out = [];
  for (const row of ["A", "B", "C", "D"]) {
    const got = overview.find((o) => o.row === row);
    if (!got) out.push({ kind: "missing", row });
    else if (got.claim !== expect[row])
      out.push({ kind: "mismatch", row, claim: got.claim, real: expect[row] });
  }
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 自测：**全部内存字符串夹具**——不读仓库文件、不写任何文件（1.27 体检判本脚本「零工作区副作用」就能补）。
 * 每一例都**真跑判据并断言实得结果**（不是只打印「应该红」）：
 * 正控 = 对得上的输入必须绿；负控 = 错得上的输入必须响。
 */
function runSelfTest() {
  const cases = [];
  const push = (kind, tag, ok, detail) => cases.push({ kind, tag, ok, detail });
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const eqCase = (kind, tag, got, want) =>
    push(
      kind,
      tag,
      eq(got, want),
      eq(got, want) ? `实得 ${JSON.stringify(got)} —— 与期望一致` : `实得 ${JSON.stringify(got)}；期望 ${JSON.stringify(want)}`,
    );
  /** 跑一段**应当抛错**的调用，断言错误信息含 needle（不抛 = 静默放行 = 红） */
  const throwCase = (kind, tag, fn, needle) => {
    let msg = null;
    try {
      fn();
    } catch (e) {
      msg = e.message;
    }
    push(
      kind,
      tag,
      msg !== null && msg.includes(needle),
      msg === null ? "没有抛错 —— 静默放行（这正是它不该有的样子）" : `抛错：${msg}`,
    );
  };
  const fmtCounted = (c) => c.map((x) => `${x.group} ${x.count}`).join(" / ") || "（空）";

  // ── 夹具①：迷你「channels.ts」（**未剥注释**：剥注释是调用方 stripComments 的事，函数是纯的） ──
  const IPC_SRC = [
    "export const IPC = {",
    "  window: {",
    '    minimize: "window:minimize",',
    "  },",
    "  files: {",
    '    read: "files://read",',
    '    weird: "files:{nested}",',
    "    nested: {",
    '      deep: "files:nested:deep",',
    "    },",
    "  },",
    "} as const;",
    "",
  ].join("\n");
  const IPC_WANT = [
    { group: "files", count: 3 },
    { group: "window", count: 1 },
  ];

  // ── 夹具②：迷你 preload（锚点 + 深度 1 的 4 空格键 + 嵌套对象 + 行尾注释里的括号） ──
  const PRELOAD_SRC = [
    "import { something } from './somewhere';",
    "const poolExposed = {",
    "    invoke: (a) => a, // 行尾注释里有 } 和 { —— 不该影响深度",
    "    on: {",
    "        inner: (cb) => cb,",
    "    },",
    '    version: "1.0",',
    "    tray: {",
    "        inner2: 2,",
    "    },",
    "};",
    "",
  ].join("\n");
  const PRELOAD_ANCHOR = /const poolExposed = \{/;
  const PRELOAD_WANT = ["invoke", "on", "version", "tray"];

  // ── 夹具③：迷你矩阵（§1 速览 + §2 表 + 表尾统计 + §3 双端表；数字自洽） ──
  const MX = [
    "# 命名空间矩阵（夹具）",
    "",
    "## 1. 速览",
    "| **A. preload-pool** | electron/preload-pool.ts | **1**（…） | 池侧 |",
    "| **B. preload-shell** | electron/preload-shell.ts | **1** | 壳侧 |",
    "| **C. API 契约** | contracts/linkdesk.d.ts | **2**（+ 5 域接口） | 作者面 |",
    "| **D. mock** | src/pool/dev/mockLinkdesk.ts | **1** | 开发壳 |",
    "",
    "## 2. 覆盖矩阵",
    "| 命名空间 | 契约域 | 契约标法 | pool | shell | mock |",
    "|:--|:--|:--|:--|:--|:--|",
    "| app | AppAPI | — | ✅ | —— | —— |",
    "| bridge | BridgeAPI | ? | —— | ✅ | ✅ |",
    "",
    "**覆盖统计**：契约 2 命名空间——pool 注入 1（唯一缺 bridge）；shell 注入 1；mock 注入 1。",
    "",
    "## 3. IPC channel 双端表（2 组 / 3 通道）",
    "| 组 | 通道数 |",
    "| files | 2 |",
    "| window | 1 |",
    "",
  ].join("\n");
  const ROW_WANT = [
    { name: "app", iface: "AppAPI", cell: { pool: true, shell: false, mock: false } },
    { name: "bridge", iface: "BridgeAPI", cell: { pool: false, shell: true, mock: true } },
  ];
  const PLAN = parseMatrix(MX);
  const ROWS = PLAN.rows;
  const statsLine = (bold) =>
    bold
      ? "**覆盖统计**：契约 **2** 命名空间——pool 注入 **1**（唯一缺 bridge）；shell 注入 **1**；mock 注入 **1**。"
      : "覆盖统计：契约 2 命名空间——pool 注入 1（唯一缺 bridge）；shell 注入 1；mock 注入 1。";
  /** 造一条统计行（数字自定） */
  const statsFixture = (total, pool, note, shell, mock) =>
    `覆盖统计：契约 ${total} 命名空间——pool 注入 ${pool}${note ? `（${note}）` : ""}；shell 注入 ${shell}；mock 注入 ${mock}。`;
  const expectMX = { A: 1, B: 1, C: 2, D: 1 };

  /* ── A. countIpcChannels（§3 计数器） ── */
  eqCase(
    "正",
    "正控①：迷你 IPC（2 组）——嵌套子对象展开计入顶层组、字符串里的 `//` 与 `{}` 不算结构",
    countIpcChannels(IPC_SRC),
    IPC_WANT,
  );
  eqCase("正", "正控②：`export const IPC = {};`（空对象）⇒ 0 组、不抛错", countIpcChannels("export const IPC = {};"), []);
  eqCase(
    "正",
    "正控③：空组也算一组（`empty: {}`）——组数不靠通道数推",
    countIpcChannels('export const IPC = {\n  empty: {},\n  window: { a: "x" },\n};'),
    [
      { group: "empty", count: 0 },
      { group: "window", count: 1 },
    ],
  );
  throwCase(
    "负",
    "负控①：括号未闭合 ⇒ 响亮抛错（不静默按 0 通道放行）",
    () => countIpcChannels('export const IPC = {\n  a: {\n    b: "a:b",\n'),
    "不闭合",
  );
  throwCase(
    "负",
    "负控②：找不到 `export const IPC = {` ⇒ 抛错（源被重构了，不许静默 0 命中）",
    () => countIpcChannels("const CHANNELS = {};\n"),
    "未找到",
  );

  /* ── B. topLevelKeysFromSource（三面注入列取键） ── */
  eqCase(
    "正",
    "正控④：锚点 + 深度 1 的 4 空格键；嵌套成员不误收、行尾注释里的括号不改深度",
    topLevelKeysFromSource(PRELOAD_SRC, PRELOAD_ANCHOR),
    PRELOAD_WANT,
  );
  eqCase(
    "正",
    "正控⑤：CRLF 行尾照抽（仓库在 Windows 上，行尾不该改变结论）",
    topLevelKeysFromSource(PRELOAD_SRC.replace(/\n/g, "\r\n"), PRELOAD_ANCHOR),
    PRELOAD_WANT,
  );
  throwCase(
    "负",
    "负控③：锚点找不到 ⇒ 抛错（响亮，不静默返回空集）",
    () => topLevelKeysFromSource(PRELOAD_SRC, /const shellExposed = \{/),
    "找不到锚点",
  );
  throwCase(
    "负",
    "负控④：锚点在但抽不到键（`{}`）⇒ 抛错（暴露对象形状变了）",
    () => topLevelKeysFromSource("const poolExposed = {};\n", PRELOAD_ANCHOR),
    "0 个键",
  );

  /* ── C. parseMatrix（矩阵文本 → 结构） ── */
  eqCase("正", "正控⑥：§2 表行解析——name / iface / 三列 ✅ 与 —— 两种都认", ROWS, ROW_WANT);
  eqCase(
    "正",
    "正控⑦：STATS_RE 命中**加粗**写法（数字两侧 `**`）",
    (PLAN.stats ? [PLAN.stats[1], PLAN.stats[2], PLAN.stats[3], PLAN.stats[4], PLAN.stats[5]] : null),
    ["2", "1", "唯一缺 bridge", "1", "1"],
  );
  eqCase(
    "正",
    "正控⑧：STATS_RE 命中**不加粗**写法（排版自由，不让门禁变脆）",
    (parseMatrix(statsLine(false)).stats ?? []).slice(1),
    ["2", "1", "唯一缺 bridge", "1", "1"],
  );
  eqCase(
    "正",
    "正控⑨：OVERVIEW_RE 命中 §1 速览 A–D 四行（行号 + 数字）",
    PLAN.overview.map((o) => [o.row, o.claim]),
    [["A", 1], ["B", 1], ["C", 2], ["D", 1]],
  );
  eqCase("正", "正控⑩：DOMAIN_IFACE_RE 命中 C 行的「+ 5 域接口」", PLAN.ifaceClaim ? PLAN.ifaceClaim[1] : null, "5");
  eqCase(
    "正",
    "正控⑪：§2 表头在位 ⇒ headerFound=true；表头缺 ⇒ false（早退判据有据可依）",
    [PLAN.headerFound, parseMatrix("| 别的表 | 头 |\n").headerFound],
    [true, false],
  );
  eqCase(
    "正",
    "正控⑫：§3 逐组行进 ipcRows、§2 表行/§1 速览行不被误当组行",
    [...PLAN.ipcRows.entries()],
    [["files", 2], ["window", 1]],
  );

  /* ── D. ① 漏登记 / ② 死行 ── */
  eqCase(
    "负",
    "负控⑤：① 契约比矩阵行多一个 ⇒ 漏登名单 = 那一个",
    judgeMissing(["app", "bridge", "settings"], ROWS),
    ["settings"],
  );
  eqCase("正", "正控⑬：① 矩阵行覆盖全部契约命名空间 ⇒ 漏登名单为空", judgeMissing(["app", "bridge"], ROWS), []);
  eqCase(
    "负",
    "负控⑥：② 矩阵行不在契约集合里 ⇒ 死行名单 = 那一行",
    judgeDead(["app", "bridge"], [...ROWS, { name: "toast", iface: "ToastAPI", cell: { pool: true, shell: true, mock: true } }]),
    ["toast"],
  );
  eqCase(
    "正",
    "正控⑭：② 矩阵行全部存在于契约 ⇒ 死行名单为空",
    [judgeMissing(["app", "bridge"], ROWS), judgeDead(["app", "bridge"], ROWS)],
    [[], []],
  );

  /* ── E. ③ 三面注入列逐名对源 ── */
  eqCase(
    "负",
    "负控⑦：③ 表标 ✅ 但源未注入 ⇒ wrong=[app]（1.27 实测的探针形态）",
    judgeFaceInjection("pool", [], ["app", "bridge"], ROWS),
    { wrong: ["app"], omitted: [], unknown: [] },
  );
  eqCase(
    "负",
    "负控⑧：③ 源已注入但表未标 ✅ ⇒ omitted=[app]",
    judgeFaceInjection("shell", ["app", "bridge"], ["app", "bridge", "settings"], ROWS),
    { wrong: [], omitted: ["app"], unknown: [] },
  );
  eqCase(
    "负",
    "负控⑨：③ 注入源里有契约未定义的命名空间 ⇒ unknown=[ghost]（不许在矩阵里给它补行）",
    judgeFaceInjection("mock", ["ghost"], ["app"], [ROWS[0]]),
    { wrong: [], omitted: [], unknown: ["ghost"] },
  );
  eqCase(
    "正",
    "正控⑮：③ 三面逐名对上（bridge 标 ✅ / 源里真有）⇒ 三笔账全空",
    judgeFaceInjection("shell", ["bridge"], ["app", "bridge"], ROWS),
    { wrong: [], omitted: [], unknown: [] },
  );

  /* ── F. ④ §2 表尾统计数字 ── */
  eqCase(
    "负",
    "负控⑩：④ 「唯一缺 X」写得不对（实际缺两个）⇒ 违规",
    judgeStats(STATS_RE.exec(statsFixture(3, 1, "唯一缺 bridge", 0, 0)), ["app", "bridge", "settings"], {
      pool: ["app"],
      shell: [],
      mock: [],
    }),
    ["表写「唯一缺 bridge」，但实际未注入 pool 的是：[bridge、settings]"],
  );
  eqCase(
    "负",
    "负控⑪：④ 四个数字之一不符（契约 3 写成 2）⇒ 违规（1.27 实测：46 改 45 当场红）",
    judgeStats(STATS_RE.exec(statsFixture(2, 3, "全量", 1, 0)), ["app", "bridge", "settings"], {
      pool: ["app", "bridge", "settings"],
      shell: ["app"],
      mock: [],
    }),
    ["契约命名空间：表写 2，实为 3"],
  );
  eqCase(
    "正",
    "正控⑯：④ 四个数字 + 「唯一缺 X」全对 ⇒ 无误",
    judgeStats(STATS_RE.exec(statsFixture(3, 2, "唯一缺 bridge", 1, 0)), ["app", "bridge", "settings"], {
      pool: ["app", "settings"],
      shell: ["app"],
      mock: [],
    }),
    [],
  );
  eqCase(
    "正",
    "正控⑰：④ poolNote 里没有「唯一缺」措辞 ⇒ 那一条不判（不许自作多情）",
    judgeStats(STATS_RE.exec(statsFixture(3, 3, "全量公开面", 1, 0)), ["app", "bridge", "settings"], {
      pool: ["app", "bridge", "settings"],
      shell: ["app"],
      mock: [],
    }),
    [],
  );

  /* ── G. ⑤ §1 速览表数字 ── */
  eqCase(
    "负",
    "负控⑫：⑤ C 行数字与实际不符 ⇒ mismatch（含表写/实为）",
    judgeOverview(parseMatrix(MX.replace("linkdesk.d.ts | **2**", "linkdesk.d.ts | **3**")).overview, expectMX),
    [{ kind: "mismatch", row: "C", claim: 3, real: 2 }],
  );
  eqCase(
    "负",
    "负控⑬：⑤ 缺 D 行 ⇒ missing（并在 A→D 行序上不串位）",
    judgeOverview(
      parseMatrix(MX.split("\n").filter((l) => !l.startsWith("| **D.")).join("\n")).overview,
      expectMX,
    ),
    [{ kind: "missing", row: "D" }],
  );
  eqCase("正", "正控⑱：⑤ A–D 四行数字全对 ⇒ 无误", judgeOverview(PLAN.overview, expectMX), []);

  /* ── 打印（风格照仓库样板：一例一行） ── */
  let bad = 0;
  for (const c of cases) {
    if (!c.ok) bad++;
    process.stdout.write(`${c.ok ? "✅" : "🔴"} ${c.tag} —— ${c.detail}\n`);
  }
  const pos = cases.filter((c) => c.kind === "正").length;
  const neg = cases.filter((c) => c.kind === "负").length;
  if (pos < neg) {
    bad++;
    process.stdout.write(`🔴 正控 ${pos} < 负控 ${neg} —— 正控条数必须 ≥ 负控（两边都要有样本）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-namespace-matrix self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n` +
          `   正控 ${pos} 例（对得上的必须绿）/ 负控 ${neg} 例（错得上的必须红）；夹具全在内存，零工作区副作用。\n`
      : `\n🔴 check-namespace-matrix self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const { namespaces, interfaces } = parseContract();
  const contractNames = [...namespaces.keys()].sort();

  let injected;
  try {
    injected = Object.fromEntries(
      Object.entries(SOURCES).map(([face, src]) => [face, exposedKeys(src)]),
    );
  } catch (err) {
    console.error(`❌ 读注入源失败：${err.message}`);
    console.error("   修法：源文件重构了暴露对象的写法 ⇒ 更新本脚本 SOURCES 的锚点常量（勿删检查）。");
    process.exit(1);
  }

  const md = readFileSync(resolve(ROOT, MATRIX), "utf-8");
  const parsed = parseMatrix(md);
  if (!parsed.headerFound) {
    console.error(`❌ ${MATRIX} 里找不到 §2 的覆盖矩阵表头。`);
    console.error(`   修法：确认表头仍是「${HEADER}」，或更新本脚本的表头常量（表被重构了）。`);
    process.exit(1);
  }

  const rows = parsed.rows;
  const problems = [];

  // ① 契约有、矩阵缺
  const missing = judgeMissing(contractNames, rows);
  if (missing.length) {
    problems.push({
      what: `矩阵漏登记 ${missing.length} 个契约命名空间`,
      detail: missing.map((n) => `  · \`${n}\`（${namespaces.get(n).iface}）`).join("\n"),
      fix: "在 §2 表里给它们补行（契约域填对应接口，pool/shell/mock 三列据实标 ✅/——）",
    });
  }

  // ② 矩阵有、契约无（死行）
  const dead = judgeDead(contractNames, rows);
  if (dead.length) {
    problems.push({
      what: `矩阵有 ${dead.length} 行指向已不存在的命名空间`,
      detail: dead.join("、"),
      fix: "删行；若是「改了名」而非「删了」，改成新名并保留备注说明沿革",
    });
  }

  // ③ 三面注入列逐名对源
  for (const [face, keys] of Object.entries(injected)) {
    const { wrong, omitted, unknown } = judgeFaceInjection(face, keys, contractNames, rows);
    if (unknown.length) {
      problems.push({
        what: `${face} 注入源里有契约未定义的命名空间`,
        detail: unknown.map((k) => `  · \`${k}\``).join("\n"),
        fix: "要么这是漏进契约的公开面（补契约），要么该从源里删掉——不要在矩阵里给它补行",
      });
    }
    if (wrong.length || omitted.length) {
      const src = SOURCES[face].file;
      problems.push({
        what: `${face} 列与 ${src} 不符`,
        detail: [
          ...wrong.map((n) => `  · 表标 ✅ 但源未注入：\`${n}\``),
          ...omitted.map((n) => `  · 源已注入但表未标 ✅（或整行缺）：\`${n}\``),
        ].join("\n"),
        fix: `按 ${src} 据实改这三格（源是真相源，不是矩阵）`,
      });
    }
  }

  // ④ §2 表尾统计数字
  const stats = parsed.stats;
  if (!stats) {
    problems.push({
      what: "找不到 §2 表尾「覆盖统计」行（或格式已变）",
      detail:
        "期望形如：`**覆盖统计**：契约 45 命名空间——pool 注入 44（唯一缺 bridge）；shell 注入 24；mock 注入 13。`",
      fix: "恢复该行，或更新本脚本的 STATS_RE（统计行被改写了）",
    });
  } else {
    const mismatches = judgeStats(stats, contractNames, injected);
    if (mismatches.length) {
      problems.push({
        what: "§2 表尾统计数字与实际不符",
        detail: mismatches.map((s) => `  · ${s}`).join("\n"),
        fix: "按实际重算并改写统计行（契约数来自 d.ts，三面数 = 真实注入源）",
      });
    }
  }

  // ⑤ §1 速览表数字
  const contractSet = new Set(contractNames);
  const expect = {
    A: injected.pool.filter((k) => contractSet.has(k)).length,
    B: injected.shell.filter((k) => contractSet.has(k)).length,
    C: contractNames.length,
    D: injected.mock.filter((k) => contractSet.has(k)).length,
  };
  for (const o of judgeOverview(parsed.overview, expect)) {
    if (o.kind === "missing") {
      problems.push({
        what: `§1 速览表缺少 ${o.row} 行（或格式已变）`,
        detail: `期望形如：\`| **${o.row}. xxx** | 文件 | **${expect[o.row]}** | 角色 |\``,
        fix: "恢复该行，或更新本脚本的 OVERVIEW_RE（速览表被改写了）",
      });
    } else {
      problems.push({
        what: `§1 速览表 ${o.row} 行数字与实际不符`,
        detail: `  · 表写 ${o.claim}，实为 ${o.real}`,
        fix: "按实际改写（数字来自契约与三个注入源，不手数）",
      });
    }
  }
  // §1 C 行的「+ N 域接口」——数取源码目录（与上面 d.ts 解析互为独立双源）
  const ifaceClaim = parsed.ifaceClaim;
  const realIfaces = domainInterfaceCount();
  if (realIfaces !== interfaces.length) {
    problems.push({
      what: "域接口数两源不一致（契约生成链路疑有漂移）",
      detail: `  · ${API_DIR}/ = ${realIfaces}，contracts/linkdesk.d.ts = ${interfaces.length}`,
      fix: "跑 npm run contracts:check / node scripts/generate-contract.mjs（本条与本表无关，但同属契约面真相）",
    });
  }
  if (!ifaceClaim) {
    problems.push({
      what: "§1 速览表 C 行找不到「+ N 域接口」",
      detail: `实际域接口 ${realIfaces} 个`,
      fix: "恢复该措辞，或更新本脚本的 DOMAIN_IFACE_RE",
    });
  } else if (Number(ifaceClaim[1]) !== realIfaces) {
    problems.push({
      what: "§1 速览表 C 行的域接口数与实际不符",
      detail: `  · 表写 ${ifaceClaim[1]}，实为 ${realIfaces}`,
      fix: `改写为「+ ${realIfaces} 域接口」（数来自 ${API_DIR}/ 与 d.ts 双源）`,
    });
  }

  checkIpcSection(parsed, problems);

  if (problems.length) {
    console.error(`❌ 命名空间矩阵已漂移（${MATRIX}）\n`);
    for (const p of problems) {
      console.error(`   ${p.what}`);
      console.error(p.detail);
      console.error(`   → 修法：${p.fix}\n`);
    }
    console.error(`   真相源 = contracts/linkdesk.d.ts（${contractNames.length} 个命名空间）`);
    console.error(`            + ${Object.values(SOURCES).map((s) => s.file).join(" / ")}`);
    process.exit(1);
  }

  console.log(
    `✅ 命名空间矩阵与真相源一致——契约 ${contractNames.length} 命名空间 / ${realIfaces} 域接口 · ` +
      `pool ${expect.A} · shell ${expect.B} · mock ${expect.D}（三列逐名对源）`,
  );
}

main();
