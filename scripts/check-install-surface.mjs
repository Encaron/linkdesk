/**
 * 机械门禁：**用户机落点契约**（台账 §六 立项 ③，2026-10-02 用户拍板「坚决禁止乱放」）。
 *
 * 契约本体 = `docs/开发管理/用户机落点规范.md`（总账 ＋ 五条铁律）。本脚本是那份契约的**机械腿**：
 * 把「落点该在哪」从口头约定变成**能拦住新违规**的判据。
 *
 * 用法：node scripts/check-install-surface.mjs
 *       node scripts/check-install-surface.mjs --self-test
 * 退出码 0 = 零违规；1 = 有违规（打印文件:行＋内容＋违反哪条）。
 *
 * ── 判据（五条，全部**否定式**：命中即红）──
 *   R1 **出厂件里的开发机绝对路径**——扫描域内出现盘符绝对路径字面量（`C:\` / `E:/` …）。
 *      出厂件里写死开发机路径 = 装到别人机器上直接指向不存在的目录（台账 §三 #2 / §五 C）。
 *      ⚠️ 只认**非注释行**（注释里的举例是文档不是落点），且**测试与 fixture 文件不在射程**（硬约束 21：
 *      fixture 一律虚构值，`C:/demo/x` 这类是**故意**造的假路径）。
 *   R2 **自造落点**——`%APPDATA%` / `%LOCALAPPDATA%` / `%TEMP%` 一类的环境变量落点字面量，
 *      必须整体命中 `SURFACE_ALLOW` 里某条**已登记落点**（前缀匹配）。反例 = `%APPDATA%\Temp`
 *      （总账 D14 的空壳就是这么来的）。
 *   R3 **`app.getPath(<键>)` 的键必须已登记**——Electron 每多一个键就是多一处落点；
 *      今天的登记表只有 `userData`（总账 A1）。新键 = 先登记再落代码（铁律 4）。
 *   R4 **注册表写调用不得碰 HKLM**——本产品是 per-user 安装，**只写 HKCU**（免提权）。
 *      判据 = 写/建/删键调用（`RegSetValueEx*` / `RegCreateKeyEx*` / `RegDeleteKey*` / `RegDeleteValue*`）
 *      的**本行或前 5 行**内出现 `HKEY_LOCAL_MACHINE` / `HKLM`。
 *   R5 **登记表自洽**——`SURFACE_ALLOW` 每条必填 `path` / `who` / `uninstall` / `reason`
 *      （照铁律 2：「谁写 / 谁删 / 卸载怎么处置」三者缺一不许上架）。
 *   R6 **豁免账本不得腐烂**——`ABSOLUTE_PATH_EXEMPT` 每条挂的「已知非落点绝对值」必须在文件里
 *      还能找到；找不到 ⇒ 报红逼对账（照 `check-css-hardcode` 的白名单纪律：留死路径 = 白名单自己腐烂）。
 *
 * ── ⛔ 域外声明（免得下一个人以为漏了）──
 *   · 扫描域 = `src/` · `electron/` · `build/installer/`（**用户 2026-10-02 拍板的覆盖范围＝只扫壳仓**，
 *     插件仓各有自己的仓，壳仓 check 够不着）。
 *   · **`build/installer/bootstrapper/tools/` 整体跳过**——那是 CI/开发脚本（`*.ps1` / `*.mjs`），
 *     它们**本来就该**指着本机仓库路径跑，不是出厂件。
 *   · `__tests__/` `__fixtures__/` 与 `*.test.*` `*.spec.*` 不在射程（同 R1 的硬约束 21 理由）。
 *   · `out/`（rc 中间产物）跳过。
 *   · 🔴 **R4 认不出「参数化的 hive」**——若代码把 hive 存进变量再传给写函数（本仓 `syswrite.cpp`
 *     的写助手就是 `HKEY root` 形参），R4 看不到。**这是有意接受的窄射程**：宁可漏报也不误伤
 *     （`syswrite.cpp` 里合法的 HKLM 用法是**读** WebView2 Evergreen 的 `pv`，用 `RegOpenKeyExW … KEY_READ`）。
 *     「写只许 HKCU」的**强判据**在 CI 侧：`tools/uninstall-test.ps1` 装前全量快照 ＋ 逐条对账
 *     （见 `build/installer/bootstrapper/README.md`）。
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_DIRS = ["src", "electron", "build/installer"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-electron",
  ".git",
  "out",
  "__tests__",
  "__fixtures__",
  "tools", // build/installer/bootstrapper/tools —— CI/开发脚本，非出厂件（见头注域外声明）
]);
const EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|cpp|h|html|css)$/;
const TEST_RE = /\.(test|spec)\./;

/**
 * ★ 落点登记表（**唯一真相源的机械镜像**——正文在 `docs/开发管理/用户机落点规范.md`，
 *   这里只放**门禁要认的形态**：落点前缀 ＋ 谁写 ＋ 卸载怎么处置 ＋ 出自总账哪一条）。
 * 🔴 新增任何「写盘 / 写注册表 / 建快捷方式」的落点 ⇒ **先在本表和规范文档各加一行**，再落代码。
 */
