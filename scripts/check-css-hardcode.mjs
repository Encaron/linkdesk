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
 * 退出码 0 = 零硬编码，退出码 1 = 有违规（打印到 stderr，附文件:行 + 内容 + 豁免类别）。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
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
  {
    path: "plugins/builtin/settings/src/views/SettingsView/SettingRow.tsx",
    reason: "强调色预设 swatches 配置数据（COLOR_PICKER_PRESETS）",
  },
  {
    path: "plugins/user/serial-monitor/src/hooks/useSerialSessions.ts",
    reason: "串口 session 色板配置数据（SESSION_COLORS 预设）",
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

function main() {
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
      stripComments(src).split("\n").forEach((line, i) => {
        if (!line.trim()) return;
        const hits = findColors(line);
        if (!hits.length) return;
        // 定义豁免：整行属于 --token: 定义（值=颜色）→ 源真值，不算消费
        if (DEF_RE.test(line)) return;
        for (const h of hits) {
          violations.push(`${r}:${i + 1}: ${line.trim().slice(0, 100)}  ← 硬编码 ${h.color}（应走 CSS 变量 var(--xxx)）`);
        }
      });
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
