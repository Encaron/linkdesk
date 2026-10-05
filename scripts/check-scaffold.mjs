/**
 * 机械检查：**脚手架生成物形状自检**（E6#95c · L3.7 门禁 G3 · 红灯）。
 *
 * 为什么要（06 §3.1）：脚手架 = **第三方作者抄的第一份样本**。它歪，整个生态歪——
 * 模板从 2.1 轮起就没被任何门禁照过，05 列出的 7 项缺口就是这么长出来的。
 *
 * 做法：把模板**真跑一遍**生成到仓外一次性目录（memory `dev-artifact-hygiene`：
 * 构建/验证产物只落 `E:\linkdesk-build+scratch\`，Temp 零残留），然后**只做静态断言**
 * （不跑 `npm install`——慢且要联网）。
 *
 * 🔴 **E6#103（L7 7.6）新增断言 9：建仓三语义**（照抄 `cargo new`）——生成物落在**仓外**要自带
 *   `main` 分支 + 一次初始提交；落在**某个 git 仓内**则**不建**嵌套仓；`--no-git` 一律不建。
 *   **两条相反路径都要验**（只验一边 = 半边门禁），负控见 `--self-test`。
 *
 * 🔴 **E6#108（L7 7.9）新增断言 10：生成物里不许出现内部任务号**（`E6#102` / `E5.7#98` 这类）。
 *   理由与作者面文档门禁**同一条**（memory `ai-friendliness-three-layers`）：任务号是本项目的内部
 *   进度坐标，对陌生作者的 AI 是**无法解析的坐标**。而脚手架生成物是作者读到的**第三种东西**——
 *   不是文档，是**他打开的第一个工程**（`src/index.tsx` 的注释、CI 配置、verify 脚本都在里面）。
 *   🔴 **尺子与 `check-author-docs-symbols.mjs` 同一份**（`scripts/lib/author-symbols.mjs`）——
 *   两处各写一份正则 = 必然漂移。实测立此断言时仓里已有 **15 处**（作者面对照：7.8 清过 155 处）。
 *
 * 🔴 **E6#109h-b②（件 2 落地·脚手架模板）新增断言 11：生成物零裸类名 / 零裸关键帧**。
 *   插件视图里宿主、共享组件与**所有已加载插件**的 CSS 装在**同一张样式表**里 ⇒ 裸类名是全局
 *   标识符（`.badge` 案同形：不报错、只是长得不对）。模板是第三方作者抄的**第一份样本**——
 *   **新产物不能一边出生一边违规**，否则作者拿到手的第一个工程就红在自己的 CI 上。
 *   🔴 **判据不许在这里重写**：调的是 SDK 里 `check-css-namespace` 腿的**同一个函数**
 *   （`runPluginPrefixCheck`，与只读审计工具 `scripts/plugin-css-prefix-audit.mjs` 同一个 dist 导出）——
 *   在这里再抄一条「名字是否以 `<id>-` 开头」= 给下一次漂移埋钉子（理由与断言 10 同款，见下面「闸 3」）。
 *   ⚠️ **射程（要说清，别以为它兜住了全部）**：本判据只看 **CSS 侧的定义点**（`.x {}` / `@keyframes x`）；
 *   模板里的**渲染点**（`src/index.tsx` 的 `className="…"`）与 `animation:` 引用**不在射程内**——
 *   「CSS 改了、TSX 没改」这种反向错误本条**不会红**（那属于改名轮的类名 token 判据，见 17 号档 §四）。
 *   ⇒ 本断言证的是「**模板不再生成裸类名**」，不是「模板的 CSS 与 TSX 必然对得上」。
 *   ⚠️ **依赖 SDK dist**：判据本体在 `packages/plugin-sdk/dist/**`（gitignored · tsc 派生物）⇒
 *   缺失或比 `src/**` 旧时**先构建**（≈2s，只在缺失/过旧时付）——对齐 `scripts/build-linkdesk-ui.mjs`
 *   那条「CI 与本地走同一条路：dist 缺失 ⇒ 构建」。**不构建就会拿旧判据报绿 = 假绿**
 *   （memory `snapshot-shadows-truth-bug-class`：验证的是手边那份、不是真发出去那份）。
 *
 * 🔴 **新增断言 12：`vitest.setup.ts` 必须是指针形态**。模板里这份曾经是壳仓 mock 的**逐字副本**
 *   （＝「新插件一出生就自带一份会漂的拷贝」，且没有任何门禁守着它跟真源走）。真源收敛进 SDK 之后
 *   （`@linkdesk/plugin-sdk/vitest-setup`），模板这份只该是**一行指针**——本断言把「收敛」钉住：
 *   三条判据（含 subpath / 无 mock 标志串 / 行数 ≤ 5），负控见 `--self-test`。
 *
 * 🔴 **「插件最低壳版本门禁」G3（2026-10-06）新增断言 13：生成物的 `minAppVersion` = 算出来的地板**。
 *   模板默认值靠人抄 ⇒ 必然出现「插件早跑了新壳、模板还留着旧号」——作者照抄旧号，装到旧壳上
 *   **整只加载失败**（不是少个组件）。⇒ 本断言判**相等**（抄低会崩、抄高白丢老壳用户，两面都拦）。
 *   判据同样**不在这里重写**：调 SDK `ui-min-app-version` 腿的同一批导出（`loadUiSurfaceLedger` /
 *   `collectUiImportNames` / `computeUiFloor` / `runUiMinAppVersionCheck`）——同断言 11 的理由。
 *
 * 🔴 **闸 3（规则不许腐烂）的关键设计**：期望是**契约**，必须**显式写死**；从模板现场读 = 断言恒真 = 假门禁
 * （这正是 `check-file-size.mjs` 被关掉的同类错误）。**契约要显式，实现要现场读。**
 * 唯一的例外是「解析规则」这类**别人的实现**（CHANGELOG 切段正则 / 占位符 values 集合）——
 * 那些**从源码现场抽**，绝不手抄第二份（否则 SDK 改了正则、这里还认旧格式 = 门禁自己腐烂）。
 *
 * 用法：node scripts/check-scaffold.mjs（已挂 npm run check）
 *       node scripts/check-scaffold.mjs --self-test   # 判据自测：拿桩 CLI 复跑建仓断言，证明它会红
 * 🔴 **本门禁需要 git 在 PATH 上**（断言 9 要真建仓、真问 `git rev-parse`）——缺 git 会明确报出来，
 *   不会伪装成「模板坏了」。
 * 退出码 0 = 生成物符合契约；1 = 有断言未过（逐条打印缺什么、该改哪）。
 */

