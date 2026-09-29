/**
 * M4 `AI#40` / E6 `AI#57` / `AI#58`：linkdeskctl **垫片门禁**——两个壳的垫片必须同体、同参、同打包声明。
 *
 * 为什么有这条门禁（两起真实事故，不是假想）：
 *   ① `AI#57`（2026-09-29 真机逼出）：`linkdeskctl.cmd` 的注释写成中文 ⇒ cmd.exe 按 **OEM 码页**
 *      （本机 936）读文件，非 ASCII 注释叠加 LF 行尾把 `set "ELECTRON_RUN_AS_NODE=1"` 那行**读坏**
 *      ⇒ 垫片改去启动整个 App 而不是 CLI。**坏的是注释文本，崩的是启动语义**——人眼读 diff
 *      完全看不出来（注释嘛），装机后才发现。⇒ 必须机械判：垫片是 ASCII-only ＋ LF-only。
 *   ② `AI#58`（2026-09-29 收尾实测）：`cmd.exe`/PowerShell 靠 PATHEXT 把裸名解析到 `.cmd`，
 *      而 **POSIX 壳不看 PATHEXT** ⇒ Git Bash 里 `linkdeskctl` = `command not found`。
 *      修法 = 随包多一个**无扩展名**的同体垫片（MSYS 认 shebang）。⇒ 两个垫片从此是**同一件事的
 *      两份实现**，启动配方（exe ＋ mjs 两条路径 ＋ ELECTRON_RUN_AS_NODE）**必须逐字一致**：
 *      改一处漏一处 = 一半壳能用一半壳不能用，且只在你没试过的那个壳里炸。
 *      ⚠️ 为什么不合成一个文件：cmd 不认 shebang、POSIX 壳不认 .cmd——**两种壳的发现机制不相交**，
 *      只能两份实现；本门禁就是这两份实现之间的对齐链（连同 extraFiles/extraResources 的声明）。
 *
 * ── 判据分三层，各自可单独红 ──
 *   ① 文件层（两个垫片字节）：ASCII-only / LF-only / 都设 ELECTRON_RUN_AS_NODE /
 *      引用的运行路径集合相同（`LinkDesk.exe` ＋ `resources/linkdeskctl/linkdeskctl.mjs`，
 *      归一化 `\` 与 `/` 后比字面）；顺带断言垫片指向的载荷 `cli/linkdeskctl/linkdeskctl.mjs` 在仓里。
 *   ② 声明层（electron-builder.yml）：`extraFiles` 两条（→ 安装根的 `linkdeskctl` 与
 *      `linkdeskctl.cmd`）＋ `extraResources` 一条（`cli/linkdeskctl` → `resources/linkdeskctl`，
 *      垫片指的那个 `resources/...` 全靠它）。**配置在、声明丢** = 垫片不进包（#57.15a 同款病）。
 *   ③ 产物层（`--with-artifact`，默认不跑）：`dist/win-unpacked/` 下两个垫片**逐字节等于仓内**——
 *      拦「声明在、产物里没有/是旧的」。⚠️ 与 check-packaging-files 同款取舍：**不挂 `npm run check`**
 *      （提交时常躺着上一次的产物 ⇒ 常态假红），显式 `--with-artifact` 才跑、缺产物**判红不跳过**。
 *
 * 🔴 判据全是**字面**（不解析 shell）：自测的职责就是证明「字面被动过 ⇒ 红，没动 ⇒ 过」，
 *    并把全部正/负例**接进每次 `npm run check`**（`--self-test`，纯内存注入，不碰盘）。
 *
 * 用法：
 *   node scripts/check-cli-shims.mjs                  # ①②（npm run check）
 *   node scripts/check-cli-shims.mjs --with-artifact  # ①②③（打包后手跑）
 *   node scripts/check-cli-shims.mjs --self-test      # 正负例自测（纯内存）
 * 退出码 0 = 全过；1 = 有红拦（打印到 stderr）。
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 安装根的两个垫片：POSIX 壳（无扩展名，shebang 发现）＋ cmd 系壳（PATHEXT 发现）。 */
const SHIMS = [
  { file: "build/linkdeskctl", role: "POSIX 壳垫片（Git Bash / MSYS2 / Cygwin；无扩展名 ⇒ shebang 发现）" },
  { file: "build/linkdeskctl.cmd", role: "cmd 系壳垫片（cmd.exe / PowerShell；PATHEXT 发现）" },
];

