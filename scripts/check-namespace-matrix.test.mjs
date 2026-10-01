/**
 * check-namespace-matrix 的内联自测（E6#0.6d 第一刀·自测外迁）。
 *
 * 原先这 392 行自测住在 check-namespace-matrix.mjs 里，把生产文件顶到 1037 行。自测是**测试**、
 * 不是生产体量：按仓库既有惯例（`*.test.*` 不计入门禁）外迁到同名测试模块。生产文件只留一层
 * `--self-test` 转发，调用面零变化（照旧 `node scripts/check-namespace-matrix.mjs --self-test`）。
 *
 * ⚠️ 判据语义一字未改——逐例实跑断言，夹具全在内存，零工作区副作用。
 * ⚠️ 与主文件互为环（主文件动态 import 本文件、本文件静态 import 主文件）：主文件在顶层 await
 *    之前已把全部导出初始化完，故 import 拿到的是完整模块命名空间，无 TDZ 风险。
 */
import {
  AUTHOR_DOCS,
  STATS_RE,
  countIpcChannels,
  judgeAuthorDoc,
  judgeDead,
  judgeFaceInjection,
  judgeMissing,
  judgeOverview,
  judgeStats,
  parseMatrix,
  topLevelKeysFromSource,
} from "./check-namespace-matrix.mjs";

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 自测：**全部内存字符串夹具**——不读仓库文件、不写任何文件（1.27 体检判本脚本「零工作区副作用」就能补）。
 * 每一例都**真跑判据并断言实得结果**（不是只打印「应该红」）：
 * 正控 = 对得上的输入必须绿；负控 = 错得上的输入必须响。
 */
export function runSelfTest() {
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

  /* ── H. ⑥ 双语作者文档里的契约数量（AI#9——同一件事的第三份副本） ── */
  const BT = "`"; // 反引号：夹具里原样拼出文档中的 `唯一缺 \`bridge\`` 形状
  const AD_ZH = AUTHOR_DOCS[0];
  const AD_EN = AUTHOR_DOCS[1];
  /** 活读数夹具：契约 3（缺 bridge 的池）——数字与下面两条「文档行」对齐时应当绿 */
  const AD_LIVE = {
    contractNames: ["app", "bridge", "other"],
    injected: { pool: ["app", "other"], shell: ["app", "bridge"], mock: ["app"] },
    ifaces: 7,
  };
  const adZhDoc = (t, p, note, s, m, iface) =>
    [
      `| **契约 ${t} 命名空间** | 池注入 ${p}（${note}）；壳注入 ${s}；mock 注入 ${m}——**以活读数为准** |`,
      `- **生成源：** \`src/core/api/linkdesk-api.ts\` + \`linkdesk-api/\`（${iface} 域接口）+ \`src/core/types/ipc/*\``,
    ].join("\n");
  const adEnDoc = (t, p, note, s, m, iface) =>
    [
      `| **The contract has ${t} namespaces** | The pool injects ${p} (${note}); the shell injects ${s}; mock injects ${m} — live readings win |`,
      `- **Generation sources:** \`src/core/api/linkdesk-api.ts\` + \`linkdesk-api/\` (${iface} domain interfaces) + \`src/core/types/ipc/*\``,
    ].join("\n");
  const adMissing = judgeAuthorDoc("## 这里什么锚点都没有\n", AD_ZH, AD_LIVE);
  eqCase(
    "负",
    "负控⑭：⑥ 两条锚点都缺 ⇒ 各记一条（响亮；⛔ 不静默当「无不符」）",
    [
      adMissing.length === 2,
      adMissing[0].startsWith("找不到契约数量摘要行"),
      adMissing[1].startsWith("找不到「（N 域接口）」"),
    ],
    [true, true, true],
  );
  eqCase(
    "正",
    "正控⑲：⑥ 中文文档四个数字 + 「唯一缺 `bridge`」（带反引号）+ 域接口数全对 ⇒ 无误",
    judgeAuthorDoc(adZhDoc(3, 2, `唯一缺 ${BT}bridge${BT}`, 2, 1, 7), AD_ZH, AD_LIVE),
    [],
  );
  eqCase(
    "正",
    "正控⑳：⑥ 英文文档同款写法（the only missing one is `bridge`）⇒ 无误（同一把尺、两种语种）",
    judgeAuthorDoc(adEnDoc(3, 2, `the only missing one is ${BT}bridge${BT}`, 2, 1, 7), AD_EN, AD_LIVE),
    [],
  );
  eqCase(
    "负",
    "负控⑮：⑥ 英文文档把 pool 注入 2 写成 3 ⇒ 违规（2026-09-28 实测：文档写的是 39/22/12，活读数 45/25/13）",
    judgeAuthorDoc(adEnDoc(3, 3, `the only missing one is ${BT}bridge${BT}`, 2, 1, 7), AD_EN, AD_LIVE),
    ["pool 注入：表写 3，实为 2"],
  );
  eqCase(
    "负",
    "负控⑯：⑥ 中文文档「唯一缺」写错（写 app，实际缺 bridge）⇒ 违规（带反引号的写法照样被抓）",
    judgeAuthorDoc(adZhDoc(3, 2, `唯一缺 ${BT}app${BT}`, 2, 1, 7), AD_ZH, AD_LIVE),
    ["表写「唯一缺 app」，但实际未注入 pool 的是：[bridge]"],
  );
  eqCase(
    "负",
    "负控⑰：⑥ 域接口数不符（文档写 6，实为 7）⇒ 违规（与矩阵 §1 C 行同源同一把尺）",
    judgeAuthorDoc(adZhDoc(3, 2, `唯一缺 ${BT}bridge${BT}`, 2, 1, 6), AD_ZH, AD_LIVE),
    ["域接口数：文档写 6，实为 7"],
  );

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