import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
/** 🔴 断言 10 的尺子与 `check-author-docs-symbols.mjs` **同一份**（lib 里的唯一定义处）——
 *  作者面禁用内部任务号这件事，文档树与脚手架生成物必须同一把尺。 */
import { scanText } from "./lib/author-symbols.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG_DIR = join(ROOT, "packages", "create-linkdesk-plugin");
export const TEMPLATE_DIR = join(PKG_DIR, "template");
const CLI = join(PKG_DIR, "index.js");

/**
 * 一次性生成目录（仓外，memory `dev-artifact-hygiene`）；可用 LINKDESK_SCRATCH 覆盖。
 *
 * 🔴 默认**从仓库根推导**（`<repo>/../linkdesk-build+scratch`），**不写死盘符**：
 *   本机 ROOT=E:\linkdesk ⇒ 解析出来正是 `E:\linkdesk-build+scratch`（策略分毫不变）；
 *   云端 ROOT=D:\a\linkdesk\linkdesk ⇒ 解析成它的兄弟目录，可写且随 runner 一起清掉。
 *   写死 `E:/` 的后果（2026-09-12 CI 实测）：`mkdirSync` **ENOENT——云端没有 E 盘**
 *   （run 34681219300）。且**任何没有 E 盘的机器都会炸，包括第三方作者**跑 `npm run check`。
 */
export const SCRATCH_ROOT = process.env.LINKDESK_SCRATCH || resolve(ROOT, "..", "linkdesk-build+scratch");
const SCRATCH_DIR = join(SCRATCH_ROOT, "scaffold-check");
export const PROBE_NAME = "scaffold-probe";

/** 契约：生成物**必须**含这些文件（06 §3.2 断言 1；显式写死，不从模板现场读） */
const EXPECTED_FILES = [
  "plugin.json",
  "package.json",
  "tsconfig.json",
  "README.md",
  "CHANGELOG.md",
  // E6#105k（L7 7.8 轮）：每个新插件**天生带**给 AI 看的进场文件（铁律内联 + 规则去哪找 + 下一步动线）
  "AGENTS.md",
  ".gitignore",
  ".vscode/settings.json",
  // 🔴 E6#102（L7 7.5 轮）：新插件**一建出来就自带门禁**——这几件随模板走，
  // 否则「搬出去不等于脱管」只覆盖到已有的 18 只，新插件第一分钟就脱管。
  ".github/workflows/ci.yml",
  "scripts/ci-verify.mjs",
  "vitest.config.ts",
  "vitest.setup.ts",
  "resources/icon.svg",
  "i18n/en.json",
  "src/index.tsx",
  "src/index.css",
];

/** 契约：`package.json` 的 scripts **必须**含这些命令（断言 5） */
const EXPECTED_SCRIPTS = ["dev", "build", "publish", "validate", "lint", "verify", "test"];

/** 契约：模板的 `vitest.setup.ts` 是**一行指针**（断言 12）——三条判据，任一不满足即红 */
const SETUP_IMPORT_MARKER = "@linkdesk/plugin-sdk/vitest-setup";
/** mock 体的标志串：把共享 mock 抄回来任一段都会命中（**盯内容形态**，与真源的文件名解耦） */
const SETUP_MOCK_MARKERS = ["__ldkConfigStore", "pathMock", "configurationMock", "workspaceMock", "filesystemMock", "tabsMock"];
const SETUP_POINTER_MAX_LINES = 5;

/**
 * 模板里**不是**占位符的 `{{…}}`——扫描豁免（E6#102 同笔）。
 *
 * GitHub Actions 的表达式就是 `${{ … }}` 形状，与脚手架的 `{{pluginName}}` 占位符同形；
 * `.github/**` 下的文件是**给 GitHub 看的**，那里面出现的 `{{…}}` 一律不作数。
 * 豁免范围刻意只有这一条路径——别的文件里出现 `{{…}}` 仍然是「未替换的占位符」。
 */
const PLACEHOLDER_SCAN_EXEMPT = /^\.github\//;

export const failures = [];
const fail = (msg, hint) => failures.push(hint ? `${msg}\n     ↳ ${hint}` : msg);

/* ── 断言 11 / 13 的判据来源：SDK 的 dist（**同一条腿的同一个函数**，不手抄第二份） ── */

const SDK_DIR = join(ROOT, "packages", "plugin-sdk");
const SDK_PREFIX_MODULE = join(SDK_DIR, "dist", "eslint", "checks", "plugin-prefix.js");
/** 断言 13 的判据模块——`minAppVersion` 声明核对那条腿（与作者跑 `lint` / `build` 是**同一个函数**） */
const SDK_UI_FLOOR_MODULE = join(SDK_DIR, "dist", "eslint", "checks", "ui-min-app-version.js");
const SDK_SRC_DIR = join(SDK_DIR, "src");

