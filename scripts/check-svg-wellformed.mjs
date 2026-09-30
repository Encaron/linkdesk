/**
 * 机械门禁：**SVG 资源合法性**（破图案 · 2026-09-30）——红灯。
 *
 * 用法：node scripts/check-svg-wellformed.mjs
 *       node scripts/check-svg-wellformed.mjs --self-test
 * 退出码 0 = 仓里每一份 .svg 都是能渲染的 SVG；1 = 有不合法的（路径 + 行号 + 修法打到 stderr）。
 *
 * ── 为什么必须有它（出处：2026-09-30 用户实机立案「插件市场图标破图」）──
 * 症状是**破图**，但排查下来没有一处「检查」会亮：文件在、协议 200、`plugin.json` 的 `icon`/`marketIcon`
 * 声明也对——三道**存在性**检查全绿。真正的病是**整份 SVG 不是合法 XML**：浏览器以
 * `image/svg+xml` 解析 `<img src>` 时用**严格 XML 解析器**，注释里出现连续两个连字符、或用了
 * `&nbsp;` 这类 XML 里不存在的实体，都会在那一行**致命报错**，整份文档被拒绝渲染——**静默破图**。
 *
 * 🔴 而那个坏掉的文件，是**脚手架的占位图**：`packages/create-linkdesk-plugin/template/resources/`
 * 里 `icon.svg` / `icon-bar.svg` 的注释为了提醒作者「别用 CSS 变量」，把 CSS 变量的**字面量**写进了
 * 注释——注释因此非法，图整份作废。第三方作者（AI）照模板「同名同位置覆盖」时，把那段注释连同画面
 * 一起搬进自己的图 ⇒ **复刻同一个错**。所以这道门禁要同时护住两头：模板自己别再坏、别人抄了会被拦住。
 *
 * ── 判据（**不在本文件里**——单一实现在 SDK，⛔ 别在这里另写一份）──
 *   `@linkdesk/plugin-sdk/svg-wellformed`（实现 = `packages/plugin-sdk/svg-wellformed.mjs`，
 *   与 `scripts/audit-plugin-tests.mjs` 引 `test-audit.mjs` 同款：plain .mjs 免构建直引）。
 *   两条判据：① 整份能被严格 XML 解析器读完（saxes——jsdom 解析 XML 用的同一实现，与真实渲染同族）；
 *   ② 根元素是 `svg`（拿 HTML 改名成 .svg 是另一类破图）。
 *   作者侧覆盖走**同一个模块**（插件仓 CI 的 `scripts/ci-verify.mjs` 第 ⑦ 段）——两轴同源、零分叉。
 *
 * ── 扫描域（**整仓走查**，不是白名单根）──
 *   从仓根走，跳过依赖/产物夹（node_modules / dist / dist-electron / .vite / build / coverage /
 *   __tests__ / 一切 `.` 开头的目录）。选**整仓**而不是像 check-empty-dirs 那样列根，是因为漏扫的
 *   代价（新开一个目录放图 ⇒ 门禁静默失效）高于多扫的代价（多读几个 KB 文本）；跳过靠**目录名精确匹配**，
 *   不吃前缀（`dist2` 不跳）。**豁免**只给测试夹具：`*.fixture.svg` / `*.mock.svg`（夹具常故意放坏样本），
 *   与 ci-verify 的 `isSourceFile` / 壳侧夹具词汇同源。
 *
 * ── 自测（`--self-test`，挂在 check 链里 ⇒ check-gate-health 的判定式 A 满足）──
 *   19 例：负控四条「真 bug 的复现形态」＋正控十五条「别误报」。**正控刻意多于负控**——
 *   误报比漏报更常毁掉一道门禁的信誉（尤其这一类：图能正常显示却被判红，作者第一反应是把门禁删掉）。
 *   夹具一律 `os.tmpdir()` + finally rmSync，**不往仓库造一个字节垃圾**。
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  SVG_CALIBER,
  checkSvgWellformed,
  formatSvgViolation,
  svgViolationHint,
} from "../packages/plugin-sdk/svg-wellformed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 合法 SVG 的最小骨架（自测正控的底子；`body` 换一处即成一例） */
const svgDoc = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">${body}</svg>`;

// ────────────────────────────────── 自测 ──────────────────────────────────

