/**
 * 机械检查：CSS 消费面硬编码颜色审计（E5.8#130，长期门禁防回潮）。
 *
 * 契约保护——壳 + 插件 CSS/TSX/TS 里任何非 token 定义的硬编码颜色（hex / rgb / hsl）即红灯。
 * 对标 E5.7 静态卫生 --max-warnings 0：check 链机械拦截，新代码随手写 #xxx 无法回潮
 * （E5.8#128 已把消费面全量 token 化，本脚本是"同一 bug 不再回来"的机械保证）。
 *
 * 规则：
 *   1. 整文件去注释（块注释 + 行注释）——注释里的 #128 式 issue 编号是噪音不是颜色。
 *   2. 找颜色字面量：hex（#rgb/#rgba/#rrggbb/#rrggbbaa，\b 词边界）+ rgb()/rgba()/hsl()/hsla()
 *      （参数全数字才算硬编码——rgb(${r}...) 动态模板 / rgb(var(--x)) / calc 不算）。
 *   3. 豁免三类，之外全部违规：
 *      a. CSS 自定义属性定义 `--token: <color>`——token 值单一权威（壳 :root 定义 + 插件本地 token
 *         都是定义，不是消费；插件定义自家 token 属插件独立合法扩展）。
 *      b. 测试 / fixture / mock 文件（\.test\.|\.spec\.|\.fixture\.|\.mock\.）——测试数据虚构值（硬约束 21）。
 *      c. 文档化路径白名单（下表）——token 值单一权威文件 + 取色器颜色模型固有基色 + 插件配置数据。
 *   4. `var(--x, #hex)` 幽灵 fallback **不豁免**（Exempt-1 只认 `--name:` 定义，var() 内 fallback 是
 *      #128.7 消灭过的幽灵 token——回潮即红灯）。
 *
 * 用法：node scripts/check-css-hardcode.mjs（已挂 npm run check）
 *       node scripts/check-css-hardcode.mjs --self-test
 * 退出码 0 = 零硬编码，退出码 1 = 有违规（打印到 stderr，附文件:行 + 内容 + 豁免类别）。
 *
 * 🔴 E6#109p-b（1.28）补自测：把当年只人手验过一次的负控变成每次 `npm run check` 都真跑
 *   （本脚本的判据此前只被 1.27 体检手验过一次，「它会红」从未被机械保证——现在 `--self-test`
 *   逐例真跑判据并断言实得结果；链里本脚本那步不带该标志，尺子由 `--self-test` 单独复跑）。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// 🔴 E6#99（L7 第 7.2 轮）覆盖域结论：`plugins/` 保留在扫描域内——18 只发货插件搬走后仓内仍有两只
//   开发夹具（panel-demo / floating-panel-demo），它们同样不许裸写 hex；发货插件的硬编码色改由
//   各插件仓自己的审计管（7.5 轮落）。白名单里指向发货插件的两条死路径已同笔删除（见下）。
const SCAN_DIRS = ["src", "plugins"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".git", ".vite", "__tests__"]);
const EXT_RE = /\.(css|tsx|ts)$/;

/** 文档化路径白名单——每项必须有理由（git diff 可见）；新增豁免需解释为何不是 token 定义 */
const EXEMPT_FILES = [
  {
    path: "src/core/services/ui/ThemeEngine/constants.ts",
    reason: "token 值单一权威——SURFACE_ZERO/BACKGROUND_ZERO/specular 默认 #ffffff/font-tone 默认数据",
  },
  {
    path: "src/core/services/ui/ThemeEngine/accent.ts",
    reason: "accent 默认值 #0078d4（app.accentColor 缺省锚）+ 动态 rgb 模板（rgb(${r}...) 非硬编码）",
  },
  {
    path: "src/App/config/appearance.ts",
    reason: "配置 schema 默认值（app.accentColor default）——配置数据非 UI 消费",
  },
  {
    path: "src/components/shared/color-picker/ColorPicker.css",
    reason: "取色器颜色模型固有基色——#fff/#000/色相光谱 #f00..#f00 无法 token 化（#128.7 沉档豁免）",
  },
  {
    path: "src/components/shared/color-picker/ColorPicker.tsx",
    reason: "initialColor 默认值——插件调用 color-picker.pick 不带初始色时的兜底（同 accent 默认）",
  },
  // 🔴 E6#99（L7 第 7.2 轮）：原 `plugins/settings/…/SettingRow/constants.ts`（强调色预设 swatches）
  //   与 `plugins/serial-monitor/…/useSerialSessions/types.ts`（串口 session 色板）两条白名单条目
  //   **已随源码外移删除**——settings / serial-monitor 各自搬进独立仓，这两个文件的硬编码色
  //   由各插件仓自己的审计管（7.5 轮落）。白名单里留死路径 = 白名单自己腐烂。
  {
    path: "src/components/shared/plugin-icon/defaultIdentityArt.ts", // E6#69a 统一默认身份彩色块（顶替 E6#66 defaultCoverArt.ts——该文件已随 #69f 删）
    reason: "默认身份彩色块 SVG 资产数据（DEFAULT_PLUGIN_IDENTITY_SVG data-URI）——外部 <img> 渲染 data-URI，CSS 变量在 img 内不可达，颜色只能字面量内嵌；与各插件 resources/*.svg 资产同性质（.svg 不被本审计扫描，TS 内嵌等价物文档化豁免）。本文件零消费逻辑；裁决逻辑在 sibling iconUtils.ts pickIdentityArt 不含 hex 照常受审",
  },
];

