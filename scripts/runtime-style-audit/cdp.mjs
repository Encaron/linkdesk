/* ════════════════════════════════════════════════════════════════════════
   ③ 采集层——连 CDP → dump → 调 ①（**不进 check**）
   ════════════════════════════════════════════════════════════════════════ */

/** 注入页面执行的抽取表达式（**只搬事实，不判口径**——口径全在 Node 侧，见文件头） */
const EXTRACT = `(() => {
  const sheets = [];
  let i = 0;
  for (const s of document.styleSheets) {
    const owner = s.ownerNode;
    const base = {
      index: i++,
      href: s.href,
      tag: owner && owner.tagName ? owner.tagName : null,
      devId: owner && owner.getAttribute ? owner.getAttribute("data-vite-dev-id") : null,
    };
    let rules;
    try { rules = s.cssRules; } catch (e) {
      sheets.push(Object.assign({}, base, { blocked: true, ruleCount: 0, rules: [], keyframes: [] }));
      continue;
    }
    const out = Object.assign({}, base, { blocked: false, ruleCount: rules.length, rules: [], keyframes: [] });
    // 🔴 Chrome 112+ 起 CSSStyleRule.cssRules 因 CSS Nesting 存在且常为空 ⇒ **必须先判 selectorText**
    //    再递归（历轮踩过：顺序反了会让类名词表恒空）。
    const walk = (list, at, nested) => {
      for (const r of list) {
        const t = r.type;
        if (t === 1 || typeof r.selectorText === "string") {
          const decl = r.style ? r.style.cssText : "";
          out.rules.push({
            at: at,
            nested: nested,
            sel: r.selectorText,
            empty: !r.style || r.style.length === 0,
            decl: decl.indexOf("--") >= 0 ? decl : null,
          });
          if (r.cssRules && r.cssRules.length) walk(r.cssRules, at, nested + 1);
        } else if (t === 7) {
          const text = r.cssText || "";
          out.keyframes.push({ name: String(r.name), at: at, decl: text.indexOf("--") >= 0 ? text : null });
          // ⛔ 不递归进 @keyframes：内部是 CSSKeyframeRule（keyText，非选择器）
        } else if (r.cssRules && r.cssRules.length) {
          const full = r.cssText || "";
          const brace = full.indexOf("{");
          const prelude = brace > 0 ? full.slice(0, brace).trim() : String(r.type);
          walk(r.cssRules, at ? at + " && " + prelude : prelude, nested);
        }
      }
    };
    walk(rules, "", 0);
    sheets.push(out);
  }
  const readInline = (el) => {
    const out = [];
    if (!el || !el.style) return out;
    for (let k = 0; k < el.style.length; k++) {
      const name = el.style[k];
      if (name.indexOf("--") === 0) out.push(name);
    }
    return out;
  };
  return JSON.stringify({
    url: location.href,
    title: document.title,
    theme: document.documentElement.getAttribute("data-theme"),
    inlineTokens: readInline(document.documentElement),
    bodyTokens: readInline(document.body),
    sheets: sheets,
  });
})()`;

const CDP_BASE = process.env.LINKDESK_CDP ?? "http://127.0.0.1:9222";