export const SURFACE_ALLOW = [
  {
    path: "%APPDATA%\\linkdesk",
    who: "壳：Electron userData（设置 / 插件 / 布局 / Chromium 缓存 / 更新缓存 / ai-bridge / hot-exit / appearance / protocol-debug.log / tmp）",
    uninstall: "**默认保留**（那是用户数据）；用户在卸载屏选「彻底删除」时才连同 plugins 一起清",
    reason: "Electron userData 规范落点（总账 A1）",
  },
  {
    path: "%LocalAppData%\\Programs\\linkdesk",
    who: "安装器：程序本体 ＋ 卸载器副本（linkdesk-setup.exe）",
    uninstall: "卸载时整树删除（INSTDIR 自删）",
    reason: "默认安装目录，用户可在欢迎屏改（总账 A4）",
  },
];

/** R3 的登记表：今天只用了 `userData`。多一个键 = 多一处落点 ⇒ 先登记（铁律 4）。 */
export const APP_GETPATH_KEYS = ["userData"];

/**
 * R1 的豁免账本——**已复核过的「绝对值字面量，但它不是落点」**。
 * 每条 = 文件 ＋ 该行必含的片段 ＋ 为什么它不是落点（R6 反向核验：片段没了 ⇒ 报红逼删条目）。
 * 🔴 不许为了凑绿往里塞条目：塞进去的每一条都是一个**没人再看着的绝对路径**。
 */
export const ABSOLUTE_PATH_EXEMPT = [
  {
    file: "electron/main.ts",
    contains: "Git\\\\git-bash.exe",
    why: "**探测候选**不是落点——「在此处打开 Git Bash」按标准安装位找 `git-bash.exe`（`fs.existsSync` 命中才用，找不到就回落普通 cmd）。读路径，不写路径。",
  },
  {
    file: "electron/services/filesystem-guard.ts",
    contains: "WINDOWS_DANGEROUS_DIRS",
    why: "**黑名单**不是落点——写保护把系统目录列出来**拒写**（`C:/Windows` / `Program Files`）。它反向证明落点纪律：这几个目录永远不许成为落点。",
  },
  {
    // T6（第 5 波）：常量随代码搬了家——registry-integration 的执行器/键路径抽到共用底座
    // `reg-exec.ts`（静态半 registry-integration ＋ 动态半 os-associations 共用一份）。
    file: "electron/services/reg-exec.ts",
    contains: "process.env.SystemRoot",
    why: "**系统工具绝对路径**不是落点——`reg.exe` 走 System32 绝对路径是**防 PATH 劫持**（头注写了：按名调用会先命中 PATH 里排前的同名程序）。",
  },
  {
    file: "build/installer/bootstrapper/app.js",
    contains: "installer.path.err.absolute",
    why: "**界面示例文案**不是落点——错误提示里的举例「例如 `C:\\Apps\\LinkDesk`」，教用户怎么填。是给人看的字，不是任何代码的目标位置。",
  },
];

const norm = (p) => p.split(sep).join("/");
const rel = (p) => norm(relative(ROOT, p));

// ────────────────────────────── 纯判据（自测从这里注入字符串） ──────────────────────────────

/** 整文件去注释（块注释先，留空行保行号；再行注释）。注释里的路径是文档，不是落点。 */
function stripComments(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return s;
}

/** `%APPDATA%\\linkdesk` → `%APPDATA%\linkdesk`（源码里的双反斜杠还原成路径形态再比对） */
const unescapePath = (t) => t.replace(/\\\\/g, "\\").replace(/\\\//g, "/");

const PERCENT_RE = /%(?:APPDATA|LOCALAPPDATA|LocalAppData|TEMP|TMP|ProgramData|USERPROFILE)%[A-Za-z0-9\\/._-]*/g;

/** R1：盘符绝对路径字面量（负向后顾排除 `https://` / `linkdesk://` 这类协议） */
export function absolutePathViolations(src) {
  const out = [];
  stripComments(src)
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(/(?<![A-Za-z])[A-Za-z]:[\\/]/);
      if (m) out.push({ line: i + 1, text: line.trim().slice(0, 120), raw: line, rule: "R1" });
    });
  return out;
}

/** R2：自造落点——环境变量落点字面量必须命中已登记落点（前缀匹配） */
export function percentPathViolations(src, allow = SURFACE_ALLOW) {
  const out = [];
  stripComments(src)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(PERCENT_RE)) {
        const token = unescapePath(m[0]);
        const ok = allow.some((a) => token === a.path || token.startsWith(a.path + "\\") || token.startsWith(a.path + "/"));
        if (!ok) out.push({ line: i + 1, text: token, rule: "R2" });
      }
    });
  return out;
}

