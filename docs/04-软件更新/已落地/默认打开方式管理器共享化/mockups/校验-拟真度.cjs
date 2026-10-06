/* 校验-拟真度.cjs —— 本 case 两张设计图的**拟真度机械门**（01 共享化落地态 ＋ 02 未知渲染器降级态）
 * 运行：在仓库根 `node "docs/04-软件更新/已落地/默认打开方式管理器共享化/mockups/校验-拟真度.cjs"`
 *       （jsdom 自仓库 node_modules 解析；本文件须为 .cjs——仓库是 "type":"module"）
 * 覆盖：段 A–N ＝ 01（含交互不回归）；段 O ＝ 02（同口径的共享件真形态 ＋ 尺寸逐值）
 * 口径：真件一致性（共享件 DOM/焦点机制/真 codicon/PluginIcon 两形态）＋ 尺寸字号逐值
 *       （src/index.css token、settings 插件 SettingsView.css/-rows.css）＋ 交互不回归（过滤/排序/阈值/折叠复位）
 * 依据：2026-10-06 用户判据「已有组件长什么样就是什么样」（先例＝滑杆搬迁）
 *       ＋「html 展示基本就是实机效果：比例、大小、尺寸、显示文字」。改动本图后必跑；红了就是漂了。
 * 注意：jsdom 无布局引擎（getBoundingClientRect 恒 0）⇒ 位置类断言不可写，只写不变量。
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const dir = __dirname;
const file = path.join(dir, "01-设计图-共享化落地态-整页拟真.html");
const html = fs.readFileSync(file, "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window;
const d = w.document;

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) pass++; else { fail++; console.log("FAIL: " + n + (extra ? "  [" + extra + "]" : "")); } };
const $ = (s) => d.querySelector(s);
const $$ = (s) => Array.from(d.querySelectorAll(s));
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const inPortal = (s) => $$("#ldkPortal " + s);
const panelVisible = () => $("#ldkPortal").style.display === "block" && !!$("#ldkPortal .ldk-selectbox-dropdown");
const rowsOf = (id) => $$("#body_" + id + " .settings-assoc-row");
const extsOf = (id) => rowsOf(id).map((r) => r.querySelector(".settings-assoc-ext").textContent);
const card = (id) => $$(".ldk-plugin-card").find((c) => {
  const sub = c.querySelector(".ldk-plugin-card-sub");
  return sub && sub.textContent.startsWith(id + " ·");
}) || null;
const trig = (key) => $('[data-sel="' + key + '"] .ldk-selectbox-trigger');

setTimeout(() => {
  // ── A. 真 codicon 字体：链接指向真实资源，字形才画得出来 ──
  const link = $("#codiconLink") || $('link[href*="codicon.css"]');
  ok("head 挂了 codicon.css 链接", !!link);
  const resolved = link ? path.resolve(dir, link.getAttribute("href")) : "";
  ok("链接路径可解析到真字体 CSS", fs.existsSync(resolved), resolved);
  const cssTxt = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : "";
  const m = cssTxt.match(/url\(["']?([^"')]+)["']?\)/);
  const fontPath = m ? path.resolve(path.dirname(resolved), m[1].split("?")[0]) : "";
  ok("codicon.css 的字体文件在同目录存在", fs.existsSync(fontPath), fontPath);
  ok("字形: codicon-gear 在 css 里定义", /\.codicon-gear:before/.test(cssTxt));
  ok("字形: codicon-chevron-down 定义", /\.codicon-chevron-down:before/.test(cssTxt));
  ok("字形: codicon-chevron-right 定义", /\.codicon-chevron-right:before/.test(cssTxt));
  ok("字形: codicon-search 定义", /\.codicon-search:before/.test(cssTxt));

  // ── B. ⛔ 原生 select 清零；下拉全是共享件 SelectBox ──
  ok("⛔ 无原生 <select>", $$("select").length === 0, "实测 " + $$("select").length);
  ok("有多个 .ldk-selectbox 实例", $$(".ldk-selectbox").length > 40, "实测 " + $$(".ldk-selectbox").length);

  // ── C. 手绘图标退役：齿轮＝codicon，箭头＝codicon，无 SVG 齿轮 ──
  ok("卡齿轮＝codicon-gear ×5", $$(".ldk-plugin-card-gear .codicon-gear").length === 5);
  ok("卡头箭头＝codicon-chevron-right ×5", $$(".ldk-plugin-card-chevron.codicon-chevron-right").length === 5);
  ok("行齿轮＝codicon-gear（竞争行+卡体行）", $$(".settings-row-gear .codicon-gear").length > 5);
  ok("⛔ 齿轮里没有手绘 SVG", $$(".settings-row-gear svg, .ldk-plugin-card-gear svg").length === 0);
  ok("工具栏搜索图标＝codicon-search", $$(".famgr-filter-icon.codicon-search").length === 1);
  ok("顶部搜索图标＝codicon-search", $$(".settings-search-icon.codicon-search").length === 1);

  // ── D. InlineInput 真件实例（顶栏搜索 ＋ 卡内过滤同一支） ──
  const s = $("#sSearch");
  ok("顶栏搜索＝InlineInput(normal)", !!s && s.classList.contains("ldk-inline-input") && s.classList.contains("ldk-inline-input--normal"));
  ok("顶栏搜索 placeholder 为「搜索设置」", s && s.getAttribute("placeholder") === "搜索设置");
  ok("卡内过滤＝InlineInput(normal)", $$(".ldk-plugin-card-toolbar input.ldk-inline-input--normal").length === 1);

  // ── E. Toggle / Badge 真件形态 ──
  const tg = $(".ldk-toggle");
  ok("Toggle＝div.ldk-toggle（无子元素）", !!tg && tg.tagName === "DIV" && tg.childElementCount === 0);
  ok("Toggle role/aria-checked 齐", tg && tg.getAttribute("role") === "switch" && tg.getAttribute("aria-checked") === "true");
  ok("Badge＝.ldk-badge（竞争行）", $$(".ldk-badge").length >= 1, "实测 " + $$(".ldk-badge").length);
  ok("⛔ 旧 .assoc-badge 已清零", $$(".assoc-badge").length === 0);

  // ── F. 阈值仍只对编辑器生效（回归） ──
  ok("5 张卡 / 1 条工具条", $$(".ldk-plugin-card").length === 5 && $$(".ldk-plugin-card-toolbar").length === 1);

  // ── G. 排序下拉＝真件 SelectBox 全链路 ──
  ok("面板初始关闭", $("#ldkPortal").style.display !== "block");
  ok("排序触发器 label＝按字母序", trig("sort_editor").querySelector(".ldk-selectbox-label").textContent === "按字母序");
  ok("触发器箭头＝codicon-chevron-down", !!trig("sort_editor").querySelector(".codicon-chevron-down.ldk-selectbox-arrow"));

  click(trig("sort_editor"));
  ok("点触发器 ⇒ 面板打开", panelVisible());
  ok("容器加 .ldk-selectbox-open", $('[data-sel="sort_editor"]').classList.contains("ldk-selectbox-open"));
  ok("箭头转为 up 态", !!trig("sort_editor").querySelector(".ldk-selectbox-arrow-up"));
  ok("触发器那一击不冒泡关闭（非模态）", panelVisible());
  const items = inPortal(".ldk-selectbox-item");
  ok("面板 2 项（列表＝ul.ldk-selectbox-list[tabindex=-1]）", items.length === 2 && !!inPortal(".ldk-selectbox-list")[0].getAttribute("tabindex"));
  ok("项文本＝真候选项", items.map((n) => n.textContent.trim()).join("|") === "按字母序|按默认排序", items.map((n) => n.textContent.trim()).join("|"));
  ok("当前值项＝focus ＋ selected", items[0].classList.contains("ldk-selectbox-item-focus") && items[0].classList.contains("ldk-selectbox-item-selected"));
  ok("面板 inline 定位（fixed ＋ 量测坐标）", /position:fixed/.test(inPortal(".ldk-selectbox-dropdown")[0].getAttribute("style") || ""));

  const liBefore = inPortal(".ldk-selectbox-item")[1];
  const ddBefore = inPortal(".ldk-selectbox-dropdown")[0];
  items[1].dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
  ok("hover 走 focus 类（真件机制，非 :hover 规则）", inPortal(".ldk-selectbox-item")[1].classList.contains("ldk-selectbox-item-focus"));
  ok(
    "悬停不重建面板（节点同一性不变；重建＝自我维持死循环，实机「鼠标一动下拉自收回」）",
    inPortal(".ldk-selectbox-item")[1] === liBefore &&
      inPortal(".ldk-selectbox-dropdown")[0] === ddBefore &&
      inPortal(".ldk-selectbox-item").length === 2 &&
      inPortal(".ldk-selectbox-item-focus").length === 1,
  );
  ok("悬停不移除「已选中」类", inPortal(".ldk-selectbox-item")[0].classList.contains("ldk-selectbox-item-selected"));

  click(inPortal(".ldk-selectbox-item")[1]);
  ok("选中后关闭面板", $("#ldkPortal").style.display === "none");
  ok("label 切到「按默认排序」", trig("sort_editor").querySelector(".ldk-selectbox-label").textContent === "按默认排序");
  ok("行序回声明序（首行 .ts）", extsOf("editor")[0] === ".ts", extsOf("editor")[0]);
  const declared = JSON.parse(w.eval("JSON.stringify(PLUGINS.editor.assoc)"));
  ok("声明序 45 项逐位一致", JSON.stringify(extsOf("editor").map((x) => x.slice(1))) === JSON.stringify(declared));
  ok("日志记了行序切换", /卡体行序/.test($("#log").textContent));

  // ── H. 外部点击 / Escape 关闭（OverlayPortal 等价物） ──
  click(trig("sort_editor"));
  ok("面板再次打开", panelVisible());
  click($("#setContent"));
  ok("点空白 ⇒ 关闭", $("#ldkPortal").style.display === "none");
  click(trig("sort_editor"));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok("Esc ⇒ 关闭", $("#ldkPortal").style.display === "none");

  // ── I. 卡体行下拉＝共享件 SelectBox（写覆盖表） ──
  const rt = trig("row_ts");
  ok("卡体行下拉是 .ldk-selectbox.settings-assoc-select", !!rt && !!$('[data-sel="row_ts"]').classList.contains("settings-assoc-select"));
  ok("卡体行下拉 label＝自动（当前值）", rt.querySelector(".ldk-selectbox-label").textContent === "自动");
  click(rt);
  const ropts = inPortal(".ldk-selectbox-item").map((n) => n.textContent.trim());
  ok("行下拉候选＝自动＋候选插件", ropts[0] === "自动" && ropts.includes("编辑器"), ropts.join("|"));
  click(inPortal(".ldk-selectbox-item")[1]);
  ok("选后写覆盖表 state.override.ts='editor'", w.eval("state.override.ts") === "editor");
  ok("覆盖表面板联动", /\bts\b/.test($("#kvOverride").textContent));
  ok("选后 label 变「编辑器」", trig("row_ts").querySelector(".ldk-selectbox-label").textContent === "编辑器");

  // ── J. 竞争格下拉（Badge ＋ SelectBox；整格生效） ──
  const bkey = $$("[data-sel^='bulk_']").length ? $$("[data-sel^='bulk_']")[0].getAttribute("data-sel") : "";
  ok("竞争格有 SelectBox", !!bkey, bkey);
  if (bkey) {
    click(trig(bkey));
    ok("竞争格面板打开（≥2 项：自动＋N 候选）", inPortal(".ldk-selectbox-item").length >= 2);
    ok("Badge 与下拉同现于 control 区", !!$(".settings-assoc-contested .ldk-badge"));
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  // ── K. 过滤 / 折叠复位 / 既有面 回归 ──
  const inp = $(".ldk-plugin-card-toolbar input.ldk-inline-input");
  inp.value = "py"; fire(inp, "input");
  ok("过滤 py ⇒ 1 行 .py", rowsOf("editor").length === 1 && extsOf("editor")[0] === ".py");
  ok("命中数随动", $("#hit_editor").textContent.trim() === "命中 1 / 45", $("#hit_editor").textContent);
  inp.value = ""; fire(inp, "input");
  ok("清空 ⇒ 回 45 行", rowsOf("editor").length === 45);
  click(card("editor").querySelector(".ldk-plugin-card-toggle"));
  ok("折叠复位过滤", w.eval("state.filter.editor") === "");
  ok("折叠后箭头回非 open 态", !card("editor").querySelector(".ldk-plugin-card-chevron--open"));
  click(card("editor").querySelector(".ldk-plugin-card-toggle"));
  ok("展开后箭头带 --open（rotate 90）", !!card("editor").querySelector(".ldk-plugin-card-chevron--open"));
  ok("小卡展开仍无工具条", (() => {
    click(card("imga").querySelector(".ldk-plugin-card-toggle"));
    return !!$("#body_imga") && !card("imga").querySelector(".ldk-plugin-card-toolbar");
  })());
  ok("阈值标注块仍在", $$(".famgr-anno").length === 1 && /是阈值，不是漏画/.test($(".famgr-anno").textContent));

  /* ── K2. C5 过滤分档（2026-10-06 口径：扩展名命中在前、仅显示名命中沉底并标「类型名 …」） ──
     ⚠️ 本段自持排序口径：段 G 早前把排序切到过 declared，这里先显式置回 alpha */
  w.eval("state.sortMode.editor='alpha';renderGroup()");
  const inpK = $(".ldk-plugin-card-toolbar input.ldk-inline-input");   /* ⚠️ 前面折叠/展开过卡 ⇒ 150 行捕获的 inp 已脱树 */
  inpK.value = "c"; fire(inpK, "input");
  const cRows = rowsOf("editor"), ext9 = ".c.cfg.cjs.cmd.cpp.css.jsonc.patch.scss";
  ok("输 c ⇒ 17 行分档：前 9 行全是扩展名命中（按字母序）、沉底 8 行全是仅显示名命中且带「类型名 …」标注",
    cRows.length === 17 &&
      cRows.slice(0, 9).map((r) => r.querySelector(".settings-assoc-ext").textContent).join("") === ext9 &&
      cRows.slice(0, 9).every((r) => !r.querySelector(".settings-assoc-why")) &&
      cRows.slice(9).every((r) => !!r.querySelector(".settings-assoc-why")) &&
      /类型名 Batch/.test(cRows[9].querySelector(".settings-assoc-why").textContent) &&
      /类型名 TypeScript/.test(cRows[cRows.length - 1].querySelector(".settings-assoc-why").textContent),
    cRows.map((r) => r.querySelector(".settings-assoc-ext").textContent).join(" "));
  w.eval("state.sortMode.editor='declared';renderGroup()");
  const dRows = rowsOf("editor");
  ok("换「按默认排序」只换序不换集（仍 17 行；分档保持——首行＝声明序里第一个扩展名命中 .cjs，仅显示名命中的 8 行仍沉底）",
    dRows.length === 17 && dRows[0].querySelector(".settings-assoc-ext").textContent === ".cjs" &&
      dRows.slice(0, 9).every((r) => !r.querySelector(".settings-assoc-why")) &&
      dRows.slice(9).every((r) => !!r.querySelector(".settings-assoc-why")),
    dRows.map((r) => r.querySelector(".settings-assoc-ext").textContent).join(" "));
  w.eval("state.filter.editor='';state.sortMode.editor='alpha';renderGroup()");
  const inp2 = $(".ldk-plugin-card-toolbar input.ldk-inline-input");
  inp2.value = "python"; fire(inp2, "input");
  ok("输 python ⇒ 1 行 .py（纯显示名命中）且标「类型名 Python」",
    extsOf("editor").length === 1 && extsOf("editor")[0] === ".py" && /类型名 Python/.test($(".settings-assoc-why")?.textContent || ""),
    extsOf("editor").join(" "));
  /* ── K3. D2 定案（2026-10-06）：卡内过滤 0 命中 ⇒ 卡体一行 muted 文案「没有匹配的类型」（⛔ 不带清空入口） ── */
  const inpD = $(".ldk-plugin-card-toolbar input.ldk-inline-input");
  inpD.value = "zzz"; fire(inpD, "input");
  const bodyD = $("#body_editor"), emptyD = $("#body_editor .settings-assoc-empty");
  ok("过滤 0 命中 ⇒ 卡体只剩一行 muted「没有匹配的类型」（零行、零按钮）",
    rowsOf("editor").length === 0 && $$("#body_editor .settings-assoc-empty").length === 1 &&
      !!emptyD && emptyD.textContent.trim() === "没有匹配的类型" &&
      bodyD.querySelectorAll("button").length === 0 && !/清空/.test(bodyD.textContent),
    bodyD.textContent.trim().slice(0, 40));
  w.eval("state.filter.editor='';renderGroup()");   /* 复原：段 L 从干净态起跑 */

  // ── L. 通用 / 外观 演示行的控件也是真件 SelectBox ──
  click($$(".setnav .nv")[0]);
  ok("通用组：字体行＝SelectBox", !!$('[data-sel="row_font"]'));
  click(trig("row_font"));
  ok("字体行面板＝2 项（FontFamilySelect 内层 SelectBox）", inPortal(".ldk-selectbox-item").length === 2);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  click($$(".setnav .nv")[1]);
  ok("外观组：枚举行＝SelectBox", !!$('[data-sel="row_appearance"]'));


  // ── M. 尺寸 / 字号 / 文字逐值（真源：src/index.css ＋ 插件 SettingsView*.css）──
  const css = html;                                   // 断言打在源文本上，防「手填 px 漂移」
  const rule = (sel) => {                             // 取某个选择器的规则体
    const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"));
    return m ? m[1] : null;
  };
  // token：字号档位 / 圆角 / hover 叠色 = index.css:71-86 逐值
  ok("token 字号档 2xs/xs/sm/md/lg/xl = 11/12/13/14/16/18",
    /--font-size-2xs:11px/.test(css) && /--font-size-xs:12px/.test(css) && /--font-size-sm:13px/.test(css) &&
    /--font-size-md:14px/.test(css) && /--font-size-lg:16px/.test(css) && /--font-size-xl:18px/.test(css));
  ok("token 圆角 sm/md/lg = 4/6/8（lg 不是 10）",
    /--radius-sm:4px/.test(css) && /--radius-md:6px/.test(css) && /--radius-lg:8px/.test(css) && !/--radius-lg:10px/.test(css));
  ok("hover-overlay = .06（真值）", /--hover-overlay:rgba\(255,255,255,\.06\)/.test(css));
  ok("配色锚 index.css :root 兜底暗色（window/card/input/primary/accent/separator）",
    /--bg-window:#1E1E1E/.test(css) && /--bg-card:#2D2D2D/.test(css) && /--bg-input:#3C3C3C/.test(css) &&
    /--text-primary:#D4D4D4/.test(css) && /--accent:#0078D4/.test(css) && /--separator:#474747/.test(css));
  ok("全局基准 = sm（html,body 13px 口径）", /font:var\(--font-size-sm\)\/1\.6 var\(--font-ui\)/.test(css));
  // 页面骨架（SettingsView.css 逐值）
  const tb = rule(".settings-tab-bar");
  ok("页签栏：padding 0 16px ＋ 无定高（真件无 height）", !!tb && /padding:0 16px/.test(tb) && !/height/.test(tb));
  const tab = rule(".settings-tab");
  ok("页签：padding 8px 16px / md / 下划线 2px transparent",
    !!tab && /padding:8px 16px/.test(tab) && /font-size:var\(--font-size-md\)/.test(tab) && /border-bottom:2px solid transparent/.test(tab));
  ok("页签 active：border-bottom-color = accent（下划线，非 inset 投影）",
    /\.settings-tab\.active\{[^}]*border-bottom-color:var\(--accent\)/.test(css));
  const sb = rule(".settings-search-bar");
  ok("搜索栏：padding 8px 16px ＋ gap 8 ＋ 底边 --border",
    !!sb && /padding:8px 16px/.test(sb) && /gap:8px/.test(sb) && /border-bottom:1px solid var\(--border\)/.test(sb));
  const jb = rule(".settings-json-btn");
  ok("JSON 钮：4px 8px / sm / radius 2px / transparent 底",
    !!jb && /padding:4px 8px/.test(jb) && /font-size:var\(--font-size-sm\)/.test(jb) && /border-radius:2px/.test(jb) && /background:transparent/.test(jb));
  const nav = rule(".setnav");
  ok("左树：200px ＋ padding 8px 0 ＋ 右边 --border（真件无底色）",
    !!nav && /width:200px/.test(nav) && /padding:8px 0/.test(nav) && /border-right:1px solid var\(--border\)/.test(nav) && !/background/.test(nav));
  const nvi = rule(".setnav .nv");
  ok("左树项：6px 20px / md / text-primary / 2px 左杠占位",
    !!nvi && /padding:6px 20px/.test(nvi) && /font-size:var\(--font-size-md\)/.test(nvi) && /color:var\(--text-primary\)/.test(nvi) && /border-left:2px solid transparent/.test(nvi));
  ok("左树项 active：500 字重 ＋ 左杠 accent",
    /\.setnav \.nv\.active\{[^}]*font-weight:500[^}]*border-left-color:var\(--accent\)/.test(css));
  ok("左树计数：实底胶囊（radius 10px ＋ hover-overlay 底），非描边",
    /\.setnav \.nv \.cnt\{[^}]*background:var\(--hover-overlay\)[^}]*border-radius:10px/.test(css));
  const form = rule(".setcontent");
  ok("表单区：padding 20px 28px（真件 .settings-form）", !!form && /padding:20px 28px/.test(form));
  ok("组标题：xl / margin 0 0 20px 0 / padding-bottom 12px",
    /\.settings-group-title\{[^}]*font-size:var\(--font-size-xl\)[^}]*margin:0 0 20px 0[^}]*padding-bottom:12px/.test(css));
  ok("子节标题：margin 22px 0 10px 0 ＋ sm/600 ＋ 3px 竖杠",
    /\.settings-subsection-title\{[^}]*font-size:var\(--font-size-sm\)[^}]*margin:22px 0 10px 0/.test(css) &&
    /\.settings-subsection-title::before\{[^}]*width:3px[^}]*height:12px/.test(css));
  ok("设置行：padding 8px 0 ＋ gap 20px ＋ 底边 --border",
    /\.settings-row\{[^}]*padding:8px 0[^}]*gap:20px/.test(css));
  ok("行标签 md / 行说明 sm（真件档位）",
    /\.settings-row-label\{[^}]*font-size:var\(--font-size-md\)/.test(css) &&
    /\.settings-row-desc\{[^}]*font-size:var\(--font-size-sm\)/.test(css));
  const ii = rule(".ldk-inline-input--normal");
  ok("InlineInput normal：32px×scale ＋ md 字（真件）",
    !!ii && /height:calc\(32px \* var\(--ui-scale\)\)/.test(ii) && /font-size:var\(--font-size-md\)/.test(ii));
  // 反例：产品区内不许出现手填 px 字号（脚手架类 .panel/.toast/.ctx/.mini 不在此列）
  const productRules = css.match(/\.(?:settings-[a-z-]+|ldk-[a-z-]+|famgr-[a-z-]+)\{[^}]*\}/g) || [];
  const rawPx = productRules.filter((r) => /font-size:\s*[\d.]+px/.test(r));
  ok("产品区零手填 px 字号（全部走 --font-size-*）", rawPx.length === 0, rawPx.join(" | ").slice(0, 160));
  ok("产品文案照真件（搜索设置 / JSON / 按插件浏览 / 系统「打开方式」登记）",
    /placeholder="搜索设置"/.test(css) && /settings-json-btn[^>]*>JSON</.test(css) &&
    /按插件浏览/.test(css) && /系统「打开方式」登记/.test(css));


  // ── N. 卡头图标 = 共享件 PluginIcon 真形态（⛔ 非自造字母磁贴）──
  click($$(".setnav .nv")[2]);   // 段 L 停在「外观」，先切回「默认打开方式」（卡在这一组）
  const icons = $$(".ldk-plugin-card-head .ldk-plugin-card-icon");
  ok("每张卡都有图标盒", icons.length === $$(".ldk-plugin-card").length && icons.length === 5, String(icons.length));
  ok("图标盒内＝真件叶子（plugin-icon ＋ card-icon-glyph），且盒上无自造底色",
    icons.every((b) => b.querySelector(".plugin-icon.ldk-plugin-card-icon-glyph") && !b.getAttribute("style")));
  const edIcon = $(".ldk-plugin-card-head img.plugin-icon--img.ldk-plugin-card-icon-glyph");
  ok("editor 卡图标＝img 形 ＋ 真资产 data URI（icon.svg 原字节）",
    !!edIcon && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]{200,}$/.test(edIcon.getAttribute("src")));
  ok("其余 4 只夹具卡＝emoji 形（真件无 manifest 兜底分支）",
    $$(".ldk-plugin-card-head span.plugin-icon--emoji.ldk-plugin-card-icon-glyph").length === 4,
    String($$(".ldk-plugin-card-head span.plugin-icon--emoji.ldk-plugin-card-icon-glyph").length));
  ok("自造字母磁贴已清零（无 P.name[0] / style=background 残迹）",
    !/P\.name\[0\]/.test(css) && !/ldk-plugin-card-icon" style=/.test(css) && !/P\.color/.test(css));
  ok("图标两形态 CSS 照真件（img 铺满 cover / span 走 lg）",
    /img\.ldk-plugin-card-icon-glyph\{[^}]*width:100%;height:100%;object-fit:cover/.test(css) &&
    /span\.ldk-plugin-card-icon-glyph\{[^}]*font-size:var\(--font-size-lg\);line-height:1/.test(css));


  // ── O. 02「未知渲染器降级态」同口径（共享件真形态 ＋ 尺寸逐值）──
  const html2 = fs.readFileSync(path.join(dir, "02-设计图-未知渲染器降级态.html"), "utf8");
  const d2 = new JSDOM(html2, { runScripts: "dangerously", pretendToBeVisual: true }).window.document;
  const q2 = (x) => d2.querySelector(x);
  const qa2 = (x) => Array.from(d2.querySelectorAll(x));
  ok("02 · token 字号/圆角/配色逐值（同 01 口径）",
    /--font-size-sm:13px/.test(html2) && /--font-size-xs:12px/.test(html2) && /--font-size-md:14px/.test(html2) &&
    /--font-size-lg:16px/.test(html2) && /--radius-lg:8px/.test(html2) && !/--radius-lg:10px/.test(html2) &&
    /--bg-window:#1E1E1E/.test(html2) && /--separator:#474747/.test(html2) && /--accent:#0078D4/.test(html2) &&
    /--hover-overlay:rgba\(255,255,255,\.06\)/.test(html2) && /--toggle-knob:#ffffff/.test(html2));
  ok("02 · 左树照真件（200px ／ 项 md·2px 左杠 ／ 计数实底胶囊）",
    /\.setnav\{[^}]*width:200px/.test(html2) && /\.setnav\{[^}]*padding:8px 0/.test(html2) &&
    /\.setnav\{[^}]*border-right:1px solid var\(--border\)/.test(html2) &&
    /\.setnav \.nv\{[^}]*font-size:var\(--font-size-md\)[^}]*border-left:2px solid transparent/.test(html2) &&
    /\.setnav \.nv\.active\{[^}]*font-weight:500[^}]*border-left-color:var\(--accent\)/.test(html2) &&
    /\.setnav \.nv \.cnt\{[^}]*background:var\(--hover-overlay\)[^}]*border-radius:10px/.test(html2));
  ok("02 · 表单/组标题/子节标题/设置行＝真件规则",
    /\.setcontent\{[^}]*padding:20px 28px/.test(html2) &&
    /\.settings-group-title\{[^}]*font-size:var\(--font-size-xl\)[^}]*margin:0 0 20px 0[^}]*padding-bottom:12px/.test(html2) &&
    /\.settings-subsection-title\{[^}]*margin:22px 0 10px 0/.test(html2) &&
    /\.settings-row\{[^}]*padding:8px 0[^}]*gap:20px/.test(html2) &&
    /\.settings-row-label\{[^}]*font-size:var\(--font-size-md\)/.test(html2));
  ok("02 · 齿轮＝真 codicon（字形 lg），手绘 svg 清零",
    /\.settings-row-gear\{[^}]*font-size:var\(--font-size-lg\)/.test(html2) && !/\.settings-row-gear svg/.test(html2) &&
    qa2(".settings-row-gear .codicon-gear").length === 2);
  const t2 = q2(".ldk-toggle");
  ok("02 · 开关＝真共享件 Toggle（div ＋ ::after，⛔ 无子元素 span）",
    !!t2 && t2.tagName === "DIV" && !t2.firstElementChild && t2.getAttribute("role") === "switch" &&
    !/\.tgl/.test(html2) && !/<span><\/span><\/button>/.test(html2) &&
    /\.ldk-toggle::after\{[^}]*content:""/.test(html2));
  ok("02 · 只读降级＝真 UnknownHintControl（data-hint ＞ .ldk-readonly-text），自造胶囊清零",
    !!q2("[data-hint] .ldk-readonly-text") &&
    /\.ldk-readonly-text\{[^}]*font-family:var\(--font-mono\)[^}]*font-size:var\(--font-size-2xs\)/.test(html2) &&
    !/\.roval/.test(html2));
  ok("02 · codicon 字体已挂（与产品同支）", /@vscode\/codicons\/dist\/codicon\.css/.test(html2));
  const raw2 = (html2.match(/\.(?:settings-[a-z-]+|ldk-[a-z-]+)\{[^}]*\}/g) || []).filter((r) => /font-size:\s*[\d.]+px/.test(r));
  ok("02 · 产品区零手填 px 字号（全部走 --font-size-*）", raw2.length === 0, raw2.join(" | ").slice(0, 160));

  console.log("\n" + (fail ? "❌" : "✅") + " 通过 " + pass + " / " + (pass + fail));
  process.exit(fail ? 1 : 0);
}, 80);
