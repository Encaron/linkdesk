/**
 * 机械门禁：文件体积防膨胀审计（E6#0.6a，长期门禁防巨兽）。
 *
 * 新门禁类别——非既有 token/一致性审计，是**体量增长哨兵**：一个文件物理行数超红线
 * 即红灯，逼出 feature-folder 拆分时机（E6#0.4d 判据：膨胀/混装唯一正解 = feature-folder
 * 聚合器+子模块，禁止「拆成更平铺」退路——本门禁与该判据互补，不替代）。
 *
 * 规则：
 *   1. 扫描域：src/ + electron/ 生产源码，扩展 .ts/.tsx/.css（src/electron 下无 .mjs/.cjs，
 *      扩展集就此三类）。skip：node_modules/dist/dist-electron/.git/.vite + *.test.* / *.spec.*
 *      + *.d.ts（全仓 .d.ts 仅 3 个且 src 下 2 个极小——ambient 声明非有机膨胀，跳过零损失）。
 *   2. 行数语义 = **物理体量**（编辑器视角行数，含空行/注释行）。data-URL/SVG 单条超长行
 *      对行门禁免疫（算 1 行）——这是选行数而非字数的红利；反向：巨型多行注释 banner 会
 *      计数，豁免请求若以「主要是注释」为由，按物理防膨胀原意裁决（一个逻辑很小的文件
 *      顶着几百行注释同样占阅读税）。边界：`lineCount > DEFAULT_MAX_LINES`（801 起红，
 *      对齐市场 12 档「≤」语义，全脚本一处常量）。
 *   3. 豁免（E6#0.6b）＝ allowlist 拍板制：合法巨兽（判不拆但已超线）需用户拍板 + 该文件
 *      自身头注加 `@E6#0.6b` 标记。脚本机械核验：allowlist 条目头注缺标记 / 已瘦身回 ≤ 阈值
 *      （过期豁免）都报错强制移除——豁免纪律不靠自觉。allowlist 只作用于 800 生产源码档，
 *      市场档无豁免通道（拆分是 #30.11 正解）；allowlist 放行不豁免 #0.4d（仍禁止平铺拆）。
 *   4. per-scope（E6#0.6c）：原为 SCAN_MARKETPLACE=false，只等 #30.11 拆完 MarketplaceSidebar.css
 *      （377>300）翻 true，且只扫 plugins/marketplace/src/**（editor/file-tree/settings 同界不扩域）。
 *      🔥 **E6#88（2026-09-11）扩域收官**——改名 `SCAN_PLUGINS` 并翻转 true，扫 **全部**
 *      `plugins/<id>/src/**`（主题/语言插件无 src，自然跳过）。休眠史：翻早 = 一屏 34 条红灯，
 *      淹没「哪条是我刚拆坏的」信号 ⇒ 硬依赖 3.6.2/3.6.3/3.6.4 三轮拆完（24 处超限归零）才翻。
 *      三档制见 §2.1：档 A `src/`+`electron/` → 800（allowlist 不动）/ 档 B `plugins/<id>/src/**`
 *      → 角色表 / 档 C `plugins/<id>/src/index.tsx` → 120。
 *      **未知 role 夹 / 根级未登记件 → 报错逼显式上档**，非兜底（防 per-scope 意图被静默瓦解）。
 *   5. 角色表（E6#88）：`.css` **恒 300**（放哪都算样式，含 co-located `views/*.css`——按扩展名
 *      优先判，不看目录）；role 夹 → `ROLE_LIMITS[首段目录]`。**同名夹聚合器 ×2** 两形：形 (a)
 *      夹旁散门面（同级存在同名夹 `X/`，views 支）；形 (b) 夹内入口 `<roleDir>/<Feature>/index.ts(x)`
 *      （非 views 支）。**不认第三形** `views/<功能夹>/<Named>.tsx`（夹名≠文件名 ≠ index）。
 *   6. 🔔 夹宽黄灯（E6#88，阈值 12）：「一个夹的直接子项（文件 + 子夹）数 > 12」⇒ 提醒一行，
 *      **永不进 exit code**。硬门禁会逼出 3 文件碎片夹，比 22 件平铺更糟——它只做一件事：
 *      逼出「看一眼 + 给一句理由」。**先判扩展名/角色、再判夹宽**（两道独立 pass，互不影响）。
 *   7. 读取失败 fail-loud 不吞——SKIP_DIRS 是枚举式，未来未预料生成目录下读失败若被吞会让
 *      真实源文件悄悄漏检（抛错让门禁红）。
 *
 * 用法：node scripts/check-file-size.mjs（已挂 npm run check，audit-i18n 后、eslint 前）
 * 退出码 0 = 零超限（黄灯也 0），退出码 1 = 有违规（打印到 stderr，附 rel: 行数 + 阈值 + 豁免数）。
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, dirname, join, relative, sep, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 壳 + electron 生产源码统一红线——>800 即红（801 起）。新门禁类别的常量权威 */
const DEFAULT_MAX_LINES = 800;
/** 扫描域——src/ + electron/（plugins/ 是独立构建产物，插件体量守 03 插件制造文档规范不在此门禁） */
const DEFAULT_SCOPE_DIRS = ["src", "electron"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".git", ".vite", "__tests__"]);
const EXT_RE = /\.(ts|tsx|css)$/;