function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "linkdesk-svg-wellformed-selftest-"));
  let bad = 0;
  let posOk = 0;
  let negCount = 0;
  let total = 0;

  /** 在 tmp 下写一份文件（自动建父目录） */
  const put = (rel, content, opts = {}) => {
    const abs = join(tmp, rel.split("/").join("\\"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, opts.encoding ?? "utf8");
    return abs;
  };
  /** 扫描一棵子树 → 违规的文件名集合（排序拼接；零 ⇒ ""） */
  const hit = (relRoot) =>
    checkSvgWellformed(join(tmp, relRoot.split("/").join("\\")))
      .violations.map((v) => v.file)
      .sort()
      .join(" ");
  const fmt = (v) => (v === "" ? "（零）" : v);

  try {
    // ── 负控：四类真形态 + 走查 + 定位 ──
    // ① 元凶本尊：注释里的 CSS 变量字面量（连续两个连字符）——**多行**夹具，顺带钉住行号定位
    put(
      "neg-comment/a.svg",
      [
        `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">`,
        `  <!-- 占位图——请替换成你自己的图标 -->`,
        `  <!-- 不能用 var(--xxx)，颜色必须自含实色 -->`,
        `  <rect width="4" height="4"/>`,
        `</svg>`,
      ].join("\n"),
    );
    // ② 同类第二例：XML 里不存在的实体
    put("neg-entity/b.svg", svgDoc("<text>PYTHON&nbsp;·&nbsp;LSP</text>"));
    // ③ 标签不闭合/不匹配
    put("neg-tag/c.svg", "<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg2>");
    // ④ 文本里的裸 `<`
    put("neg-rawlt/d.svg", svgDoc("<text>a < b</text>"));
    // ⑤ 空文件
    put("neg-empty/e.svg", "");
    // ⑥ 根元素不是 svg（HTML 改名成 .svg）
    put("neg-root/f.svg", "<html><body>不是图</body></html>");
    // ⑦ 深层子目录里的坏图 —— 证明真的下降走查
    put("neg-deep/a/b/c/g.svg", svgDoc("<!-- -- -->"));

    // ── 正控：别误报 ──
    put("pos-ok/a.svg", svgDoc("<rect width='48' height='48' rx='10' fill='#64748B'/>"));
    // 正文里的连续连字符**合法**（XML 只禁注释里的）——证明判据是真解析器，不是 grep 找 `--`
    put("pos-dash-in-text/b.svg", svgDoc("<text>a--b</text>"));
    // CDATA 段里的 `<` 与 `&` 合法
    put("pos-cdata/c.svg", svgDoc("<text><![CDATA[a < b & c -- d]]></text>"));
    // 属性里的预定义实体合法
    put("pos-entity-amp/d.svg", svgDoc("<text>a &amp; b &#160; c</text>"));
    // 注释里的 em dash（U+2014）合法——与 ASCII 双连字符只差一个码位，正是当年踩坑处
    put("pos-emdash/e.svg", svgDoc("<!-- 占位图——请替换 --><rect width='4' height='4'/>"));
    // CRLF 行尾
    put("pos-crlf/f.svg", svgDoc("<rect width='4' height='4'/>").replace(/></g, ">\r\n<"));
    // UTF-8 BOM（Windows 编辑器常加，XML 规范允许）
    put("pos-bom/g.svg", "\uFEFF" + svgDoc("<rect width='4' height='4'/>"));
    // 大写扩展名同样在域内
    put("pos-upper/H.SVG", svgDoc("<rect width='4' height='4'/>"));
    // 夹具豁免：坏样本但按约定命名 ⇒ 放过
    put("pos-fixture/bad.fixture.svg", svgDoc("<!-- -- -->"));
    put("pos-fixture/bad.mock.svg", svgDoc("<text>&nbsp;</text>"));
    // __tests__ 目录整体跳过
    put("pos-testdir/__tests__/bad.svg", svgDoc("<!-- -- -->"));
    // 非 .svg 的文件根本不看（HTML 里写坏 XML 与门禁无关）
    put("pos-notsvg/readme.txt", "<!-- -- --> <not xml");
    // 依赖/产物夹跳过
    for (const d of ["node_modules", "dist", "dist-electron", ".vite", "coverage", "build"]) {
      put(`pos-skip/${d}/bad.svg`, svgDoc("<!-- -- -->"));
    }
    // 不吃前缀：`dist2` 不在跳过名单里 ⇒ 里面的坏图**必须**被抓
    put("neg-dist2/dist2/bad.svg", svgDoc("<!-- -- -->"));

    const cases = [
      // ── 负控 ──
      ["负控①：注释里的 CSS 变量字面量（连续两个连字符）⇒ 报", "负控", () => hit("neg-comment"), "a.svg"],
      ["负控②：未定义实体 &nbsp; ⇒ 报", "负控", () => hit("neg-entity"), "b.svg"],
      ["负控③：标签不匹配 ⇒ 报", "负控", () => hit("neg-tag"), "c.svg"],
      ["负控④：文本里的裸 `<` ⇒ 报", "负控", () => hit("neg-rawlt"), "d.svg"],
      ["负控⑤：空文件 ⇒ 报（少一个根元素）", "负控", () => hit("neg-empty"), "e.svg"],
      ["负控⑥：根元素不是 svg ⇒ 报 root 一类", "负控", () => hit("neg-root"), "f.svg"],
      ["负控⑦：三层子目录里的坏图 ⇒ 报（走查真下降）", "负控", () => hit("neg-deep"), "a/b/c/g.svg"],
      ["负控⑧：跳目录名不吃前缀（dist2 里的坏图 ⇒ 抓）", "负控", () => hit("neg-dist2"), "dist2/bad.svg"],
      [
        "负控⑨：行号定位到出错那一行（注释在第 3 行 ⇒ line=3）",
        "负控",
        () => checkSvgWellformed(join(tmp, "neg-comment")).violations[0]?.line,
        3,
      ],
      [
        "负控⑩：根元素一类报 kind=root（与 xml 那类可分辨 ⇒ 修法不同）",
        "负控",
        () => checkSvgWellformed(join(tmp, "neg-root")).violations[0]?.kind,
        "root",
      ],

      // ── 正控 ──
      ["正控①：合法 SVG ⇒ 零", "正控", () => hit("pos-ok"), ""],
      ["正控②：**正文**里的连续连字符合法 ⇒ 零（判据不是 grep `--`）", "正控", () => hit("pos-dash-in-text"), ""],
      ["正控③：CDATA 里的 `<` `&` 合法 ⇒ 零", "正控", () => hit("pos-cdata"), ""],
      ["正控④：预定义实体 &amp; / 数字引用 &#160; 合法 ⇒ 零", "正控", () => hit("pos-entity-amp"), ""],
      ["正控⑤：注释里的 em dash（U+2014）合法 ⇒ 零", "正控", () => hit("pos-emdash"), ""],
      ["正控⑥：CRLF 行尾合法 ⇒ 零", "正控", () => hit("pos-crlf"), ""],
      ["正控⑦：UTF-8 BOM 合法 ⇒ 零", "正控", () => hit("pos-bom"), ""],
      ["正控⑧：大写 .SVG 在域内且合法 ⇒ 零", "正控", () => hit("pos-upper"), ""],
      ["正控⑨：*.fixture.svg / *.mock.svg 豁免 ⇒ 零", "正控", () => hit("pos-fixture"), ""],
      ["正控⑩：__tests__/ 整体跳过 ⇒ 零", "正控", () => hit("pos-testdir"), ""],
      ["正控⑪：非 .svg 文件不看不判 ⇒ 零", "正控", () => hit("pos-notsvg"), ""],
      [
        "正控⑫：node_modules/dist/dist-electron/.vite/coverage/build 全跳过 ⇒ 零",
        "正控",
        () => hit("pos-skip"),
        "",
      ],
      ["正控⑬：根不存在 ⇒ 零、不崩", "正控", () => hit("no-such-root"), ""],
      [
        "正控⑭：两次调用互不累积（判据无模块级状态）",
        "正控",
        () => `${hit("pos-ok")} | ${hit("pos-ok")}`,
        " | ",
      ],
      [
        "正控⑮：格式器给「文件:行:列」——两轴打印同款",
        "正控",
        () => formatSvgViolation({ file: "a.svg", line: 3, column: 7, message: "x", kind: "xml" }),
        "a.svg:3:7  x",
      ],
      ["正控⑯：口径串仍在（删了它＝文档与判据脱钩）", "正控", () => /XML/.test(SVG_CALIBER) && /svg/i.test(SVG_CALIBER), true],
      [
        "正控⑰：修法提示按因给（注释类 ⇒ 提「连续两个连字符」）",
        "正控",
        () => /连续两个连字符/.test(svgViolationHint({ file: "a.svg", line: 1, column: 1, message: "malformed comment.", kind: "xml" })),
        true,
      ],
    ];

    for (const [tag, group, run, want] of cases) {
      let got;
      try {
        got = run();
      } catch (e) {
        got = `抛错(${e.message})`;
      }
      const pass = got === want;
      if (group === "负控") negCount++;
      if (pass && group === "正控") posOk++;
      if (!pass) bad++;
      total++;
      process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${fmt(String(got))}${pass ? "" : `，应 ${fmt(String(want))}`}\n`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true }); // 自测不许往仓库/系统留垃圾
  }

  process.stdout.write(
    bad === 0
      ? `\n✅ check-svg-wellformed self-test 全过（${total} 例：正控 ${posOk} 绿 / 负控 ${negCount} 红）——尺子不是在恒绿。\n`
      : `\n🔴 check-svg-wellformed self-test ${bad} 例不符（共 ${total} 例）。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  if (!existsSync(ROOT)) {
    console.log("⏭ 仓根不存在——本门禁无对象。");
    return;
  }
  const { scanned, violations } = checkSvgWellformed(ROOT);

  if (violations.length > 0) {
    console.error(
      `❌ ${violations.length} 份 .svg 不是一张能渲染的 SVG——浏览器会显示破图，**且不报任何错**\n` +
        `   （这是「存在性」检查看不出来的那一类：文件在、200、manifest 声明也对）。\n`,
    );
    for (const v of violations) {
      console.error(`   ${formatSvgViolation(v)}`);
      console.error(`     修法：${svgViolationHint(v)}`);
    }
    console.error("");
    process.exit(1);
  }

  console.log(
    `✅ ${scanned} 份 .svg 全部是合法 XML 且根元素为 svg（走查整仓；跳过 node_modules/dist/dist-electron/` +
      `.vite/build/coverage/__tests__ 与 .* 目录；豁免 *.fixture.svg / *.mock.svg）。`,
  );
}

main();
