/**
 * i18n 全量审计——扫描所有 .tsx/.ts 文件中的中文 UI 字符串，
 * 与 5 个 i18n/en.json 交叉比对，输出缺翻译清单。
 *
 * 🔥 E5.8#37.9.2 边界说明——只扫中文，不扫英文/法文等非中文 key：
 * 插件作者可用任意语言原文做 i18n key（docs/03-插件制造 约定已放宽）。
 * 纯英文/纯法文插件的 key 即原文，缺译文时 parseMissingKeyHandler 静默回退
 * 显示 key 本身 = 设计意图，不是漏翻。审计扫不到非中文 key 属预期，勿误报。
 *
 * 🔥 E6#95b（G2）第二职责——**标识符形态的 `t()` key 黄灯**：
 * `t("newPattern")` 这类「数据键名走了翻译」本脚本**原来扫不到**（它只扫中文）。现在同一趟扫描
 * 顺带收集 `t("…")` 调用，凡是「标识符形态（无空格无中文）且不在任何字典里」的 key 就提示。
 * **永不 exit 1**（哪怕 --strict）——实测有误报（产品专名 `t("LinkDesk")` / 动态前缀 `t("category.")`），
 * 按三档哲学只能配黄灯。白名单与既有 contributes.languages/themes 专名跳过**同一处**，不开第二份名单。
 *
 * 🔥 E6#161（2026-09-30）第三职责——**manifest 声明串的「归属」腿**：
 *   判「插件自己声明的可渲染文案有没有住**本仓**字典」（谁声明谁负责，判据本体住 SDK
 *   `own-dict-coverage`，作者侧 `ci-verify` 引同一份）。旧腿两处失域：只走仓内 `plugins/`
 *   （E6#99 源码外移后官方各仓不在任何一盏灯下）＋ 字段表只收 title/label 那批
 *   （`group` / `subtitle` / `groupDescriptions` / `enumDescriptions` 不在内）。
 *   已在案的缺口登记在 `scripts/i18n-manifest-debt.json`：**新缺口判红、还清未删行也判红**。
 *
 * 用法：
 *   node scripts/audit-i18n.mjs          # 只报告
 *   node scripts/audit-i18n.mjs --strict # 门禁：**只对「缺翻译」** exit 1（已接入 npm run check）
 *                                        # 「可疑 key」是黄灯，strict 也不 fail
 *                                        # manifest 归属缺口按账本登记判（新缺口/自腐账本 ⇒ 红）
 *
 * 输出：
 *   - 已翻译数 / 缺翻译数
 *   - 每个缺翻译字符串的原文 + 出现位置
 *   - ⚠ 可疑 t() key（黄灯，永不 fail）
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
import JSZip from "jszip";
// E6#161：判据本体（「谁的仓谁译文」）来自 SDK——与作者侧 ci-verify 引的**同一份**，⛔ 这里不复制
import { checkOwnDictCoverage } from "../packages/plugin-sdk/own-dict-coverage.mjs";
// 仓发现与官方名单的唯一真相源（与 audit-plugin-tests / sync-plugin-agents 同一份）
import { discoverPluginRepos, officialPluginIds, readManifestJson } from "./lib/plugin-repos.mjs";

// ── 0. 设计裁决排除——非 UI 数据/诊断（每项有出处注释，不得随意增删） ──
const EXCLUDE_FILES = [
  // ProfileService 校验明细：E6#73h（D4）后该文件的**用户可见文案已全部走 i18n.t()**（pushToast 那句
  // 结论句 + 成功句）；残留中文一律是 `errors.push` 里的**内部诊断明细**（「插件 "x"（未加载）」
  // 「[维度2] 设置 … 期望=… 实际=…」「主题 CSS 变量 --bg 未设置」）——它们只流向 console.warn
  // 调试日志（18 档 D4 明文：**细节进 console / 调试日志**），不属 UI 文字，故不补译也不进词典。
  // ⚠️ 排除范围仅限这些诊断串：若将来该文件重新产出用户可见文案，必须走 t() 并撤销本排除。
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
  // M1 `AI#8`：面板位置/对齐八条命令的 `description` 字面量住在查找表
  // （PANEL_COMMAND_DESCRIPTIONS: Record<string,string>）里，**不是内联的 `description:` 字段**——
  // 属性名级排除（见 §0 METADATA_VALUE_PROP）看不穿查找表，故按行排除。**同一批声明数据、同一条
  // 裁决**（消费方 = 命令元数据 → 契约 → AI，今天零 UI 渲染消费方）。
  // ⚠️ 撤销条件与 §0 完全一致：命令说明一旦进 UI，本排除与那条属性名排除**同笔撤销并补译**。
  // 🔴 行号会随该表**上方**的增删漂移（实测：M2 `AI#21` 在文件里加了个 helper，区间从 45-54 滑到
  //    47-56，末条「两端对齐」立刻假红）。**改了本文件就把这个区间跟着对一遍**——多了会静默放过
  //    区间内别的中文串（假绿），少了当场假红。区间 = `const PANEL_COMMAND_DESCRIPTIONS` 那行到此表的 `};`。
  "src/core/commands/shell/panelCommands.ts": [[47, 56]],
};

/**
 * 🔥 属性名级排除——`description` 的值是**声明数据，不是 UI 文字**（M1 `AI#7`/`AI#8`，2026-09-28）。
 *
 * 对象 = 命令元数据的 `description` / `params[].description`：宿主命令逐条补的「这条命令干什么」
 * ＋ 每个参数的说明（`src/core/commands/**` ＋ `src/App/startup.ts` 的 `color-picker.pick`）。
 * 消费方 = `commands.getCommands()` → 契约 `LinkDeskCommand` → 喂给 AI 的工具清单（function calling）
 * ——**今天零渲染消费方**（命令面板不画它）。
 *
 * 🔴 为什么不能「补译了事」：壳侧译名住在 `lang-defaults` 插件，而该插件**源码已外移独立仓**
 * （E6#99，本仓只有随包种子 zip，`check-bundled-freshness` 守）⇒ 仓内**没有**能加译名的落点，
 * 硬加＝手改别人仓的产物。而本文件头已定：非 UI key 缺译文时 `parseMissingKeyHandler`
 * 回退显示 key 本身 = **设计意图，不是漏翻**——元数据正属这一类。
 *
 * 判据与下方 manifest 侧的 `MANIFEST_TITLE_FIELDS`（**只收显示字段**、不收 `args` 数据）同源，
 * 只是方向相反：那边是白名单（只有显示字段要译），这里**黑名单一条**（`description` 恒非显示）。
 * 实测兜底：本规则生效前，全 `src/**` 非测试文件里的中文 `description:` 字面量**只有**这批命令元数据
 * （其余全在 `*.test.*`——本审计本就整文件跳过）⇒ 对既有判定**零影响**，不开新洞。
 *
 * ⚠️ **撤销条件**：命令说明/参数说明一旦进 UI（命令面板副标题、设置页帮助文本……任何渲染点），
 * 本规则必须撤销并把那些串补译——那时它们就是 UI 文字了。
 */
