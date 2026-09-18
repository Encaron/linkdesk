/**
 * E6#122 spike 探针——「@linkdesk/ui 池 vendor 单实例供给」真机四断言（🔴 全批 go/no-go 闸）。
 *
 * 用法：npx electron scripts/spike-ui-vendor-probe.mjs   （先 npm run build 产出 dist/）
 * 退出码：0 = 四断言全绿（开闸，#123 可做）；1 = 任一红（停批，等用户裁决）。
 *
 * 跑在**真实 Chromium**（Electron renderer）里、加载**真实打包产物** dist/pool.html——
 * import-map 与 vendor css link 都是打包轨道注入的原件，不是探针自搭的假环境。
 * 断言 4（无插件零成本）必须在任何显式 import 之前读 resource timing，故排在最前。
 */
const { app, BrowserWindow } = require("electron");
const { resolve } = require("path");

const probeSource = (() => {
  async function probe() {
    const out = { assertions: {}, details: {} };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ── 断言 4：无插件零成本——任何显式 import 之前，vendor ui 不得有网络/预加载 ──
    const resBefore = performance.getEntriesByType("resource").map((e) => e.name);
    const uiResBefore = resBefore.filter((n) => n.includes("pool-vendor/@linkdesk"));
    const uiPreload = [...document.querySelectorAll('link[rel="modulepreload"],link[rel="preload"]')]
      .map((l) => l.href).filter((h) => h.includes("pool-vendor/@linkdesk"));
    const mapEntry = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports["@linkdesk/ui"];
    const cssLink = Boolean(document.querySelector('link[data-pool-vendor="css"][href*="@linkdesk"]'));
    out.assertions.zeroCost = uiResBefore.length === 0 && uiPreload.length === 0;
    out.details.zeroCost = { uiResourcesBefore: uiResBefore, uiPreload, mapEntry, cssLink };

    // ── 断言 1：具名导出链接——import-map 严格静态链接的死亡形态 = undefined ──
    const ui = await import("@linkdesk/ui");
    const want = ["SelectBox", "ContextMenu", "HintCard", "Button", "Slider", "Toggle", "Combobox", "inferSliderStep", "pickIdentityArt"];
    const missing = want.filter((n) => ui[n] == null);
    out.assertions.namedExports = missing.length === 0;
    out.details.namedExports = { missing, checked: want.length, exportedKeys: Object.keys(ui).length };

    // ── 断言 2：单实例——两个独立入口（模拟两插件 bundle）各自 import，引用必须全等 ──
    const two = await new Promise((res) => {
      const got = {};
      let done = 0;
      window.__probeUI = (id, mod) => { got[id] = mod; if (++done === 2) res(got); };
      for (const id of ["entryA", "entryB"]) {
        const s = document.createElement("script");
        s.type = "module";
        s.textContent = 'import("@linkdesk/ui").then((m) => window.__probeUI("' + id + '", m))';
        document.head.appendChild(s);
      }
      setTimeout(() => res(got), 8000);
    });
    const sameRef = Boolean(two.entryA && two.entryB && two.entryA === two.entryB && two.entryA.SelectBox === two.entryB.SelectBox);
    out.assertions.singleInstance = sameRef;
    out.details.singleInstance = { entryA: Boolean(two.entryA), entryB: Boolean(two.entryB), sameRef };

    // ── 断言 3：CSS + token 跟随——vendor css link 生效；改 --accent 外观跟随 ──
    const React = (await import("react")).default;
    const { createRoot } = await import("react-dom/client");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(React.createElement(ui.Button, null, "probe"));
    await sleep(300);
    const el = host.querySelector("button") || host.firstElementChild;
    const cssLoaded = [...document.styleSheets].some((s) => (s.href || "").includes("pool-vendor/@linkdesk"));
    const bgBefore = el ? getComputedStyle(el).backgroundColor : null;
    document.documentElement.style.setProperty("--accent", "#ff0000");
    await sleep(150);
    const bgAfter = el ? getComputedStyle(el).backgroundColor : null;
    root.unmount();
    host.remove();
    document.documentElement.style.removeProperty("--accent");
    out.assertions.cssTokenFollow = cssLoaded && bgBefore !== bgAfter && bgAfter.includes("255, 0, 0");
    out.details.cssTokenFollow = { cssLoaded, bgBefore, bgAfter };

    out.ok = Object.values(out.assertions).every(Boolean);
    return out;
  }
  return probe;
})();
const PROBE_FN = `(${probeSource})`;
const RUNNER = `(async () => { try { return await (${PROBE_FN})(); } catch (e) { return { ok: false, assertions: {}, crash: String((e && e.stack) || e) }; } })()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  try {
    await win.loadFile(resolve(process.cwd(), "dist", "pool.html"));
    await new Promise((r) => setTimeout(r, 1200)); // 池 bundle 自己先跑/失败都行——import-map 是静态声明
    const result = await win.webContents.executeJavaScript(RUNNER, true);
    console.log(JSON.stringify(result, null, 2));
    app.exit(result && result.ok ? 0 : 1);
  } catch (err) {
    console.error("probe crashed:", err);
    app.exit(2);
  }
});