/** 递归求最新改动时间（空目录 → 0），用来判 dist 是否落后于源码 */
function newestMtime(dir) {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * 确保 SDK 的 dist 新鲜（断言 11 / 13 都要它）：`samplePath` 缺失或落后于 `src/**` ⇒ **先构建一次**。
 * 返回 `false` = dist 不可用（已记 `failures` ⇒ 门禁红，**绝不静默放过**）。
 * 一次运行只构建一次——多道断言共用它，别对每道各建一遍。
 */
let sdkDistFresh = false;
function ensureSdkDist(samplePath) {
  if (sdkDistFresh) return true;
  const stale =
    !existsSync(samplePath) ||
    (existsSync(SDK_SRC_DIR) && newestMtime(SDK_SRC_DIR) > statSync(samplePath).mtimeMs);
  if (stale) {
    // Windows 上 `npm` 只能经 shell 启动（`npm.cmd` 直启在 Git Bash 下 EINVAL，同 assertPublishFidelity）。
    // 🔴 用**整条命令串**而不是「命令 + 参数数组」：Node 的 DEP0190 只对后者告警（参数不转义、只拼接），
    //    而这里的两个值都是固定字面量（脚本自算的仓库内路径），不含任何外部输入。
    const r = spawnSync(`npm run --prefix "${SDK_DIR}" build`, { cwd: ROOT, encoding: "utf8", shell: true });
    if (r.status !== 0) {
      fail(
        "构建 @linkdesk/plugin-sdk 的 dist 失败——断言 11 / 13 没有判据可用（**拿不到判据就报红，不许静默放过**）",
        (r.stderr || r.stdout || "").trim().split("\n").slice(0, 5).join("\n     ") +
          "\n     修好 SDK 的 tsc 构建，或手工 `npm run --prefix packages/plugin-sdk build` 看完整输出",
      );
      return false;
    }
  }
  sdkDistFresh = true;
  return true;
}

/**
 * 取断言 11 的判据函数（懒加载；dist 缺失或落后于 `src/**` 时**先构建**）。
 * 返回 `null` = 拿不到判据（原因已记进 `failures` ⇒ 门禁红，**绝不静默放过**）。
 */
let prefixCheckFn; // undefined = 尚未尝试；null = 试过且失败
export function getPrefixCheck() {
  if (prefixCheckFn !== undefined) return prefixCheckFn;
  prefixCheckFn = null;
  if (!ensureSdkDist(SDK_PREFIX_MODULE)) return null;

  try {
    // 同步 require：本仓 engines 是 Node ≥24，可直接 require ESM。
    // ⚠️ SDK dist 将来若引入**顶层 await**，这里会报 ERR_REQUIRE_ASYNC_MODULE——那时改用
    //    `await import()` 并把本脚本主流程改成异步（`plugin-css-prefix-audit.mjs` 就是这么写的）。
    const req = createRequire(import.meta.url);
    const mod = req(SDK_PREFIX_MODULE);
    if (typeof mod.runPluginPrefixCheck !== "function") {
      fail(
        `SDK dist 里没有 runPluginPrefixCheck（${SDK_PREFIX_MODULE}）——dist 与源码不同步`,
        "先 `npm run --prefix packages/plugin-sdk build`；别在这里补一条自己的判据",
      );
      return null;
    }
    prefixCheckFn = mod.runPluginPrefixCheck;
  } catch (e) {
    fail(
      `加载断言 11 的判据失败（${SDK_PREFIX_MODULE}）：${e instanceof Error ? e.message : String(e)}`,
      "先 `npm run --prefix packages/plugin-sdk build`；本断言刻意不自带判据——那是 check-css-namespace 腿的同一处实现",
    );
  }
  return prefixCheckFn;
}

/** 断言 13 要用的四处导出——同一个模块，缺一即 dist 与源码不同步 */
const UI_FLOOR_EXPORTS = ["loadUiSurfaceLedger", "computeUiFloor", "collectUiImportNames", "runUiMinAppVersionCheck"];

/**
 * 取断言 13 的判据（懒加载，dist 新鲜度判据同 `getPrefixCheck`）。`null` = 拿不到（已记 `failures`）。
 * ⛔ 刻意**不在本脚本另抄一份地板公式**——判据住在 SDK 那条腿里（单一算点，改判据只改一处）。
 */
let uiFloorApi; // undefined = 尚未尝试；null = 试过且失败
export function getUiFloorApi() {
  if (uiFloorApi !== undefined) return uiFloorApi;
  uiFloorApi = null;
  if (!ensureSdkDist(SDK_UI_FLOOR_MODULE)) return null;

  try {
    const req = createRequire(import.meta.url);
    const mod = req(SDK_UI_FLOOR_MODULE);
    const missing = UI_FLOOR_EXPORTS.filter((k) => typeof mod[k] !== "function");
    if (missing.length > 0) {
      fail(
        `SDK dist 的 ui-min-app-version 少了导出 ${missing.join("、")}（${SDK_UI_FLOOR_MODULE}）——dist 与源码不同步`,
        "先 `npm run --prefix packages/plugin-sdk build`；别在这里补一条自己的判据",
      );
      return null;
    }
    uiFloorApi = mod;
  } catch (e) {
    fail(
      `加载断言 13 的判据失败（${SDK_UI_FLOOR_MODULE}）：${e instanceof Error ? e.message : String(e)}`,
      "先 `npm run --prefix packages/plugin-sdk build`；本断言刻意不自带判据——那是 ui-min-app-version 腿的同一处实现",
    );
  }
  return uiFloorApi;
}

// ── 现场读「别人的实现」（不手抄第二份——闸 3） ──

/** SDK 的 CHANGELOG 切段正则——从 `publish.ts` 源文件抽取（不 import dist：dist 未构建时静默失效 = 假门禁） */
function loadChangelogHeadingRe() {
  const src = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "publish.ts"), "utf8");
  const m = src.match(/^const CHANGELOG_HEADING = (\/.*\/[a-z]*);\s*$/m);
  if (!m) {
    fail(
      "抽不到 SDK 的 CHANGELOG_HEADING 正则（packages/plugin-sdk/src/publish.ts）",
      "该常量被改名/改形了——本门禁的解析规则来源断了，**不要手抄一份**，去修这个抽取",
    );
    return null;
  }
  const last = m[1].lastIndexOf("/");
  return new RegExp(m[1].slice(1, last), m[1].slice(last + 1));
}