/**
 * E6#88 门开关——插件域体积门禁。**翻于 2026-09-11**（3.6.2/3.6.3/3.6.4 三轮拆完后，
 * 24 处超限归零）。休眠史见脚本头 §4——翻早 = 一屏红灯淹没真信号。
 *
 * 🔴 E6#99（L7 第 7.2 轮）覆盖域结论：**保持 true 不动**。18 只发货插件源码外移后，
 *   插件域的对象只剩两只开发夹具（panel-demo / floating-panel-demo 有 src）——它们照样受体积门禁管；
 *   发货插件的体积红线改由各插件仓自己的 CI 管（7.5 轮落，阈值表随 preset 一起带过去）。
 *   注意：本门禁**不是**真空（夹具仍在扫），所以不像 check-theme-audit 那样需要打「无对象」黄灯。
 */
const SCAN_PLUGINS = true;
/** 插件域根——只扫 `<plugin>/src/**`；无 src 的插件（主题/语言插件）自然跳过 */
const PLUGINS_ROOT = "plugins";

/** E6#88 角色表——首段目录 → 行数上限（扩展名维度由 `.css` 恒 300 单独接管） */
const ROLE_LIMITS = {
  views: 150,
  components: 150,
  hooks: 150,
  utils: 150,
  services: 200,
  // E6#88a 显式上档（2026-09-11，用户拍板「登记它们」）：serial-monitor 的 CodeMirror 6
  // 域——5 个纯逻辑模块（appendLine/decorations/scroll/search/theme），无 JSX、无状态，
  // 语义与 hooks/utils 同级。**登记 = 新增顶层目录必须显式上档**（fail-loud 机制的正解，
  // 不是把代码搬去凑目录表）。规范侧同步见 09-插件目录规范 / 12 档 §一·二。
  cm6: 150,
};
/** `.css` 恒走此档——**按扩展名优先判，不看目录**（co-located `views/*.css` 与 `styles/*.css` 同一把尺） */
const CSS_LIMIT = 300;
/** 档 C——插件 entry，精确路径 `plugins/<id>/src/index.tsx`（**不许按 basename 匹配 `index.*`**，
 * 否则 `services/<Feature>/index.ts` 会被误判成 entry，把 200 档收成 120） */
const ENTRY_LIMIT = 120;
/** 根级跨层共享单件（`src/types.ts` / `src/constants.ts` 等非 entry 的根级 ts/tsx）——
 * 09-插件目录规范「特殊情况：跨层共享的类型定义放 src/ 根」已授权，故给一档而非 throw。
 * E6#88a 用户拍板「登记它们」（2026-09-11）。取 hooks/utils 同级 150。 */
const ROOT_SHARED_LIMIT = 150;
/** 🔔 夹宽黄灯阈值（E6#88，[06 §三] 判据）——**只提醒，永不 fail build** */
const FOLDER_WIDTH_WARN = 12;

/**
 * E6#0.6b allowlist 拍板制——空数组启动，零豁免。新增条目 = 用户拍板 + 文件头注加
 * `@E6#0.6b`；头注缺标记 / 已瘦身回 ≤ 阈值（过期豁免）都即刻报错（机械核验，不靠自觉）。
 */
const EXEMPT_FILES = [];
const EXEMPT_TOKEN = "@E6#0.6b";

const norm = (p) => p.split(sep).join("/");
const rel = (p) => norm(relative(ROOT, p));
const isTestFile = (p) => /\.(test|spec)\.(tsx?|jsx?)$/.test(p) || /\.d\.ts$/.test(p);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 物理行数（编辑器视角）——归一顺序咬死：先 CRLF 后孤 \r（旧 Mac 整段 \r 分隔若不归一
 * 会少计成 1 行→放行巨兽）；尾随换行判定在归一之后（否则以 \r 结尾的文件漏减 1）。
 * BOM 粘首行不影响行数，不处理。空文件 = 0 行。
 */
function lineCount(src) {
  const s = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s === "") return 0;
  return s.endsWith("\n") ? s.split("\n").length - 1 : s.split("\n").length;
}

