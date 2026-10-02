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
//   node tools\dom-probe.mjs --attach --port 9440 --eval "document.documentElement.dataset.mode"
// 参数：
//   --exe <path>   默认 ..\out\bootstrapper.exe（开发态壳）；产品态给拼好的 setup exe 也行
//   --preview <q>  页面 query（同官方口径，如 `screen=home&custom=1`；屏名须在当前模式白名单里，否则静默不切）
//   --uninstall    加 `--uninstall`（720×540 卸载态）
//   --port <n>     CDP 端口，默认 9440
//                  🔴 起窗前**先探端口**：被占就当场报错并指名占用者，不再硬连。
//                  （2026-10-02 实机踩过：默认 9333 与**正在运行的 LinkDesk 本体**撞了，
//                   于是拿到的是它的 target —— 报错只有「target 有 2 个但都不是 app.html」，
//                   查半天才发现压根不是我们的窗。换成 9440 + 预探。）
//   --settle <ms>  等加载/动画，默认 2500（点击后另等 400ms 让 0.2s 过渡跑完）
//   --wait <ms>    等 CDP 页面**出现**的上限，默认 240000（与 install-test.ps1 的 90s 窗口口径一致）。
//                  🔴 2026-10-02 CI 实测：默认原先 15s，在 windows-latest 上第一条就红——
//                  本脚本常是**全场第一个起 WebView2 的**（`npm run check` 不碰 exe），
//                  一次性 VM 上冷启动远超本机那 2–3 秒。成功即返回，加长不影响快路径。
//                  🔴 2026-10-03 90s 仍然红（v0.2.36 tag 两次＋更早的两笔 docs 提交同一处），
//                  故：① 上限提到 240s；② 超时且壳还活着就**杀掉重起一次**（首跑把运行时捂热，
//                  第二跑走快路径）；③ 起窗时带 `--log=`，超时把宿主那几行打出来——
//                  否则「装载器报错」与「只是慢」在日志里长得一模一样。
//   --click <sel>  求值前先点一下（可重复，按命令行顺序）
//   --rect <sel>   {x,y,w,h,right,bottom,outL,outR,outB,vis,win,text}——元素在**窗口坐标系**里的实际几何
//                  （out* = 出窗左/右/下三向，「面板展开有没有被裁」就看它；win = 视口尺寸）
//   --text <sel>   textContent（截尾）
//   --eval <js>    自由表达式（`returnByValue` 原样回传，Promise 会 await）
//   --assert <js>  同 --eval，但要**判真假**：表达式求值结果 `=== true` → ✅；其余（false / null /
//                  对象 / 抛错）→ 🔴 且退出码 1，并把实得值打出来。所以断言表达式**只返回布尔**，
//                  细节靠多跑一条 `--eval`（或让它在 false 时 throw）。
//                  给 CI / 一键回归用——台账 §二 B-1 的路径规整就是这么卡的。
//   --keep         测完不关窗（排查用）
// 退出码：0 全通；1 出错（等不到 CDP 页面 / 页面里抛错 / 找不到必需参数）。
// ⚠️ 输出里 `win` 是页面视口尺寸——与 mockup 画布（780×570 / 卸载 720×540）对账时用它，别用窗口外框。

import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const one = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const exe = one('--exe', path.join(here, '..', 'out', 'bootstrapper.exe'));
const port = Number(one('--port', '9440'));
const settle = Number(one('--settle', '2500'));
const wait = Number(one('--wait', '240000'));
const keep = has('--keep');
const attach = has('--attach');

// 动作**按命令行顺序**执行——这条对本工具很关键：语言下拉那种「点开才露出来」的面板，
// 量法就是先 `--click` 再 `--rect`；乱序执行量到的是点开前的几何，会得出错误的「没出窗」结论。
const actions = argv.reduce((acc, a, i) => {
  const kind = { '--click': 'click', '--rect': 'rect', '--text': 'text', '--eval': 'eval', '--assert': 'assert' }[a];
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

/** 端口上已经有东西在听吗？（起窗前问一次——被占的端口会让我们读到**别人的** target） */
const portListening = (p) => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port: p });
  const done = (v) => { try { s.destroy(); } catch {} res(v); };
  s.on('connect', () => done(true));
  s.on('error', () => done(false));
  s.setTimeout(1200, () => done(false));
});

/** 壳进程退了吗（还活着 = null）。CDP 等不到时，靠它把「窗口压根没起来」与「窗口起了但端口没开」分开 */
let childExit = null;

