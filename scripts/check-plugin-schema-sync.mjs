/**
 * 机械检查：author 面 JSON Schema **整文件**同步守卫（E6#5/#6 立 plugin.schema；E6#60 扩 theme/icon）。
 *
 * 背景：live schema = public/schemas/*.schema.json（发布态校验源 + repo 内 $schema 编辑器引用），
 * 另有**整文件**字节拷贝供各消费面：
 *   - plugin.schema.json：live + docs/03-插件制造/（作者文档区）+ packages/plugin-sdk/schemas/（SDK 包内，ajv 编译消费）
 *   - theme.schema.json / icon-theme.schema.json：live + packages/plugin-sdk/schemas/（E6#60 收编——npm 作者
 *     拿数据文件 schema，IntelliSense + SDK validate；收编前仅仓库一份，第三方作者无 npm 通道）
 * SDK validate 消费**整个** schema（非仅 contributes 键）——check-contributes ② 只比 contributes 字段，
 * 管不住 readme/entry-required/allOf if 等非 contributes 段的漂移 → 本脚本整文件字节级守卫（单一权威 live，
 * 拷贝须与 live 字节相同）。SDK 跑在发布前的数据上，schema 漂移 = 作者拿到旧版校验 = 红灯。
 *
 * ── 🔴 E6#109p-b（1.28b）补自测 ＋ 一条**发现式断言**（治「清单漏登记」）──
 *   1.27 全量体检把本脚本判为**半瞎**：`FILES` 是硬编码清单，**新开一个 live schema（或一份新拷贝位置）
 *   不进来 ⇒ 那一片完全不受守护，门禁照样绿灯**。本轮做两件事：
 *     · 字节比较抽成纯函数 `findDrifted(liveBytes, copies)`（**不读盘**，`--self-test` 用内存 Buffer 夹具）
 *       ——`main()` 仍是「读盘 + 打印 + 退出码」，输出文案与结论一字未改；
 *     · 发现式断言 `schemaCoverageGaps()`：`public/schemas/*.schema.json` 里**每个** live schema 都必须
 *       在 `FILES` 某组里成组（唯一例外见 `LIVE_ONLY`，而豁免条目本身也受机械核验——过期即红）。
 *
 * 用法：node scripts/check-plugin-schema-sync.mjs（已挂 npm run check）
 *       node scripts/check-plugin-schema-sync.mjs --self-test
 * 退出码 0 = 全部文件组内同步，退出码 1 = 有漂移（打印到 stderr）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 每文件组：copies[0] = live（权威）；其余为必须字节相同的跟踪拷贝
// 🔴 1.28b 顺带查到的一件事（本轮**不动判据**，留给专项轮次裁决）：
//   plugin.schema.json 在仓里其实有**第四份跟踪拷贝** `packages/plugin-docs/docs/zh/plugin.schema.json`，
//   不在下面的 copies 里——它是 `scripts/generate-plugin-docs.mjs` 从 `docs/03-插件制造/`（**已在 copies 内**）
//   生成的产物，同步由「真源同字节 ＋ 生成器 `--check`」**间接**关闭。要不要把生成产物也纳入本表
//   （那会让本门禁的份数从 7 变 8），是公共面决策，不在本轮射程。
const FILES = [
  {
    schema: "public/schemas/plugin.schema.json",
    copies: [
      { name: "public/schemas/plugin.schema.json", role: "live（权威）" },
      { name: "docs/03-插件制造/plugin.schema.json", role: "作者文档区拷贝" },
      { name: "packages/plugin-sdk/schemas/plugin.schema.json", role: "SDK 包内拷贝（ajv 编译消费）" },
    ],
  },
  {
    schema: "public/schemas/theme.schema.json",
    copies: [
      { name: "public/schemas/theme.schema.json", role: "live（权威，E5.8#129）" },
      { name: "packages/plugin-sdk/schemas/theme.schema.json", role: "SDK 包内拷贝（E6#60 收编）" },
    ],
  },
  {
    schema: "public/schemas/icon-theme.schema.json",
    copies: [
      { name: "public/schemas/icon-theme.schema.json", role: "live（权威，E6#60 重写对齐引擎）" },
      { name: "packages/plugin-sdk/schemas/icon-theme.schema.json", role: "SDK 包内拷贝（E6#60 收编）" },
    ],
  },
];

/**
 * live-only 豁免——**机制核验，不是逃生口**。
 * 为什么需要它：`public/schemas/workspace.schema.json` 是**内部**工作区布局 schema
 * （`$id: …/workspace.schema.json`，管标签页 + 卡片的本地布局），**不是作者面 schema**——今天全仓**零拷贝面**
 * （`dist/schemas/` 是构建产物，不属拷贝面）。没有拷贝面 ⇒ 本门禁对它无物可守.
 * ⛔ 也别硬把它塞进 FILES：那会多出一组「自己跟自己比」的空转组，把报表里的份数灌水。
 * 但**豁免得受核验**（照 `check-file-size.mjs` 的 `EXEMPT_FILES` 先例，挂账纪律不靠自觉）：
 *   · 条目指向的 live 必须今天**真在** `public/schemas/` 里；
 *   · 且**不得又出现在 FILES 里**（重复登记 = 豁免过期）。
 * 两条任一不成立 ⇒ 本脚本报「LIVE_ONLY 条目过期」并红。
 */