const norm = (p) => p.split(sep).join("/");
const rel = (p) => norm(relative(ROOT, p));
const isTestFile = (p) => /\.(test|spec)\.(tsx?|jsx?)$/.test(p) || /\.(fixture|mock)\.(tsx?|jsx?)$/.test(p);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** 整文件去注释：块注释先（留空行保持行号），再行注释 */
function stripComments(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return s;
}

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /rgba?\(|hsla?\(/g;
/** 定义上下文：颜色值属于 `--name:` 自定义属性（source of truth） */
const DEF_RE = /--[\w-]+\s*:\s*(?!var\()/;

/** 判断 rgb()/hsl() 是否为动态模板（参数含 ${ / var( / calc( ——非硬编码字面量） */
function isDynamicFunc(line, index) {
  const open = line.lastIndexOf("(", index);
  const close = line.indexOf(")", index);
  const body = line.slice(open + 1, close < 0 ? undefined : close);
  return /(\$\{|\bvar\(|calc\(|\bcolor-mix\(|#[0-9a-fA-F]{3,})/.test(body);
}

function findColors(line) {
  const hits = [];
  for (const m of line.matchAll(HEX_RE)) hits.push({ color: m[0], index: m.index });
  for (const m of line.matchAll(RGB_RE)) {
    if (!isDynamicFunc(line, m.index)) hits.push({ color: m[0] === "rgb(" || m[0] === "rgba(" ? "rgb()" : "hsl()", index: m.index });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * 纯判据：一段源码文本里的硬编码颜色违规（1-based 行号）。
 * **不读盘、不管文件级豁免**（测试文件 / EXEMPT_FILES 那两层留在 main：那是「哪些文件受审」，
 * 不是「什么算硬编码」）。`--self-test` 就是往这里注入字符串。
 * 每项：`{ line, color, text }`——行号 / 颜色文本 / 该行片段（去注释后 trim，前 100 字符，同旧输出）。
 */
export function colorViolations(src) {
  const out = [];
  stripComments(src)
    .split("\n")
    .forEach((line, i) => {
      if (!line.trim()) return;
      const hits = findColors(line);
      if (!hits.length) return;
      // 定义豁免：整行属于 --token: 定义（值=颜色）→ 源真值，不算消费
      if (DEF_RE.test(line)) return;
      for (const h of hits) {
        out.push({ line: i + 1, color: h.color, text: line.trim().slice(0, 100) });
      }
    });
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const cases = [
    // ── 正控：合规 / 已达成的豁免 / 已知边界 ⇒ 判据不许报（0 处） ──
    ["正控①：`--brand: #fff`（CSS 自定义属性定义）⇒ 豁免，0 处", ":root { --brand: #fff; }\n", 0],
    ["正控②：`--b: rgba(...)` 定义同样豁免（定义豁免不挑颜色写法）", ":root {\n  --a: #ffff;\n  --b: rgba(1, 2, 3, 0.5);\n}\n", 0],
    ["正控③：块注释里的 hex（注释被剥掉）⇒ 0 处", "/* 归到 #112233 那次改动 */\n.a { color: var(--x); }\n", 0],
    ["正控④：行注释里的 hex ⇒ 0 处", ".a { color: var(--x); } // 历史： #112233\n", 0],
    ["正控⑤：`rgb(${r}, 0, 0)` 动态模板 ⇒ 0 处（参数非字面量）", "background: rgb(${r}, 0, 0);\n", 0],
    ["正控⑥：`rgb(var(--x))` ⇒ 0 处（token 间接）", "color: rgb(var(--x));\n", 0],
    ["正控⑦：`rgba(var(--r), var(--g), var(--b), 0.5)` ⇒ 0 处", "box-shadow: 0 0 0 1px rgba(var(--r), var(--g), var(--b), 0.5);\n", 0],
    ["正控⑧：`hsl(var(--h), 50%, 50%)` ⇒ 0 处", "color: hsl(var(--h), 50%, 50%);\n", 0],
    ["正控⑨：`color-mix(in srgb, var(--a) 50%, var(--b))` ⇒ 0 处", "background: color-mix(in srgb, var(--a) 50%, var(--b));\n", 0],
    ["正控⑩：🔴 命名色 `color: red` ⇒ 0 处（**已知不在射程**：头部只声称管 hex/rgb/hsl；不是 bug，钉住）", ".a { color: red; }\n", 0],
    ["正控⑪：无颜色字面量的行 ⇒ 0 处", ".a { display: flex; gap: 8px; }\n", 0],
    [
      "正控⑫：同一行里既有 `--token:` 定义又有消费 ⇒ 整行豁免（**既有行级语义**，DEF_RE 判整行，本轮不改）",
      ".a { --b: #fff; color: #000; }\n",
      0,
    ],
    // ── 负控：违规 ⇒ 必须报（1 处） —— 1.27 体检的实测形态在此变成机械用例 ──
    ["负控①：hex 3 位 `#fff` ⇒ 1 处", ".a { color: #fff; }\n", 1],
    ["负控②：hex 4 位 `#ffff` ⇒ 1 处", ".a { color: #ffff; }\n", 1],
    ["负控③：hex 6 位 `#112233` ⇒ 1 处（1.27 实测原样）", ".a { color: #112233; }\n", 1],
    ["负控④：hex 8 位 `#11223344` ⇒ 1 处", ".a { color: #11223344; }\n", 1],
    ["负控⑤：`rgb(1, 2, 3)` 全数字 ⇒ 1 处", ".a { color: rgb(1, 2, 3); }\n", 1],
    ["负控⑥：`rgba(1, 2, 3, 0.5)` 全数字 ⇒ 1 处", ".a { background: rgba(1, 2, 3, 0.5); }\n", 1],
    ["负控⑦：`hsl(0, 0%, 0%)` 全数字 ⇒ 1 处", ".a { color: hsl(0, 0%, 0%); }\n", 1],
    ["负控⑧：🔴 `var(--x, #fff)` 幽灵 fallback ⇒ 1 处（**不豁免**——Exempt-1 只认 `--name:` 定义）", ".a { color: var(--x, #fff); }\n", 1],
    [
      '负控⑨：🔴 `content: "#fff"` 字符串字面量 ⇒ 1 处（**有意接受的偏严**：加例外反而给真 hex 留门）',
      '.a::before { content: "#fff"; }\n',
      1,
    ],
  ];

  let bad = 0;
  for (const [tag, src, want] of cases) {
    const got = colorViolations(src);
    const pass = got.length === want;
    if (!pass) bad++;
    process.stdout.write(
      `${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 处${pass ? "" : `（应 ${want} 处：${got.map((v) => `第 ${v.line} 行 ${v.color}`).join(" / ") || "无命中"}）`}\n`,
    );
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-css-hardcode self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-css-hardcode self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const violations = [];
  let scannedFiles = 0;

  for (const dir of SCAN_DIRS) {
    const root = resolve(ROOT, dir);
    if (!existsSync(root)) continue;
    for (const f of walk(root)) {
      const r = rel(f);
      if (isTestFile(r)) continue;
      const exempt = EXEMPT_FILES.find((e) => e.path === r);
      if (exempt) continue;
      scannedFiles++;
      const src = readFileSync(f, "utf8");
      for (const v of colorViolations(src)) {
        violations.push(`${r}:${v.line}: ${v.text}  ← 硬编码 ${v.color}（应走 CSS 变量 var(--xxx)）`);
      }
    }
  }

  if (violations.length) {
    console.error(`❌ 硬编码颜色审计失败——${violations.length} 处（E5.8#130 门禁：消费面禁止硬编码 hex/rgb/hsl，token 定义 + 测试 + 文档化豁免除外）：`);
    for (const v of violations.slice(0, 60)) console.error(`   ${v}`);
    if (violations.length > 60) console.error(`   …（共 ${violations.length} 处，其余略）`);
    process.exit(1);
  }
  console.log(`✅ 硬编码颜色审计通过——${scannedFiles} 个生产文件零硬编码（token 定义/测试/豁免除外，E5.8#130）`);
}

main();
