import { join } from "node:path";
import { SOLE_CLASS, compoundsOf, formOf, hasAncestor, judgeTokenScope, selectorFormSites, soleClassOf, splitSelector, subjectOf, tokenScopeOf } from "../lib/css-selectors.mjs";

/**
 * ⚠️ 本模块由 `../runtime-style-audit.mjs` 拆出（E6#0.6d 第一刀 · feature-folder）——判据一字未改。
 * `isDocLevel` / `gradeOne` 的 `export` **只为自测模块**（`selftest.mjs` 逐条真跑它们）——无外部消费者。
 * 文件头那份「探针覆盖不到什么」的完整说明仍在门面 `../runtime-style-audit.mjs`。
 */

/* ════════════════════════════════════════════════════════════════════════
   ① 纯分析层——吃 dump JSON，出碰撞报告（可自测、可离线、进 check）
   ════════════════════════════════════════════════════════════════════════ */

export const AXES = ["class", "keyframes", "token", "selector-shape"];

/** 把一只插件记成一方 */
export const partyOf = (id) => `plugin:${id}`;

/**
 * 🔴 归属规则表（**声明式**：一条规则 = 一条正则 ＋ 一句「凭什么」）。
 * 顺序有意义：**先具体后一般**（`shared` / `codicon` / `index.css` 先于 `src/pool/`；插件目录先于 node_modules）。
 * 设计纪律：**归不出来一律报「未归属」**——表里**不许**出现 `.*` 兜底分支
 * （静默兜底 = 又一个错的启发式，正是本系列的病根；自测里有一条锚钉住这件事）。
 */