/** allowlist 机械核验——拍板纪律不靠自觉：路径存在 + 头注含标记 token + 未过期 */
function verifyAllowlist() {
  for (const e of EXEMPT_FILES) {
    const full = resolve(ROOT, e.path);
    if (!existsSync(full)) throw new Error(`allowlist 路径不存在：${e.path}（${e.why}）`);
    const head = readFileSync(full, "utf8").slice(0, 2000);
    if (!head.includes(EXEMPT_TOKEN)) {
      throw new Error(`allowlist 条目缺头注标记 ${EXEMPT_TOKEN}：${e.path}——被豁免文件自身头注必须声明（E6#0.6b 拍板制）`);
    }
    const cnt = lineCount(readFileSync(full, "utf8"));
    if (cnt <= DEFAULT_MAX_LINES) {
      throw new Error(`过期豁免：${e.path} 现 ${cnt} 行 ≤ ${DEFAULT_MAX_LINES}，已无需豁免——请从 EXEMPT_FILES 移除（${e.why}）`);
    }
  }
}

/**
 * E6#88 聚合器判据——**两形都认**（12 档 §一·二 + [06 §〇] 门面形态铁律）：
 *   形 (a) 夹旁散门面：同级存在同名夹 `X/`——`views/` 支（basename = `render` 字段，有约束）
 *   形 (b) 夹内入口：`<roleDir>/<Feature>/index.ts(x)`（非 views 支）——无 basename 约束，门面即夹入口
 * **刻意不认第三形**：`views/<功能夹>/<Named>.tsx`（夹名≠文件名、也不叫 index，如
 * `views/keybinding-settings/KeybindingSettingsView.tsx`）= 功能域文件集合，按 views 档 150 计。
 */
function isAggregator(relPath, dirs) {
  const abs = resolve(ROOT, relPath);
  const file = basename(abs);
  const stem = file.replace(/\.(tsx?|css)$/, "");
  if (existsSync(join(dirname(abs), stem)) && statSync(join(dirname(abs), stem)).isDirectory()) return true;
  // 形 (b)：`<roleDir>/<Feature>/index.ts(x)`——判的是**文件名**（不是 dirs 末段，那是夹名）
  if (dirs.length >= 2 && dirs[0] !== "views" && (file === "index.ts" || file === "index.tsx")) return true;
  return false;
}

/**
 * E6#88 插件域档解析——rel 如 `plugins/settings/src/views/SettingsView.tsx`。
 * 顺序咬死：**`.css` 扩展名优先** → 根级（entry / 跨层共享单件）→ role 夹 → 聚合器 ×2。
 * 未登记项 **throw**（fail-loud，逼显式上档——不许静默落进 800 兜底）。
 */
function pluginLimit(relPath) {
  const seg = relPath.split("/");
  const base = seg[seg.length - 1];
  if (base.endsWith(".css")) return CSS_LIMIT;
  const dirs = seg.slice(seg.indexOf("src") + 1, -1);
  const limit = dirs.length === 0
    ? (base === "index.tsx"
        ? ENTRY_LIMIT
        : (base === "index.ts"
            ? (() => { throw new Error(`插件 src 根的 index.ts 未上档——entry 只认 index.tsx（→ ${ENTRY_LIMIT}）：${base}`); })()
            : (base.endsWith(".ts") || base.endsWith(".tsx")
                ? ROOT_SHARED_LIMIT
                : (() => { throw new Error(`根级未上档（entry index.tsx → ${ENTRY_LIMIT} / 跨层共享 *.ts(x) → ${ROOT_SHARED_LIMIT}）：${base}`); })())))
    : (() => {
        const role = dirs[0];
        if (ROLE_LIMITS[role] === undefined) {
          throw new Error(`未知 role 夹「${role}」未上档——需在 ROLE_LIMITS 显式登记（E6#88 fail-loud）`);
        }
        return ROLE_LIMITS[role];
      })();
  return isAggregator(relPath, dirs) ? limit * 2 : limit;
}

/**
 * 🔔 夹宽黄灯（E6#88，[06 §三] 判据）——一道**独立 pass**，与体积判定零耦合
 * （「先判扩展名/角色、再判夹宽」的实现保证：role 解析 throw 也不影响本 pass）。
 * 只数直接子项（文件 + 子夹），SKIP_DIRS 不算；**只打印，永不进 exit code**。
 */
function folderWidthWarnings(scanRoots) {
  const warns = [];
  const seen = new Set();
  const visit = (dir) => {
    const r = norm(dir);
    if (seen.has(r)) return;
    seen.add(r);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !SKIP_DIRS.has(e.name));
    } catch {
      return; // 目录不可读——体积判定那侧已 fail-loud，这里静默跳过不重复报
    }
    if (entries.length > FOLDER_WIDTH_WARN) warns.push({ rel: rel(dir), n: entries.length });
    for (const e of entries) if (e.isDirectory()) visit(join(dir, e.name));
  };
  for (const root of scanRoots) if (existsSync(root)) visit(root);
  return warns.sort((a, b) => b.n - a.n);
}

