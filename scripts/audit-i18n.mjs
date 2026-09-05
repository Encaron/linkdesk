/**
 * i18n 全量审计——扫描所有 .tsx/.ts 文件中的中文 UI 字符串，
 * 与 5 个 i18n/en.json 交叉比对，输出缺翻译清单。
 *
 * 🔥 E5.8#37.9.2 边界说明——只扫中文，不扫英文/法文等非中文 key：
 * 插件作者可用任意语言原文做 i18n key（docs/03-插件制造 约定已放宽）。
 * 纯英文/纯法文插件的 key 即原文，缺译文时 parseMissingKeyHandler 静默回退
 * 显示 key 本身 = 设计意图，不是漏翻。审计扫不到非中文 key 属预期，勿误报。
 *
 * 用法：
 *   node scripts/audit-i18n.mjs          # 只报告
 *   node scripts/audit-i18n.mjs --strict # 门禁：缺翻译时 exit 1（已接入 npm run check）
 *
 * 输出：
 *   - 已翻译数 / 缺翻译数
 *   - 每个缺翻译字符串的原文 + 出现位置
 *
 * 非 UI 上下文排除（E5.8#37.9 强化——非 UI 字符串不得当作"缺翻译"）：
 *   - *.test.* / *.spec.* 文件整跳过（测试断言的是 t() 键透传，不是 UI 字符串）
 *   - /mock/i 文件名（共享测试桩，如 viewContainerMocks.ts）
 *   - 目录 dev / __tests__（池独立预览脚手架 + 测试）
 *   - 模板字面量含 ${} 插值（数据拼接，非纯 UI 标签；t() 插值走 {{var}}）
 *   - console.* / throw new X( / reportError( 行 + 多行调用续行（paren 平衡跟踪）
 *   - 注释（块注释跨行状态机 + 行注释 `//`，`http://` 用 lookbehind 保护）
 *   - EXCLUDE_FILES / EXCLUDE_RANGES——经设计裁决的非 UI 数据/诊断（见下注释）
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// ── 0. 设计裁决排除——非 UI 数据/诊断（每项有出处注释，不得随意增删） ──
const EXCLUDE_FILES = [
  // ProfileService 校验消息：走 errors.push/pushToast 但**不经 t()**（模板 `${}` 拼接）——
  // 补译须重构该文件为 t() 调用（含 {{var}}），属单独质量任务，非"漏加 key"。E5.8#37.9 记录。
  "src/core/services/plugins/ProfileService.ts",
];

// 文件内行区间排除——[起, 止] 闭区间（1 基）
const EXCLUDE_RANGES = {
  // DemoOutputView 日志池 + 初始 useState：作者注释 :30 明示"text 是演示数据
  // （输出面板的内容 = 数据，不属 UI 文字铁律范围）"——设计裁决跳过，非漏翻。
  // 2026-09-05 塌平单根：plugins/panel-demo（原 plugins/user/panel-demo）
  "plugins/panel-demo/src/views/DemoOutputView.tsx": [[42, 57]],
  // DemoSidebarView SIDEBAR_POOL / DemoTodoView SEED_TODOS：演示日志池/种子待办——
  // 与 DemoOutputView:42-57 同类（演示数据 = 日志/内容，非 UI 文字）。作者注释明示
  // "内容 = 数据，不属 UI 文字铁律范围"。设计裁决跳过，非漏翻。
  "plugins/panel-demo/src/views/DemoSidebarView.tsx": [[29, 35]],
  "plugins/panel-demo/src/views/DemoTodoView.tsx": [[24, 28]],
  // registerBuiltinProtocols 方括号协议 name：主进程注册的**协议元数据**（id="bracket"
  // 才是身份，name 仅描述）。当前 listProtocols() 零显示消费方——纯注册表数据，非渲染文本。
  // 且本文件运行于主进程（E5.7#49），不能 import 渲染进程 i18n（react-i18next）。补译归
  // 未来协议选择器显示点 t()（协议下拉框消费方出现时）。E5.8#37.9 记录。
  "src/core/commands/infra/registerBuiltinProtocols.ts": [[47, 47]],
};

// ── 1. 加载所有翻译 key ──
// 2026-09-05 塌平单根：plugins/<id>（builtin/user 前缀全删）
const I18N_FILES = [
  "plugins/lang-defaults/en.json",
  "plugins/file-tree/i18n/en.json",
  "plugins/editor/i18n/en.json",
  "plugins/serial-monitor/i18n/en.json",
  "plugins/marketplace/i18n/en.json",
  "plugins/panel-demo/i18n/en.json", // E5.8#37.9：演示插件 UI 串归插件自持
  "plugins/floating-panel-demo/i18n/en.json", // E5.8#39.5：第二声明者验证载体 UI 串归插件自持
  // E5.8#41.17 settings-demo（漂亮设置卡片分区）条目已删——插件被用户自删（eef2d31c2），残留死路径
];

const translated = new Set();
for (const f of I18N_FILES) {
  if (!existsSync(f)) { console.warn(`⚠ 缺失: ${f}`); continue; }
  Object.keys(JSON.parse(readFileSync(f, "utf-8"))).forEach((k) => translated.add(k));
}

// ── 2. 扫描所有源文件，提取完整引用字符串中的中文 ──
function walkDir(dir, cb) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const n = e.name;
    if (n.startsWith(".") || n === "node_modules" || n === "dist" || n === "dist-electron") continue;
    if (e.isDirectory()) {
      if (n === "dev" || n === "__tests__") continue; // 池独立预览脚手架 + 测试目录
      walkDir(join(dir, n), cb);
    } else if (/\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) && !/mock/i.test(n)) {
      cb(join(dir, n));
    }
  }
}

/** 带转义引号感知的字符串提取——`"a\"b"` / `"含"引号"` 一整个捕获，防内嵌引号截断 */
const STR_RE = /(['"`])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;

/**
 * 🔥 E5.8#37.9 修复：提取的原始串含转义序列（`\"`），而 JSON key 用真实引号——
 * `"插件声明 location:\"panel\""` 源码串 ≠ `插件声明 location:"panel"` key → 误报缺翻译。
 * 反转义后与 key 精确比对（处理 \" \' \\ \n \r \t）。
 */
function unescapeStr(s) {
  return s.replace(/\\(["'\\nrt])/g, (m, c) => {
    switch (c) { case "n": return "\n"; case "r": return "\r"; case "t": return "\t"; default: return c; }
  });
}

/** 行内括号净深度（console/throw 多行调用跟踪用） */
function parenDelta(line) {
  let d = 0;
  for (const ch of line) {
    if (ch === "(") d += 1;
    else if (ch === ")") d -= 1;
  }
  return d;
}

/** 多行 console/throw/reportError 调用跟踪状态（跨文件不可残留——每文件重置） */
let logDepth = 0;

const found = new Map(); // text → [file:line, ...]

function processFile(filePath, relPath) {
  // 🔥 E5.8#37.9 修复：EXCLUDE_FILES 此前定义了但从未应用——ProfileService 等设计裁决
  // 排除文件的中文一直漏进"缺翻译"清单。现在整文件跳过。
  if (EXCLUDE_FILES.includes(relPath)) return;
  let inBlock = false;
  logDepth = 0;
  const skipRanges = EXCLUDE_RANGES[relPath] ?? [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      // 设计裁决行区间排除
      if (skipRanges.some(([a, b]) => lineNo >= a && lineNo <= b)) continue;

      // 块注释状态机 + 行注释剥离
      let eff = lines[i];
      if (inBlock) {
        const end = eff.indexOf("*/");
        if (end === -1) continue; // 整行在块注释内
        inBlock = false;
        eff = eff.slice(end + 2);
      }
      eff = eff.replace(/\/\*[\s\S]*?\*\//g, "");   // 单行块注释
      // 🔥 E5.8#37.9 修复：`//.*$` 的 `$` 在 CRLF 行（`\r` 结尾）不匹配（Node v24 实测）——
      // 行尾注释里的中文全漏进"缺翻译"。改用 `[^\r\n]*`（不含锚点，按行处理天然止于行尾）。
      eff = eff.replace(/(?<!:)\/\/[^\r\n]*/g, ""); // 行注释（http:// 受 lookbehind 保护）
      const blkStart = eff.indexOf("/*");
      if (blkStart !== -1) { inBlock = true; eff = eff.slice(0, blkStart); }
      if (!eff.trim()) continue;

      // 多行 console/throw 续行
      if (logDepth > 0) {
        logDepth += parenDelta(eff);
        if (logDepth > 0) continue;
        logDepth = 0;
        continue; // 本行闭合了调用——不再提取
      }
      // console/throw/reportError/.appendLine 调用起行（单行或多行起）——
      // .appendLine = 内部日志（loader log），非用户可见 UI（E5.8#37.9）
      if (/console\.\w+\s*\(|throw\s+new\s+\w+\s*\(|reportError\s*\(|\.appendLine\s*\(/.test(eff)) {
        const d = parenDelta(eff);
        if (d > 0) logDepth = d; // 多行调用——续行跳过
        continue;
      }

      STR_RE.lastIndex = 0;
      let m;
      while ((m = STR_RE.exec(eff)) !== null) {
        const text = unescapeStr(m[2]).trim();
        if (text.length < 2) continue;
        if (!/[一-鿿]/.test(text)) continue;
        if (text.includes("${")) continue; // 插值模板——数据拼接非纯 UI 标签
        if (!found.has(text)) found.set(text, []);
        found.get(text).push(relPath + ":" + lineNo);
      }
    }
  } catch { /* skip unreadable */ }
}

for (const root of ["src", "plugins"]) {
  walkDir(root, (full) => processFile(full, full.replace(/\\/g, "/")));
}

// ── 2b. 🔥 E5.8#37.9：plugin.json manifest 显示字段扫描 ──
// 盲区修复：contributes.views[].title / viewsContainers[].title / titleActions.title+items[].label /
// menus[].label / commands[].title 是**声明数据**，旧审计只扫 .ts/.tsx 源码 → 漏网。
// 这些字段的消费方全部走 t() 路径（P2 归一化后）：
//   views.title / viewsContainers.title        → buildSidebarViewMetas/buildPanelViewMetas DTO t()
//   titleActions.title / items[].label         → ViewTitleActions 渲染 t()
//   menus.label（含子菜单 children）           → getItems 桥 t()
//   commands.title                             → 命令面板/菜单标题 t()
// 因此这些字符串必须存在于某 i18n bundle（key = 中文原文）——漏了就是英文模式见中文。
const MANIFEST_TITLE_FIELDS = ["title", "titleDescription", "titleTooltip", "singleViewPaneContainerTitle", "label"];

/** 从 contributes 树递归收集上述显示字段的字符串（只认字段名，不收集 args 数据等深部值） */
function collectManifestStrings(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => collectManifestStrings(n, out)); return; }
  if (!node || typeof node !== "object") return;
  for (const k of MANIFEST_TITLE_FIELDS) {
    const v = node[k];
    if (typeof v === "string" && /[一-鿿]/.test(v)) out.add(v);
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((n) => collectManifestStrings(n, out));
    else if (v && typeof v === "object") collectManifestStrings(v, out);
  }
}

function walkManifests(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "dist-electron") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkManifests(full);
    else if (entry.name === "plugin.json") {
      let manifest;
      try { manifest = JSON.parse(readFileSync(full, "utf-8")); } catch { continue; }
      if (!manifest?.contributes) continue;
      // 专名跳过：languages[].name（语言名 = 本地自称，中文/日本語 永不翻译）+
      // themes[].name（主题名 = 品牌名，薄荷苏打 Mint Soda 双语品牌）。非 UI 可译文本。
      const contributes = { ...manifest.contributes };
      delete contributes.languages;
      delete contributes.themes;
      const collected = new Set();
      collectManifestStrings(contributes, collected);
      const rel = full.replace(/\\/g, "/");
      for (const text of collected) {
        if (!found.has(text)) found.set(text, []);
        found.get(text).push(`${rel} (contributes)`);
      }
    }
  }
}
walkManifests("plugins");

// ── 3. 筛选真正缺翻译的（排除子串误报） ──
const missing = [];
for (const [text, files] of found) {
  if (translated.has(text)) continue;
  // 排除已被**格式模板 key** 覆盖的子串（如 "条通知" ⊂ "{{count}} 条通知"）——
  // 只认含 {{ }} 的长 key，纯标签重叠（如 "暂停" ⊂ "暂停接收"）不算覆盖、照实报缺。
  let isSub = false;
  for (const k of translated) {
    if (k.length > text.length && k.includes("{{") && k.includes(text)) { isSub = true; break; }
  }
  if (isSub) continue;
  missing.push({ text, count: files.length, first: files[0] });
}

missing.sort((a, b) => b.count - a.count);

// ── 4. 输出 ──
const totalFound = found.size;
const totalTranslated = found.size - missing.length;

console.log(`\n=== i18n 审计 ===`);
console.log(`已翻译: ${totalTranslated}  |  缺翻译: ${missing.length}  |  总字符串: ${totalFound}`);
console.log(`翻译文件: ${I18N_FILES.length} 个, 共 ${translated.size} key\n`);

if (missing.length === 0) {
  console.log("✅ 所有中文 UI 字符串均有翻译。\n");
} else {
  console.log("🔴 以下字符串缺翻译：\n");
  for (const m of missing) {
    console.log(`  ${m.text}  [${m.count}x, e.g. ${m.first}]`);
  }
  console.log(`\n修复：将以上字符串添加到对应插件的 i18n/en.json 或 lang-defaults/en.json\n`);
}

// ── 5. 门禁（--strict：缺翻译即失败——npm run check 机械拦截） ──
if (process.argv.includes("--strict") && missing.length > 0) {
  console.log("❌ i18n 审计门禁未过——缺翻译字符串存在，请补译后重跑。");
  process.exit(1);
}