async function pageTarget(timeoutMs) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    if (childExit !== null) {
      throw new Error(
        `起的壳自己退出了（退出码 ${childExit}）——窗口没起来，${port} 上自然没人听。\n` +
        `  排查：WebView2 运行时装了吗？壳路径对吗？（起进程本身失败会另打「起窗失败」一行）`
      );
    }
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pages = list.filter((t) => t.type === 'page' && /app\.html/.test(t.url));
      if (pages.length) return pages[pages.length - 1];   // 多个就取最新的
      last = `target 有 ${list.length} 个但都不是 app.html`;
    } catch (e) {
      // 🔴 别只留 undici 那句 "fetch failed"（它把底层 errno 藏在 cause 里）：
      //    ECONNREFUSED = 端口上没人听，与「连上了但不是我们的窗」是两回事。
      //    2026-10-02 CI 第一次跑时日志里就只有 "fetch failed"，只能靠猜。
      const c = e.cause && (e.cause.code || e.cause.message);
      last = e.message + (c ? `（${c}）` : '');
    }
    await sleep(200);
  }
  throw new Error(
    `等不到 CDP 页面（端口 ${port}，等了 ${Math.round((Date.now() - t0) / 1000)}s）：${last}\n` +
    `  排查：窗口起来了吗？端口被占？宿主是否自己设了 AdditionalBrowserArguments？\n` +
    `  壳进程：${childExit === null ? '仍在跑 ⇒ 窗口起了但端口没开（多半是宿主顶掉了那个环境变量）' : '已退出，码 ' + childExit}`
  );
}

let child = null;
let childLog = null;                                    // 宿主自己写的几行（--log= 那条），超时后打出来

/** 把宿主那几行打出来（有才打）。等不到端口时，「装载器报错」与「只是慢」在别处长得一模一样。 */
function dumpChildLog(why) {
  if (!childLog) return;
  let text = '';
  try { text = readFileSync(childLog, 'utf8').trim(); } catch { /* 没写出来 = 连宿主都没走到那 */ }
  console.log(`\n宿主日志（--log，${why}）：${text ? '\n' + text : '（空文件——宿主那几行都没走到）'}`);
}

/** 起窗（含 `--log=` 落盘）。抽出来是为了超时能杀掉重起一次——见下面 RETRIES 的注释。 */
function launch() {
  const args = [];
  if (has('--uninstall')) args.push('--uninstall');
  const q = one('--preview');
  if (q) args.push('--preview=' + q);   // ⚠️ query 必须与 --preview 同一个参数（拆开会丢，见 README 坑 4/04）
  if (!childLog) {
    childLog = path.join(os.tmpdir(), `lk-probe-${process.pid}-${Date.now()}.log`);
    try { rmSync(childLog, { force: true }); } catch { /* 清不掉就追加，无妨 */ }
  }
  args.push('--log=' + childLog);
  childExit = null;
  child = spawn(exe, args, {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: 'ignore',
  });
  child.on('error', (e) => { console.error('起窗失败：' + e.message); });
  child.on('exit', (code) => { childExit = code; });
}

try {
  if (!attach) {
    // 🔴 起窗前先探端口：占了就**当场说清是谁占的**，别硬连（硬连会在 15 秒后报一句
    //    「target 有 N 个但都不是 app.html」——那是别人的窗，误导排查方向）
    if (await portListening(port)) {
      let who = '';
      try {
        const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        who = v.Browser ? `（${v.Browser}）` : '';
      } catch { /* 不是 CDP：普通服务占着 */ }
      throw new Error(
        `端口 ${port} 已被占用${who}——那不是我们要的窗，硬连会读到别人的 target。\n` +
        `  改端口：--port <别的端口>（如 9441）；想知道是谁：netstat -ano | findstr :${port}`);
    }
    launch();
  }

  // 🔴 RETRIES = 1（共两次）：一次性 CI 机器上本脚本常是全场第一个起 WebView2 的，
  //    第一跑要把运行时捂热；超时且壳还活着 ⇒ 杀掉重起，第二跑走快路径。
  //    壳**自己退了**（childExit 非 null）不重试——那是真的起不来，重试只会重复同一封信。
  let target = null;
  for (let attempt = 0; attempt <= 1 && !target; attempt++) {
    try {
      target = await pageTarget(wait);
    } catch (err) {
      dumpChildLog(`第 ${attempt + 1} 次尝试`);
      if (attach || attempt === 1 || childExit !== null) throw err;
      console.log(`\n⚠️ 第 1 次等满 ${Math.round(wait / 1000)}s 仍无调试端口；壳还在跑 ⇒ 杀掉重起一次（冷启动兜底）。`);
      try { child.kill(); } catch { /* 已经没了更好 */ }
      await sleep(2000);
      if (await portListening(port)) throw err;          // 杀不干净就别叠加第二个窗
      launch();
    }
  }
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
    } else if (kind === 'assert') {
      // 断言动作：**只有 `=== true` 算过**（对象/字符串/undefined 一律红——避免「返回个对象就算过」的假绿）
      const got = await cdp.eval(arg);
      const pass = got === true;
      console.log(`${pass ? '✅ assert' : '🔴 assert'} : ${arg.slice(0, 90)}${arg.length > 90 ? '…' : ''}` +
        (pass ? '' : ` —— 实得 ${JSON.stringify(got)}`));
      if (!pass) process.exitCode = 1;
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