/** 垫片必须逐字引用的运行路径（两份实现互相同文）。`\` 与 `/` 归一化后比。 */
const RUNTIME_PATHS = ["LinkDesk.exe", "resources/linkdeskctl/linkdeskctl.mjs"];

/** 垫片载荷（`extraResources: cli/linkdeskctl → resources/linkdeskctl` 的源头）。 */
const PAYLOAD = "cli/linkdeskctl/linkdeskctl.mjs";

/** 启动语义标记：没有它垫片会拉起整个 App（`AI#57` 的那条）。 */
const NODE_MODE_MARK = "ELECTRON_RUN_AS_NODE";

/**
 * 🔑 逐壳的**启动行契约**（字面锚定，不是「文件里出现过这个词」）。
 * 为什么必须锚行：两个垫片的注释里都写着 `ELECTRON_RUN_AS_NODE` 解释自己——
 * 只判 `includes(MARK)` 的话，**把真正的启动行删掉、注释还在 ⇒ 照样绿**
 * （2026-09-29 自测负控③实测：判据被自己的注释救活）。注释不是证据，行才是。
 */
const LAUNCH_CONTRACT = [
  { file: "build/linkdeskctl", re: /^ELECTRON_RUN_AS_NODE=1 exec /m, lit: "ELECTRON_RUN_AS_NODE=1 exec …" },
  { file: "build/linkdeskctl.cmd", re: /^set "ELECTRON_RUN_AS_NODE=1"\r?$/m, lit: 'set "ELECTRON_RUN_AS_NODE=1"' },
];

/** 抽取 yml 里某个块状列表的 `from:`/`to:` 对（本仓 yml 只有这一种对象形状）。
 *  键不存在 → null（判红：结构变了，解析器不认了）；键在但 0 条 → []。绝不静默返回空。 */
function fromToList(yamlText, key) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:[ \\t]*(#.*)?$`).test(l));
  if (start < 0) return null;
  const out = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^[ \t]/.test(line)) break; // 缩进结束 = 块结束
    const item = /^[ \t]*-[ \t]+(.*)$/.exec(line);
    if (item) {
      cur = {};
      out.push(cur);
      const kv = /^(from|to):[ \t]*(.*)$/.exec(item[1].trim());
      if (kv) cur[kv[1]] = kv[2].trim();
      continue;
    }
    const kv = /^[ \t]+(from|to):[ \t]*(.*)$/.exec(line);
    if (kv && cur) cur[kv[1]] = kv[2].trim();
  }
  return out;
}

/** 归一化后抽出垫片里引用的运行路径（`%~dp0X` / `$dir/X` 都归到同一形状）。 */
function extractRuntimePaths(text) {
  const norm = text.replace(/\\/g, "/");
  const hits = new Set();
  for (const p of RUNTIME_PATHS) if (norm.includes(p)) hits.add(p);
  return hits;
}

/**
 * 纯函数：给定两个垫片文本 + yml 文本 ⇒ 违规清单（空 = 全过）。
 * 自测直接注入改动过的字符串，**不碰盘**——「塞违规看它红」在这里被钉进每次 check。
 */