/** CLI 的占位符 values 集合——从 `index.js` 抽取 `const values = { … }` 的键 */
function loadCliValueKeys() {
  const src = readFileSync(CLI, "utf8");
  const block = src.match(/const values = \{([\s\S]*?)\n {2}\};/);
  if (!block) {
    fail("抽不到 CLI 的 `const values = { … }`（packages/create-linkdesk-plugin/index.js）",
      "占位符来源断了——去修抽取，别手写一份键名表");
    return null;
  }
  return [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
}

// ── 生成（真跑 CLI，不模拟） ──

export function generate() {
  if (existsSync(SCRATCH_DIR)) rmSync(SCRATCH_DIR, { recursive: true, force: true });
  mkdirSync(SCRATCH_DIR, { recursive: true });
  const r = spawnSync(process.execPath, [CLI, PROBE_NAME], { cwd: SCRATCH_DIR, encoding: "utf8" });
  if (r.status !== 0) {
    fail(`脚手架 CLI 退出码 ${r.status}——生成都没成功，后面断言无从谈起`,
      (r.stderr || r.stdout || "").trim().split("\n").slice(0, 5).join("\n     "));
    return null;
  }
  return join(SCRATCH_DIR, PROBE_NAME);
}

/** 递归收集相对路径（正斜杠，排序）——**`.git/` 不计**：生成物现在自带仓，它不是「模板产物」 */
function listFiles(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else out.push(full.slice(base.length + 1).replace(/\\/g, "/"));
  }
  return out.sort();
}

// ── 断言 ──

/**
 * 断言 10 的判据本体（纯函数——`--self-test` 拿它做负控，不重复实现）：
 * 逐文件找**内部任务号**，返回 `rel:行 ← 符号` 形态的命中清单。
 */
export function scanInternalSymbols(dir) {
  const hits = [];
  for (const rel of listFiles(dir)) {
    if (/\.(svg|png|ico|jpg|jpeg|webp|woff2?|ttf)$/i.test(rel)) continue;
    for (const h of scanText(readFileSync(join(dir, rel), "utf8"))) {
      hits.push(`${rel}:${h.line} ← ${h.symbol}`);
    }
  }
  return hits;
}

/**
 * 断言 12 的判据本体（纯函数——`--self-test` 拿它做负控，不重复实现）：
 * 返回「不是指针形态」的理由清单（空 = 过）。三条判据见文件头 ＋ 上面那两个常量。
 */
export function checkSetupPointer(text) {
  const out = [];
  const body = text.replace(/\r\n/g, "\n");
  if (!body.includes(SETUP_IMPORT_MARKER)) {
    out.push(`没有指向共享测试地基——应含一行 \`import "${SETUP_IMPORT_MARKER}";\``);
  }
  const hits = SETUP_MOCK_MARKERS.filter((m) => body.includes(m));
  if (hits.length > 0) {
    out.push(`看着是 mock 体而不是指针（命中 ${hits.join("、")}）——共享 mock 的真源在 SDK，别在这里抄第二份`);
  }
  const lines = body.replace(/\n+$/, "").split("\n").length;
  if (lines > SETUP_POINTER_MAX_LINES) {
    out.push(`行数 ${lines} > ${SETUP_POINTER_MAX_LINES}——指针不该长成一个文件（注释也算行）`);
  }
  return out;
}

/** 断言 13 的判据本体（纯函数——`--self-test` 拿它做负控，不重复实现）：
 *  返回 `{ problems, declared, floor, imports, red }`，`problems` 空 = 过。
 *
 *  守的是哪句话（案卷 02 §四）：**模板的 `minAppVersion` 默认值 = 按模板自己导入的 `@linkdesk/ui`
 *  导出算出来的地板**——而**不是**一个抄下来的旧号（「顺手留着上一个数」正是本格事故的形态：
 *  插件跑了新壳、旧壳用户装上即整只崩）。所以这里判**相等**，不是「≥ 就行」：
 *    · 抄低了 ⇒ 旧壳上装得上、加载即崩（真事故）；
 *    · 抄高了 ⇒ 白白放弃老壳用户（与「默认值 = 模板自身导入的地板」同一条纪律的两面）。
 *  地板与判定都取自 SDK 的 `ui-min-app-version` 腿（`api` 那四个导出）——⛔ 本脚本不算第二份。
 */
export function checkMinAppVersionFloor(dir, api) {
  const problems = [];
  const ledger = api.loadUiSurfaceLedger();
  if (!ledger) {
    return {
      problems: ["读不到 SDK 随包账本（packages/plugin-sdk/schemas/ui-surface.json）——判据没有依据"],
      declared: null,
      floor: null,
      imports: [],
      red: 0,
    };
  }

  const manifestPath = join(dir, "plugin.json");
  let declared = null;
  if (!existsSync(manifestPath)) {
    problems.push("生成物没有 plugin.json——没得核对");
  } else {
    const errors = [];
    const parsed = parseJsonc(readFileSync(manifestPath, "utf8"), errors, { allowTrailingComma: true });
    if (errors.length > 0) {
      problems.push(`plugin.json 不是合法 JSONC：${errors.map((e) => printParseErrorCode(e.error)).join("、")}`);
    } else {
      declared = typeof parsed?.minAppVersion === "string" ? parsed.minAppVersion : null;
      if (declared === null) problems.push("plugin.json 未声明 `minAppVersion`（模板必须带一个算出来的默认值）");
    }
  }

  const imports = api.collectUiImportNames(dir);
  const floor = api.computeUiFloor(ledger, imports.map((i) => i.name)); // { floor, baseline, driver, missing }
  const red = api.runUiMinAppVersionCheck(dir);

  const names = imports.map((i) => i.name).join("、") || "（无）";
  if (floor.missing.length > 0) {
    problems.push(`模板导入了账本里没有的导出：${floor.missing.join("、")}——拼错 / 私有 API / 子路径都不是许诺的导出面`);
  }
  if (red.length > 0) {
    problems.push(`生成物过不了那条腿（${red.length} 处）：\n     ${red.map((v) => `${v.file}:${v.line} ${v.message.split("：")[0]}`).join("\n     ")}`);
  }
  if (declared !== null && floor.floor !== null && declared !== floor.floor) {
    const driver = floor.driver ? `${floor.driver.name}（since ${floor.driver.since}）` : `基线（vendor 供给起点那一批）`;
    problems.push(
      `minAppVersion = ${declared}，但按模板自身导入算出的地板是 ${floor.floor}` +
        `（导入 ${names}；顶上去的是 ${driver}）——模板默认值必须是这个地板：` +
        `抄低了旧壳上加载即崩，抄高了白白放弃老壳用户`,
    );
  }
  return { problems, declared, floor: floor.floor, imports, red: red.length };
}

