#!/usr/bin/env node
// dom-probe.mjs — 在**真页面**里求值：起（或附着）一个引导器窗口，走 CDP 读 DOM / 算几何。
//
// 为什么要有这条通道（2026-10-02 立）：像素通道（capture.ps1 / cmp-shots.ps1）只回答「看起来对不对」，
// 而且读图贵、780×570 里的 11px 小字容易被看错；但「这句文案在不在」「这个元素的真实矩形是多少」
// 「点开后面板有没有出窗」这类问题，最准最省的证法是**直接在页面里求值**。数就是数，不是像素。
//
// 原理（本机实测）：宿主 `main.cpp` **没有**给 WebView2 设 `AdditionalBrowserArguments`
// （它只按 `--debug` 开 DevTools，见 main.cpp 的 `put_AreDevToolsEnabled`），所以官方那个环境变量
// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 生效——起子进程时带上 `--remote-debugging-port=<port>`，
// WebView2 的 Edge 就开出 CDP 端口：`http://127.0.0.1:<port>/json/list` 能拿到页面 target
// 的 `webSocketDebuggerUrl`（实测 Edg/140.0.3485.94、target URL 就是 `https://installer.local/app.html?...`）。
// 产品态的 setup.exe 同样认这个环境变量（它只是运行时变量，与安装器自己无关）。
// ⚠️ 反过来：若哪天宿主自己设了 `AdditionalBrowserArguments`，环境变量会被顶掉，本脚本就得改成加参数。
//
// 为什么是 .mjs 而不是 .ps1（其余工具都是 ps1）：PowerShell 5.1 没有 WebSocket 客户端，要么装模块
// 要么手写握手；而本机 Node v24 自带 `fetch` 与 `WebSocket` ⇒ 零依赖、跨三种壳都能跑。
//
// 人肉版（只想瞄一眼、不想写脚本）：`out\bootstrapper.exe --debug` 会开 DevTools，Console 里
// `$$('#lkdd-btn')`、`$0.getBoundingClientRect()`、`copy(...)` 一样能用——本脚本是把同一件事做成可复跑的证据。
//
// 用法（在 bootstrapper 目录下）：
//   node tools\dom-probe.mjs --preview "screen=home" --rect "#lkdd-btn" --rect ".xbtn"
//   node tools\dom-probe.mjs --preview "screen=home" --click "#lkdd-btn" --rect "#lkdd-pop"
//   node tools\dom-probe.mjs --uninstall --text "#u2"
//   node tools\dom-probe.mjs --attach --port 9333 --eval "document.documentElement.dataset.mode"
// 参数：
//   --exe <path>   默认 ..\out\bootstrapper.exe（开发态壳）；产品态给拼好的 setup exe 也行
//   --preview <q>  页面 query（同官方口径，如 `screen=home&custom=1`；屏名须在当前模式白名单里，否则静默不切）
//   --uninstall    加 `--uninstall`（720×540 卸载态）
//   --port <n>     CDP 端口，默认 9333
//   --settle <ms>  等加载/动画，默认 2500（点击后另等 400ms 让 0.2s 过渡跑完）
//   --click <sel>  求值前先点一下（可重复，按命令行顺序）
//   --rect <sel>   {x,y,w,h,right,bottom,outL,outR,outB,vis,win,text}——元素在**窗口坐标系**里的实际几何
//                  （out* = 出窗左/右/下三向，「面板展开有没有被裁」就看它；win = 视口尺寸）
//   --text <sel>   textContent（截尾）
//   --eval <js>    自由表达式（`returnByValue` 原样回传，Promise 会 await）
//   --keep         测完不关窗（排查用）
// 退出码：0 全通；1 出错（等不到 CDP 页面 / 页面里抛错 / 找不到必需参数）。
// ⚠️ 输出里 `win` 是页面视口尺寸——与 mockup 画布（780×570 / 卸载 720×540）对账时用它，别用窗口外框。

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const one = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const exe = one('--exe', path.join(here, '..', 'out', 'bootstrapper.exe'));
const port = Number(one('--port', '9333'));
const settle = Number(one('--settle', '2500'));
const keep = has('--keep');
const attach = has('--attach');

