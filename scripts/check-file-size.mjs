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
 *   4. per-scope（E6#0.6c）：SCAN_MARKETPLACE=false，仅 #30.11 拆完 MarketplaceSidebar.css
 *      （377>300）后翻 true。只扫 plugins/marketplace/src/**（根级 css/js/svg/json
 *      天然不扫；editor/file-tree/settings 等插件同界不扩域）。role 夹 + 扩展名按 12 档
 *      ROLE_LIMITS 上档取阈值；未知 role 夹 / 越界扩展名组合 → 报错逼显式上档，非兜底 800
 *      （防 per-scope 意图被静默瓦解）。嵌套 index 语义：根 entry index.tsx → 120；role 夹内
 *      嵌套 index 按 role 档落（12 档文档只写了根 index 一行）。
 *   5. 读取失败 fail-loud 不吞——SKIP_DIRS 是枚举式，未来未预料生成目录下读失败若被吞会让
 *      真实源文件悄悄漏检（抛错让门禁红）。
 *
 * 用法：node scripts/check-file-size.mjs（已挂 npm run check，audit-i18n 后、eslint 前）
 * 退出码 0 = 零超限，退出码 1 = 有违规（打印到 stderr，附 rel: 行数 + 阈值 + 豁免数）。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join, relative, sep } from "path";
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
 * E6#0.6c 门开关——marketplace per-scope 档仅在 #30.11 拆完 MarketplaceSidebar.css
 * （377 > 300，12 档 styles 阈值）后翻转 true。翻早 → 肇事文件被列出红灯（行为正确，
 * 失败自解释）；翻晚 = 该档休眠。编辑器/file-tree/settings 等插件同界不扩域（清单未授权）。
 */
const SCAN_MARKETPLACE = false;
/** marketplace 插件域根——只扫 src/**，根级 css/js/svg/json 天然不扫（2026-09-05 塌平单根） */
const MARKETPLACE_SRC = "plugins/marketplace/src";

/** E6#0.6c 12 档 §一·二 阈值表——role 夹 → 扩展名 → 行数上限。嵌套 index 按 role 档落 */
const ROLE_LIMITS = {
  "views": { ".tsx": 150 },
  "components": { ".tsx": 150 },
  "services": { ".ts": 200 },
  "styles": { ".css": 300 },
};
/** 市场根 entry——仅 index.tsx 上此档；其它根级 tsx 未上档报错（逼显式上档） */
const MARKET_ENTRY_LIMIT = 120;

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
 * E6#0.6c per-scope 档解析——rel 如 plugins/marketplace/src/views/X.tsx（2026-09-05 塌平单根）。
 * 根 entry 仅 index.tsx（→120）；role 夹取 ROLE_LIMITS[首段 dir][扩展名]，未知组合 throw（R3）。
 */
function marketLimit(relPath) {
  const seg = relPath.split("/");
  const srcIdx = seg.indexOf("src");
  const dirs = seg.slice(srcIdx + 1, -1);
  const base = seg[seg.length - 1];
  const ext = base.slice(base.lastIndexOf("."));
  if (dirs.length === 0) {
    if (base === "index.tsx") return MARKET_ENTRY_LIMIT;
    throw new Error(`根级入口未上档（仅 index.tsx → ${MARKET_ENTRY_LIMIT}）：${base}`);
  }
  const role = dirs[0];
  const roleExts = ROLE_LIMITS[role];
  if (!roleExts) throw new Error(`未知 role 夹「${role}」未上 12 档——需在 ROLE_LIMITS 显式上档（E6#0.6c）`);
  const lim = roleExts[ext];
  if (lim === undefined) throw new Error(`组合「${role}/*${ext}」未上 12 档——需在 ROLE_LIMITS 显式上档（E6#0.6c）`);
  return lim;
}

function main() {
  verifyAllowlist();

  /** 待扫 = 壳+electron 全域（800 档）+ 市场 src（12 档，gate 内）；豁免数上报 pass log */
  const scanned = [];
  for (const d of DEFAULT_SCOPE_DIRS) {
    const root = resolve(ROOT, d);
    if (!existsSync(root)) continue;
    for (const f of walk(root)) scanned.push({ rel: rel(f), full: f, market: false });
  }
  if (SCAN_MARKETPLACE && existsSync(resolve(ROOT, MARKETPLACE_SRC))) {
    for (const f of walk(resolve(ROOT, MARKETPLACE_SRC))) scanned.push({ rel: rel(f), full: f, market: true });
  }

  const violations = [];
  const sizes = []; // { rel, lines } —— pass log Top-N（把 440-521 逼近簇提前暴露，零额外告警噪音）
  let exemptCount = 0;

  for (const f of scanned) {
    if (isTestFile(f.rel)) continue;
    if (EXEMPT_FILES.some((e) => e.path === f.rel && !f.market)) {
      exemptCount++;
      continue;
    }
    let limit;
    if (f.market) {
      try {
        limit = marketLimit(f.rel);
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
      violations.push(`${f.rel}  ⚠  ${lines} 行超阈值 ${limit}（>${limit} ${f.market ? "市场 12 档" : "生产源码"}体积门禁，E6#0.6a）`);
    }
  }

  if (violations.length) {
    console.error(`❌ 文件体积门禁失败——${violations.length} 处超限（合法巨兽走 allowlist 拍板制，E6#0.6b）：`);
    for (const v of violations.slice(0, 60)) console.error(`   ${v}`);
    if (violations.length > 60) console.error(`   …（共 ${violations.length} 处，其余略）`);
    process.exit(1);
  }

  const exemptNote = EXEMPT_FILES.length ? `（豁免 ${exemptCount} 条 @E6#0.6b）` : "";
  console.log(`✅ 文件体积门禁通过——${scanned.length - exemptCount} 个生产文件零超限${exemptNote}（红线 >${DEFAULT_MAX_LINES} 行，E6#0.6a）`);
  const top = sizes.sort((a, b) => b.lines - a.lines).slice(0, 5);
  if (top.length) console.log(`   当前最大 ${top.length} 文件（逼近红线预警）：${top.map((t) => `${t.rel} ${t.lines}`).join("  /  ")}`);
}

main();