async function listTargets() {
  const res = await fetch(`${CDP_BASE}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  const list = await res.json();
  return list.filter((t) => t.type === "page" && /^https?:/.test(t.url ?? "") && t.webSocketDebuggerUrl);
}

/** 连一个 target 跑表达式（照 scratch/cdp.mjs 的连法，别重写） */
function evaluateOn(target, expression) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let seq = 0;
    const send = (method, params = {}) =>
      new Promise((res2, rej2) => {
        const id = ++seq;
        pending.set(id, { res: res2, rej: rej2 });
        ws.send(JSON.stringify({ id, method, params }));
      });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res: r, rej: j } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? j(new Error(JSON.stringify(msg.error))) : r(msg.result);
      }
    });
    ws.addEventListener("error", () => rej(new Error("WebSocket 连接失败")));
    ws.addEventListener("open", async () => {
      try {
        await send("Runtime.enable");
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) throw new Error(`页面内异常：${r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)}`);
        ws.close();
        res(r.result?.value);
      } catch (e) {
        try { ws.close(); } catch { /* 已关 */ }
        rej(e);
      }
    });
  });
}

/** 文档标签：`pool` / `shell` / `other:<文件>`——供人读与「按文档对账」 */
export function labelOf(url) {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").pop() || "";
    if (base === "pool.html") return "pool";
    if (base === "" || base === "index.html") return "shell";
    return `other:${base}`;
  } catch {
    return `other:${url}`;
  }
}

export async function collect({ docFilter, rawPath } = {}) {
  let targets;
  try {
    targets = await listTargets();
  } catch (e) {
    console.error(`❌ 连不上 CDP（${CDP_BASE}）：${e.message}`);
    console.error("   ⇒ 先按文件头「启动配方」起一个带 `--remote-debugging-port=9222` 的实例。");
    process.exit(2);
  }
  const picked = docFilter ? targets.filter((t) => t.url.includes(docFilter)) : targets;
  if (picked.length === 0) {
    console.error(`❌ 没有匹配的文档。候选：${targets.map((t) => `${t.title} <${t.url}>`).join(" ｜ ") || "（无）"}`);
    process.exit(2);
  }
  const documents = [];
  for (const t of picked) {
    const raw = JSON.parse(await evaluateOn(t, EXTRACT));
    documents.push({ label: labelOf(raw.url), url: raw.url, title: raw.title, theme: raw.theme, inlineTokens: raw.inlineTokens, bodyTokens: raw.bodyTokens, sheets: raw.sheets });
  }
  const dump = {
    probe: { version: 1, cdp: CDP_BASE, capturedAt: new Date().toISOString(), docFilter: docFilter ?? null, note: "**原始事实** dump——口径与判据全在 runtime-style-audit.mjs 的纯分析层，本文件不含结论" },
    documents,
  };
  if (rawPath) {
    mkdirSync(dirname(resolve(rawPath)), { recursive: true });
    writeFileSync(resolve(rawPath), JSON.stringify(dump, null, 1), "utf8");
  }
  return dump;
}

/* ════════════════════════════════════════════════════════════════════════
   ④ 人读输出 ＋ 入口
   ════════════════════════════════════════════════════════════════════════ */

export function printReport(report) {
  console.log(`\n═══ 运行时全表断言探针（E6#109m · 件 5）═══ 采集于 ${report.probe.capturedAt ?? "(离线复算)"}`);
  for (const d of report.documents) {
    console.log(`\n▸ 文档 ${d.label}  <${d.url}>${d.title ? `  「${d.title}」` : ""}`);
    console.log(`  ${d.sheetCount} 张样式表 / ${d.ruleCount} 条规则`);
    for (const [party, info] of Object.entries(d.parties)) {
      const c = info.counts;
      console.log(
        `    · ${party.padEnd(22)} 表 ${String(info.sheets.length).padStart(2)} ｜ 类名 ${String(c.class).padStart(4)} ｜ 关键帧 ${String(c.keyframes).padStart(2)} ｜ token ${String(c.token).padStart(4)} ｜ 顶层形态 ${String(c["selector-shape"]).padStart(3)}`
      );
    }
    if (d.facts.inlineHostTokens.length) console.log(`    · documentElement 上的 inline token（宿主契约，单列、不参与碰撞）：${d.facts.inlineHostTokens.length} 个`);
    for (const [party, list] of Object.entries(d.facts.documentLevelTokens)) console.log(`    · ${party} 的 document 级 token 定义：${list.length} 个（${list.map((x) => x.name).slice(0, 8).join(" ")}${list.length > 8 ? " …" : ""}）`);
    // token 作用域判级（E6#109n-b）——红让结论不成立；黄只报
    const ts = d.facts.tokenScope;
    if (ts.red.length > 0) {
      console.log(`    🔴 token 作用域**红** ${ts.red.length} 处（${d.facts.tokenScopeSummary.redNames} 名）——必须改：`);
      for (const s of ts.red) console.log(`       [${s.code}] ${s.party} · --${s.name} · ${s.scope} · ${s.file ?? "(来源未知)"}`);
      console.log(`       依据：${ts.red[0].why}`);
    }
    if (ts.yellow.length > 0) {
      console.log(`    🟡 token 作用域**黄** ${ts.yellow.length} 处（${d.facts.tokenScopeSummary.yellowNames} 名）——建议改（不拦）：`);
      for (const s of ts.yellow) console.log(`       [${s.code}] ${s.party} · --${s.name} · ${s.scope} · ${s.file ?? "(来源未知)"}`);
    }
    for (const intr of d.facts.ldkIntrusions) console.log(`    🔴 [${intr.axis}] ${intr.name} —— ${intr.party} 占用了宿主 \`ldk-\` 命名空间`);
    if (d.facts.vendoredSharedNames.length) {
      const parties = [...new Set(d.facts.vendoredSharedNames.map((x) => x.party))].join(" / ");
      console.log(`    ℹ️ 内联的共享组件 CSS：${d.facts.vendoredSharedNames.length} 个 \`ldk-\` 名被 ${parties} 定义（逐条见 JSON；**不判红**——它不是 external 的已知结构性事实）`);
    }
  }
  const byAxis = report.collisions.reduce((acc, c) => ((acc[c.axis] = (acc[c.axis] ?? 0) + 1), acc), {});
  console.log(`\n▸ 跨方碰撞：${report.collisions.length} 处（red ${report.summary.red} / yellow ${report.summary.yellow} / info ${report.summary.info}）｜按轴 ${JSON.stringify(byAxis)}`);
  console.log(`▸ token 作用域（判据⑨ 的运行时镜像）：红 ${report.summary.tokenRed} 处 / 黄 ${report.summary.tokenYellow} 处`);
  for (const c of report.collisions) {
    const mark = c.severity === "red" ? "🔴" : c.severity === "yellow" ? "🟡" : "ℹ️";
    if (c.severity === "info") {
      console.log(`   ${mark} [${c.axis}] ${c.name}  ←  ${c.parties.join(" × ")}   (${c.document})`);
      continue; // info 的 `why` 在摘要行里已说明，逐条打印会淹掉真信号
    }
    console.log(`   ${mark} [${c.axis}] ${c.name}  ←  ${c.parties.join(" × ")}   (${c.document})`);
    console.log(`        依据：${c.why}`);
    for (const e of c.evidence.slice(0, 4)) console.log(`        ${e.party} · 表#${e.sheet} · ${e.sel}${e.at ? `  @${e.at}` : ""}`);
  }
  if (report.summary.info) console.log(`\n   ℹ️ 那 ${report.summary.info} 处 info 的判据依据（同一句）：${report.collisions.find((c) => c.severity === "info")?.why ?? ""}`);
  if (report.unattributed.length) {
    console.log(`\n▸ 🔴 未归属样式表：${report.unattributed.length} 张（**结论不成立**——不许静默当宿主）`);
    for (const u of report.unattributed) console.log(`   表#${u.index} (${u.document})  ${u.why}${u.clue ? `  ｜ ${u.clue}` : ""}`);
  }
  if (!report.summary.rosterOk) console.log(`\n▸ ⚠️ 方名册不够真：插件方 < ${report.probe.minPlugins} ⇒ **插件↔插件轴未被验证**（先把要采的插件视图打开，见文件头启动配方第 ④ 步）`);
  console.log(`\n${report.ok ? "✅ 探针结论成立：零 red 跨方碰撞、零未归属、方名册够真" : "❌ 探针结论**不成立**（上面逐条见）"}`);
}
