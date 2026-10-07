/**
 * 机械检查：侧栏面板容器 `.ldk-side-panel-content` 的 flex 纵列形态不许再退化。
 *
 * 用法：node scripts/check-sidebar-container-shape.mjs
 *       node scripts/check-sidebar-container-shape.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 背景（2026-09-28 修「侧栏toolbar与section吸顶丢失」时用户拍板的第四件——「先一次性实证，门禁化另登记」，
 * 登记档 = docs/04-软件更新/待抉择池/侧栏布局形态门禁化.md）：
 *   `.ldk-side-panel-content` 必须是 **flex 纵列**（`display:flex` + `flex-direction:column`）——
 *   子层① toolbar 包装（flex-shrink:0）钉在滚动区外、子层② section 包装（flex:1 + min-height:0）
 *   自任唯一滚动容器 ⇒ toolbar 与 section 头粘顶的**前提**全在这两条声明上。
 *   2026-09-28 的真事故：两 zone 的这两条原本是内联 style，E5.7#10 迁池时没搬进 CSS
 *   ⇒ 容器退回「块级 + 自滚」，sticky 永不生效——而**五道既有门禁全绿**（类名有定义、tsc 合法、
 *   ESLint 合法、jsdom 不跑布局、间距档位不问容器形态）。
 *
 * 判据（B 案「静态断言作钉子」——防的是**这一处**再退化，不追求覆盖一切容器形态）：
 *   对左右两个 zone 文件各判：剥注释后，`.ldk-side-panel-content` 规则块
 *   ① 必须存在（选择器整个丢了也算退化）；
 *   ② 块内必须同时含 `display: flex` 与 `flex-direction: column`。
 *   ⚠️ 判据有意地脆（换类名/换写法即失效）——但它的目标只是钉住这处已知前提，够用；
 *   将来有 GUI CI 再上池档里的 A 案（dev + CDP 量计算后布局）。
 *
 * ── 自测（`--self-test`）覆盖的形状 ──
 *   正控：缺 display:flex / 缺 flex-direction:column / 选择器整个丢失 / 块内注释包裹声明 ⇒ 红
 *   负控：两行齐全（含真实文件同款写法）/ 其他类名同款缺失 ⇒ 绿
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 判据物：左右两个 zone 的容器规则块都住这里（新增第三个 side-panel zone 时此处同步加） */
const ZONE_CSS = [
  "src/pool/zones/sidebar/SidebarZone.css",
  "src/pool/zones/right-sidebar/RightSidebarZone.css",
];

const SELECTOR = ".ldk-side-panel-content";

/** 剥行内与跨行块注释——注释里的 "display: flex" 字样不是声明 */
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * 纯判据：一段 CSS 文本里 `.ldk-side-panel-content` 规则块的形态违规清单。
 * 返回字符串数组（空 = 合规）。
 */
export function containerShapeViolations(cssText) {
  const stripped = stripCssComments(cssText);
  // 选择器必须存在（后跟 `{`；`.ldk-side-panel-content-xxx` 这类更长类名不算命中）
  const selRe = new RegExp(
    "(^|[},\\s])" + SELECTOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{",
  );
  const m = selRe.exec(stripped);
  if (!m) return [`${SELECTOR} 规则块不存在——容器整个丢了，比缺声明更糟`];

  const blockStart = m.index + m[0].length;
  const blockEnd = stripped.indexOf("}", blockStart);
  const block = stripped.slice(blockStart, blockEnd === -1 ? undefined : blockEnd);
  // 归一空白后按声明判（`display :flex` / `display:flex` 一视同仁）
  const decls = block.toLowerCase().replace(/\s+/g, " ");

  const violations = [];
  if (!/display\s*:\s*flex\b/.test(decls)) violations.push(`${SELECTOR} 缺 display:flex`);
  if (!/flex-direction\s*:\s*column\b/.test(decls)) violations.push(`${SELECTOR} 缺 flex-direction:column`);
  return violations;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const ok = `.${SELECTOR.slice(1)} {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}`;
  const cases = [
    ["负控①：两行齐全 ⇒ 绿", ok, 0],
    [
      "负控②：真实文件同款（声明带行尾注释）⇒ 绿",
      ".ldk-side-panel-content {\n  flex: 1; /* 填满 */\n  display: flex; /* 纵列 */\n  flex-direction: column; /* 粘顶前提 */\n}",
      0,
    ],
    [
      "正控①：缺 display:flex ⇒ 红（正是 2026-09-28 事故形态）",
      ".ldk-side-panel-content {\n  flex-direction: column;\n}",
      1,
    ],
    [
      "正控②：缺 flex-direction:column ⇒ 红",
      ".ldk-side-panel-content {\n  display: flex;\n}",
      1,
    ],
    ["正控③：选择器整个丢失 ⇒ 红", ".other { display: flex; }\n", 1],
    [
      "正控④：声明只活在注释里 ⇒ 红 2 条（剥注释后判，两条声明都缺）",
      ".ldk-side-panel-content {\n  /* display: flex; flex-direction: column; */\n}",
      2,
    ],
    [
      "负控③：更长类名不算命中 `.ldk-side-panel-content-xxx` 丢失不影响本判据 ⇒ 绿",
      ".ldk-side-panel-content-xxx { color: red; }\n.ldk-side-panel-content { display: flex; flex-direction: column; }\n",
      0,
    ],
    [
      "正控⑤：块里两条声明全缺 ⇒ 红 2 条",
      ".ldk-side-panel-content { display: block; }",
      2,
    ],
  ];

  let bad = 0;
  for (const [tag, text, wantCount] of cases) {
    const got = containerShapeViolations(text);
    const pass = got.length === wantCount;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 条（${got.join("；") || "—"}）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-sidebar-container-shape self-test 全过（${cases.length} 例：正控红 / 负控绿）。\n`
      : `\n🔴 check-sidebar-container-shape self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const violations = [];
  for (const rel of ZONE_CSS) {
    const file = resolve(ROOT, rel);
    let text;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      violations.push(`  ${rel}  ⚠  判据物读不到——文件被移动/改名而本门禁没跟着改`);
      continue;
    }
    for (const v of containerShapeViolations(text)) {
      violations.push(`  ${rel}  ⚠  ${v}——toolbar 粘顶与 section 头吸顶的前提在退化（2026-09-28 事故同款）`);
    }
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(
      `\n❌ 侧栏容器形态退化 ${violations.length} 处——`.concat(
        "flex 纵列两条声明必须写进 CSS 规则块本体（不许只靠使用者内联样式补）。\n判据出处：docs/04-软件更新/待抉择池/侧栏布局形态门禁化.md",
      ),
    );
    process.exit(1);
  }

  console.log(`✅ 侧栏容器形态合规——${ZONE_CSS.length} 个 zone 的 ${SELECTOR} 均为 flex 纵列。`);
}

main();
