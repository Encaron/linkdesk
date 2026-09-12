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
 * 🔴 **闸 3（规则不许腐烂）的关键设计**：期望是**契约**，必须**显式写死**；从模板现场读 = 断言恒真 = 假门禁
 * （这正是 `check-file-size.mjs` 被关掉的同类错误）。**契约要显式，实现要现场读。**
 * 唯一的例外是「解析规则」这类**别人的实现**（CHANGELOG 切段正则 / 占位符 values 集合）——
 * 那些**从源码现场抽**，绝不手抄第二份（否则 SDK 改了正则、这里还认旧格式 = 门禁自己腐烂）。
 *
 * 用法：node scripts/check-scaffold.mjs（已挂 npm run check）
 * 退出码 0 = 生成物符合契约；1 = 有断言未过（逐条打印缺什么、该改哪）。
 */

import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PKG_DIR = join(ROOT, "packages", "create-linkdesk-plugin");
const TEMPLATE_DIR = join(PKG_DIR, "template");
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
const SCRATCH_ROOT = process.env.LINKDESK_SCRATCH || resolve(ROOT, "..", "linkdesk-build+scratch");
const SCRATCH_DIR = join(SCRATCH_ROOT, "scaffold-check");
const PROBE_NAME = "scaffold-probe";

/** 契约：生成物**必须**含这些文件（06 §3.2 断言 1；显式写死，不从模板现场读） */
const EXPECTED_FILES = [
  "plugin.json",
  "package.json",
  "tsconfig.json",
  "README.md",
  "CHANGELOG.md",
  ".gitignore",
  ".vscode/settings.json",
  "resources/icon.svg",
  "i18n/en.json",
  "src/index.tsx",
  "src/index.css",
];

/** 契约：`package.json` 的 scripts **必须**含这些命令（断言 5） */
const EXPECTED_SCRIPTS = ["dev", "build", "publish", "validate", "lint"];

const failures = [];
const fail = (msg, hint) => failures.push(hint ? `${msg}\n     ↳ ${hint}` : msg);

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

function generate() {
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

/** 递归收集相对路径（正斜杠，排序） */
function listFiles(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else out.push(full.slice(base.length + 1).replace(/\\/g, "/"));
  }
  return out.sort();
}

// ── 断言 ──

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
    // 断言 2：不含 pluginId（身份 = 目录名，见 05 §2.5）；含 icon
    if ("pluginId" in manifest) {
      fail("plugin.json 含 `pluginId`——E6#94 已删该字段（身份默认 = 插件目录名）",
        "除非是「目录名要改、安装身份不能变」的覆盖场景，模板里应保持注释掉");
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

// ── 主流程 ──

const genDir = generate();
if (genDir) {
  runAssertions(genDir);
  assertPublishFidelity();
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
    `占位符与 CLI values 齐平 / CHANGELOG 段可切 / i18n 零死 key / npm 打包不丢文件。`,
);
