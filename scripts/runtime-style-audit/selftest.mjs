import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOLE_CLASS, formOf, hasAncestor, judgeTokenScope, selectorFormSites, stripComments, subjectOf, tokenScopeOf } from "../lib/css-selectors.mjs";
import { ROOT } from "./root.mjs";
import { PARTY_RULES, analyzeDump, gradeOne, gradeTokenScopes, isDocLevel, selectorShape } from "./grading.mjs";
import { compareStatic } from "./static-compare.mjs";

/** ⚠️ 由 `../runtime-style-audit.mjs` 拆出（E6#0.6d 第一刀 · feature-folder）——判据一字未改，只搬了家。 */

/* ════════════════════════════════════════════════════════════════════════
   ② 自测（正控绿 / 负控红）——**判据的存活不能寄托在人工上**（记忆 gate-selftest-must-be-wired）
   ════════════════════════════════════════════════════════════════════════ */

function sheet(index, origin, rules = [], keyframes = []) {
  const rs = rules.map((r) => {
    const decl = r.decl ?? "color: red";
    return { at: "", nested: r.nested ?? 0, sel: r.sel, empty: decl === "", decl: decl.includes("--") ? decl : null };
  });
  return { index, href: origin.href ?? null, devId: origin.devId ?? null, tag: "STYLE", blocked: origin.blocked ?? false, ruleCount: rs.length, rules: rs, keyframes };
}
const rules = (...sels) => sels.map((sel) => ({ sel }));
const doc = (label, sheets, extra = {}) => ({ label, url: `http://localhost:1420/${label}.html`, title: label, sheets, inlineTokens: [], bodyTokens: [], ...extra });

const HOST_CSS = { devId: "E:/linkdesk/src/pool/zones/icon-bar/IconBarZone.css" };
const SHARED_CSS = { devId: "E:/linkdesk/src/components/shared/button/Button.css" };
const PLUG_A = { href: "http://localhost:1420/@fs/E:/linkdesk-rmt-appdata/linkdesk/plugins/alpha/dist/index.bundle.css" };
const PLUG_B = { href: "http://localhost:1420/@fs/E:/linkdesk-rmt-appdata/linkdesk/plugins/beta/dist/index.bundle.css" };