export const PARTY_RULES = [
  { re: /^linkdesk:\/\/([^/]+)\//i, party: (m) => partyOf(m[1]), why: "`linkdesk://<pluginId>/…` 协议 = 该插件（生产态插件视图产物）" },
  { re: /\/src\/components\/shared\//, party: () => "shared", why: "共享组件域 = `src/components/shared/**`（`@linkdesk/ui` 的单一真源）" },
  { re: /\/@vscode\/codicons\//, party: () => "codicon", why: "三方 codicon（本仓只消费它、从不独立定义）" },
  { re: /\/src\/[^/]+\.css$/, party: () => "host", why: "宿主入口层样式 = `src/*.css`（`src/index.css` 池入口 ＋ `src/App.css` 壳窗口入口）" },
  { re: /\/src\/pool\//, party: () => "host", why: "宿主池域 = `src/pool/**`" },
  { re: /[\\/]linkdesk-plugins[\\/](?:official|third-party)[\\/]([^\\/]+)[\\/]/, party: (m) => partyOf(m[1]), why: "本地插件容器 `linkdesk-plugins/{official,third-party}/<id>/`" },
  { re: /[\\/]plugins[\\/]([^\\/]+)[\\/]/, party: (m) => partyOf(m[1]), why: "`plugins/<id>/`——含壳内夹具与用户的 `userData/plugins/<id>/`" },
];

/** 归属一张样式表：→ `{ party, why, clue }`；`party = null` = **未归属**（结论不成立） */
export function attributeSheet(origin) {
  const clues = [];
  if (origin?.href) clues.push({ text: origin.href, from: "href" });
  if (origin?.devId) clues.push({ text: String(origin.devId).replace(/\\/g, "/"), from: "data-vite-dev-id" });
  if (origin?.tag === "LINK" && !origin?.href) clues.push({ text: "<link> 但无 href（运行时改写的样式表？）", from: "tag" });
  if (clues.length === 0) {
    return { party: null, why: "无 href、无 `data-vite-dev-id`（运行时注入的 `<style>`？）——**不许静默当宿主**", clue: null };
  }
  for (const clue of clues) {
    for (const rule of PARTY_RULES) {
      if (!rule.re.test(clue.text)) continue;
      const m = rule.re.exec(clue.text);
      return { party: rule.party(m), why: rule.why, clue: `${clue.from}: ${clue.text}` };
    }
  }
  return { party: null, why: "没有任何一条归属规则命中——**不许静默当宿主**（是新的加载形态？把它加进 PARTY_RULES 并写明理由）", clue: clues.map((c) => `${c.from}: ${c.text}`).join(" ｜ ") };
}

/** 轴 ④：顶层「非类名」选择器的**形态**（单类名主体 = 轴 ① 的地盘 ⇒ 这里回 `null`）。
 *  形态的取法（**有意偏保守**：宁可多报一种形态，也不把两种不同的东西并成一种）：
 *    · 纯形态给名字：`universal:*` · `id:root` · `attr:[data-theme="light"]` · `element:select`
 *    · **无锚形态**（E6#109o-b 新增，32 号档 §三.1）：`doc:root` · `pseudo:<原文>`（纯伪元素，
 *      `::-webkit-scrollbar` / `::before`）· `pseudo-class:<原文>`（伪类独体，`:focus-visible`）
 *    · **带限定符/复合的主体一律原样报**：`input[type="number"]` / `.a.b` / `div.x` ⇒ `other:<主体原文>`
 *      —— 因为「`input` 的样式」与「`input[type=number]` 的样式」是**两件不同的事**，
 *      并成一个 `element:input` 会制造假碰撞（假红会让真红失效，22 号档 §10.3）。
 *  ⚠️ CSSOM 会归一引号与空白 ⇒ 同一形态的不同写法在运行时是同一个字符串（不会漏报）。
 *
 *  🔴 **1.25 实测的 F1/F2 就修在下面那个 `if (!sub)` 分支里**：
 *    CSSOM 的 `selectorText` 会把 `*::before` 序列化成 `::before`、`*:focus-visible` 序列化成
 *    `:focus-visible`（多余的 `*` 被吃掉，F2）；而 `:root` / `::-webkit-scrollbar` 一族本来就
 *    「剥掉伪类/伪元素后没有主体」（F1）。旧代码 `if (!sub) return null` 把**这两种**都**静默丢掉**
 *    ——没有任何计数器。⇒ 现在它们都是**有意的形态站点**：`pseudo:` / `pseudo-class:` / `doc:root`。 */
export function selectorShape(compound) {
  const sub = subjectOf(compound);
  if (!sub) {
    // 无主体 ≠ 无形态：`subjectOf()` 连**伪类**一起剥 ⇒ 纯伪类/纯伪元素主体在这里回空串。
    // 用 `formOf()` 的口径（只剥伪元素）判它到底是哪一类。
    const raw = String(compound).trim();
    const cs = compoundsOf(compound);
    // 含伪元素（`::`）⇒ `pseudo:<原文>`：`::-webkit-scrollbar` · `::before` · `::-webkit-scrollbar-thumb:hover`
    if (/::/.test(raw)) return `pseudo:${raw}`;
    if (cs.length === 0) return `pseudo:${raw}`;
    if (/^:root$/i.test(cs[0])) return "doc:root";
    if (/^:/.test(cs[0])) return `pseudo-class:${raw}`; // :focus-visible / :hover（伪类独体）
    return `other:${raw.replace(/\s+/g, "")}`; // 兜底：不静默丢
  }
  if (SOLE_CLASS.test(sub)) return null;
  if (sub === "*") return "universal:*";
  let m;
  if ((m = /^#(-?[_a-zA-Z][\w-]*)$/.exec(sub))) return `id:${m[1]}`;
  if (/^\[[^\]]+\]$/.test(sub)) return `attr:${sub}`;
  if (/^-?[_a-zA-Z][\w-]*$/.test(sub)) return `element:${sub.toLowerCase()}`;
  return `other:${sub.replace(/\s+/g, "")}`;
}

/** token 轴的**作用域**描述符（⚠️ 与轴 ①/④ 的口径不同域：token 挂在什么选择器之下，
 *  所以要能表达 `:root` / `html` / `[data-theme]` / 选择器列表这些轴 ①④ 不认的形态）。 */
export function scopeShape(compound) {
  const raw = compound.trim();
  if (!raw) return "(空)";
  if (/^:root$/i.test(raw)) return "doc:root";
  if (/^html$/i.test(raw)) return "doc:html";
  if (/^body$/i.test(raw)) return "doc:body";
  if (raw === "*") return "doc:universal";
  const sub = subjectOf(raw); // 去伪类/伪元素
  if (SOLE_CLASS.test(sub)) return `class:${sub}`;
  let m;
  if ((m = /^#(-?[_a-zA-Z][\w-]*)$/.exec(sub))) return `id:${m[1]}`;
  if ((m = /^\[([^\]]+)\]$/.exec(sub))) return `attr:[${m[1]}]`;
  if (/^-?[_a-zA-Z][\w-]*$/.test(sub)) return `element:${sub.toLowerCase()}`;
  return `other:${raw.replace(/\s+/g, "")}`;
}

/** 一条规则的选择器 → 作用域（单 compound 直接给形态；列表给 `list:` 聚合） */
function scopeOf(selectorText) {
  const compounds = splitSelector(selectorText);
  if (compounds.length === 1) return scopeShape(compounds[0]);
  return `list:${compounds.map((c) => scopeShape(c)).join(" | ")}`;
}

/** 🔴 「document 级」的**字面判据**（事实面的分类规则，写出来让 1.23 能复核——不是裁决）：
 *  ① 作用域是 `doc:*`（`:root` / `html` / `body` / `*`）；
 *  ② 或作用域里有 `attr:[data-…]`（本仓 `data-theme` 挂在 `<html>` 上）。
 *  ⚠️ 选择器列表里**任一项**命中即算 document 级（那正是一条规则同时写 `:root, .x` 的形态）。 */
export const DOC_LEVEL_CRITERION = "作用域含 doc:* 或 attr:[data-…]（本仓 data-theme 挂在 <html>）";
export const isDocLevel = (scope) => /\bdoc:/.test(scope) || /attr:\[data-/.test(scope);

/** 从一段声明块里取**自定义属性的定义名**（`--x:` 形态；`var(--x)` 用法没有冒号，天然不命中） */
function customPropDefs(declText) {
  const out = [];
  for (const m of String(declText ?? "").matchAll(/(?:^|;|\{)\s*(--[\w-]+)\s*:/g)) out.push(m[1]);
  return out;
}

/** 收集一份文档里**每一方**在四条轴上的名字集合（＋ 证据点，供碰撞报告回显） */
function collectParties(doc) {
  const parties = new Map();
  const bump = (party) => {
    if (!parties.has(party)) {
      parties.set(party, { classes: new Set(), keyframes: new Set(), tokens: new Map(), tokenSites: [], shapes: new Set(), anchorless: new Set(), anchorlessSites: [], sheets: [], evidence: [] });
    }
    return parties.get(party);
  };
  const unattributed = [];

  for (const sheet of doc.sheets ?? []) {
    const { party, why, clue } = attributeSheet(sheet);
    if (!party) {
      unattributed.push({ document: doc.label ?? doc.url, index: sheet.index, href: sheet.href ?? null, devId: sheet.devId ?? null, why, clue });
      continue;
    }
    const p = bump(party);
    p.sheets.push(sheet.index);
    if (sheet.blocked) {
      unattributed.push({
        document: doc.label ?? doc.url,
        index: sheet.index,
        href: sheet.href ?? null,
        devId: sheet.devId ?? null,
        why: "样式表规则**读不到**（cssRules 抛异常 = CORS）——看不见内容 ≠ 干净 ⇒ 结论不成立",
        clue,
      });
      continue;
    }
    for (const r of sheet.rules ?? []) {
      if (r.empty) continue; // 空规则体：与静态门禁 parseCss() 同口径（跳）
      if ((r.nested ?? 0) > 0) continue; // CSS 嵌套：相对选择器带隐式祖先 = scoped，不占名（见"覆盖不到"第 5 条）
      for (const one of splitSelector(r.sel)) {
        if (hasAncestor(one)) continue; // scoped 调优 = 合法消费
        const name = soleClassOf(one);
        if (name) {
          p.classes.add(name);
          p.evidence.push({ axis: "class", name, sheet: sheet.index, sel: one, at: r.at ?? "" });
          continue;
        }
        const shape = selectorShape(one);
        if (shape) {
          p.shapes.add(shape);
          p.evidence.push({ axis: "selector-shape", name: shape, sheet: sheet.index, sel: one, at: r.at ?? "" });
          // 🔴 E6#109o-b：**无锚站点**单列一份——它是与静态门禁（判据⑩／lib 的 `selectorFormSites()`）
          //    **逐字可比**的那个数（「轴 ④ 静态 17 ＝ 运行时 17」）。`formOf()` 是唯一的形态口径：
          //    `#root` 这类 id 形态是 **anchored**（D 段，只登记不设门禁）⇒ 不进这个计数。
          if (formOf(one).kind === "anchorless") {
            p.anchorless.add(shape);
            // `origin` = 该样式表的来源线索（`data-vite-dev-id` / `href`）——`compareStatic()` 用它
            // 把站点映射回**仓内文件**，从而按「该文档实际加载了域的哪些文件」逐字对账。
            p.anchorlessSites.push({ shape, sel: one, sheet: sheet.index, at: r.at ?? "", origin: sheet.devId ?? sheet.href ?? null });
          }
        }
      }
    }
    for (const k of sheet.keyframes ?? []) {
      p.keyframes.add(k.name);
      p.evidence.push({ axis: "keyframes", name: k.name, sheet: sheet.index, sel: `@keyframes ${k.name}`, at: k.at ?? "" });
      for (const name of customPropDefs(k.decl)) {
        const set = p.tokens.get(name) ?? new Set();
        set.add(`@keyframes ${k.name}`);
        p.tokens.set(name, set);
        p.tokenSites.push({ name, scope: `@keyframes ${k.name}`, sheet: sheet.index });
        p.evidence.push({ axis: "token", name, sheet: sheet.index, sel: `@keyframes ${k.name} 体内的定义`, at: k.at ?? "" });
      }
    }
    if (sheet.rules?.length) {
      for (const r of sheet.rules) {
        if (r.empty || !r.decl) continue;
        const scope = scopeOf(r.sel);
        for (const name of customPropDefs(r.decl)) {
          const set = p.tokens.get(name) ?? new Set();
          set.add(scope);
          p.tokens.set(name, set);
          p.tokenSites.push({ name, scope, sheet: sheet.index });
          p.evidence.push({ axis: "token", name, sheet: sheet.index, sel: `${scope} 之下的定义`, at: r.at ?? "" });
        }
      }
    }
  }
  return { parties, unattributed };
}

/* ── token 作用域判级（E6#109n-b · 1.24；「两层证明」的第二层）─────────────────

   规则既然定了（1.23 定案：**作用域才是命名空间**），探针就从「只报事实」升级为**判级**。
   🔴 判定式**不在这里**：一律调壳仓 `lib/css-selectors.mjs` 的 `judgeTokenScope()`——与门禁
      **同一个函数**（31 号档 §4.3 要的「判级文案与门禁逐字一致」由构造保证）。
   ⚠️ 三处诚实边界（写进「覆盖不到」清单）：
     · **非文档级的作用域判不了 V4/V5**：运行时的作用域描述符只留**主体**（`class:.foo`）、
       **丢了祖先** ⇒ 重建出的 compound 会漏掉 `.我的根类 .ldk-x` 里的自有类 ⇒ **假红**。
       ⇒ 类限定一律传 `compound: null`（= 不判，**不判 ≠ 合规**，静态腿管这一格）。
     · **`attr:[data-…]`**：事实面（`DOC_LEVEL_CRITERION`）按「任何 `data-` 属性」算文档级，
       比门禁（只认 `[data-theme…]`）**宽** ⇒ 判级一律**从 compound 原文重推**（`tokenScopeOf`），
       两边由构造一致（本仓活体上两者重合，实测零分歧）。
     · **名字层（V2）与作用域无关** ⇒ 类限定站点照样能判 V2（名字以 `ldk-` 开头即红）。
   ───────────────────────────────────────────────────────────────────────── */

/** 运行时的作用域描述符 → 可判级的 compound 原文（**只在能安全重建时给**，否则 `null`） */
function runtimeCompound(part) {
  if (part.startsWith("attr:")) return part.slice(5); // `attr:[data-theme="light"]` → 原样
  const m = /^doc:(root|html|body|universal)$/.exec(part);
  if (!m) return null; // `class:.foo`（丢祖先）/ `id:` / `element:` / `other:` 一律不重建
  return { root: ":root", html: "html", body: "body", universal: "*" }[m[1]];
}

/** 一串描述符部分 → 判级结果（逐部分判，取**最重**的那条） */
export function gradeOne(partyKey, name, scopeDesc, file) {
  const parts = scopeDesc.startsWith("list:") ? scopeDesc.slice(5).split(" | ") : [scopeDesc];
  const isPlugin = partyKey.startsWith("plugin:");
  const base = isPlugin ? "plugin" : partyKey;
  const pluginId = isPlugin ? partyKey.slice("plugin:".length) : null;
  const RANK = { red: 2, yellow: 1 };
  let best = null;
  for (const part of parts) {
    const compound = runtimeCompound(part);
    if (compound === null) {
      // 非文档级：只能判名字层（V2）。先跑一次「不判作用域」的探针，看名字有没有问题
      const nameOnly = judgeTokenScope({ party: base, pluginId, name, scope: "other", compound: null, file });
      if (nameOnly.level && (!best || RANK[nameOnly.level] > RANK[best.level])) best = nameOnly;
      continue;
    }
    const verdict = judgeTokenScope({ party: base, pluginId, name, scope: tokenScopeOf(compound), compound, file });
    if (verdict.level && (!best || RANK[verdict.level] > RANK[best.level])) best = verdict;
  }
  return best;
}

/**
 * 给「每一方的每一处 token 定义」判级 → `{ red: [...], yellow: [...] }`。
 * 站点 = `{ party, name, scope, file, code, why }`（**按站点**计数；去重后的**名字**数另给）。
 */
export function gradeTokenScopes(parties, sheets = []) {
  const red = [];
  const yellow = [];
  for (const [party, p] of parties) {
    if (party === "codicon") continue; // 三方 CSS 不在射程（本仓只消费、不定义）
    for (const site of p.tokenSites) {
      const origin = sheets[site.sheet] ?? {};
      const file = origin.devId ?? origin.href ?? null;
      // ⚠️ 事实面的 token 名**带前导 `--`**（`--status-connected`——既有读数口径，不动），
      //    而判定体要的是**裸名**（`status-connected`）⇒ 在这里剥一次（只有这一处转换）。
      const name = site.name.replace(/^--/, "");
      const verdict = gradeOne(party, name, site.scope, file);
      if (!verdict) continue;
      const entry = { party, name, scope: site.scope, file, code: verdict.code, why: verdict.why, at: origin.devId ?? origin.href ?? null };
      (verdict.level === "red" ? red : yellow).push(entry);
    }
  }
  return { red, yellow };
}

/** 轴 ④ 的形态是否**带类名锚**（`other:.x…` / `other:.x[y]`）——
 *  带锚 ⇒ 命中范围被那个类限定 ⇒ 归属问题落回**轴 ①（类名命名空间）**；
 *  不带锚（`universal:*` / `element:*` / `id:*` / `attr:*` / `other:input[type=…]`）⇒ 命中
 *  「该文档里所有那一类元素」，与谁渲染无关（22 号档 §3.2 的真害：插件写 `button{}` 会改掉所有人的按钮）。
 *  ⚠️ 这条分界**就是 22 号档 §3.2「16 处」那条读数的口径边界**（它只数 元素/通配/属性/id）。 */
export const isClassAnchoredShape = (shape) => shape.startsWith("other:") && /\.-?[_a-zA-Z]/.test(shape.slice(6));

/** 一处碰撞在**共享组件域**里对应的名字（用来判「是不是内联的 UI 库 CSS」）：
 *  轴 ① 的名字本身就是类名；轴 ② 的名字就是关键帧名（种子集合把两者并在一起 —— 问题问的是
 *  「这个名字属于共享组件的 CSS 吗」，类名与关键帧名不会互相混淆）；轴 ④ 取形态里锚定的类名
 *  （`other:.ldk-toggle.on` → `ldk-toggle`）；轴 ③ 与共享域的关系另有判据（token 轴归 1.23）⇒ 回 `null`。 */
function anchoredClassOf(axis, name) {
  if (axis === "class" || axis === "keyframes") return name;
  if (axis === "selector-shape" && isClassAnchoredShape(name)) {
    const m = /\.(-?[_a-zA-Z][\w-]*)/.exec(name.slice(6));
    return m ? m[1] : null;
  }
  return null;
}

/**
 * 🔴 一处碰撞的**性质**与判红分级（依据 22 号档 §10.3「宽容度模型」；**不许自创判红**）。
 *
 * ── 为什么需要「已内联的共享组件 CSS」这一档（**本格实测出来的，不是理论**）──
 * 实机读数：`@linkdesk/ui` **不是 external** ⇒ **每只插件的 bundle 里都内联了一整份共享组件 CSS**。
 * 于是池文档里同一个 `ldk-toggle` 会被 `shared`（宿主 import 的那份）＋ `file-tree` ＋ `marketplace`
 * **各自独立定义**——按字面就是「三方各自定义同名」。
 * ⇒ 但它**不是两套规则打架**：实测两侧声明块**逐字段等价**（只有小压缩带来的写法差：
 *   `150ms` ↔ `0.15s`、逗号后空格有无），肉眼与浏览器都看不出差别。
 * 🔴 **本格刻意不做「规则体逐字比较」**：上面那种等价写法会被逐字比较**误判成冲突** ⇒ 制造假红，
 *    而假红会让真红失效（§10.3 原话）。⇒ 判据改为看**命名空间归属**：
 *    「该名字属于**共享组件域**（`ldk-` 族段，`src/components/shared/**` 里有静态定义）⇒
 *     插件产物里出现它 = **把 UI 库的 CSS 内联进产物**这个已知结构性事实，**逐条列名但不判红**」。
 * 🔑 **这条豁免不会漏掉真正的借用**：插件**源码**里写 `ldk-*` 由**静态腿**判红
 *    （SDK `check-css-namespace`／`plugin-prefix`；18 仓实测 0 违规）⇒ 两把尺子合起来仍无死角。
 *    豁免面**全部逐条列出**（`facts.vendoredSharedNames`），不是悄悄放过。
 */
function classifyCollision(axis, name, parties, sharedDomain = new Set()) {
  const anchored = axis === "class" ? name : anchoredClassOf(axis, name);
  if (anchored && sharedDomain.has(anchored)) {
    return {
      severity: "info",
      kind: "vendored-shared-css",
      why:
        "该名字属于**共享组件域**（`src/components/shared/**` 里有静态定义）⇒ 插件产物里出现它 = " +
        "`@linkdesk/ui` 的 CSS 被**内联进每只插件 bundle**（它不是 external 的已知结构性事实），" +
        "实测两侧声明块逐字段等价（仅小压缩的写法差：`150ms`↔`0.15s`）⇒ **不判红、只列名**。" +
        "插件**源码**里的 `ldk-` 借用由 SDK 静态腿判红（两把尺子合起来无死角）。",
    };
  }
  if (axis === "selector-shape" && isClassAnchoredShape(name)) {
    return {
      severity: "yellow",
      kind: "class-anchored-shape",
      why:
        "形态**带类名锚** ⇒ 命中范围被那个类限定，归属问题落在轴 ①（类名命名空间）；且状态类写成复合" +
        "（硬约束 23 ③）正是被鼓励的形态 ⇒ **黄灯只报事实**（用一条没定案的规则判红会制造假红，§10.3）。",
    };
  }
  if (parties.some((x) => x === "host" || x === "shared")) {
    return {
      severity: "red",
      kind: "cross-party-clash",
      why:
        "任一方是 `host` / `shared` ⇒ 软件自己的元素会被别人的样式命中（`.badge` 案同形）；" +
        "「本仓可答 ＋ 有真害」两条都满足 ⇒ 红（§10.3）。",
    };
  }
  return {
    severity: "yellow",
    kind: "plugin-plugin-clash",
    why: "碰撞只发生在两只插件之间 ⇒ 只有**跨仓**才能回答「已知它在哪、该改哪」⇒ 黄灯（§10.3 判红范围判据）。",
  };
}

/** 一方在某个轴上的名字集合（轴 → 收集字段的**唯一映射点**，加轴时只改这里） */
const AXIS_FIELD = { class: "classes", keyframes: "keyframes", token: "tokens", "selector-shape": "shapes" };
const namesOn = (p, axis) => (axis === "token" ? new Set(p.tokens.keys()) : p[AXIS_FIELD[axis]]);

/** 「被 ≥2 方独立定义」的名字 / 形态 */
function collisionsOn(axis, parties, sharedDomain) {
  const byName = new Map();
  for (const [party, p] of parties) {
    for (const name of namesOn(p, axis)) {
      const list = byName.get(name) ?? [];
      list.push(party);
      byName.set(name, list);
    }
  }
  const out = [];
  for (const [name, ps] of byName) {
    if (ps.length < 2) continue;
    const sorted = [...ps].sort();
    const verdict = classifyCollision(axis, name, sorted, sharedDomain);
    out.push({
      axis,
      name,
      parties: sorted,
      ...verdict,
      evidence: sorted.flatMap((party) =>
        parties
          .get(party)
          .evidence.filter((e) => e.axis === axis && e.name === name)
          .slice(0, 3)
          .map((e) => ({ party, sheet: e.sheet, sel: e.sel, at: e.at }))
      ),
    });
  }
  return out;
}

/**
 * **纯分析层入口**：吃一份 dump（多文档）→ 出报告。
 * @param {{documents: Array}} dump
 * @param {{minPlugins?: number, sharedDomainNames?: Iterable<string>}} opts
 *   `minPlugins` 方名册下限（默认 2 只插件——否则插件↔插件轴未被验证）；
 *   `sharedDomainNames` **共享组件域的静态名字集合**（`src/components/shared/**` 的独立定义
 *   ＋ 关键帧）——它是「插件产物里的 `ldk-` 名 = 内联的 UI 库 CSS」这条豁免的**唯一依据**。
 *   ⚠️ **不给这个种子 ⇒ 按最严处理**（插件里的 `ldk-` 名一律算越界），这是有意的 fail-loud 方向。
 */
export function analyzeDump(dump, { minPlugins = 2, sharedDomainNames = [] } = {}) {
  const sharedDomain = new Set(sharedDomainNames);
  const documents = [];
  const allCollisions = [];
  const allUnattributed = [];

  for (const doc of dump?.documents ?? []) {
    const { parties, unattributed } = collectParties(doc);
    const collisions = AXES.flatMap((axis) => collisionsOn(axis, parties, sharedDomain)).sort((a, b) =>
      a.axis === b.axis ? a.name.localeCompare(b.name) : a.axis.localeCompare(b.axis)
    );

    // ── 事实面（只报，不裁决）──
    const ldkIntrusions = [];
    const vendoredSharedNames = [];
    for (const [party, p] of parties) {
      if (party === "host" || party === "shared") continue;
      for (const axis of ["class", "keyframes"]) {
        for (const name of namesOn(p, axis)) {
          if (!name.startsWith("ldk-")) continue;
          if (sharedDomain.has(name)) {
            vendoredSharedNames.push({ axis, name, party, severity: "info", why: "共享组件域里的名字 ⇒ 内联的 `@linkdesk/ui` CSS（不是借用；插件源码里的 `ldk-` 借用由 SDK 静态腿判红）" });
            continue;
          }
          ldkIntrusions.push({
            axis,
            name,
            party,
            severity: "red",
            why: "非宿主方独立定义了 `ldk-` 开头的名字、且它**不属于共享组件域** = 占用宿主命名空间（CLAUDE.md 硬约束 23 ②；22 号档 §10.3 判红第 ① 类）",
          });
        }
      }
    }
    const documentLevelTokens = {};
    const allTokens = {};
    for (const [party, p] of parties) {
      allTokens[party] = Object.fromEntries([...p.tokens.entries()].sort().map(([n, s]) => [n, [...s].sort()]));
      const dl = [];
      for (const [name, scopes] of p.tokens) if ([...scopes].some(isDocLevel)) dl.push({ name, scopes: [...scopes].sort() });
      if (dl.length) documentLevelTokens[party] = dl.sort((a, b) => a.name.localeCompare(b.name));
    }

    // ── token 作用域判级（E6#109n-b）——规则已定案 ⇒ 探针出「红 / 黄 ＋ 名单」 ──
    const tokenScope = gradeTokenScopes(parties, doc.sheets ?? []);
    const uniqueNames = (list) => [...new Set(list.map((x) => `${x.party}--${x.name}`))].length;
    const tokenScopeSummary = {
      redSites: tokenScope.red.length,
      yellowSites: tokenScope.yellow.length,
      redNames: uniqueNames(tokenScope.red),
      yellowNames: uniqueNames(tokenScope.yellow),
      criterion:
        "judgeTokenScope()（与壳门禁 check-css-namespace 判据⑨ **同一个函数**）；文案逐字一致",
    };

    const pluginParties = [...parties.keys()].filter((x) => x.startsWith("plugin:")).sort();
    documents.push({
      label: doc.label ?? doc.url,
      url: doc.url,
      title: doc.title ?? null,
      sheetCount: (doc.sheets ?? []).length,
      ruleCount: (doc.sheets ?? []).reduce((n, s) => n + (s.ruleCount ?? 0), 0),
      parties: Object.fromEntries(
        [...parties.entries()].sort().map(([party, p]) => [
          party,
          {
            sheets: [...p.sheets].sort((a, b) => a - b),
            counts: {
              class: p.classes.size,
              keyframes: p.keyframes.size,
              token: p.tokens.size,
              "selector-shape": p.shapes.size,
              // 🔴 E6#109o-b：轴 ④ 的**无锚站点数**（＝与静态门禁判据⑩ 逐字可比的那个数）
              "selector-shape-anchorless": p.anchorlessSites.length,
              nonLdkClass: [...p.classes].filter((n) => !n.startsWith("ldk-")).length,
              nonLdkKeyframes: [...p.keyframes].filter((n) => !n.startsWith("ldk-")).length,
            },
            classes: [...p.classes].sort(),
            keyframes: [...p.keyframes].sort(),
            tokens: allTokens[party],
            "selector-shapes": [...p.shapes].sort(),
            anchorlessShapes: [...p.anchorless].sort(),
            anchorlessSites: p.anchorlessSites,
            nonLdkClasses: [...p.classes].filter((n) => !n.startsWith("ldk-")).sort(),
            nonLdkKeyframes: [...p.keyframes].filter((n) => !n.startsWith("ldk-")).sort(),
          },
        ])
      ),
      collisions,
      unattributed,
      facts: {
        ldkIntrusions: ldkIntrusions.sort((a, b) => a.name.localeCompare(b.name)),
        vendoredSharedNames: vendoredSharedNames.sort((a, b) => a.name.localeCompare(b.name)),
        documentLevelTokens,
        documentLevelCriterion: DOC_LEVEL_CRITERION,
        tokenScope,
        tokenScopeSummary,
        inlineHostTokens: [...(doc.inlineTokens ?? [])].sort(),
        inlineBodyTokens: [...(doc.bodyTokens ?? [])].sort(),
        pluginParties,
      },
    });
    const label = doc.label ?? doc.url;
    allCollisions.push(...collisions.map((c) => ({ ...c, document: label })));
    allUnattributed.push(...unattributed);
  }

  const reds = allCollisions.filter((c) => c.severity === "red");
  const yellows = allCollisions.filter((c) => c.severity === "yellow");
  const infos = allCollisions.filter((c) => c.severity === "info");
  const intrusions = documents.flatMap((d) => d.facts.ldkIntrusions);
  const tokenRed = documents.flatMap((d) => d.facts.tokenScope.red);
  const tokenYellow = documents.flatMap((d) => d.facts.tokenScope.yellow);
  const rosterOk = documents.length > 0 && documents.some((d) => d.facts.pluginParties.length >= minPlugins);
  const ok = allUnattributed.length === 0 && reds.length === 0 && intrusions.length === 0 && tokenRed.length === 0 && rosterOk;

  return {
    probe: { ...(dump?.probe ?? {}), analyzer: "runtime-style-audit/v1", minPlugins, sharedDomainSeed: sharedDomain.size },
    ok,
    summary: {
      documents: documents.length,
      collisions: allCollisions.length,
      red: reds.length,
      yellow: yellows.length,
      info: infos.length,
      unattributed: allUnattributed.length,
      ldkIntrusions: intrusions.length,
      tokenRed: tokenRed.length,
      tokenYellow: tokenYellow.length,
      rosterOk,
      perDocument: Object.fromEntries(
        documents.map((d) => [
          d.label,
          {
            parties: Object.keys(d.parties).length,
            plugins: d.facts.pluginParties.length,
            sheets: d.sheetCount,
            rules: d.ruleCount,
            collisions: d.collisions.length,
            red: d.collisions.filter((c) => c.severity === "red").length,
            info: d.collisions.filter((c) => c.severity === "info").length,
            unattributed: d.unattributed.length,
          },
        ])
      ),
    },
    documents,
    collisions: allCollisions,
    unattributed: allUnattributed,
  };
}
