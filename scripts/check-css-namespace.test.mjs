/**
 * check-css-namespace 的内联自测（E6#0.6d 第一刀·自测外迁）。
 *
 * 原先这段（正控 16 ／ 负控 17 ＋ 锚⑥⑦⑧⑨ 的跨包文案钉）住在主文件里，用的全是**系统临时目录夹具**
 * （`mkdtempSync`，跑完 `rmSync`）。自测是测试、不是生产体量：按仓库既有惯例（`*.test.*` 不计入门禁）
 * 外迁到同名测试模块；主文件只留 `--self-test` 转发，调用面零变化。
 * ⚠️ 判据语义一字未改——逐例实跑 `runChecks()` 断言，零仓库副作用（夹具落系统临时目录）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { TOKEN_WHY } from "./lib/css-selectors.mjs";
import { HOST_DOMAIN, runChecks } from "./check-css-namespace.mjs";

/** 与主文件同一算式（测试与生产同夹 ⇒ 同一个 ROOT） */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ── 自测（正控会绿 / 负控会红）────────────────────────────────────── */

export function selfTest() {
  const cases = [];
  const tmp = mkdtempSync(join(tmpdir(), "ldk-css-ns-"));
  const mk = (rel, content) => {
    const full = join(tmp, rel);
    mkdirSync(dirname(full), { recursive: true }); // 判据⑨ 的夹具要落到 `src/pool/**` 深层
    writeFileSync(full, content, { flag: "w", encoding: "utf8" });
  };
  const setup = () => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, "src", "components", "shared", "toggle"), { recursive: true });
    mkdirSync(join(tmp, "src", "components", "shared", "theme-picker"), { recursive: true });
    mkdirSync(join(tmp, "src"), { recursive: true });
    mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n");
    mk("src/components/shared/toggle/Toggle.tsx", 'export const T = () => <div className="ldk-toggle" />;\n');
    mk("src/index.css", ".ldk-input { background: var(--bg-input); }\n");
    mk("src/App.tsx", "export const A = () => <div className='x' />;\n");
    // 判据⑩ 的基线登记表（夹具默认「任何文件都不许有顶层无锚站点」）——E6#109o-b 起它是 ⑩ 的
    // 唯一真相源，且它声明的 `domain.files` 必须与 `HOST_DOMAIN` 逐字一致（域漂移会另报一条红）。
    mkBaseline({ files: [] });
  };
  /** 写夹具的基线登记表（`files` = [{file,count}]） */
  const mkBaseline = (body) => {
    mk(
      "scripts/css-selector-baseline.json",
      JSON.stringify({ why: "(夹具)", domain: { files: HOST_DOMAIN }, ...body }, null, 1)
    );
  };
  const registry = { keyframes: [] };

  // 正控：两域都 `ldk-` 化 ＋ 关键帧表一致 ⇒ 零违规（**终态**：判据①③ 双双结构性）
  setup();
  cases.push(["正控：两域独立定义均 `ldk-` ＋ 无关键帧 ⇒ 绿（终态）", runChecks(tmp, registry).length === 0]);

  // 负控①：共享组件**带连字符**的独立定义（`.foo-bar`）⇒ 红
  //   🔴 这正是旧启发式（`name.includes("-") ? 跳过`）漏掉的那一整类——1.21b 把判据① 转结构性就为它。
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".foo-bar { color: red; }\n");
  cases.push(["负控①：共享组件带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "shared-bare-unprefixed")]);

  // 负控①b：共享组件**不带连字符**的独立定义（`.mybrand`）同样红（不是「只拦带连字符的」）
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".mybrand { color: red; }\n");
  cases.push(["负控①b：共享组件不带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "shared-bare-unprefixed")]);

  // 🔴 tripwire（**已翻面**——混合态结束的钉子）：同一份 `.foo-bar` 放共享组件与放宿主**两侧都报**。
  //   E6#109l（宿主转结构性）与本格（共享组件转结构性）之间那段混合态里，这条断言是「共享组件侧不报」；
  //   件 4 收官后它翻成「两侧同为结构性」。⇒ 它同时钉住「判据①③ 形态一致」这件事本身。
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".foo-bar { color: red; }\n");
  mk("src/index.css", ".ldk-input { color: red; }\n.foo-bar { color: blue; }\n");
  {
    const ks = new Set(runChecks(tmp, registry).map((v) => v.kind));
    cases.push([
      "tripwire（翻面）：同一 `.foo-bar` 放共享组件与宿主两侧都报 ⇒ 判据①③ 同为结构性（终态）",
      ks.has("shared-bare-unprefixed") && ks.has("host-bare-unprefixed"),
    ]);
  }

  // 负控②：宿主**带连字符**的独立定义（`.foo-bar`）⇒ 红（E6#109l 加的，保留）
  setup();
  mk("src/index.css", ".ldk-input { color: red; }\n.foo-bar { color: blue; }\n");
  cases.push(["负控②：宿主带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "host-bare-unprefixed")]);

  // 负控②b：宿主不带连字符的裸定义（`.mybrand`）⇒ 红
  setup();
  mk("src/index.css", ".mybrand { color: blue; }\n");
  cases.push(["负控②b：宿主不带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "host-bare-unprefixed")]);

  // 负控③：**判据⑥**——宿主定义了一条共享组件已有的 `ldk-` 名（演示目录组件 `ldk-toggle`）
  setup();
  mk("src/index.css", ".ldk-input { color: red; }\n.ldk-toggle { color: blue; }\n");
  cases.push(["负控③：`ldk-` 名跨域同名 ⇒ 红（判据⑥）", runChecks(tmp, registry).some((v) => v.kind === "ldk-cross-domain-clash")]);

  // 正控⑥：**消费边不算撞车**——共享组件 CSS 里 scoped 消费宿主的 `ldk-input`、宿主 scoped 调优 `ldk-toggle`
  //   （判据⑥ 只看「定义 × 定义」；这两条是文档明写的设计内消费）
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.ldk-form-row > .ldk-input { flex-shrink: 0; }\n");
  mk("src/index.css", ".ldk-input { background: var(--bg-input); }\n.ldk-titlebar .ldk-toggle { margin: 0; }\n");
  cases.push(["正控⑥：scoped 消费/调优（有祖先）不算跨域撞车 ⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 负控④：关键帧重名
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { animation: fade-in 1s; }\n@keyframes fade-in { to { opacity: 1 } }\n");
  mk("src/App.css", "@keyframes fade-in { to { opacity: 0 } }\n");
  cases.push(["负控④：关键帧重名 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "keyframes-clash")]);

  // 负控⑤：关键帧未登记（实况有、表里没有 ⇒ 插件作者会以为该名字可用）
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { animation: my-in 1s; }\n@keyframes my-in { to { opacity: 1 } }\n");
  cases.push(["负控⑤：关键帧未登记 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "keyframes-unregistered")]);

  // 负控⑥：登记过期（表里的关键帧实况已不存在 ⇒ 发给作者的清单在误导）
  //   ⚠️ `classes` 整块已删（E6#109l-b）⇒ 登记过期只剩关键帧这一条腿。
  setup();
  cases.push(["负控⑥：登记过期（关键帧）⇒ 红", runChecks(tmp, { keyframes: ["gone-anim"] }).filter((v) => v.kind === "registry-stale").length === 1]);

  /* ── 判据⑨（token 作用域 · E6#109n-b）────────────────────────────────
     🔴 正控条数 ≥ 负控条数（件 2 立下的纪律）：判据**不许朝严的方向腐烂** ⇒
        每一条「该红的」旁边都配一条「长得很像但该绿的」。 */

  // 负控⑦：宿主把文档级定义写在契约块之外 ⇒ V3（**带连字符的名字照样红** ⇒ 尺子不是「连字符即安全」）
  setup();
  mk("src/pool/views/about/AboutView.css", ":root { --shadow-tiny: red; }\n");
  cases.push([
    "负控⑦：宿主非契约文件里的文档级定义 ⇒ 红（判据⑨ V3；带连字符的名字照样红）",
    runChecks(tmp, registry).some((v) => v.kind === "token-scope-v3"),
  ]);

  // 负控⑧：共享组件挂非自有类 ⇒ V4
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.foo-bar { --x: 1; }\n");
  cases.push(["负控⑧：共享组件类限定定义挂非自有类 ⇒ 红（判据⑨ V4）", runChecks(tmp, registry).some((v) => v.kind === "token-scope-v4")]);

  // 负控⑨：共享组件在文档级定义（且带 `ldk-` 名）⇒ **V3**（这条钉住「共享组件也在宿主文档级约束内」）
  //   ——同一站点同时命中 V3 与 V2，判级**只报最具体的一条**（先 V3、过契约块后才落到 V2）；
  //   V2 的「与作用域无关」由下一条（负控⑩）单独钉。
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n:root { --ldk-toggle-bg: red; }\n");
  {
    const kinds = runChecks(tmp, registry).map((v) => v.kind);
    cases.push([
      "负控⑨：共享组件文档级定义 ⇒ 红 V3（共享组件也在宿主文档级约束内）",
      kinds.includes("token-scope-v3") && kinds.filter((k) => k.startsWith("token-scope-")).length === 1,
    ]);
  }

  // 负控⑩：宿主在**类限定**下定义 `ldk-*` 自定义属性 ⇒ V2（**与作用域无关**：名字层一句话）
  setup();
  mk("src/index.css", ".ldk-input { --ldk-input-bg: red; }\n");
  cases.push(["负控⑩：`ldk-*` 自定义属性即便挂在自有类之下也红（V2，名字层一句话）", runChecks(tmp, registry).some((v) => v.kind === "token-scope-v2")]);

  // 正控⑦：契约块里的文档级定义 ⇒ 绿（`index.css` 的 `:root` 与 `[data-theme="light"]` 是**文件级**登记）
  //   ⚠️ E6#109o-b 起这两条同时是判据⑩ 的基线站点 ⇒ 夹具必须登记它们（这正是「登记域」的真实形态：
  //     **同一批文档级选择器**在判据⑨ 眼里是契约块、在判据⑩ 眼里是基线块 —— 两个判据、同一处事实）。
  setup();
  mk("src/index.css", ':root { --bg-window: #111; }\n[data-theme="light"] { --bg-window: #eee; }\n');
  mkBaseline({ files: [{ file: "src/index.css", count: 2 }] });
  cases.push(["正控⑦：契约块（`src/index.css` 的 `:root` / `[data-theme=…]`）里的文档级定义 ⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 正控⑧：类限定 + 自有类（**名字随你、无需前缀**）⇒ 绿
  setup();
  mk("src/index.css", ".ldk-panel-zone { --panel-inset: 4px; }\n");
  cases.push(["正控⑧：类限定定义挂在自有类之下（名字不带前缀也合规）⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 正控⑨：**`(c)` portal 面的浮层宿主根**（id 作用域）⇒ 绿（放宽的是「元素归谁」，不是「名字归谁」）
  setup();
  mk("src/index.css", "#ld-float-layer { --float-blur-floor: 8px; }\n");
  cases.push(["正控⑨：`#ld-float-layer` 的 token 定义 ⇒ 绿（判据⑨ (c) portal 面）", runChecks(tmp, registry).length === 0]);

  // 正控⑩：域扩到 `src/**` 之后，**类限定定义照样按类判**（`.ldk-*` 之下 ⇒ 绿，哪怕它不在 index.css）
  //   ——这条防的是「把域宽误当成把规则也变宽」。
  setup();
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view { --about-gap: 8px; }\n");
  cases.push(["正控⑩：池域文件里的类限定定义（挂自有类）⇒ 绿（域宽 ≠ 规则宽）", runChecks(tmp, registry).length === 0]);

  // 锚⑦：**跨包文案同源** —— 判级文案在壳（本文件的 `TOKEN_WHY`，门禁与运行时探针共用）与
  //   SDK 腿（`packages/plugin-sdk/src/eslint/checks/token-scope.ts`）各一份（跨包无法 import）
  //   ⇒ 用锚词把两份钉在一起：**改一边不改另一边 ⇒ 自测当场红**（口径文本一致不靠自觉）。
  {
    const anchors = [
      "83 个只有样式表提供、引擎不写 inline", // V1
      "整个命名空间属宿主", // V2
      "跨方命中必须有自有根类作祖先", // V5
      "无人同吃", // V6
    ];
    const sdkSrc = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "eslint", "checks", "token-scope.ts"), "utf8");
    const shellText = Object.values(TOKEN_WHY).join("\n");
    cases.push([
      "锚⑦：判级文案壳 / SDK 同源（4 句锚词两边都在 ⇒ 改一边不改另一边必红）",
      anchors.every((a) => shellText.includes(a) && sdkSrc.includes(a)),
    ]);
  }

  // 锚⑥：**行号可映射** —— `stripComments` 保留换行（原先把换行也换成空格 ⇒ 多行注释后行号全部上移）。
  //   这条同时是 SDK 腿报点（`文件:行`）的前提。
  setup();
  mk("src/pool/views/about/AboutView.css", "/* 多行注释\n   第二行\n   第三行 */\n:root { --shadow-tiny: red; }\n");
  {
    const line = /AboutView\.css:(\d+)/.exec(runChecks(tmp, registry).find((v) => v.kind === "token-scope-v3")?.msg ?? "")?.[1];
    cases.push(["锚⑥：多行注释之后的定义点行号不乱（`stripComments` 保留换行）⇒ 报点在第 4 行", line === "4"]);
  }

  /* ── 判据⑦⑧⑩ ＋ 壳内夹具（**选择器形态轴** · E6#109o-b · 轮次 1.26）────────────
     🔴 正控条数 ≥ 负控条数（件 2 立下的纪律）：每条「该红的」旁边都配一条「长得很像但该绿的」。 */

  // 负控⑪：**基线文件之外**出现顶层无锚选择器（`button`）⇒ ⑩ 红
  setup();
  mk("src/pool/views/about/AboutView.css", "button { color: red; }\n");
  cases.push([
    "负控⑪：基线文件之外出现顶层无锚选择器 ⇒ 红（判据⑩ · R1）",
    runChecks(tmp, registry).some((v) => v.kind === "host-baseline-outside"),
  ]);

  // 负控⑫：**`@media` 内的规则同样是顶层**（相对它所在的层叠上下文无祖先）⇒ ⑩ 红
  setup();
  mk("src/pool/views/about/AboutView.css", "@media (min-width: 1px) { button { color: red } }\n");
  cases.push([
    "负控⑫：`@media` 内的无锚选择器**同样算顶层** ⇒ 红（判据⑩）",
    runChecks(tmp, registry).some((v) => v.kind === "host-baseline-outside" && /button/.test(v.msg)),
  ]);

  // 负控⑬：通配选择器落在基线文件之外 ⇒ ⑩ 红
  setup();
  mk("src/pool/views/about/AboutView.css", "* { margin: 0 }\n");
  cases.push([
    "负控⑬：`*` 落在基线文件之外 ⇒ 红（判据⑩）",
    runChecks(tmp, registry).some((v) => v.kind === "host-baseline-outside"),
  ]);

  // 负控⑭：**条数守卫**——基线文件里多塞一条顶层无锚（稳态 2 条被打破）⇒ ⑩ 红
  //   这条钉住「**静默加一条跨方泄漏**」这个动作：新增基线必须同笔改登记数 = 一次显式动作。
  setup();
  mk("src/index.css", ":root { --bg: #111 }\nhtml { height: 100% }\n");
  mkBaseline({ files: [{ file: "src/index.css", count: 2 }] });
  {
    const before = runChecks(tmp, registry).length === 0;
    mk("src/index.css", ":root { --bg: #111 }\nhtml { height: 100% }\ntextarea { resize: none }\n");
    const caught = runChecks(tmp, registry).some((v) => v.kind === "host-baseline-count");
    cases.push(["负控⑭：条数守卫（基线文件里多塞一条 ⇒ 站点数 ≠ 登记数）⇒ 红（判据⑩）", before && caught]);
  }

  // 负控⑭b：基线**域**漂移——登记表声明的宿主域 ≠ 判据③⑩ 的域 ⇒ 红
  //   （「域不一致」就是「尺子不止一把」：这条断言是它唯一的机械传感器。）
  setup();
  mkBaseline({ domain: { files: ["src/index.css", "src/pool/**"] }, files: [] });
  cases.push([
    "负控⑭b：登记表声明的宿主域与门禁的域不一致 ⇒ 红（域一致性断言）",
    runChecks(tmp, registry).some((v) => v.kind === "selector-baseline-domain-drift"),
  ]);

  // 负控⑭c：基线登记表**读不到** ⇒ fail-closed 红（静默放过 = 判据瞎了）
  setup();
  rmSync(join(tmp, "scripts", "css-selector-baseline.json"), { force: true });
  cases.push([
    "负控⑭c：基线登记表读不到 ⇒ fail-closed 红（判据⑩ 不许静默放过）",
    runChecks(tmp, registry).some((v) => v.kind === "selector-baseline-missing"),
  ]);

  // 负控⑮：共享组件目录里定义 `ldk-not-toggle`（族段 ≠ 目录族 `toggle`）⇒ ⑦ 红
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.ldk-not-toggle { color: red; }\n");
  cases.push([
    "负控⑮：共享组件目录里定义族外名字 ⇒ 红（判据⑦ 族段规则）",
    runChecks(tmp, registry).some((v) => v.kind === "shared-family-mismatch"),
  ]);

  // 负控⑯：`animation` 引用的关键帧没有定义 ⇒ ⑧ 红（症状是动画静默消失）
  setup();
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view { animation: ldk-gone 1s; }\n");
  cases.push([
    "负控⑯：`animation` 引用的关键帧没有定义 ⇒ 红（判据⑧ 引用不悬空）",
    runChecks(tmp, registry).some((v) => v.kind === "animation-ref-dangling"),
  ]);

  // 负控⑰：壳内夹具（`plugins/**`）里的无锚选择器 ⇒ ⑪ 红（夹具没有「基线区块」这个概念）
  setup();
  mk("plugins/demo-fixture/src/styles/demo.css", "button { color: red; }\n");
  cases.push([
    "负控⑰：壳内夹具（`plugins/**`）里的无锚选择器 ⇒ 红（判据⑪ 的夹具面）",
    runChecks(tmp, registry).some((v) => v.kind === "plugin-anchorless-selector"),
  ]);

  // 负控⑰b：夹具里的 **id 选择器**同样红（R2 对 id 与元素一视同仁，32 号档 §四）
  setup();
  mk("plugins/demo-fixture/src/styles/demo.css", "#demo-hook { color: red; }\n");
  cases.push([
    "负控⑰b：壳内夹具里的 **id 选择器** ⇒ 同样红（R2 一视同仁）",
    runChecks(tmp, registry).some((v) => v.kind === "plugin-anchorless-selector" && /id 选择器/.test(v.msg)),
  ]);

  // 正控⑪：文档级基线**在基线文件里**且条数相等 ⇒ 绿（现况的等价夹具）
  setup();
  mk(
    "src/index.css",
    ":root { --bg: #111 }\nhtml, body { height: 100% }\n* { box-sizing: border-box }\n::-webkit-scrollbar { width: 4px }\n"
  );
  mkBaseline({ files: [{ file: "src/index.css", count: 5 }] });
  cases.push([
    "正控⑪：基线文件里的文档级基线 ＋ 条数相等 ⇒ 绿（判据⑩ 正控；含**纯伪元素形态**）",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑫：复合（`.ldk-toggle.on::after`）**不占基线站点**（有名字锚）⇒ 绿（与轴 ① 同口径）
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.ldk-toggle.on::after { color: red; }\n");
  cases.push([
    "正控⑫：共享组件复合选择器（`.ldk-toggle.on::after`）不算基线站点 ⇒ 绿",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑬：🔴 `@keyframes` 体内的 `from` / `to` **不是选择器**——不算站点（钉住 `maskKeyframes()`）
  setup();
  mk("src/index.css", ":root { --bg: #111 }\n@keyframes ldk-probe { from { opacity: 0 } to { opacity: 1 } }\n");
  mkBaseline({ files: [{ file: "src/index.css", count: 1 }] });
  cases.push([
    "正控⑬：`@keyframes` 体内的 `from`/`to` 不算站点（钉住 `maskKeyframes()`）⇒ 绿",
    runChecks(tmp, { keyframes: ["ldk-probe"] }).length === 0,
  ]);

  // 正控⑭：宿主域文件里写 `.ldk-about-view textarea { }`（**有类锚**）⇒ 绿（⑩ 只管网子锚的）
  setup();
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view textarea { resize: none; }\n");
  cases.push([
    "正控⑭：挂自有类之下的元素样式（有锚）⇒ 绿（判据⑩ 的射程只有无锚）",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑮：族段**合规**形态——同目录内的 `--` 修饰与 `__` 元素后缀都算同族 ⇒ 绿
  setup();
  mk(
    "src/components/shared/toggle/Toggle.css",
    ".ldk-toggle { background: red; }\n.ldk-toggle--on { background: blue; }\n.ldk-toggle__knob { color: red; }\n"
  );
  cases.push([
    "正控⑮：同目录内 `--` 修饰 ／ `__` 元素后缀算同族 ⇒ 绿（判据⑦）",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑯：`animation` 引用的名字**在共享组件域**有定义（宿主域文件引用它）⇒ 绿
  //   （判据⑧ 的「同方」= 宿主域 ＋ 共享组件域——两边最终进同一张表，跨边引用是设计内形态。）
  setup();
  mk(
    "src/components/shared/toggle/Toggle.css",
    ".ldk-toggle { animation: ldk-toggle-in 0.15s; }\n@keyframes ldk-toggle-in { from { opacity: 0 } }\n"
  );
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view { animation: ldk-toggle-in 1s; }\n");
  cases.push([
    "正控⑯：宿主域引用共享组件域定义的关键帧 ⇒ 绿（判据⑧ 的「同方」= 宿主域 ＋ 共享组件域）",
    runChecks(tmp, { keyframes: ["ldk-toggle-in"] }).length === 0,
  ]);

  // 锚⑧：**形态口径文案跨包同源**——`formOf()` 的锚词在壳 lib 与 SDK 的 `css-selectors.ts` 各一份
  //   （跨包无法 import ⇒ 只能钉文本；照 1.24 `锚⑦` 先例：改一边不改另一边 ⇒ 自测当场红）。
  {
    const anchors = ["纯伪类/纯伪元素主体 ⇒ 无锚（不是无主体）", "不是顶层无锚（F3 反面）"];
    const sdkSrc = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "eslint", "checks", "css-selectors.ts"), "utf8");
    const shellSrc = readFileSync(join(ROOT, "scripts", "lib", "css-selectors.mjs"), "utf8");
    cases.push([
      "锚⑧：`formOf()` 口径文案壳 / SDK 同源（2 句锚词两边都在 ⇒ 改一边不改另一边必红）",
      anchors.every((a) => shellSrc.includes(a) && sdkSrc.includes(a)),
    ]);
  }

  // 锚⑨：**关键帧名抽取口径跨包同源**（E6#112 · 2026-09-18）——`animationRefs()` 在主仓的域是
  //   宿主域 ＋ 共享组件域（判据⑧），在 SDK 是**插件域**（第 46 号档那条腿）；域不同、**抽取口径必须同一份**，
  //   否则「同一个 `animation:` 值，壳说有一个名字、SDK 说没有」——两边报点会各说各话。
  //   跨包无法 import ⇒ 照 `锚⑦`/`锚⑧` 先例钉文本：**改一边不改另一边 ⇒ 自测当场红**。
  //   4 句锚词各钉一件事：① 关键字表（漏一个 ⇒ 把时长/缓动当名字 ⇒ 假红）；
  //   ② `--*` 跳过（自定义属性名里含 "animation" 的一大把）；③ 那条跳过的**理由**（口径不是巧合）；
  //   ④ 属性名正则本体（放宽一位 ⇒ `animation-timing-function: linear` 当场变假红）。
  {
    const anchors = [
      '"none", "initial", "inherit", "unset", "revert", "revert-layer",',
      "--my-animation:",
      "会造出假红",
      "if (!/(^|-)animation(-name)?$/.test(prop)) continue;",
    ];
    const sdkSrc = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "eslint", "checks", "css-selectors.ts"), "utf8");
    const shellSrc = readFileSync(join(ROOT, "scripts", "lib", "css-selectors.mjs"), "utf8");
    cases.push([
      "锚⑨：`animationRefs()` 口径壳 / SDK 同源（4 句锚词两边都在 ⇒ 改一边不改另一边必红）",
      anchors.every((a) => shellSrc.includes(a) && sdkSrc.includes(a)),
    ]);
  }

  rmSync(tmp, { recursive: true, force: true });
  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) ok = false;
  }
  console.log(`check-css-namespace self-test ${ok ? "✔️ 全部符合预期（正控绿 / 负控红）" : "❌ 有判据不符预期"}`);
  process.exit(ok ? 0 : 1);
}