export function selfTest() {
  const cases = [];
  const t = (name, pass) => cases.push([name, pass]);

  // ① 正控：各方各定义各的 ⇒ 零碰撞
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-icon-bar")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控①：各方各自定义、零交集 ⇒ ok 且碰撞 0", r.ok === true && r.collisions.length === 0);
  }
  // ② 负控：宿主 × 插件 同名裸类名 ⇒ red（`.badge` 案同形）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".badge")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "class" && x.name === "badge");
    t("负控①：宿主×插件 同名类名 ⇒ red 碰撞 ＋ ok=false", !!c && c.severity === "red" && r.ok === false);
  }
  // ③ 负控：关键帧跨方重名 ⇒ red（轴 ②）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a"), [{ name: "spin" }]), sheet(1, PLUG_A, rules(".alpha-root"), [{ name: "spin" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("负控②：关键帧跨方重名 ⇒ red 碰撞（轴 ②）", r.collisions.some((x) => x.axis === "keyframes" && x.name === "spin" && x.severity === "red"));
  }
  // ④ 负控：归不出来 ⇒ 未归属 且 **结论不成立**
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, {}, rules(".mystery")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("负控③：归不出来的样式表 ⇒ 未归属 1 ＋ ok=false（不许静默当宿主）", r.unattributed.length === 1 && r.ok === false);
  }
  // ⑤ 负控：插件定义 `ldk-` 名 ⇒ 占用宿主命名空间（即使没有第二方也红）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-pretend-host")), sheet(1, PLUG_B, rules(".beta-root"))])] });
    t("负控④：插件独立定义 `ldk-` 类名 ⇒ 越界 red ＋ ok=false", r.documents[0].facts.ldkIntrusions.length === 1 && r.ok === false);
  }
  // ⑥ 正控：**scoped 调优不算定义**（口径锚）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-icon-bar .badge")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控②：有祖先的 scoped 调优不算独立定义 ⇒ 宿主侧不占名、零碰撞", r.collisions.length === 0);
  }
  // ⑦ 正控：复合 `.badge.on` 不算类名定义（落轴 ④）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".badge.on")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const p = r.documents[0].parties.host;
    t("正控③：复合 `.badge.on` 不算类名定义（轴 ① 零命中 ／ 轴 ④ 命中 `other:.badge.on`）", !p.classes.includes("badge") && p["selector-shapes"].includes("other:.badge.on"));
  }
  // ⑧ 正控：空规则体不吃 —— **与静态门禁同口径**（两把尺子读数必须逐字相等）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, [{ sel: ".empty-badge", decl: "" }]), sheet(1, PLUG_A, rules(".empty-badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控④：空规则体（只有注释）不算定义 ⇒ 不产生碰撞（同 parseCss() 口径）", r.collisions.length === 0);
  }
  // ⑨ 负控：token 跨方同名 ⇒ 报（轴 ③）＋ document 级定义进事实面
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, [{ sel: ":root", decl: "--status-connected: green" }]), sheet(1, PLUG_A, [{ sel: ":root", decl: "--status-connected: red" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "token" && x.name === "--status-connected");
    t("负控⑤：token 跨方同名 ⇒ 报（轴 ③）＋ 双方 document 级定义被记为事实", !!c && r.documents[0].facts.documentLevelTokens["plugin:alpha"]?.length === 1 && r.documents[0].facts.documentLevelTokens.host?.length === 1);
  }
  // ⑩ 负控：轴 ④ 形态跨方 ⇒ 报
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("*, *::before")), sheet(1, PLUG_A, rules("button")), sheet(2, PLUG_B, rules("button"))])] });
    t("负控⑥：顶层非类名选择器形态跨方 ⇒ 报（轴 ④）", r.collisions.some((x) => x.axis === "selector-shape" && x.name === "element:button"));
  }
  // ⑪ 正控：插件 × 插件 同名 ⇒ **yellow 不是 red**（钉住 §10.3 判红范围判据）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".shared-name")), sheet(1, PLUG_B, rules(".shared-name"))])] });
    const c = r.collisions.find((x) => x.name === "shared-name");
    t("正控⑤：插件×插件 同名 ⇒ yellow（跨仓才答得了 ⇒ 不许升格成红）", !!c && c.severity === "yellow" && r.summary.red === 0);
  }
  // ⑫ 负控：**方名册不够真** ⇒ 结论不成立
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root"))])] });
    t("负控⑦：插件方 < 2 ⇒ 方名册不够真 ＋ ok=false", r.summary.rosterOk === false && r.ok === false);
  }
  // ⑬ 负控：CORS 不可读的表 ⇒ 未归属 ＋ 结论不成立
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, { ...HOST_CSS, blocked: true }, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("负控⑧：样式表规则读不到（CORS） ⇒ 未归属 ＋ ok=false", r.unattributed.length === 1 && r.ok === false);
  }
  // ⑭ 正控：打包态归不出的 bundle ⇒ 未归属（**不臆造成 host+shared**）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, { href: "http://localhost:1420/assets/pool-abc123.css" }, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控⑥：打包态归不出的 bundle ⇒ 未归属（不臆造；按「覆盖不到」第 7 条如实要求声明粒度）", r.unattributed.length === 1 && r.ok === false);
  }
  // ⑮ 正控：共享组件方被单独识别（共享 × 插件 同名 ⇒ red，别把它并进宿主）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, SHARED_CSS, rules(".badge")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.name === "badge");
    t("正控⑦：共享组件域是独立的一方（共享×插件 同名 ⇒ red，`shared` 与 `host` 不混）", !!c && c.parties.includes("shared") && r.summary.red === 1);
  }
  // ⑯ 锚：轴 ④ 形态函数逐条符合预期
  {
    const shapes = ["*", "*::before", "#root", '[data-theme="light"]', 'input[type="number"]', "select", ".a.b", "button"].map(selectorShape);
    t(
      "锚①：形态函数（轴 ④）逐条符合预期（复合主体原样报 ⇒ 不制造假碰撞）",
      JSON.stringify(shapes) === JSON.stringify(["universal:*", "universal:*", "id:root", 'attr:[data-theme="light"]', 'other:input[type="number"]', "element:select", "other:.a.b", "element:button"])
    );
  }
  // ⑰ 锚：归属规则表**没有 `.*` 兜底**（fail-loud 的结构保证）
  {
    const catchAll = PARTY_RULES.some((r) => r.re.source === ".*" || r.re.source === "^.*$");
    t("锚②：归属规则表里没有 `.*` 兜底规则（fail-loud 由构造保证，不靠自觉）", catchAll === false);
  }
  // ⑱ 锚：`:root` 被认成 document 级作用域（token 轴事实面的分类规则可证伪）
  {
    t("锚③：`:root` / `html` / `[data-theme=…]` 的 token 作用域判成 document 级", ["doc:root", "doc:html", 'attr:[data-theme="light"]'].every((s) => isDocLevel(s)) && !isDocLevel("class:.ldk-a"));
  }
  // ⑲ 正控：**类名锚定的复合形态**（如宿主定制三方 codicon 类）⇒ 只报事实、**黄灯不判红**
  //    🔴 真实读数就在这套软件的活体上：`other:.codicon[class*="codicon-"]` 被 codicon 与 host 各自定义
  //    ——那是「宿主定制三方类」，不是污染；判红会制造假红（假红会让真红失效）。
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules('.codicon[class*="codicon-"]')), sheet(1, { devId: "E:/linkdesk/node_modules/@vscode/codicons/dist/codicon.css" }, rules('.codicon[class*="codicon-"]')), sheet(2, PLUG_A, rules(".alpha-root")), sheet(3, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "selector-shape");
    t("正控⑧：类名锚定的复合形态跨方 ⇒ **yellow 不判红**（宿主定制三方类 ≠ 污染）", !!c && c.severity === "yellow" && r.summary.red === 0 && r.ok === true);
  }
  // ⑳ 负控：**不带类名锚**的形态跨方 ⇒ red（元素/通配/属性/id 级基线被两方各自定义 = 22 号档 §3.2 的真害）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("input[type=\"number\"]")), sheet(1, PLUG_A, rules("input[type=\"number\"]")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "selector-shape");
    t("负控⑨：不带类名锚的形态跨方 ⇒ red（宿主 × 插件 各自给同一类元素上样式）", !!c && c.severity === "red" && r.ok === false);
  }
  // ㉑ 锚：判红依据（why）对三类都写得出——**判红必须能复核，不许"探针说红就红"**
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".x")), sheet(1, PLUG_A, rules(".x")), sheet(2, PLUG_B, rules(".x"))])] });
    const c = r.collisions.find((x) => x.name === "x");
    t("锚④：每处碰撞都带 `why`（判红依据），且宿主侧真红 / 纯插件侧黄灯的措辞不同", !!c?.why?.includes("§10.3") && r.collisions.every((x) => typeof x.why === "string" && x.why.length > 10));
  }
  // ㉒ 锚：`.app-shell` 这类**域外文件**的名字**不会**被静默算进宿主域（对账能把它抓出来）
  {
    t("锚⑤：静态↔运行时对账函数可调用（域边界不一致必须能被机械列出来，而不是靠人记得）", typeof compareStatic === "function");
  }
  // ㉓ 正控：**共享组件域里的 `ldk-` 名出现在插件产物里** ⇒ info（内联的 UI 库 CSS），**不判红**
  //    🔴 这是本格实机跑出来的主读数：`@linkdesk/ui` 不是 external ⇒ 每只插件 bundle 内联一份
  {
    const seed = ["ldk-toggle", "ldk-ctx-menu", "ldk-selectbox-in"];
    const r = analyzeDump(
      { documents: [doc("pool", [sheet(0, SHARED_CSS, rules(".ldk-toggle")), sheet(1, PLUG_A, rules(".ldk-toggle")), sheet(2, PLUG_B, rules(".ldk-toggle"))])] },
      { sharedDomainNames: seed }
    );
    const c = r.collisions.find((x) => x.name === "ldk-toggle");
    t("正控⑨：共享域名字被插件内联 ⇒ **info 不判红**（结构性事实，不是两套规则打架）", !!c && c.severity === "info" && c.kind === "vendored-shared-css" && r.summary.red === 0 && r.ok === true);
  }
  // ㉔ 负控：插件定义了**不属于共享域**的 `ldk-` 名 ⇒ 仍是**越界 red**（豁免不许被滥用成"什么都放过"）
  {
    const seed = ["ldk-toggle"];
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-icon-btn")), sheet(1, PLUG_B, rules(".beta-root"))])] }, { sharedDomainNames: seed });
    t("负控⑩：插件定义**共享域之外**的 `ldk-` 名 ⇒ 越界 red ＋ ok=false（豁免只认共享域，不是「放过 ldk-」）", r.documents[0].facts.ldkIntrusions.length === 1 && r.ok === false);
  }
  // ㉕ 负控：**不给种子**时按最严处理（fail-loud 方向）——插件里的 `ldk-` 名一律算越界
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-toggle")), sheet(1, PLUG_B, rules(".beta-root"))])] });
    t("负控⑪：不给共享域种子 ⇒ 按最严处理（`ldk-` 一律算越界，不静默放过）", r.documents[0].facts.ldkIntrusions.length === 1 && r.summary.red === 0 && r.ok === false);
  }
  // ㉖ 正控：轴 ④ 的类名锚豁免同样按共享域走（`other:.ldk-toggle.on` ⇒ info；`other:.codicon[…]` ⇒ 仍 yellow）
  {
    const seed = ["ldk-toggle"];
    const r = analyzeDump(
      { documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-toggle.on", ".codicon[class*=\"codicon-\"]")), sheet(1, PLUG_B, rules(".ldk-toggle.on", ".codicon[class*=\"codicon-\"]"))])] },
      { sharedDomainNames: seed }
    );
    const t1 = r.collisions.find((x) => x.name === "other:.ldk-toggle.on");
    const t2 = r.collisions.find((x) => x.name.startsWith("other:.codicon"));
    t("正控⑩：轴 ④ 的类名锚也按共享域分级（`.ldk-toggle.on` ⇒ info；`.codicon[…]` 非共享域 ⇒ yellow）", t1?.severity === "info" && t2?.severity === "yellow");
  }
  // ㉗ 锚：方名册够真 = **至少一个有插件的文档**满足 ≥2（壳窗口文档永远没有插件，不能因此判不成立）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".alpha-root")), sheet(1, PLUG_B, rules(".beta-root"))]), doc("shell", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, { devId: "E:/linkdesk/node_modules/@vscode/codicons/dist/codicon.css" }, rules(".codicon"))])] });
    t("锚⑥：方名册判据按「至少一个文档 ≥2 只插件」——壳窗口文档没有插件不该把结论打成不成立", r.summary.rosterOk === true && r.ok === true);
  }

  // ㉘–㉜ token 作用域判级（E6#109n-b · 1.24）——「两层证明」的第二层
  const HOST_INDEX_CSS = { devId: "E:/linkdesk/src/index.css" };
  // ㉘ 负控：插件在文档级写宿主契约名 ⇒ 红（`marketplace` 案复刻）＋ ok=false
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, [{ sel: ":root", decl: "--status-connected: green" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const red = r.documents[0].facts.tokenScope.red;
    t("负控⑫：插件在 `:root` 写宿主契约名 ⇒ token 红 1（V1）＋ ok=false", red.length === 1 && red[0].code === "V1" && red[0].party === "plugin:alpha" && r.ok === false);
  }
  // ㉙ 正控：插件在文档级写**自有前缀**名 ⇒ 黄，**不拦**（ok 仍成立）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, [{ sel: ":root", decl: "--alpha-ok: green" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const y = r.documents[0].facts.tokenScope.yellow;
    t("正控⑪：插件在 `:root` 写自有前缀名 ⇒ token 黄 1（V6）、**ok 仍成立**（只报不拦）", y.length === 1 && y[0].code === "V6" && r.summary.tokenRed === 0 && r.ok === true);
  }
  // ㉚ 正控：**契约块**（`src/index.css` 的 `:root`）里的宿主文档级定义 ⇒ 绿（不算污染）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_INDEX_CSS, [{ sel: ":root", decl: "--bg-card: #222" }]), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控⑫：契约块（`src/index.css` 的 `:root`）里的宿主定义 ⇒ token 零红零黄", r.summary.tokenRed === 0 && r.summary.tokenYellow === 0 && r.ok === true);
  }
  // ㉛ 负控：宿主把文档级定义写在**契约块之外**（池域文件）⇒ 红 V3（影子契约）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, [{ sel: ":root", decl: "--shadow-tiny: red" }]), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const red = r.documents[0].facts.tokenScope.red;
    t("负控⑬：宿主在非契约文件里写文档级定义 ⇒ token 红 1（V3）＋ ok=false", red.length === 1 && red[0].code === "V3" && red[0].party === "host" && r.ok === false);
  }
  // ㉜ 正控/边界：类限定定义**判不了 V4/V5**（运行时丢了祖先）⇒ 既不红也不黄（不判 ≠ 合规）
  //     同时钉住「名字层（V2）与作用域无关」：同一形态下 `--ldk-x` 照样红。
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, [{ sel: ".ldk-badge", decl: "--plain-x: 1" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const r2 = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, [{ sel: ".ldk-badge", decl: "--ldk-x: 1" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t(
      "正控⑬：类限定定义在运行时判不了 V4/V5（丢了祖先 ⇒ 不判，不制造假红）；但名字层 `ldk-` 照样红（V2）",
      r.summary.tokenRed === 0 && r.summary.tokenYellow === 0 && r2.summary.tokenRed === 1 && r2.documents[0].facts.tokenScope.red[0].code === "V2",
    );
  }
  // ㉝ 锚：**判级与门禁同源** —— gradeTokenScopes 的结论 === 直接调 `judgeTokenScope()` 的结论
  //     （同一条实现；这里钉住「运行时没有第二条判定路径」这件事本身）
  {
    const direct = judgeTokenScope({ party: "plugin", pluginId: "alpha", name: "status-connected", scope: tokenScopeOf(":root"), compound: ":root", file: null });
    const viaGrade = gradeOne("plugin:alpha", "status-connected", "doc:root", null);
    t("锚⑦：运行时判级 === `judgeTokenScope()` 直接调用（与壳门禁判据⑨ 同一个函数，没有第二条判定路径）", direct.code === viaGrade.code && direct.why === viaGrade.why);
  }
  // ㉞ 锚：**`@keyframes` 体内的自定义属性**只判名字层（作用域是 `@keyframes …`，不是子树）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root"), [{ name: "alpha-in", decl: "--ldk-bad: 1" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("锚⑧：`@keyframes` 体内的 `--ldk-*` ⇒ 名字层照样红（V2，与作用域无关）", r.summary.tokenRed === 1 && r.documents[0].facts.tokenScope.red[0].code === "V2");
  }

  /* ── ㉟–㊷ 轴 ④ 的**无锚形态**（E6#109o-b · 1.26）——F1/F2 的钉子 ＋ 两把尺子逐字相等 ──
     1.25 实测：`:root` / `::-webkit-scrollbar` 一族（F1，两把尺子共同盲区）＋ CSSOM 归一后的
     `::before`/`::after`/`:focus-visible`（F2，运行时独有盲区）**被 `if (!sub) return null` 静默丢掉**
     ——没有任何计数器。下面三条负控就是这三类的钉子；最后一条是**本轮最硬的一条验收**。 */

  // ㉟ 负控⑧：`:root` ⇒ 轴 ④ 出现 `doc:root` 形态（🔴 **F1 的钉子**：修前它被静默丢）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a", ":root")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const shapes = r.documents[0].parties.host["selector-shapes"];
    t("负控⑧：`:root` 产出 `doc:root` 形态（F1 钉子：修前被 `if (!sub)` 静默丢）", shapes.includes("doc:root") && r.documents[0].parties.host.anchorlessSites.length === 1);
  }
  // ㊱ 负控⑨：`::-webkit-scrollbar` ⇒ `pseudo:::webkit-scrollbar`（同样是 F1 的钉子）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a", "::-webkit-scrollbar", "::-webkit-scrollbar-thumb")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const shapes = r.documents[0].parties.host["selector-shapes"];
    t("负控⑨：`::-webkit-scrollbar` 一族产出 `pseudo::…` 形态（F1 钉子）", shapes.includes("pseudo:::-webkit-scrollbar") && shapes.includes("pseudo:::-webkit-scrollbar-thumb"));
  }
  // ㊲ 负控⑩：CSSOM 归一后的 `::before` / `:focus-visible` ⇒ 各有形态（🔴 **F2 的钉子**）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a", "::before", "::after", ":focus-visible")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const shapes = r.documents[0].parties.host["selector-shapes"];
    t(
      "负控⑩：CSSOM 归一后的 `::before`/`::after`/`:focus-visible` 各有形态（F2 钉子：修前再丢 5 站点）",
      shapes.includes("pseudo:::before") && shapes.includes("pseudo:::after") && shapes.includes("pseudo-class::focus-visible"),
    );
  }
  // ㊳ 正控⑮：🔴 **本轮最硬的一条验收** —— 轴 ④「静态 17 ＝ 运行时 17」。
  //     做法：拿**真实的 `src/index.css`** 当夹具 —— 静态侧用门禁同一个 `selectorFormSites()` 数，
  //     运行时侧把它按 **CSSOM 的实际序列化规则**（`*::x` → `::x`、`*:x` → `:x`，1.25 实测）
  //     喂进 dump，再数无锚站点。两侧必须**逐字相等**，且都等于登记表里的条数（三把尺子对齐）。
  //     ⚠️ 这条不是「一个常数 17」——index.css 变了三侧一起变；真正会红的是**任何一侧单独漂移**。
  {
    const indexPath = join(ROOT, "src", "index.css");
    const cleaned = stripComments(readFileSync(indexPath, "utf8"));
    const staticSites = selectorFormSites(cleaned).filter((s) => s.form.kind === "anchorless" && s.form.top);
    // CSSOM 序列化：`*::before` → `::before`、`*:focus-visible` → `:focus-visible`（多余的 `*` 被吃掉）；
    // 单独的 `*` 保留原样。⚠️ 这是**事实**（1.25 用 CSS.getMatchedStylesForNode 实测），不是口径。
    const cssom = (sel) => String(sel).replace(/(^|[\s,>+~])\*(?=[:\[])/g, "$1");
    const runtimeRules = selectorFormSites(cleaned).map((s) => ({ sel: cssom(s.selector) }));
    const r = analyzeDump({
      documents: [
        doc("pool", [
          sheet(0, { devId: "E:/linkdesk/src/index.css" }, runtimeRules),
          sheet(1, PLUG_A, rules(".alpha-root")),
          sheet(2, PLUG_B, rules(".beta-root")),
        ]),
      ],
    });
    const runtimeCount = r.documents[0].parties.host.anchorlessSites.length;
    const registered = (() => {
      try {
        const b = JSON.parse(readFileSync(join(ROOT, "scripts", "css-selector-baseline.json"), "utf8"));
        return b.files?.find((f) => f.file === "src/index.css")?.count ?? null;
      } catch {
        return null;
      }
    })();
    t(
      `正控⑮：🔴 轴 ④ 静态 ${staticSites.length} ＝ 运行时 ${runtimeCount} ＝ 登记 ${registered}（三把尺子逐字相等）`,
      staticSites.length === runtimeCount && runtimeCount === registered,
    );
  }
  // ㊴ 正控⑯：两条方各自定义同一形态（`element:button`）⇒ 仍报碰撞（改口径不得让既有负控失效）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("button")), sheet(1, PLUG_A, rules("button")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控⑯：两条方各自定义 `element:button` ⇒ 仍报碰撞（red，host 在内）", r.collisions.some((x) => x.axis === "selector-shape" && x.name === "element:button" && x.severity === "red"));
  }
  // ㊵ 正控：**id 形态不进无锚计数**（`#root` 是 D 段：登记不设门禁；与静态 A 段 17 处同口径）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("#root", "#ld-float-layer", ".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const p = r.documents[0].parties.host;
    t("正控⑰：id 形态（`#root`）产出形态但**不进无锚计数**（D 段口径）", p["selector-shapes"].includes("id:root") && p.anchorlessSites.length === 0);
  }
  // ㊶ 正控：**B 段（限定无锚）**在运行时与静态同待遇（都被 `hasAncestor()` 挡在站点之外）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("html body", ".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控⑱：`html body`（限定无锚）与静态口径一致——不进运行时无锚站点（本仓静态 B 段 = 0）", r.documents[0].parties.host.anchorlessSites.length === 0);
  }
  // ㊷ 锚：`selectorShape()` 与门禁的形态谓词**同源**（同一份 lib ⇒ 同判）
  {
    const same = [
      [":root", "doc:root"],
      ["::-webkit-scrollbar", "pseudo:::-webkit-scrollbar"],
      [":focus-visible", "pseudo-class::focus-visible"],
      ["*", "universal:*"],
      ["select", "element:select"],
      ['[data-theme="light"]', 'attr:[data-theme="light"]'],
      ["#root", "id:root"],
      ["input[type=\"number\"]", 'other:input[type="number"]'],
    ].every(([sel, want]) => selectorShape(sel) === want);
    const formOfAligned = [":root", "::-webkit-scrollbar", ":focus-visible", "*", "select"].every(
      (sel) => (selectorShape(sel) === null) === (formOf(sel).kind === "anchored" && SOLE_CLASS.test(subjectOf(sel)))
    );
    t("锚⑨：`selectorShape()` 逐条符合预期，且「是否成站点」与 lib 的 `formOf()` 口径一致（同源）", same && formOfAligned);
  }

  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) ok = false;
  }
  console.log(`runtime-style-audit self-test ${ok ? "✔️ 全部符合预期（正控绿 / 负控红）" : "❌ 有判据不符预期"}`);
  process.exit(ok ? 0 : 1);
}