/** R3：`app.getPath(<键>)` 的键必须已登记 */
export function appGetPathViolations(src, keys = APP_GETPATH_KEYS) {
  const out = [];
  stripComments(src)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(/app\.getPath\(\s*['"]([A-Za-z]+)['"]/g)) {
        if (!keys.includes(m[1])) out.push({ line: i + 1, text: `app.getPath('${m[1]}')`, rule: "R3" });
      }
    });
  return out;
}

/** R4：注册表**写**调用不得碰 HKLM（本行或前 5 行内出现 HKLM 字面量即红） */
export function registryHiveViolations(src) {
  const out = [];
  const lines = stripComments(src).split("\n");
  const WRITE_RE = /Reg(?:SetValueEx|CreateKeyEx|DeleteKey|DeleteValue)[A-Za-z]*\(/;
  const HKLM_RE = /HKEY_LOCAL_MACHINE|\bHKLM\b/;
  lines.forEach((line, i) => {
    if (!WRITE_RE.test(line)) return;
    const from = Math.max(0, i - 5);
    const window = lines.slice(from, i + 1).join("\n");
    if (HKLM_RE.test(window)) out.push({ line: i + 1, text: line.trim().slice(0, 120), rule: "R4" });
  });
  return out;
}

/** R5：登记表自洽——每条必填 path / who / uninstall / reason */
export function judgeRegistry(entries) {
  const out = [];
  entries.forEach((e, idx) => {
    const label = e?.path ?? `#${idx}`;
    for (const f of ["path", "who", "uninstall", "reason"]) {
      if (!e?.[f] || !String(e[f]).trim()) {
        out.push({ line: 0, text: `登记表条目「${label}」缺 \`${f}\``, rule: "R5" });
      }
    }
  });
  return out;
}

/** 一段源码的全部违规（供自测与主流程共用）。
 *  `ctx = { file, exemptions }`——只有 R1 吃豁免（R1 是唯一会产生「正当绝对值」的判据）。 */
export function scanSource(src, ctx = {}) {
  const file = ctx.file ?? "";
  const exemptions = ctx.exemptions ?? [];
  const r1 = absolutePathViolations(src).filter(
    (h) => !exemptions.some((e) => e.file === file && h.raw.includes(e.contains)),
  );
  return [...r1, ...percentPathViolations(src), ...appGetPathViolations(src), ...registryHiveViolations(src)];
}

/** R6：豁免账本反向核验——挂的片段必须在文件里还能找到，否则报「过期豁免」 */
export function judgeExemptRegistry(exemptions, readFile) {
  const out = [];
  for (const e of exemptions) {
    let text = null;
    try {
      text = readFile(e.file);
    } catch {
      out.push({ line: 0, text: `豁免条目指向的文件读不到：${e.file}`, rule: "R6" });
      continue;
    }
    if (!text.includes(e.contains)) {
      out.push({ line: 0, text: `过期豁免：\`${e.file}\` 里已找不到 \`${e.contains}\`——账本腐烂，删掉该条（或改准片段）`, rule: "R6" });
    }
  }
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

export function runSelfTest() {
  const cases = [
    // ── 正控：合规 ⇒ 0 处 ──
    ["正控①：登记过的落点 `%APPDATA%\\linkdesk` ⇒ 0 处", 'const p = "%APPDATA%\\\\linkdesk\\\\plugins";', 0],
    ["正控②：登记落点的子路径（`%LocalAppData%\\Programs\\linkdesk\\x`）⇒ 0 处", 'const q = "%LocalAppData%\\\\Programs\\\\linkdesk\\\\bin";', 0],
    ["正控③：注释里的盘符路径（注释被剥掉）⇒ 0 处", "// 例：E:/linkdesk/src 是开发机路径\nconst a = 1;", 0],
    ["正控④：`https://linkdesk:` 协议不被误判成盘符 ⇒ 0 处", 'const u = "linkdesk://abc/x"; const v = "https://x/y";', 0],
    ["正控⑤：`app.getPath('userData')` 已登记 ⇒ 0 处", 'const d = app.getPath("userData");', 0],
    ["正控⑥：注册表**读**调用旁的 HKLM（`RegOpenKeyExW … KEY_READ`）⇒ 0 处", "HKEY hives[] = { HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE };\nRegOpenKeyExW(hives[i], path, 0, KEY_READ, &h);", 0],
    ["正控⑦：登记表条目齐备 ⇒ 0 处（R5）", "x", 0],
    // ── 负控：违规 ⇒ 必须报 ──
    ["🔴 负控①：出厂件里写死开发机盘符 `E:/linkdesk-build` ⇒ R1 报红", 'const out = "E:/linkdesk-build";', 1],
    ["🔴 负控②：`%APPDATA%\\Temp`（自造落点，总账 D14 空壳）⇒ R2 报红", 'const t = "%APPDATA%\\\\Temp\\\\x";', 1],
    ["🔴 负控③：`app.getPath('sessionData')` 未登记 ⇒ R3 报红", 'const d = app.getPath("sessionData");', 1],
    ["🔴 负控④：注册表**写**调用旁有 HKLM ⇒ R4 报红", "RegCreateKeyExW(HKEY_LOCAL_MACHINE, sub, 0, nullptr, 0, KEY_WRITE, nullptr, &h, nullptr);", 1],
  ];

  let bad = 0;
  const check = (tag, got, want) => {
    const pass = got === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got}（期望 ${want}）\n`);
  };

  for (const [tag, src, want] of cases) {
    if (tag.includes("R5")) {
      check(tag, judgeRegistry(SURFACE_ALLOW).length, want);
      continue;
    }
    check(tag, scanSource(src).length, want);
  }

  // 正控⑧：豁免账本命中 ⇒ 同一行判绿（R1 是唯一吃豁免的判据）
  check(
    "正控⑧：已登记的「非落点绝对值」（文件 ＋ 片段命中）⇒ 0 处",
    scanSource("const WINDOWS_DANGEROUS_DIRS = ['C:/Windows'];", {
      file: "electron/services/filesystem-guard.ts",
      exemptions: ABSOLUTE_PATH_EXEMPT,
    }).length,
    0,
  );

  // 🔴 负控⑤/⑥：登记表缺字段（R5）· 豁免账本腐烂（R6）
  check("🔴 负控⑤：登记表缺 `uninstall` ⇒ R5 报红", judgeRegistry([{ path: "x", who: "y", reason: "z" }]).length, 1);
  check(
    "🔴 负控⑥：豁免挂的片段已不存在 ⇒ R6 报「过期豁免」",
    judgeExemptRegistry([{ file: "a.ts", contains: "早就删了的片子" }], () => "文件里没有那段").length,
    1,
  );

  // 🔴 真实仓库绿基线（照 check-gate-health 正控⑨的写法：尺子必须在**今天的真仓**上判绿）
  const real = scanRepo().violations;
  check("正控⑨：**今天的真仓**判绿（R1–R6 合计 0 处）", real.length, 0);
  if (real.length) for (const v of real.slice(0, 10)) process.stdout.write(`     ${v}\n`);

  process.stdout.write(
    bad === 0 ? `\n✅ check-install-surface self-test 全过（正控绿 / 负控红）——尺子不是在恒绿。\n` : `\n🔴 check-install-surface self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT_RE.test(entry.name) && !TEST_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** 扫全仓，返回 { violations: string[], scanned: number } */
export function scanRepo() {
  const violations = [];
  let scanned = 0;
  for (const dir of SCAN_DIRS) {
    const root = resolve(ROOT, dir);
    if (!existsSync(root)) continue;
    for (const f of walk(root)) {
      scanned++;
      const src = readFileSync(f, "utf8");
      for (const v of scanSource(src, { file: rel(f), exemptions: ABSOLUTE_PATH_EXEMPT })) {
        violations.push(`${rel(f)}:${v.line}: [${v.rule}] ${v.text}`);
      }
    }
  }
  const readRel = (p) => readFileSync(resolve(ROOT, p), "utf8");
  for (const v of judgeRegistry(SURFACE_ALLOW)) violations.push(`[${v.rule}] ${v.text}`);
  for (const v of judgeExemptRegistry(ABSOLUTE_PATH_EXEMPT, readRel)) violations.push(`[${v.rule}] ${v.text}`);
  return { violations, scanned };
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const { violations, scanned } = scanRepo();

  if (violations.length) {
    console.error(`❌ 用户机落点契约门禁失败——${violations.length} 处（契约正文 = docs/开发管理/用户机落点规范.md）：`);
    for (const v of violations.slice(0, 60)) console.error(`   ${v}`);
    if (violations.length > 60) console.error(`   …（共 ${violations.length} 处，其余略）`);
    console.error(`   处置：① 落点是错的 → 改用登记过的标准位；② 落点是新的且正当 → 在规范文档与 SURFACE_ALLOW 各登记一行，再落代码。`);
    process.exit(1);
  }
  console.log(
    `✅ 用户机落点契约通过——${scanned} 个生产文件零越界（登记落点 ${SURFACE_ALLOW.length} 条／app.getPath 键 ${APP_GETPATH_KEYS.length} 个；R1 绝对路径 · R2 自造落点 · R3 新键 · R4 HKLM 写 · R5 表自洽）。`,
  );
}

main();