function main() {
  verifyAllowlist();

  /** 扫描域 = 壳 + electron（档 A，800）+ 各插件 src（档 B/C，E6#88 扩域） */
  const scanRoots = [];
  const scanned = [];
  for (const d of DEFAULT_SCOPE_DIRS) {
    const root = resolve(ROOT, d);
    if (!existsSync(root)) continue;
    scanRoots.push(root);
    for (const f of walk(root)) scanned.push({ rel: rel(f), full: f, plugin: false });
  }
  if (SCAN_PLUGINS) {
    const pluginsRoot = resolve(ROOT, PLUGINS_ROOT);
    if (existsSync(pluginsRoot)) {
      for (const e of readdirSync(pluginsRoot, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const src = join(pluginsRoot, e.name, "src");
        if (!existsSync(src)) continue; // theme-*/lang-* 无 src，自然跳过
        scanRoots.push(src);
        for (const f of walk(src)) scanned.push({ rel: rel(f), full: f, plugin: true });
      }
    }
  }

  const violations = [];
  const sizes = []; // { rel, lines } —— pass log Top-N（把逼近簇提前暴露，零额外告警噪音）
  let exemptCount = 0;
  let checked = 0; // 真正过了体积判定的文件数（scanned 里还混着 test 文件，报数不诚实）

  for (const f of scanned) {
    if (isTestFile(f.rel)) continue;
    checked++;
    if (EXEMPT_FILES.some((e) => e.path === f.rel && !f.plugin)) {
      exemptCount++;
      continue;
    }
    let limit;
    if (f.plugin) {
      try {
        limit = pluginLimit(f.rel);
      } catch (err) {
        violations.push(`${f.rel}  ⚠  ${err.message}`);
        continue;
      }
    } else {
      limit = DEFAULT_MAX_LINES;
    }
    let src;
    try {
      src = readFileSync(f.full, "utf8");
    } catch (err) {
      // fail-loud：读失败抛错让门禁红，真实源文件不许悄悄漏检（R2）
      throw new Error(`读取失败：${f.rel} —— ${err.message}`);
    }
    const lines = lineCount(src);
    sizes.push({ rel: f.rel, lines });
    if (lines > limit) {
      violations.push(`${f.rel}  ⚠  ${lines} 行超阈值 ${limit}（>${limit} ${f.plugin ? "插件角色档" : "生产源码"}体积门禁，E6#0.6a）`);
    }
  }

  // 🔔 夹宽黄灯——先算、后判红；两件事各自报，黄灯不得吞掉红灯也不得让 check 假绿
  const widthWarns = folderWidthWarnings(scanRoots);

  if (violations.length) {
    console.error(`❌ 文件体积门禁失败——${violations.length} 处超限（合法巨兽走 allowlist 拍板制，E6#0.6b）：`);
    for (const v of violations.slice(0, 60)) console.error(`   ${v}`);
    if (violations.length > 60) console.error(`   …（共 ${violations.length} 处，其余略）`);
    for (const w of widthWarns) console.error(`   🔔 夹宽 ${w.rel} 直接子项 ${w.n} > ${FOLDER_WIDTH_WARN}（提醒，不计入本次失败）`);
    process.exit(1);
  }

  const exemptNote = EXEMPT_FILES.length ? `（豁免 ${exemptCount} 条 @E6#0.6b）` : "";
  // 🔔 休眠可见（[05 §六]）——任一刀位被关掉，这行就少一段/多一句警告，休眠不再是隐形的
  const pluginTier = SCAN_PLUGINS
    ? "档 B plugins/<id>/src 按角色表 · 档 C entry ≤120"
    : "⚠️ 插件档已关闭（SCAN_PLUGINS=false）——插件域当前无人看管";
  console.log(`✅ 文件体积门禁通过——${checked - exemptCount} 个生产文件零超限${exemptNote}（档 A src/+electron/ >${DEFAULT_MAX_LINES} 行；${pluginTier}）`);
  const top = sizes.sort((a, b) => b.lines - a.lines).slice(0, 5);
  if (top.length) console.log(`   当前最大 ${top.length} 文件（逼近红线预警）：${top.map((t) => `${t.rel} ${t.lines}`).join("  /  ")}`);
  if (widthWarns.length) {
    console.log(`   🔔 夹宽提醒 ${widthWarns.length} 处（直接子项 > ${FOLDER_WIDTH_WARN}，仅提醒不阻断——台账见 docs/.../06-目录结构二次收口.md §三）：`);
    for (const w of widthWarns) console.log(`      ${w.rel}  ${w.n}`);
  }
}

main();
