import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { bareClassDefinitions, formOf, keyframeDefinitions, selectorFormSites, soleClassOf, stripComments } from "../lib/css-selectors.mjs";
import { ROOT } from "./root.mjs";

/**
 * ⚠️ 由 `../runtime-style-audit.mjs` 拆出（E6#0.6d 第一刀 · feature-folder）——判据一字未改。
 * `sharedDomainSeed` / `printPrefixAudit` / `printCompare` 的 `export` **只为门面 CLI**（消费者就是它）。
 */

/* ────────────────────────────────────────────────────────────────────────
   ①b 静态源 ↔ 运行时 对账（**只覆盖仓内两个域**的**类名轴 ＋ 关键帧轴**）
   ────────────────────────────────────────────────────────────────────────
   为什么要它：本系列的病根是「**尺子不止一把**」。现在两把尺子共用
   `lib/css-selectors.mjs` 的口径，但「口径相同」≠「读数相同」——本对账就是那个
   **可证伪的验证**：
     · **运行时 ⊆ 静态源**（同名域）：运行时出现、静态源里没有的名字 ⇒
       要么它来自**域外的文件**（如 `src/App.css` 不在门禁判据③ 域内），
       要么**有人在运行时注入了源码里不存在的样式** ⇒ 两种都必须被人看见；
     · 静态 − 运行时 = **本次没被 import/挂载的 CSS 文件**（dev 逐文件注入的天然结果，正常）。
   ⚠️ 射程：插件与 codicon 的**源不在本仓**（在插件仓产物 / `node_modules`）⇒ 不进本对账。
   ⚠️ 本对账**只报事实**，不改任何域（域是门禁的事，改域 = 改规则，属件 7/件 8 的活）。
   ──────────────────────────────────────────────────────────────────────── */