export function auditShims({ posixText, cmdText, yamlText }) {
  const bad = [];
  const texts = [
    { file: SHIMS[0].file, text: posixText },
    { file: SHIMS[1].file, text: cmdText },
  ];

  // ① 文件层
  for (const { file, text } of texts) {
    if (text === null || text === undefined) {
      bad.push(`${file}：读不到/RED——垫片文件缺失`);
      continue;
    }
    const offenders = [...text].filter((ch) => ch.codePointAt(0) > 0x7f);
    if (offenders.length > 0) {
      const first = text.split(/\r?\n/).findIndex((l) => [...l].some((c) => c.codePointAt(0) > 0x7f)) + 1;
      bad.push(
        `${file}：含 ${offenders.length} 个非 ASCII 字符（首个在第 ${first} 行）——` +
          `cmd.exe 按 OEM 码页读文件，非 ASCII 注释会把启动行读坏（AI#57 真机事故）。垫片只许 ASCII。`,
      );
    }
    if (/\r/.test(text)) {
      bad.push(`${file}：含 CR（CRLF 行尾）——垫片必须 LF-only（AI#57 的叠加因子，见文件头）。`);
    }
    // 启动行契约（锚行判，见 LAUNCH_CONTRACT 注释——注释里也有这个词，判 includes 会被注释救活）
    const contract = LAUNCH_CONTRACT.find((c) => c.file === file);
    if (contract && !contract.re.test(text)) {
      bad.push(
        `${file}：不见启动行契约 ${contract.lit}——没它垫片会启动整个 App 而不是 CLI（AI#57 的那条语义）。`,
      );
    }
    const hits = extractRuntimePaths(text);
    const missing = RUNTIME_PATHS.filter((p) => !hits.has(p));
    if (missing.length > 0) bad.push(`${file}：未引用 ${missing.join(" / ")}——启动配方与另一份垫片不同体。`);
  }

  // 两份实现的运行路径集合必须相等（改一处漏一处 = 一半壳不能用）
  if (posixText && cmdText) {
    const a = extractRuntimePaths(posixText);
    const b = extractRuntimePaths(cmdText);
    const onlyA = [...a].filter((p) => !b.has(p));
    const onlyB = [...b].filter((p) => !a.has(p));
    if (onlyA.length > 0 || onlyB.length > 0) {
      bad.push(
        `两个垫片引用的运行路径不一致：仅 ${SHIMS[0].file} 有 [${onlyA.join(", ")}]，` +
          `仅 ${SHIMS[1].file} 有 [${onlyB.join(", ")}]——同一件事的两份实现必须逐字同参。`,
      );
    }
  }

  // ② 声明层
  const extraFiles = fromToList(yamlText, "extraFiles");
  if (extraFiles === null) {
    bad.push("electron-builder.yml：抽不到 extraFiles 块——配置结构变了，本门禁不认（别静默放行）。");
  } else {
    const byTo = new Map(extraFiles.filter((e) => e && e.to).map((e) => [e.to, e.from]));
    for (const { file } of SHIMS) {
      const to = file.replace(/^build\//, "");
      const from = byTo.get(to);
      if (from === undefined) {
        bad.push(`electron-builder.yml：extraFiles 缺「to: ${to}」——${file} 不会进安装根（垫片在仓里、包里没有）。`);
      } else if (from !== file) {
        bad.push(`electron-builder.yml：extraFiles 的 to: ${to} 指向 ${from}，应为 ${file}。`);
      }
    }
  }

  const extraResources = fromToList(yamlText, "extraResources");
  if (extraResources === null) {
    bad.push("electron-builder.yml：抽不到 extraResources 块——配置结构变了，本门禁不认。");
  } else {
    const hit = extraResources.some((e) => e && e.from === "cli/linkdeskctl" && e.to === "linkdeskctl");
    if (!hit) {
      bad.push(
        "electron-builder.yml：extraResources 缺「from: cli/linkdeskctl → to: linkdeskctl」——" +
          "垫片引用的 resources/linkdeskctl/linkdeskctl.mjs 全靠它，缺了垫片无法启动。",
      );
    }
  }

  return bad;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const posixText = readFileSync(resolve(ROOT, SHIMS[0].file), "utf-8");
  const cmdText = readFileSync(resolve(ROOT, SHIMS[1].file), "utf-8");
  const yamlText = readFileSync(resolve(ROOT, "electron-builder.yml"), "utf-8");

  const cases = [
    // ── 正控：原样必须过 ──
    ["正控①：仓内两个垫片 + yml 原样 ⇒ 过", { posixText, cmdText, yamlText }, true],
    // ── 负控：每一层各塞一次违规 ──
    [
      "🔴 负控①：cmd 垫片塞一个非 ASCII 字符（AI#57 的原病）⇒ 红",
      { posixText, cmdText: cmdText.replace("rem Zero deps", "rem 零依赖"), yamlText },
      false,
    ],
    [
      "🔴 负控②：把垫片行尾改成 CRLF ⇒ 红",
      { posixText: posixText.replace(/\n/g, "\r\n"), cmdText, yamlText },
      false,
    ],
    [
      "🔴 负控③：抽掉 sh 垫片的启动行前缀（ELECTRON_RUN_AS_NODE=1 exec）⇒ 红",
      { posixText: posixText.replace(/^ELECTRON_RUN_AS_NODE=1 exec /m, ""), cmdText, yamlText },
      false,
    ],
    [
      "🔴 负控⑧：抽掉 cmd 垫片的 set 行（AI#57 真机坏的就是这一行）⇒ 红",
      { posixText, cmdText: cmdText.replace(/^set "ELECTRON_RUN_AS_NODE=1"\r?$/m, "rem (set 行被删)"), yamlText },
      false,
    ],
    [
      "🔴 负控④：两份垫片指向不同的 mjs（mjs 路径被改名）⇒ 红",
      { posixText: posixText.replace("resources/linkdeskctl/linkdeskctl.mjs", "resources/linkdeskctl/other.mjs"), cmdText, yamlText },
      false,
    ],
    [
      "🔴 负控⑤：extraFiles 少一条（漏发 sh 垫片）⇒ 红",
      { posixText, cmdText, yamlText: yamlText.replace(/^\s*- from: build\/linkdeskctl\n\s*-?.*$/m, "") },
      false,
    ],
    [
      "🔴 负控⑥：extraResources 少 cli/linkdeskctl 那条 ⇒ 红",
      { posixText, cmdText, yamlText: yamlText.replace("from: cli/linkdeskctl", "from: cli/moved") },
      false,
    ],
    [
      "🔴 负控⑦：垫片文件读不到（缺失）⇒ 红（fail-closed）",
      { posixText: null, cmdText, yamlText },
      false,
    ],
  ];

  let bad = 0;
  for (const [tag, input, wantOk] of cases) {
    const problems = auditShims(input);
    const ok = problems.length === 0;
    const pass = ok === wantOk;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${ok ? "过" : "红"}\n`);
    if (!pass) for (const p of problems) process.stderr.write(`      ← ${p}\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-cli-shims self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-cli-shims self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function readIfExists(rel) {
  const abs = resolve(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, "utf-8") : null;
}

function checkArtifact() {
  const dist = resolve(ROOT, "dist", "win-unpacked");
  const bad = [];
  if (!existsSync(dist)) {
    bad.push(`dist/win-unpacked 不存在——--with-artifact 模式判红（缺产物 ≠ 跳过；见文件头取舍）。`);
    return bad;
  }
  for (const { file } of SHIMS) {
    const to = file.replace(/^build\//, "");
    const packed = join(dist, to);
    if (!existsSync(packed)) {
      bad.push(`产物缺 ${to}——extraFiles 声明在、包里没有（垫片装机后不存在）。`);
      continue;
    }
    const a = readFileSync(resolve(ROOT, file));
    const b = readFileSync(packed);
    if (!a.equals(b)) bad.push(`产物 ${to} 与仓内 ${file} 逐字节不同——包里是旧/坏的那份（AI#57 同款病）。`);
  }
  return bad;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return runSelfTest();

  const yamlText = readIfExists("electron-builder.yml");
  if (yamlText === null) {
    console.error("❌ electron-builder.yml 读不到——红门禁。");
    process.exit(1);
  }
  const problems = auditShims({
    posixText: readIfExists(SHIMS[0].file),
    cmdText: readIfExists(SHIMS[1].file),
    yamlText,
  });
  if (!existsSync(resolve(ROOT, PAYLOAD))) {
    problems.push(`${PAYLOAD} 不存在——垫片指向的载荷不在仓里（改名/挪位漏改垫片）。`);
  }
  const artifactProblems = argv.includes("--with-artifact") ? checkArtifact() : [];
  const all = [...problems, ...artifactProblems];
  if (all.length > 0) {
    console.error(`[cli-shims] 红门禁——${all.length} 处：`);
    for (const p of all) console.error(`  ❌ ${p}`);
    console.error(
      "\n[cli-shims] 两个垫片 = 同一件事的两份实现（cmd 系壳 PATHEXT / POSIX 壳 shebang），" +
        "启动配方与打包声明必须逐字对齐；垫片只许 ASCII ＋ LF（AI#57 真机事故的根因）。",
    );
    process.exit(1);
  }
  const mode = argv.includes("--with-artifact") ? "①②③" : "①②";
  console.log(
    `[cli-shims] ✓ ${mode} 全过——两个垫片 ASCII/LF/同参（${RUNTIME_PATHS.join(" ＋ ")}，${NODE_MODE_MARK}）` +
      `${argv.includes("--with-artifact") ? "，且产物内两份与仓内逐字节相同" : ""}。`,
  );
}

main();