const METADATA_VALUE_PROP = "description";
/** 命中串的**紧邻前缀**是不是 `description:`（即「这个中文串是那个字段的值」） */
const METADATA_VALUE_PREFIX_RE = /(?:^|[\s,{[])description:\s*$/;

// ── 1. 加载所有翻译 key ──
// 2026-09-05 塌平单根：plugins/<id>（builtin/user 前缀全删）
//
// 🔴 E6#99（L7 第 7.2 轮）：**字典源随插件一起搬走了**——这处必须说清，否则本门禁会静默失去意义。
//   病灶：本审计要回答的是「源码里的中文串有没有译名」，而译名的**大半住在插件里**——
//   应用级字典 = lang-defaults 插件（运行时由它经 LanguageRegistry 提供，见 src/i18n/index.ts
//   「第 1 层翻译资源由插件系统提供」），另有各插件的 i18n/en.json 也一并注册进同一资源表
//   （实测：壳 src/hooks/usePoolSync/notif.ts 的「下载中 {{percent}}%」等 install 进度串，
//   译名就住在 **marketplace** 插件的字典里）。仓内没有这些字典的第二份。
//   18 只发货插件源码外移后照旧读文件 ⇒ `translated` 几乎为空 ⇒ **满屏假「缺翻译」**
//   （比门禁失效更糟：假红会让真红失效）。
//   处置：改读**随壳发货的种子 zip**（`bundled-plugins/*.linkdesk-plugin`）里的字典——
//   它们不是「第二份真相源」，而是壳仓里**真实存在的那一份**（D3：出厂靠种子随包），
//   语义还更准：被审计的就是「用户实际会拿到的那些字典」。
//   种子缺失 ⇒ **响亮红灯**（下）：决不退化成「查了个空还说 ✓」。
const SEED_DIR = "bundled-plugins";
/** 包内字典条目——lang-defaults 用根级 `en.json`，其余插件用 `i18n/en.json`（两种都收） */
const SEED_DICT_ENTRIES = ["en.json", "i18n/en.json"];
const APP_DICT_SEED = `${SEED_DIR}/lang-defaults.linkdesk-plugin`;

// 仓内夹具的字典——**仍在仓内**，照旧按路径读（演示插件 UI 串归插件自持）
const I18N_FILES = [
  "plugins/panel-demo/i18n/en.json", // E5.8#37.9：演示插件 UI 串归插件自持
  // 🔥 2026-09-28：`plugins/floating-panel-demo/i18n/en.json` 条目已删——插件本体（含其市场条目、
  //   GitHub 仓、本仓 `plugins/floating-panel-demo/`）由用户拍板整套移除，此路径永不再存在。
  //   与下面两条同一处置：**死路径不留待复活**（它会让每次 check 白打一行 `⚠ 缺失:`）。
  // 🔥 E6#95d：`plugins/first-run-setup/i18n/en.json` 已删——该插件**源码在仓外**（用户 2026-09-11
  //   拍板「不搬」，见插件规范化层/00 §五②），此路径在本仓**永远够不着** ⇒ 每次 npm run check
  //   都白打一行 `⚠ 缺失:` 假警告。**门禁自己腐烂的实例**（06 §〇 闸 3），删掉不留待复活。
  // E5.8#41.17 settings-demo（漂亮设置卡片分区）条目已删——插件被用户自删（eef2d31c2），残留死路径
  // 🔴 E6#99：`plugins/{lang-defaults,editor,file-tree,serial-monitor,marketplace}/…/en.json` 五条已删——
  //   那些插件各自搬进独立仓，字典随源码走，改由下方**种子 zip** 读。
];

const translated = new Set();
for (const f of I18N_FILES) {
  if (!existsSync(f)) { console.warn(`⚠ 缺失: ${f}`); continue; }
  Object.keys(JSON.parse(readFileSync(f, "utf-8"))).forEach((k) => translated.add(k));
}

// 应用级字典：从随壳种子 zip 里取（lang-defaults 的 en.json + 各插件的 i18n/en.json）
let seedDictKeys = 0;
let seedDictFiles = 0;
try {
  if (!existsSync(APP_DICT_SEED)) throw new Error(`应用级字典种子不在位：${APP_DICT_SEED}`);
  const zips = readdirSync(SEED_DIR).filter((n) => n.endsWith(".linkdesk-plugin"));
  if (zips.length === 0) throw new Error(`${SEED_DIR}/ 下没有任何 .linkdesk-plugin`);
  for (const name of zips) {
    const zip = await JSZip.loadAsync(readFileSync(join(SEED_DIR, name)));
    for (const wanted of SEED_DICT_ENTRIES) {
      const entry = Object.keys(zip.files).find((n) => n === wanted || n.endsWith(`/${wanted}`));
      if (!entry) continue;
      const dict = JSON.parse(await zip.file(entry).async("string"));
      const keys = Object.keys(dict);
      keys.forEach((k) => translated.add(k));
      seedDictKeys += keys.length;
      seedDictFiles += 1;
    }
  }
  if (seedDictKeys === 0) throw new Error(`${zips.length} 个种子 zip 里一个字典条目都没读到`);
} catch (e) {
  console.error(
    `❌ 读不到随包字典（${SEED_DIR}/ 的种子 zip）：${e instanceof Error ? e.message : String(e)}\n` +
      `   本审计靠它判定「源码里的中文串有没有译名」——18 只发货插件的**源码**已外移各自独立仓（E6#99），\n` +
      `   壳仓里只剩这些随包种子。种子不在 ⇒ 审计无从进行：**不许退化成真空绿灯**，故此处直接红。\n` +
      `   修复：确认 bundled-plugins/ 下的出厂种子在位（出厂种子不许丢；7.4 轮起由 sync:bundled 保鲜）。`
  );
  process.exit(1);
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

// ── 1b. G2（E6#95b）：可疑 t() key——标识符形态且不在任何字典里 ──
/** 标识符形态：ASCII 字母开头，无空格无中文（`newPattern` / `category.` / `LinkDesk` 都命中） */
const SUSPICIOUS_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;
/** t("…") 调用点——只认直接字面量；t(someVar) / t("a" + b) 不在此列 */
const T_CALL_RE = /\bt\(\s*(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;
/** 产品专名——永不翻译（与下方 walkManifests 的 contributes.languages/themes 跳过**同源**，不开第二份名单） */
const PROPER_NOUNS = new Set(["LinkDesk"]);

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
const tCallKeys = new Map(); // G2：t("…") 的字面量 key → [file:line, ...]

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
        // 声明数据（非 UI）——`description:` 的值＝命令/参数元数据，见上方 §0 的属性名级排除
        if (METADATA_VALUE_PREFIX_RE.test(eff.slice(0, m.index))) continue;
        const text = unescapeStr(m[2]).trim();
        if (text.length < 2) continue;
        if (!/[一-鿿]/.test(text)) continue;
        if (text.includes("${")) continue; // 插值模板——数据拼接非纯 UI 标签
        if (!found.has(text)) found.set(text, []);
        found.get(text).push(relPath + ":" + lineNo);
      }

      // G2：同一趟顺带收 t("…") 字面量 key（注释已剥离、console/throw 行已跳过——白捡的净化）
      T_CALL_RE.lastIndex = 0;
      let t;
      while ((t = T_CALL_RE.exec(eff)) !== null) {
        const key = unescapeStr(t[2]);
        if (!SUSPICIOUS_RE.test(key)) continue;
        if (!tCallKeys.has(key)) tCallKeys.set(key, []);
        tCallKeys.get(key).push(relPath + ":" + lineNo);
      }
    }
  } catch { /* skip unreadable */ }
}

for (const root of ["src", "plugins"]) {
  walkDir(root, (full) => processFile(full, full.replace(/\\/g, "/")));
}

// ── 2b. 🔥 E6#161：manifest 声明串——按「谁的仓谁译文」判（归属腿） ──
// 判据本体住 SDK（`own-dict-coverage.mjs`，作者侧 `ci-verify` ⑧ 段引的是同一份）；
// 仓清单 = `scripts/lib/plugin-repos.mjs`（官方名单的唯一真相源，⛔ 不写死 id）。
// 🔴 与上一段（源码中文串 × 随包字典池）**判的不是同一件事**：那段问「用户能不能看见译名」，
//    这段问「这条文案的译名该归谁」。所以「池里有」也算缺口——只是今天界面不错而已。
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";
const DEBT_FILE = "scripts/i18n-manifest-debt.json";
const officialIds = officialPluginIds("scripts/sync-plugin-agents.mjs");
const containerThere = existsSync(CONTAINER);

/** 一趟判据：插件根 + manifest → 汇总（`pool` = 随包字典里已有译名） */
function judgeRepo(dir, manifest, label, kind) {
  const cov = checkOwnDictCoverage(dir, { manifest });
  return {
    label,
    kind,
    scanned: cov.scanned.manifestStrings,
    dict: cov.dict.files.map((f) => f.rel),
    degraded: cov.degraded,
    problems: cov.problems,
    gaps: cov.manifestGap.map((g) => ({ ...g, repo: label, pool: translated.has(g.text) })),
    sourceGapCount: cov.sourceGap.length,
    sourceKeyCount: cov.scanned.sourceKeys,
  };
}

const judged = [];
// ① 仓内夹具（`plugins/<id>`——演示插件仍住本仓）
if (existsSync("plugins")) {
  for (const e of readdirSync("plugins", { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join("plugins", e.name);
    if (!existsSync(join(dir, "plugin.json"))) continue;
    const read = readManifestJson(join(dir, "plugin.json"));
    if (!read.ok) { console.warn(`⚠ ${dir}/plugin.json 读不动（${read.why}）`); continue; }
    judged.push(judgeRepo(dir, read.manifest, e.name, "仓内夹具"));
  }
}
// ② 插件容器（官方 / 第三方——**只读**）
if (containerThere) {
  for (const r of discoverPluginRepos(CONTAINER)) {
    const read = readManifestJson(join(r.dir, "plugin.json"));
    if (!read.ok) continue;
    const official = officialIds ? officialIds.has(r.id) : true;
    judged.push(judgeRepo(r.dir, read.manifest, r.id, official ? "官方" : "第三方"));
  }
}

// 判域：**官方 + 仓内夹具**（这二者是本仓能管的），第三方仓只报告不判红——
// 别人的声明该由**别人仓的 ci-verify ⑧ 段**拦（跨仓替人立账 = 拿别人的欠款卡自己的提交）。
const gated = judged.filter((r) => r.kind !== "第三方");
const thirdParty = judged.filter((r) => r.kind === "第三方");
const thirdPartyGapCount = thirdParty.reduce((a, r) => a + r.gaps.length, 0);
const allGaps = gated.flatMap((r) => r.gaps);
const gapsByRepo = gated.filter((r) => r.gaps.length > 0).sort((a, b) => b.gaps.length - a.gaps.length);
const uncovered = allGaps.filter((g) => !g.pool);
const sourceDebt = gated.filter((r) => r.sourceGapCount > 0);

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

// ── 3b. G2：可疑 t() key（黄灯，永不 fail） ──
// 判据 = 「标识符形态（无空格无中文）且不在任何字典里」。两条白名单（各有真实来源，非拍脑袋放宽）：
//   ① PROPER_NOUNS——产品专名，永不翻译；
//   ② 动态前缀——key 以 `.` 结尾（t("category." + id)），或是另一个更长 key 的前缀（运行时才拼全）。
const allTKeys = [...tCallKeys.keys()];
const suspicious = allTKeys.filter((k) => {
  if (translated.has(k)) return false;
  if (PROPER_NOUNS.has(k)) return false;
  if (k.endsWith(".")) return false;
  if (allTKeys.some((o) => o !== k && o.startsWith(k))) return false;
  return true;
});

// ── 4. 输出 ──
const totalFound = found.size;
const totalTranslated = found.size - missing.length;

console.log(`\n=== i18n 审计 ===`);
console.log(`已翻译: ${totalTranslated}  |  缺翻译: ${missing.length}  |  总字符串: ${totalFound}`);
console.log(`翻译文件: ${I18N_FILES.length} 个仓内夹具字典 + 随包种子字典（${SEED_DIR}/ 下 ${seedDictFiles} 个条目，${seedDictKeys} key）, 共 ${translated.size} key\n`);

if (missing.length === 0) {
  console.log("✅ 所有中文 UI 字符串均有翻译。\n");
} else {
  console.log("🔴 以下字符串缺翻译：\n");
  for (const m of missing) {
    console.log(`  ${m.text}  [${m.count}x, e.g. ${m.first}]`);
  }
  console.log(`\n修复：将以上字符串添加到对应插件的 i18n/en.json 或 lang-defaults/en.json\n`);
}

// ── 4b. G2 输出（黄灯） ──
if (suspicious.length > 0) {
  console.log(`⚠ 可疑 t() key（${suspicious.length} 条）——症状：标识符形态且不在任何字典里。`);
  console.log(`  自己判断是哪一种：数据标识符（不该走 t()，改成字面量）/ 漏翻（补进字典）/ 动态前缀（合法）。\n`);
  for (const k of suspicious) {
    const at = tCallKeys.get(k);
    console.log(`  ${at[0]}  t(${JSON.stringify(k)})${at.length > 1 ? `  [+${at.length - 1} 处]` : ""}`);
  }
  console.log("");
}

// ── 4c. E6#161：manifest 归属缺口（谁的仓谁译文） ──
const debtEntries = (() => {
  try {
    const doc = JSON.parse(readFileSync(DEBT_FILE, "utf-8"));
    return Array.isArray(doc) ? doc : (doc?.entries ?? null);
  } catch {
    return null;
  }
})();
/** 账本条目的身份键——用 JSON 数组避开分隔符碰撞（文案里什么字符都可能出现） */
const debtKey = (e) => JSON.stringify([e.repo, e.field, e.text]);
const registered = new Set((debtEntries ?? []).map(debtKey));
const unregistered = allGaps.filter((g) => !registered.has(debtKey(g)));
const gapKeys = new Set(allGaps.map(debtKey));
const staleDebt = (debtEntries ?? []).filter((e) => !gapKeys.has(debtKey(e)));

const kindCount = (k) => judged.filter((r) => r.kind === k).length;
const scannedTotal = gated.reduce((a, r) => a + r.scanned, 0);
console.log(`── manifest 声明串（归属 = 谁的仓谁译文 · E6#161）──`);
if (!containerThere) {
  console.log(
    `⏭ 插件容器不在位（${CONTAINER}）——只审了仓内夹具；跨仓那半趟跳过` +
      `（⛔ 不因此判红，设 LINKDESK_PLUGIN_CONTAINER 指到容器即可恢复）。`,
  );
}
console.log(
  `判了 ${judged.length} 只仓（官方 ${kindCount("官方")} · 仓内夹具 ${kindCount("仓内夹具")} · 第三方 ${kindCount("第三方")}）；` +
    `判域内可渲染中文串 ${scannedTotal} 条（每仓各算一份），归属缺口 ${allGaps.length} 条`,
);
if (thirdParty.length > 0) {
  console.log(
    `⏭ 第三方仓 ${thirdParty.length} 只（缺口 ${thirdPartyGapCount} 条）**只报告不判红**——` +
      `他们的声明由他们仓的 ci-verify ⑧ 段拦（跨仓替人立账 = 拿别人的欠款卡自己的提交）。`,
  );
}
if (judged.length === 0) {
  console.log(`⏭ 无仓可判（容器不在位且本仓无夹具插件）。`);
} else if (allGaps.length === 0) {
  console.log(`✅ 每条声明串都有本仓译名——归属成立（${scannedTotal} 条逐条有主）。`);
} else {
  console.log(
    `   其中 ${uncovered.length} 条**池里也没有**（随包字典都没给译名 ⇒ 今日英文界面必然显中文）；` +
      `${allGaps.length - uncovered.length} 条池里有（界面不错，但归属未落：声明在本仓、译名住别处，跨仓追不上）。\n`,
  );
  for (const r of gapsByRepo) {
    const dictNote = r.dict.length === 0 ? " · **本仓一份字典都没声明**" : ` · 自有字典 ${r.dict.join("、")}`;
    console.log(`  ${r.label}（${r.kind}）· 可渲染 ${r.scanned} 条 · 缺口 ${r.gaps.length} 条${dictNote}`);
    for (const g of r.gaps) {
      const mark = g.pool ? "（池里有）" : "（🔴 池里也没有）";
      const fresh = !registered.has(debtKey(g));
      console.log(`     ${fresh ? "🆕" : "  "} ${JSON.stringify(g.text)}  @${g.field}${mark}`);
    }
    if (r.degraded) console.log(`     ⏭ 另有 ${r.problems.length} 处判不了（字典读不动等），本仓读数不全。`);
  }
}
for (const r of sourceDebt) {
  console.log(
    `  ⚠ ${r.label}：src 里 ${r.sourceKeyCount} 个 t() 中文 key，其中 ${r.sourceGapCount} 个不在自有字典` +
      `（黄灯——应用级字典是合法提供方，硬判会有一堆假红；按「谁的仓」逐条迁）。`,
  );
}
if (sourceDebt.length > 0) console.log("");
if (debtEntries === null) {
  console.log(`ℹ 债务账本 ${DEBT_FILE} 读不到 ⇒ 所有缺口都按「新缺口」算（门禁会红）。\n`);
} else {
  console.log(
    `   债务账本 ${DEBT_FILE}：登记 ${debtEntries.length} 条 ⇒ 其中 ${debtEntries.length - staleDebt.length} 条仍在案` +
      `（本轮不判红）；新缺口 ${unregistered.length} 条；已还清未删行 ${staleDebt.length} 条。\n`,
  );
}

// ── 5. 门禁（--strict：缺翻译即失败——npm run check 机械拦截） ──
if (process.argv.includes("--strict") && missing.length > 0) {
  console.log("❌ i18n 审计门禁未过——缺翻译字符串存在，请补译后重跑。");
  process.exit(1);
}

// ── 5b. E6#161 门禁：manifest 归属缺口（账本登记制） ──
// 两条铁律：① 新缺口（不在账本里）当场红；② 账本里已还清却没删行同样红（账本不许自腐）。
// ⛔ 没有「一键重写账本」的开关——那等于把门拆了（见 i18n-manifest-debt.json 头部）。
if (process.argv.includes("--strict") && (unregistered.length > 0 || staleDebt.length > 0)) {
  const listing = (rows) =>
    rows
      .slice(0, 12)
      .map((r) => `   ${r.repo}  ${JSON.stringify(r.text)}  @${r.field}`)
      .join("\n") + (rows.length > 12 ? `\n   … 等 ${rows.length} 条` : "");
  if (unregistered.length > 0) {
    console.log(
      `❌ i18n 归属门禁未过——${unregistered.length} 条声明串缺口**不在账本里**（新缺口）：\n` +
        listing(unregistered) +
        `\n   修法：在本仓 \`i18n/<lang>.json\` 补译并在 manifest 声明（谁的仓谁译文——声明在谁手里，译名就归谁）；` +
        `确实要留债的，写进 ${DEBT_FILE} 并注明为什么。`,
    );
  }
  if (staleDebt.length > 0) {
    console.log(
      `❌ i18n 归属门禁未过——账本里 ${staleDebt.length} 条**已还清却没删行**（账本不许自腐）：\n` +
        listing(staleDebt) +
        `\n   修法：把这几条从 ${DEBT_FILE} 删掉（缺口已消失 = 债务还清）。`,
    );
  }
  process.exit(1);
}