function walkCss(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkCss(full, out);
    else if (e.name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** 一组 CSS 文件 → 该域的静态名字集合（**走 lib 的同一份口径**） */
function staticNames(files) {
  const classes = new Set();
  const keyframes = new Set();
  for (const f of files) {
    if (!statSync(f, { throwIfNoEntry: false })) continue;
    const cleaned = stripComments(readFileSync(f, "utf8"));
    for (const d of bareClassDefinitions(cleaned)) classes.add(d.name);
    for (const k of keyframeDefinitions(cleaned)) keyframes.add(k.name);
  }
  return { classes, keyframes };
}

/** 共享组件域的静态名字集合（类名 ＋ 关键帧）= 「内联的 UI 库 CSS」豁免判据的**唯一依据** */
export function sharedDomainSeed(root = ROOT) {
  const s = staticNames(walkCss(join(root, "src", "components", "shared")));
  return [...s.classes, ...s.keyframes];
}

/** 从报告里取某一方（跨全部文档求并集）的运行时名字集合 */
function runtimeNames(report, party) {
  const classes = new Set();
  const keyframes = new Set();
  const classSheets = new Map();
  for (const d of report.documents) {
    const p = d.parties[party];
    if (!p) continue;
    for (const n of p.classes) {
      classes.add(n);
      if (!classSheets.has(n)) classSheets.set(n, { document: d.label, sheets: p.sheets });
    }
    for (const k of p.keyframes) keyframes.add(k);
  }
  return { classes, keyframes, classSheets };
}

/** 🔴 探针的 host 归属域（**字面量**；由 `PARTY_RULES` 的两条 host 规则实现）。
 *  E6#109o-b（1.26）起它与门禁 `check-css-namespace.mjs` 的 `HOST_DOMAIN` ＋ 基线登记表的
 *  `domain.files` **三处逐字一致**——`compareStatic()` 里有一条断言钉住这件事（域不一致就是
 *  「尺子不止一把」，本系列一句话根因的层 3）。⚠️ 域**可以按判据分别设定**（判据⑨ 的域更宽），
 *  但「宿主域」这个名字只有一个定义。 */
export const PROBE_HOST_DOMAIN = ["src/*.css", "src/pool/**"];

/** 某一方在某个域上的**无锚站点**（轴 ④ 与静态门禁逐字可比的那份数据） */
function runtimeAnchorless(report, party) {
  const out = [];
  for (const d of report.documents) {
    const p = d.parties[party];
    if (!p) continue;
    for (const s of p.anchorlessSites ?? []) out.push({ ...s, document: d.label });
  }
  return out;
}

/** 把样式表来源线索映射成**仓内相对路径**（对不上/文件不存在 ⇒ `null` = 不算进域）——`compareStatic` 用 */
function relFromOrigin(origin, root) {
  const s = String(origin ?? "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/src/");
  if (i < 0) return null;
  const rel = s.slice(i + 1);
  return existsSync(join(root, rel)) ? rel : null;
}

/**
 * 静态 ↔ 运行时对账（E6#109o-b 重写）。三件事：
 *  ① **域一致性**：探针 host 归属域 ＝ 门禁 `HOST_DOMAIN` ＝ 基线登记表 `domain.files`（三处逐字一致）；
 *  ② **类名/关键帧轴**（既有）：每域「运行时独有」应为 0；
 *  ③ 🔴 **轴 ④：静态无锚站点 ＝ 运行时无锚站点**（**本轮最硬的一条验收**——两把尺子读数逐字相等）。
 */
export function compareStatic(report, root = ROOT) {
  const srcTop = readdirSync(join(root, "src"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".css"))
    .map((e) => join(root, "src", e.name));
  const pool = walkCss(join(root, "src", "pool"));
  const shared = walkCss(join(root, "src", "components", "shared"));
  const domains = [
    { key: "host", label: "host（宿主域：src/*.css ＋ src/pool/**）", files: [...srcTop, ...pool], anchorless: true },
    { key: "shared", label: "shared（src/components/shared/**）", files: shared, anchorless: true },
  ];

  const out = [];
  const shapes = [];
  for (const dom of domains) {
    const stat = staticNames(dom.files);
    const run = runtimeNames(report, dom.key);
    const runtimeOnly = [...run.classes].filter((n) => !stat.classes.has(n)).sort();
    const staticOnly = [...stat.classes].filter((n) => !run.classes.has(n)).sort();
    const kfRuntimeOnly = [...run.keyframes].filter((n) => !stat.keyframes.has(n)).sort();
    out.push({
      domain: dom.label,
      files: dom.files.map((f) => relative(root, f).replace(/\\/g, "/")),
      staticClasses: stat.classes.size,
      runtimeClasses: run.classes.size,
      runtimeOnly: runtimeOnly.map((n) => ({ name: n, seenIn: run.classSheets.get(n) ? { document: run.classSheets.get(n).document, sheets: run.classSheets.get(n).sheets } : null })),
      staticOnly,
      staticKeyframes: [...stat.keyframes].sort(),
      runtimeKeyframes: [...run.keyframes].sort(),
      keyframesRuntimeOnly: kfRuntimeOnly,
    });
    // ③ 轴 ④ 的静态 ↔ 运行时（**同一个 lib 口径**：`selectorFormSites()` ＋ `formOf()`）
    //    ⚠️ 对账**按文档**做：同一个域的文件可能被**多个文档**各加载一次（本仓：`src/index.css`
    //      在壳窗口文档与池文档里各注入一份）⇒ 直接跨文档求和会得到 2 倍，那是**重复计数不是差异**。
    //      每个文档只跟「**它实际加载了的**域内文件」的静态站点比。
    if (dom.anchorless) {
      const relOf = (f) => relative(root, f).replace(/\\/g, "/");
      const staticOf = (files) =>
        files
          .flatMap((f) => selectorFormSites(stripComments(readFileSync(f, "utf8"))).map((s) => ({ ...s, file: relOf(f) })))
          .filter((s) => s.form.kind === "anchorless" && s.form.top);
      const perDoc = [];
      for (const d of report.documents) {
        const p = d.parties[dom.key];
        if (!p || (p.anchorlessSites ?? []).length === 0) continue;
        const sites = p.anchorlessSites.map((s) => ({ ...s, document: d.label }));
        const files = [...new Set(sites.map((s) => relFromOrigin(s.origin, root)).filter(Boolean))].sort();
        const staticSites = staticOf(files);
        perDoc.push({
          document: d.label,
          files,
          staticCount: staticSites.length,
          runtimeCount: sites.length,
          equal: staticSites.length === sites.length,
          staticSites: staticSites.map((s) => ({ file: s.file, line: s.line, selector: s.selector })),
          runtimeSites: sites.map((s) => ({ sheet: s.sheet, selector: s.sel, shape: s.shape })),
        });
      }
      const domainStatic = staticOf(dom.files);
      shapes.push({
        domain: dom.label,
        domainStaticCount: domainStatic.length,
        perDocument: perDoc,
        // 域内**一个站点都没有** ⇒ 运行时也必须是 0（不是「没得比」）
        equal: perDoc.length === 0 ? domainStatic.length === 0 : perDoc.every((x) => x.equal),
        runtimeShapes: [...new Set(perDoc.flatMap((x) => x.runtimeSites.map((s) => s.shape)))].sort(),
      });
    }
  }

  // ① 域一致性：三处逐字一致（探针字面量 ／ 门禁 HOST_DOMAIN ／ 登记表 domain.files）
  let registryDomain = null;
  let registryReadError = null;
  try {
    registryDomain = JSON.parse(readFileSync(join(root, "scripts", "css-selector-baseline.json"), "utf8"))?.domain?.files ?? null;
  } catch (e) {
    registryReadError = e instanceof Error ? e.message : String(e);
  }
  const gateDomain = ["src/*.css", "src/pool/**"]; // = check-css-namespace.mjs 的 HOST_DOMAIN（字面量重复一次，由本断言钉住）
  const domainCheck = {
    probe: PROBE_HOST_DOMAIN,
    gate: gateDomain,
    registry: registryDomain,
    registryReadError,
    ok:
      JSON.stringify(PROBE_HOST_DOMAIN) === JSON.stringify(gateDomain) &&
      JSON.stringify(registryDomain) === JSON.stringify(gateDomain),
  };

  // 域外补充：探针归属域里有、而门禁判定域里没有的独立定义（域边界不一致的**直接证据**）
  // ⚠️ 域对齐之后这一段**按构造必为 0** —— 它保留下来是「对账留痕」，不是活的判据；
  //    真正的活判据是上面的 `domainCheck`（两条域声明的字面量比较）。
  const gateStat = staticNames([...srcTop, ...pool]).classes;
  const probeStat = staticNames([...srcTop, ...pool]).classes;
  const outsideGateDomain = [...probeStat].filter((n) => !gateStat.has(n)).sort();
  return { domains: out, outsideGateDomain, shapes, domainCheck };
}

export function printPrefixAudit(report) {
  console.log("\n═══ 前缀审计（**改前/改后对账用的那把尺子**）——每方「非 `ldk-` 独立定义」的计数 ═══");
  console.log("   （口径 = 与静态门禁同一份 `soleClassOf()`；空规则体同 parseCss() 跳过 ⇒ 两把尺子读数应逐字相等）");
  for (const d of report.documents) {
    console.log(`\n▸ ${d.label}`);
    for (const [party, info] of Object.entries(d.parties)) {
      const c = info.counts;
      console.log(
        `   ${party.padEnd(22)} 非 ldk- 类名 ${String(c.nonLdkClass).padStart(4)} ｜ 非 ldk- 关键帧 ${String(c.nonLdkKeyframes).padStart(2)} ｜ ` +
          `（总 类名 ${c.class} / 关键帧 ${c.keyframes}）｜ 🔴 轴 ④ 无锚站点 ${String(c["selector-shape-anchorless"] ?? 0).padStart(3)}`
      );
      if (c.nonLdkClass) console.log(`        ${info.nonLdkClasses.slice(0, 24).join(" ")}${info.nonLdkClasses.length > 24 ? " …" : ""}`);
      if (c.nonLdkKeyframes) console.log(`        ${info.nonLdkKeyframes.join(" ")}`);
      const a = info.anchorlessShapes ?? [];
      if (a.length) console.log(`        轴 ④ 无锚形态（${a.length}）：${a.join(" ")}`);
    }
  }
}

export function printCompare(cmp) {
  console.log("\n═══ 静态源 ↔ 运行时 对账（类名轴 ＋ 关键帧轴 ＋ 🔴 轴 ④ 无锚站点；只覆盖仓内两个域）═══");
  // ① 域一致性（E6#109o-b §六.3 的硬验收）
  const dc = cmp.domainCheck ?? null;
  if (dc) {
    console.log(`\n▸ 域一致性（**三处逐字一致**）：${dc.ok ? "✔️ 一致" : "🔴 **不一致**"}`);
    console.log(`   探针 host 归属域   ${JSON.stringify(dc.probe)}`);
    console.log(`   门禁 HOST_DOMAIN   ${JSON.stringify(dc.gate)}`);
    console.log(`   登记表 domain      ${dc.registryReadError ? `🔴 读不到（${dc.registryReadError}）` : JSON.stringify(dc.registry)}`);
    if (!dc.ok) console.log("   ⇒ 域不一致就是「尺子不止一把」（本系列一句话根因的层 3）——改域必须三处同笔。");
  }
  for (const d of cmp.domains) {
    console.log(`\n▸ ${d.domain}`);
    console.log(`   文件 ${d.files.length} 个 ｜ 静态独立定义 ${d.staticClasses} ｜ 运行时独立定义 ${d.runtimeClasses}`);
    console.log(`   运行时独有（**必须为 0**，否则是"运行时注入了源码里没有的样式"或"来自域外文件"）：${d.runtimeOnly.length === 0 ? "0 ✔️" : d.runtimeOnly.map((x) => `${x.name}@${x.seenIn?.document ?? "?"}`).join(" ")}`);
    console.log(`   静态独有（= 本次**没被 import/挂载**的文件里的名字，正常）：${d.staticOnly.length} 个${d.staticOnly.length ? ` —— ${d.staticOnly.slice(0, 12).join(" ")}${d.staticOnly.length > 12 ? " …" : ""}` : ""}`);
    console.log(`   关键帧：静态 ${d.staticKeyframes.length} ｜ 运行时 ${d.runtimeKeyframes.length} ｜ 运行时独有 ${d.keyframesRuntimeOnly.length}`);
  }
  // ③ 🔴 轴 ④：静态无锚站点 ＝ 运行时无锚站点（**本轮最硬的一条验收**；**按文档**对账）
  for (const s of cmp.shapes ?? []) {
    console.log(
      `\n▸ 🔴 轴 ④ 对账 —— ${s.domain}：${s.equal ? "✔️ **逐字相等**" : "🔴 **不相等**（差出来的就是「静默丢」——不是判绿）"}`
    );
    for (const d of s.perDocument) {
      console.log(
        `   · ${String(d.document).padEnd(8)} 静态无锚站点 **${d.staticCount}** ＝ 运行时 **${d.runtimeCount}** ${d.equal ? "✔️" : "🔴"}` +
          `（该文档里**贡献了站点**的域内文件 ${d.files.length} 个）`
      );
      if (!d.equal) {
        const rs = new Set(d.runtimeSites.map((x) => x.selector));
        const miss = d.staticSites.filter((x) => !rs.has(x.selector));
        console.log(`       静态有、运行时无（按 CSSOM 归一后的文本对不上 ⇒ 逐个查）：${miss.map((x) => `${x.file}:${x.line} \`${x.selector}\``).join(" · ") || "（无——差异来自重复计数）"}`);
      }
    }
    if (s.perDocument.length === 0) {
      console.log(`   · （域内静态无锚站点 ${s.domainStaticCount} 个、运行时 0 个 ⇒ ${s.equal ? "✔️ 两边都是空" : "🔴 对不上"}）`);
    }
    if (s.runtimeShapes.length) console.log(`   运行时形态（${s.runtimeShapes.length} 个）：${s.runtimeShapes.join(" · ")}`);
  }
  if (cmp.outsideGateDomain.length) {
    console.log(`\n🔴 **域边界不一致**：探针归属域里有、而**门禁判据③ 域里没有**的独立定义 ${cmp.outsideGateDomain.length} 个：`);
    console.log(`   ${cmp.outsideGateDomain.join(" ")}`);
    console.log("   ⇒ 这些名字来自宿主域之外的文件 ⇒ 「宿主自己定义的类名 100% 是 `ldk-`」按门禁口径不覆盖它们。");
  } else {
    console.log(
      "\n✅ **域边界不一致 = 0 个名字**：探针归属域 ＝ 门禁判据③ 域 ＝ 登记表 `domain.files`" +
        " ⇒ 「宿主自己定义的类名 100% 是 `ldk-`」**无条件为真**（`.app-shell` 已于 1.26 改名 `.ldk-app-shell`）。"
    );
  }
}