function runAssertions(genDir) {
  const generated = listFiles(genDir);

  // 断言 1：生成物文件清单 ⊇ 契约（盯「有人删了模板文件」）
  const missingFiles = EXPECTED_FILES.filter((f) => !generated.includes(f));
  if (missingFiles.length > 0) {
    fail(`生成物缺文件：${missingFiles.join("、")}`,
      "模板目录被删了文件，或 CLI 生成流程漏拷——对照 05 §2.9 生成物契约");
  }

  // 断言 7：模板占位符集合 == CLI values 集合（盯「新增占位符忘加 values」这类静默失败）
  const cliKeys = loadCliValueKeys();
  if (cliKeys) {
    const used = new Set();
    for (const rel of listFiles(TEMPLATE_DIR)) {
      if (PLACEHOLDER_SCAN_EXEMPT.test(rel)) continue; // `.github/**` 的 `${{ … }}` 不是占位符
      const text = readFileSync(join(TEMPLATE_DIR, rel), "utf8");
      for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) used.add(m[1]);
    }
    const orphan = [...used].filter((k) => !cliKeys.includes(k));
    const unused = cliKeys.filter((k) => !used.has(k));
    if (orphan.length > 0) {
      fail(`模板里有 CLI 不认识的占位符：${orphan.map((k) => `{{${k}}}`).join("、")}`,
        "生成后会**原样留在作者的文件里**——把键名加进 index.js 的 values，或改对拼写");
    }
    if (unused.length > 0) {
      fail(`CLI 定义了模板里没用的占位符：${unused.join("、")}`,
        "死 value（无害但会烂）——从 index.js 的 values 删掉，或补进模板");
    }
    // 生成后不得残留任何 {{...}}（拼错的占位符、CLI 漏替换都会在这里现形）
    const leftover = [];
    for (const rel of generated) {
      if (/\.(svg|png|ico|jpg)$/i.test(rel)) continue;
      if (PLACEHOLDER_SCAN_EXEMPT.test(rel)) continue; // `.github/**` 的 `${{ … }}` 不是占位符
      const text = readFileSync(join(genDir, rel), "utf8");
      for (const m of text.matchAll(/\{\{[^}]*\}\}/g)) leftover.push(`${rel} ← ${m[0]}`);
    }
    if (leftover.length > 0) {
      fail(`生成物残留未替换的占位符：\n     ${leftover.join("\n     ")}`,
        "作者会拿到一个带 {{…}} 的工程——检查上面的占位符集合对不对");
    }
  }

  // 断言 3：plugin.json 能被 jsonc 解析（占位符替换把 JSON 写坏）
  const manifestPath = join(genDir, "plugin.json");
  let manifest = null;
  if (existsSync(manifestPath)) {
    const errors = [];
    manifest = parseJsonc(readFileSync(manifestPath, "utf8"), errors, { allowTrailingComma: true });
    if (errors.length > 0) {
      fail(`plugin.json 不是合法 JSONC：${errors.map((e) => printParseErrorCode(e.error)).join("、")}`,
        "占位符替换或模板编辑把它写坏了——作者第一步就会撞墙");
    }
  }

  if (manifest) {
    // 断言 2：**必须显式声明 `pluginId`** + 含 icon（E6#103 反转，见文件头 §〇 与下面那段注记）
    if (!manifest.pluginId) {
      fail("plugin.json 缺 `pluginId`——硬约束 11 要求插件身份**显式声明**（E6#98g 起 schema 有该字段）",
        '补 `"pluginId": "{{pluginName}}"`（模板里本来就有这一行）；靠目录名兜底 = 改目录名就换了身份');
    } else if (manifest.pluginId !== PROBE_NAME) {
      fail(`plugin.json 的 pluginId = ${JSON.stringify(manifest.pluginId)}，期望生成时的插件名 ${JSON.stringify(PROBE_NAME)}`,
        "占位符没被替换成真名，或模板里写死了别的 id——作者的插件会用错身份");
    }
    if (!manifest.icon) {
      fail("plugin.json 缺 `icon`——图标栏 / 标签页 / 市场都没有图标",
        "补 `\"icon\": \"resources/icon.svg\"`（模板自带占位图）");
    }
    // 断言 3（续）：entry 指向的文件真的存在
    if (manifest.entry && !generated.includes(manifest.entry)) {
      fail(`plugin.json 的 entry 指向不存在的文件：${manifest.entry}`,
        "改模板时把入口挪了位置，却忘了同步 plugin.json");
    }
  }

  // 断言 4：CHANGELOG.md 的版本段标题能被 SDK 切成段（否则市场「更改日志」页签空白）
  const changelogPath = join(genDir, "CHANGELOG.md");
  if (existsSync(changelogPath) && manifest) {
    const headingRe = loadChangelogHeadingRe();
    if (headingRe) {
      const lines = readFileSync(changelogPath, "utf8").split("\n");
      // 「像版本段标题」= markdown 标题且版本号打头（允许 `[`/`v` 前缀）——放宽到 #{1,6} 好抓「少写一个 #」
      const candidate = /^#{1,6}\s+\[?[vV]?\d+\.\d+\.\d+/;
      const bad = lines.filter((l) => candidate.test(l) && !headingRe.test(l));
      if (bad.length > 0) {
        fail(`CHANGELOG.md 有切不到段的版本标题：\n     ${bad.map((l) => l.trim()).join("\n     ")}`,
          "SDK publish 切不出来的段 = 市场显示「此版本未提供变更说明」——对照 02 §四 的段标题格式");
      }
      // plugin.json 的当前 version 必须真能切出一个段（模板教的就是「bump 同笔补段」）
      const versionLine = lines.find((l) => {
        const m = l.match(headingRe);
        return m && m[1] === manifest.version;
      });
      if (!versionLine) {
        fail(`CHANGELOG.md 里切不到 plugin.json 的当前版本段：v${manifest.version}`,
          "模板的初始段版本号与 plugin.json 的 version 不一致——两个数字必须逐字相同");
      }
    }
  }

  // 断言 5：package.json 的 scripts ⊇ 契约命令（盯「有人又漏接 SDK 命令」）
  const pkgPath = join(genDir, "package.json");
  if (existsSync(pkgPath)) {
    const scripts = Object.keys(JSON.parse(readFileSync(pkgPath, "utf8")).scripts || {});
    const missing = EXPECTED_SCRIPTS.filter((s) => !scripts.includes(s));
    if (missing.length > 0) {
      fail(`package.json 的 scripts 缺：${missing.join("、")}`,
        "作者没有这条命令可用——补 `\"<name>\": \"linkdesk-plugin-sdk <name>\"`");
    }
  }

  // 断言 6：i18n/en.json 每个 key 都能在 src/ 里找到 t("…") 调用（零死 key，盯 05 §2.8 回归）
  const i18nPath = join(genDir, "i18n/en.json");
  if (existsSync(i18nPath)) {
    const keys = Object.keys(JSON.parse(readFileSync(i18nPath, "utf8")));
    const srcText = generated
      .filter((f) => f.startsWith("src/"))
      .map((f) => readFileSync(join(genDir, f), "utf8"))
      .join("\n");
    const called = new Set(
      [...srcText.matchAll(/\bt\(\s*(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1/g)].map((m) => m[2]),
    );
    const dead = keys.filter((k) => !called.has(k));
    if (dead.length > 0) {
      fail(`i18n/en.json 有 ${dead.length} 个死 key（src/ 里没有 t() 调用）：\n     ${dead.join("\n     ")}`,
        "死 key = 教作者写死代码——补上调用，或从字典删掉");
    }
  }

  // 断言 10：生成物里不许出现**内部任务号**（E6#… / E5.7#… 这类；尺子与作者面文档门禁同一份）
  const symbolHits = scanInternalSymbols(genDir);
  if (symbolHits.length > 0) {
    fail(`生成物里有 ${symbolHits.length} 处内部任务号：\n     ${symbolHits.join("\n     ")}`,
      "任务号是**本项目的内部坐标**，第三方作者的 AI 解析不了——删掉坐标、保留「为什么」（写成一句人话）；" +
        "尺子与 `check-author-docs-symbols.mjs` 同一份（`scripts/lib/author-symbols.mjs`）");
  }

  // 断言 11：生成物**零裸类名 / 零裸关键帧**（E6#109h-b②）——判据来自 SDK 的同一条腿，见文件头
  const prefixCheck = getPrefixCheck();
  if (prefixCheck) {
    const report = prefixCheck(genDir);
    if (report.violations.length > 0) {
      const points = report.violations
        .map((v) => `${v.file}:${v.line}  ← ${v.message.split("——")[0].trim()}`)
        .join("\n     ");
      fail(
        `生成物有 ${report.violations.length} 处命名空间违规` +
          `（裸定义类名 ${report.classes.length} / 裸关键帧 ${report.keyframes.length}）：\n     ${points}`,
        "模板里的示例类名必须带 `{{pluginName}}-` 前缀（生成后即 `<pluginId>-`）——插件视图里宿主、" +
          "共享组件与所有已加载插件的 CSS 同表，裸类名是全局标识符；改模板的 index.css + index.tsx（渲染点同笔）",
      );
    }
  }

  // 断言 12：模板的 `vitest.setup.ts` 是**指针形态**（真源 = SDK 的共享测试地基），不是 mock 体 —— 见文件头
  const setupRel = "vitest.setup.ts";
  const setupTemplatePath = join(TEMPLATE_DIR, setupRel.split("/").join("\\"));
  if (!existsSync(setupTemplatePath)) {
    fail(`模板里没有 ${setupRel}——断言 12 没有判据可用`, "它仍应在 EXPECTED_FILES 里（新插件一出生就该有测试地基）");
  } else {
    const setupProblems = checkSetupPointer(readFileSync(setupTemplatePath, "utf8"));
    if (setupProblems.length > 0) {
      fail(
        `模板的 ${setupRel} 不是指针形态：\n     ${setupProblems.join("\n     ")}`,
        `共享 mock 的真源是 SDK 的 \`${SETUP_IMPORT_MARKER}\`——模板这份只该是「一两行注释 ＋ 一行 import」；` +
          "插件专属的桩住各仓自己的测试文件里（那条纪律写在模板 AGENTS.md 里）",
      );
    }
  }

  // 断言 13：生成物的 `minAppVersion` == 按模板自身导入算出的地板（判据 = SDK 那条腿，见 checkMinAppVersionFloor）
  const floorApi = getUiFloorApi();
  if (floorApi) {
    const verdict = checkMinAppVersionFloor(genDir, floorApi);
    if (verdict.problems.length > 0) {
      fail(
        `生成物的 minAppVersion 默认值不对（声明 ${verdict.declared ?? "无"} / 地板 ${verdict.floor ?? "无法算"}）：\n     ` +
          verdict.problems.join("\n     "),
        "模板的 `plugin.json` 默认值必须是「按模板自身 `@linkdesk/ui` 导入算出来的地板」——" +
          "改模板导入后同笔改它（作者面说明：《插件分发格式》§minAppVersion / 《组件速查》§2.1）；" +
          "题面见案卷 02 §四、03 §二 T1",
      );
    }
  }

  return generated;
}

/**
 * 断言 8：**发布路径保真**——`npm pack` 的 tarball 里，`template/` 下的文件集合必须与仓内模板一致。
 *
 * 🔴 **这一条是实测逼出来的**（E6#95c 执行期发现，06 §3.2 七条断言原样照做会漏）：
 * 断言 1–7 全部读的是**仓内模板目录**，而第三方作者拿到的是 **npm 货架上的解包物**——两者可以不一致。
 * 实证：npm-packlist **恒定丢弃名为 `.gitignore` 的文件**（同目录 `.gitignoreprobe` / `probe.txt` 都能进包），
 * ⇒ 模板里直接放 `.gitignore` 时，**仓内生成一切正常、发布后作者拿到的工程没有 .gitignore**。
 * 这正是 memory `snapshot-shadows-truth-bug-class` 的「快照遮蔽真值」：验证的是手边那份，不是真发出去那份。
 */
function assertPublishFidelity() {
  // Windows 上 `npm` 只能经 shell 启动（`npm` 本体 ENOENT、`npm.cmd` 直启 EINVAL，实测）。
  // 用**整条命令串**而不是「命令 + 参数数组」——Node 的 DEP0190 只对后者告警（参数不转义），
  // 且这里的命令是固定字面量、不含任何外部输入。`npm.cmd` 也必须经 shell：Git Bash 下 EINVAL。
  const r = spawnSync("npm pack --dry-run --json", { cwd: PKG_DIR, encoding: "utf8", shell: true });
  if (r.status !== 0) {
    fail(`npm pack --dry-run 失败（退出码 ${r.status}）——查不了发布路径保真`,
      (r.stderr || "").trim().split("\n").slice(0, 5).join("\n     "));
    return;
  }
  const start = r.stdout.indexOf("[");
  if (start === -1) {
    fail("npm pack --dry-run 没吐 JSON——无法核对 tarball 文件清单");
    return;
  }
  let packed;
  try {
    packed = JSON.parse(r.stdout.slice(start))[0].files.map((f) => f.path);
  } catch (e) {
    fail(`npm pack --dry-run 输出解析失败：${e.message}`);
    return;
  }
  const packedTemplate = new Set(
    packed.filter((p) => p.startsWith("template/")).map((p) => p.slice("template/".length)),
  );
  const repoTemplate = listFiles(TEMPLATE_DIR);
  const dropped = repoTemplate.filter((f) => !packedTemplate.has(f));
  if (dropped.length > 0) {
    fail(`模板文件被 npm 打包丢弃（作者拿到的是残缺模板）：\n     ${dropped.join("\n     ")}`,
      "npm-packlist 有自己的排除表（`.gitignore` 恒定被丢就是实例）——改用不触雷的文件名，由 CLI 在生成时改名");
  }
}

/**
 * 断言 9：**建仓三语义**（E6#103 · L7 7.6 轮）——照抄 `cargo new`，**两条相反路径都要真验**：
 *
 *   ① 不在任何 git 仓内 ⇒ 建仓：`.git` 在 + 一次初始提交 + `git branch --show-current` = `main`
 *   ② 已在某个 git 仓内 ⇒ **不建**（`.git` 不存在，且 `rev-parse --show-toplevel` 仍指外层仓）
 *   ③ `--no-git` ⇒ **不建**，但其余产物照常（逃生口，对标 `cargo new --vcs none`）
 *
 * 🔴 为什么值得一条门禁：这条规则**两个方向都会静默坏**——少建仓 = 作者被 publish 报错挡住、
 *   手敲三条命令（本来的痛点）；多建仓 = 容器目录里每只插件都变成子目录 = 最不想看到的 monorepo。
 *   `spawnSync` 的退出码与 git 输出就是判据，不需要人看。
 *
 * `cliPath` / `root` 是**参数**不是闭包常量：`--self-test` 要拿桩 CLI 复跑同一段判据，
 * 才能证明这些断言不是恒真的（**把 init 拿掉 ⇒ 必红**）。
 * 返回失败清单（空 = 全过）——不往模块级 `failures` 里塞，好让自测复用。
 */
export function checkGitBehavior(cliPath, root) {
  const out = [];
  const add = (msg, hint) => out.push(hint ? `${msg}\n     ↳ ${hint}` : msg);

  const g = (cwd, args) => spawnSync("git", args, { cwd, encoding: "utf8" });

  mkdirSync(root, { recursive: true }); // cwd 必须存在，否则 git 探测失败会被误读成「没装 git」
  if (g(root, ["--version"]).status !== 0) {
    add("本门禁需要 git 在 PATH 上（断言 9 要真建仓、真问 rev-parse）——找不到 git",
      "装上 git，或让 check 在这个环境里能调到它；别把这条当成「模板坏了」");
    return out;
  }

  // 判据的前提：一次性目录必须落在**任何 git 仓之外**，否则「仓外 ⇒ 建仓」这条根本测不了
  const outside = join(root, "git-outside");
  rmSync(outside, { recursive: true, force: true });
  mkdirSync(outside, { recursive: true });
  const pre = g(outside, ["rev-parse", "--show-toplevel"]);
  if (pre.status === 0 && (pre.stdout || "").trim()) {
    add(`一次性目录落在 git 仓内（${(pre.stdout || "").trim()}）——测不了「仓外 ⇒ 建仓」`,
      "把 LINKDESK_SCRATCH 指到任何仓之外的目录（本机默认 E:\\linkdesk-build+scratch 就在仓外）");
    return out;
  }

  // 🔴 给生成的仓一份**确定的身份**：`git commit` 没有 user.name/email 会直接失败，而 CI runner
  //    （actions/checkout 只给被检出的那个仓配身份）与干净机器都没有 —— 不钉的话这条断言会
  //    「本机绿、CI 红」。这里给的是**判据要跑的环境**，不是掩盖：真机没身份时 CLI 优雅降级
  //    （仓建了、提交跳过、打印提示），那条路径见 index.js 的 setupGit。
  const probeEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "scaffold-check",
    GIT_AUTHOR_EMAIL: "scaffold-check@example.invalid",
    GIT_COMMITTER_NAME: "scaffold-check",
    GIT_COMMITTER_EMAIL: "scaffold-check@example.invalid",
  };
  const runCli = (cwd, args) => spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: "utf8", env: probeEnv });
  /** 路径比大小写不敏感（Windows 上 `rev-parse` 回的盘符大小写与 realpathSync 不一定一致） */
  const same = (a, b) => realpathSync(a).replace(/\\/g, "/").toLowerCase() === realpathSync(b).replace(/\\/g, "/").toLowerCase();

  // ── 情形①：仓外空目录 ⇒ 必须建仓 ──
  const a = "probe-outside";
  const r1 = runCli(outside, [a]);
  if (r1.status !== 0) {
    add(`情形①（仓外）CLI 退出码 ${r1.status}——生成都没成功`, (r1.stderr || "").trim().split("\n").slice(0, 5).join(" / "));
  } else {
    const dir = join(outside, a);
    if (!existsSync(join(dir, ".git"))) {
      add(`情形①（仓外空目录）**没有建 git 仓**：${join(dir, ".git")} 不存在`,
        "`cargo new` 语义 = 不在任何仓内就自动建仓——CLI 的 setupGit 这一步丢了？");
    } else {
      const log = g(dir, ["rev-list", "--count", "HEAD"]);
      const n = Number((log.stdout || "").trim());
      if (!(n >= 1)) {
        add(`情形①（仓外）没有初始提交（git rev-list --count HEAD → ${JSON.stringify((log.stdout || "").trim())}）`,
          "模板自带 .gitignore，建完仓该顺手提交一次——不然作者第一步看到的是满屏 untracked");
      }
      const br = (g(dir, ["branch", "--show-current"]).stdout || "").trim();
      if (br !== "main") {
        add(`情形①（仓外）默认分支是 ${JSON.stringify(br)} 而不是 main`,
          "`git init -b main` 才对得上 GitHub 默认；老 git 退回 init 时要 symbolic-ref HEAD → refs/heads/main");
      }
    }
  }

  // ── 情形②：已在某个 git 仓内 ⇒ **不许**建嵌套仓（在容器目录里生成插件正是这一幕） ──
  const inrepo = join(root, "git-inrepo");
  rmSync(inrepo, { recursive: true, force: true });
  mkdirSync(inrepo, { recursive: true });
  if (g(inrepo, ["init", "-q", "-b", "main"]).status !== 0) {
    add("情形②的前置失败：造不出一个外层 git 仓（外层仓的规则要遵守）");
  } else {
    const b = "probe-inrepo";
    const r2 = runCli(inrepo, [b]);
    if (r2.status !== 0) {
      add(`情形②（仓内）CLI 退出码 ${r2.status}`);
    } else {
      const dir = join(inrepo, b);
      if (existsSync(join(dir, ".git"))) {
        add(`情形②（已在 git 仓内）**建出了嵌套仓**：${join(dir, ".git")} 存在`,
          "防的就是容器被建仓那一幕——每只插件都变成子目录，正好是最不想要的 monorepo");
      }
      const top = g(dir, ["rev-parse", "--show-toplevel"]);
      if (top.status !== 0 || !same((top.stdout || "").trim(), inrepo)) {
        add(`情形② 生成物没落在外层仓里：toplevel = ${JSON.stringify((top.stdout || "").trim())}，期望 ${inrepo}`,
          "跳过建仓 ≠ 逃出外层仓——它本来就该在外层仓的管理范围内");
      }
    }
  }

  // ── 情形③：`--no-git` ⇒ 不建仓，但骨架照常 ──
  const c = "probe-nogit";
  const r3 = runCli(outside, [c, "--no-git"]);
  if (r3.status !== 0) {
    add(`情形③（--no-git）CLI 退出码 ${r3.status}`);
  } else {
    const dir = join(outside, c);
    if (existsSync(join(dir, ".git"))) {
      add(`情形③（--no-git）居然建了仓：${join(dir, ".git")} 存在`, "逃生口失效——不想建仓的作者被卡住");
    }
    for (const f of ["plugin.json", "package.json", ".gitignore", "src/index.tsx"]) {
      if (!existsSync(join(dir, f.split("/").join("\\")))) {
        add(`情形③（--no-git）产物缺 ${f}——跳过建仓不该影响骨架`);
      }
    }
  }

  return out;
}