export const LIVE_ONLY = [
  {
    file: "public/schemas/workspace.schema.json",
    why: "内部工作区布局 schema（非作者面），今天全仓无拷贝面",
  },
];

/**
 * 纯判据：`copies` 里与 `liveBytes` **字节不一致**的项（返回 `{ name, role, bytes }` 子集）。
 * ⚠️ 字节由调用方读好传进来——本函数**不碰盘**，所以自测能用内存 Buffer 夹具真跑它。
 */
export function findDrifted(liveBytes, copies) {
  return copies.filter((c) => !c.bytes.equals(liveBytes));
}

/**
 * 发现式断言（纯函数）：返回「未被 FILES 覆盖」的 live schema 问题行——空数组 = 绿。
 * 治的正是本脚本的原生盲区：**FILES 是硬编码清单，新开一个 live schema 不放进来 ⇒ 它的拷贝面完全不受守护，
 * 而门禁照样打绿灯**。今天 `public/schemas/` 有 4 个 live：plugin / theme / icon-theme 三人在 FILES 里成组，
 * workspace 在 LIVE_ONLY 里。
 */
export function schemaCoverageGaps(liveNames, files = FILES, liveOnly = LIVE_ONLY) {
  const gaps = [];
  const tracked = new Set(files.flatMap((g) => g.copies.map((c) => c.name)));
  const exempt = new Set(liveOnly.map((e) => e.file));

  for (const name of liveNames) {
    if (tracked.has(name) || exempt.has(name)) continue;
    gaps.push(
      `  ${name}  ⚠  live schema 未登记在 FILES 任何一组——它的拷贝面**完全不受本门禁守护**（新增或漂移的拷贝不会被发现）`,
    );
  }
  for (const e of liveOnly) {
    if (!liveNames.includes(e.file)) {
      gaps.push(`  ${e.file}  ⚠  LIVE_ONLY 条目过期——该 live 已不在 public/schemas/（${e.why}）：把它从 LIVE_ONLY 删掉`);
    } else if (tracked.has(e.file)) {
      gaps.push(`  ${e.file}  ⚠  LIVE_ONLY 条目过期——它已登记进 FILES，豁免不再需要：把它从 LIVE_ONLY 删掉`);
    }
  }
  return gaps;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 每例都**真跑判据**并断言实得项数——负控必须真的报出漂移，正控必须真的干净。
 * 夹具全是**内存 Buffer**（`Buffer.from("a")` vs `Buffer.from("a ")`），不碰盘、不造临时文件。
 */
function runSelfTest() {
  const LIVE = Buffer.from('{\n  "$id": "plugin"\n}\n');
  const SAME = Buffer.from('{\n  "$id": "plugin"\n}\n');
  const DRIFTED = Buffer.from('{\n  "$id": "plugin"\n}\n '); // 尾多一个空格（1.27 实测的红形态）
  const DOCS = { name: "docs/03-插件制造/plugin.schema.json", role: "作者文档区拷贝" };
  const SDK = { name: "packages/plugin-sdk/schemas/plugin.schema.json", role: "SDK 包内拷贝（ajv 编译消费）" };
  /** 今日 public/schemas/ 的 4 个 live（自测用内存夹具，不读盘） */
  const LIVE_NAMES_TODAY = [
    "public/schemas/icon-theme.schema.json",
    "public/schemas/plugin.schema.json",
    "public/schemas/theme.schema.json",
    "public/schemas/workspace.schema.json",
  ];

  const oneDrifted = [
    { ...DOCS, bytes: DRIFTED },
    { ...SDK, bytes: SAME },
  ];

  const cases = [
    // ── 正控：同步 ⇒ 0 项 ──
    [
      "正控①：三份拷贝与 live 字节相同（今日 plugin 组形态）⇒ 0 项漂移",
      findDrifted(LIVE, [
        { ...DOCS, bytes: SAME },
        { ...SDK, bytes: SAME },
      ]).length,
      0,
    ],
    ["正控②：单份拷贝组（theme / icon-theme 形态）字节相同 ⇒ 0 项漂移", findDrifted(LIVE, [{ ...SDK, bytes: SAME }]).length, 0],
    [
      "正控③：空文件边界（live 与拷贝都是 Buffer.alloc(0)）⇒ 0 项漂移",
      findDrifted(Buffer.alloc(0), [{ ...SDK, bytes: Buffer.alloc(0) }]).length,
      0,
    ],
    ["正控④：发现式断言——今日 4 个 live 全有归属（3 进 FILES ＋ workspace 走 LIVE_ONLY）⇒ 0 条", schemaCoverageGaps(LIVE_NAMES_TODAY).length, 0],
    // ── 负控：漂移 / 漏登记 ⇒ 红（项数也要对） ──
    [
      "负控①：差一个字节（尾多一个空格）⇒ 恰报 1 项，且该项带 name + role 文案",
      findDrifted(LIVE, oneDrifted).length,
      1,
      findDrifted(LIVE, oneDrifted)[0]?.name === DOCS.name && findDrifted(LIVE, oneDrifted)[0]?.role === DOCS.role,
    ],
    [
      "负控②：两份拷贝都漂移 ⇒ 报 2 项（不是首个命中就停）",
      findDrifted(LIVE, [
        { ...DOCS, bytes: DRIFTED },
        { ...SDK, bytes: DRIFTED },
      ]).length,
      2,
    ],
    [
      "负控③：发现式断言——假集合里放一个未登记的 live ⇒ 报 1 条（并点名）",
      schemaCoverageGaps([...LIVE_NAMES_TODAY, "public/schemas/probe-no-group.schema.json"]).length,
      1,
      schemaCoverageGaps([...LIVE_NAMES_TODAY, "public/schemas/probe-no-group.schema.json"])[0]?.includes(
        "public/schemas/probe-no-group.schema.json",
      ),
    ],
    [
      "负控④：LIVE_ONLY 条目过期（豁免的 live 又登记进 FILES）⇒ 报 1 条",
      schemaCoverageGaps(LIVE_NAMES_TODAY, [...FILES, { schema: "x", copies: [{ name: LIVE_ONLY[0].file, role: "live" }] }]).length,
      1,
    ],
  ];

  let bad = 0;
  for (const [tag, got, want, probe] of cases) {
    const pass = got === want && probe !== false;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got} 项\n`);
  }
  const positives = cases.filter(([, , want]) => want === 0).length;
  const negatives = cases.length - positives;
  process.stdout.write(
    bad === 0
      ? `\n✅ check-plugin-schema-sync self-test 全过（${cases.length} 例：${positives} 正控绿 / ${negatives} 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-plugin-schema-sync self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  // ── 发现式断言先行：清单本身漏登记 ⇒ 后面的字节比对再绿也不可信 ──
  const liveNames = readdirSync(resolve(ROOT, "public/schemas"))
    .filter((n) => n.endsWith(".schema.json"))
    .map((n) => `public/schemas/${n}`)
    .sort();
  const gaps = schemaCoverageGaps(liveNames);
  if (gaps.length > 0) {
    console.error("❌ live schema 清单有漏登记——FILES 是硬编码清单，漏一个 = 那一片拷贝面没有守护：");
    console.error(gaps.join("\n"));
    console.error("\n   修法：在 scripts/check-plugin-schema-sync.mjs 的 FILES 里给它开一组（copies[0] = live 本身），");
    console.error("        或若它确无拷贝面（非作者面），照 LIVE_ONLY 的格式登记豁免并写明理由。");
    process.exit(1);
  }

  let anyDrifted = false;
  for (const group of FILES) {
    const live = group.copies[0];
    const liveBytes = readFileSync(resolve(ROOT, live.name));
    const copies = group.copies
      .slice(1)
      .map((c) => ({ ...c, bytes: readFileSync(resolve(ROOT, c.name)) }));
    const drifted = findDrifted(liveBytes, copies);
    if (drifted.length > 0) {
      anyDrifted = true;
      for (const c of drifted) {
        console.error(`❌ ${c.name}（${c.role}）与 ${live.name}（${live.role}）字节不一致——单一权威，拷贝须与 live 同步`);
        console.error(`   同步：cp ${live.name} ${c.name}`);
      }
    }
  }
  if (anyDrifted) {
    process.exit(1);
  }

  const total = FILES.reduce((n, g) => n + g.copies.length, 0);
  console.log(`✅ author 面 schema ${FILES.map((g) => `${g.schema.replace("public/schemas/", "")}×${g.copies.length}`).join("、")} 全部字节同步——共 ${total} 份（live 权威）。`);
  console.log(`✅ 发现式断言：public/schemas 下 ${liveNames.length} 个 live schema 全部有归属（FILES 成组 ＋ LIVE_ONLY 豁免），无静默漏扫。`);
}

main();