// 动作**按命令行顺序**执行——这条对本工具很关键：语言下拉那种「点开才露出来」的面板，
// 量法就是先 `--click` 再 `--rect`；乱序执行量到的是点开前的几何，会得出错误的「没出窗」结论。
const actions = argv.reduce((acc, a, i) => {
  const kind = { '--click': 'click', '--rect': 'rect', '--text': 'text', '--eval': 'eval' }[a];
  return kind ? [...acc, { kind, arg: argv[i + 1] }] : acc;
}, []);

if (!actions.length) {
  console.error('没用例可跑：给 --rect <sel> / --text <sel> / --eval <js> 至少一个');
  process.exit(1);
}

/** 页面里的求值片段：几何 + 可见性 + 视口尺寸（含 text，省得再跑一次） */
const rectJs = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { sel: ${JSON.stringify(sel)},
           x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
           right: Math.round(r.right), bottom: Math.round(r.bottom),
           outL: r.left < 0, outR: r.right > innerWidth, outB: r.bottom > innerHeight,   // 出窗三向（面板裁切就靠它）
           vis: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0,
           win: { w: innerWidth, h: innerHeight },
           text: (el.textContent || '').trim().slice(0, 80) };
})()`;

class Cdp {
  constructor(ws) { this.ws = ws; this.seq = 0; this.waiting = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, no) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', () => no(new Error('CDP WebSocket 连不上：' + url)), { once: true });
    });
    const c = new Cdp(ws);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      const slot = m.id && c.waiting.get(m.id);
      if (!slot) return;                      // 事件推送（无 id）一律忽略：本脚本不用事件
      c.waiting.delete(m.id);
      m.error ? slot.no(new Error(JSON.stringify(m.error))) : slot.ok(m.result);
    });
    return c;
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((ok, no) => { this.waiting.set(id, { ok, no }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(js) {
    const r = await this.send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面里抛错：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget(timeoutMs) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pages = list.filter((t) => t.type === 'page' && /app\.html/.test(t.url));
      if (pages.length) return pages[pages.length - 1];   // 多个就取最新的
      last = `target 有 ${list.length} 个但都不是 app.html`;
    } catch (e) { last = e.message; }
    await sleep(200);
  }
  throw new Error(`等不到 CDP 页面（端口 ${port}）：${last}\n  排查：窗口起来了吗？端口被占？宿主是否自己设了 AdditionalBrowserArguments？`);
}

let child = null;
try {
  if (!attach) {
    const args = [];
    if (has('--uninstall')) args.push('--uninstall');
    const q = one('--preview');
    if (q) args.push('--preview=' + q);   // ⚠️ query 必须与 --preview 同一个参数（拆开会丢，见 README 坑 4/04）
    child = spawn(exe, args, {
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
      stdio: 'ignore',
    });
    child.on('error', (e) => { console.error('起窗失败：' + e.message); });
  }

  const target = await pageTarget(settle + 15000);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await sleep(settle);                                  // 等词条装载 + 入场动效落定

  console.log('target : ' + target.url);
  console.log('窗口   : ' + JSON.stringify(await cdp.eval('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,mode:document.documentElement.dataset.mode||null})')));

  for (const { kind, arg } of actions) {
    if (kind === 'click') {
      const hit = await cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return false; el.click(); return true; })()`);
      console.log(`click  : ${arg} -> ${hit ? 'OK' : '🔴 找不到元素'}`);
      await sleep(400);                                  // 让 .2s 过渡落定再量
    } else if (kind === 'rect') {
      console.log('rect   : ' + JSON.stringify(await cdp.eval(rectJs(arg))));
    } else if (kind === 'text') {
      console.log('text   : ' + JSON.stringify(await cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); return el ? (el.textContent || '').trim() : null; })()`)));
    } else {
      console.log('eval   : ' + JSON.stringify(await cdp.eval(arg)));
    }
  }

  cdp.close();
  if (!keep) console.log('已关窗（--keep 可留着）');
} catch (e) {
  console.error('🔴 ' + e.message);
  process.exitCode = 1;
} finally {
  if (child && !keep) child.kill();
}