// ── 主流程 ──

/**
 * 主流程（仅直接运行时执行）。`--self-test` 转发给同名测试模块——
 * ⛔ 这里是 `async function` 而非顶层 await：本文件与测试模块互为环（测试模块静态 import 本文件），
 *    顶层 await 会与其互等而死锁（实测 exit 13 / unsettled top-level await）。
 */
async function main() {
  if (process.argv.includes("--self-test")) {
    const { runSelfTest } = await import("./check-scaffold.test.mjs");
    process.exit(runSelfTest());
  }

  const genDir = generate();
  if (genDir) {
    runAssertions(genDir);
    assertPublishFidelity();
    for (const f of checkGitBehavior(CLI, SCRATCH_DIR)) failures.push(f);
  }

  if (failures.length > 0) {
    console.error(`❌ 脚手架生成物自检未过（${failures.length} 条）：\n`);
    for (const f of failures) console.error(`  · ${f}\n`);
    if (genDir) console.error(`  生成物留在：${genDir}\n`);
    process.exit(1);
  }

  // 一跑一清（memory `packaging-run-sop`）：成功才抹，失败留着给人看
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
  console.log(
    `✅ 脚手架生成物符合契约——${EXPECTED_FILES.length} 个文件 / ${EXPECTED_SCRIPTS.length} 条命令 / ` +
      `pluginId 已声明 / 占位符与 CLI values 齐平 / CHANGELOG 段可切 / i18n 零死 key / npm 打包不丢文件 / ` +
      `建仓三语义（仓外建·仓内不建·--no-git 不建）/ 零内部任务号 / 零裸类名·关键帧（与 check-css-namespace 腿同源）/ ` +
      `vitest.setup.ts 是一行指针（真源 = SDK 共享测试地基）/ minAppVersion = 按模板导入算出的地板。`,
  );
}

main();
