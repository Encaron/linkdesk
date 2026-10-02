/* LinkDesk 安装器界面逻辑（件 1b：六屏状态机接线 ／ 件 1c：i18n 装载器 ／ 件 1d：卸载四帧
 *                        ／ 件 2c：版本守卫屏 · 路径行内校验 · 三路汇一关闭 · 运行中检测接线）
 * 来源：docs/04-软件更新/待抉择池/安装界面自绘/mockups/E-混合提案.html 与 E-卸载屏.html 的 <script>（直搬改造）
 * 拆掉的：设计注记/演示控制的写入（.cap/.note/「重新播放」/「演示：失败分支」/enUI 文案补丁）、
 *         9 秒假进度、写死的语言数组、badge() 里按下拉文字判语言的做法（改用 1c 的 t()）
 * 接上的：宿主消息桥（拖窗/关闭/件2 的安装动作）、Enter=主按钮、语言下拉（清单 = 宿主扫描 i18n/ 目录）
 * 件 2 接手点：ACTIONS.install / uninstall 后的真 IO 与进度回调（setProgress）、setInstallDir/setVersion/
 *             setError/setUninstallInfo、set-lang 的注册表持久化（HKCU\Software\LinkDesk\Installer → Language
 *             写侧）、运行时真值的本地化（onLangChange 钩子）
 * 件 2c 已落：close-request 单入口分流、version-guard 确认屏、dir-invalid 行内错、uninstall-* 检测/超时；
 *             **卸载的真清理（帧 3 进度 / 帧 4 徽章真值）仍归 2d**——这里只把进程检测与关窗接活。
 */
(function () {
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const q = new URLSearchParams(location.search);

/* ── 模式（件 1d）：同一个壳、同一个入口，宿主 --uninstall 时挂 ?mode=uninstall ────────
 * 两套屏同页共存，因此有一条硬约束：**安装屏与卸载屏的 id 不能重名**。冲突的四个
 * （s-progress/s-finish 与 ph/pn/fill/p1..p4）在卸载侧改名 s-un- 前缀 / u 前缀，CSS 侧用 .scr.un /
 * html[data-mode=uninstall] 双限定——1b 已验收的安装屏规则一个字不动（见 06-任务清单 1d ⚠️）。 */
const MODE = q.get('mode') === 'uninstall' ? 'uninstall' : 'install';
document.documentElement.dataset.mode = MODE;

/* ── 宿主桥（WebView2）——浏览器里预览时不存在，退化为空实现 ─────────────── */
const webview = (window.chrome && window.chrome.webview) || null;
function post(msg) { if (webview) webview.postMessage(JSON.stringify(msg)); }

/* ── 确定性随机（?seed=1）────────────────────────────────────────────────
 * 对照截图（mockup vs 实机）两侧用同一序列，微尘/彩粒落点才可比。
 * ⚠️ 取数顺序必须与 mockup 逐字一致：左 → 时长 → 延迟 → 透明度；彩粒同（角度/距离/旋转/时长/延迟） */
let rnd = Math.random;
if (q.get('seed')) {
  let s = 0x9E3779B9;
  rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ── 微尘粒子（常驻；与 mockup 同取数顺序：左 → 时长 → 延迟 → 透明度）
 * 卸载屏调淡调少（10 粒 / 10–20s / .08 档起 / 升幅 560px）——E-卸载屏 直搬 */
(function dust() {
  const un = MODE === 'uninstall', box = $('#dust');
  for (let i = 0, n = un ? 10 : 14; i < n; i++) {
    const d = document.createElement('i');
    d.style.left = rnd() * 100 + '%';
    d.style.animationDuration = ((un ? 10 : 9) + rnd() * 10) + 's';
    d.style.animationDelay = (-rnd() * 15) + 's';
    d.style.opacity = (un ? .08 : .12) + rnd() * (un ? .18 : .25);
    if (un) d.style.animationName = 'rise-un';
    box.appendChild(d);
  }
})();

/* ── 屏幕状态机（类名/ID 与 mockup 一致 = 规格；两套屏按模式分流）────────── */
const SCREENS = {
  install: ['uac', 'home', 'progress', 'finish', 'error', 'version'],
  uninstall: ['confirm', 'running', 'un-progress', 'un-finish']
};
let cur = null;
/* 件 2c：install-start 已发出、宿主还没回话的那一小段——挡住二次提交（连点两下「立即安装」）。
   每一次宿主的回话（progress / install-error / version-guard / dir-invalid / canceled / done）都解除它。 */
let starting = false;

/* 件 2d 验收缝（?autocancel=<pct>，缺省 5）：进度爬到该读数就点一次「取消安装」。
   取「已解压若干文件」的点，不是第一条进度——pct=0 时盘上还什么都没有，那样测不出回滚
   （「删了个空目录」也算通过，是假绿）。与 autoinstall 同规：走的是页面真动作（ACTIONS.cancel），
   产品运行不带此参数。解压一完就过了宿主的提交点、取消不再受理 ⇒ 这个缝只在解压段有效。 */
const AUTOCANCEL = (function () {
  const v = q.get('autocancel');
  if (v === null) return -1;
  const n = parseInt(v, 10);
  return (!isFinite(n) || n <= 1) ? 5 : Math.min(n, 60);   // ?autocancel=1 ⇒ 默认 5%
})();
let autocancelArmed = AUTOCANCEL > 0;

function go(id) {
  if (SCREENS[MODE].indexOf(id) < 0) return;
  cur = id;
  $$('.scr').forEach(function (s) { s.classList.remove('on'); });
  $('#s-' + id).classList.add('on');
  // 卸载进度屏 ✕ 置灰（E-卸载屏 设计点③：点了卸载就走完——可取消的清理反而不干净）
  $('#xbtn').disabled = MODE === 'uninstall' && id === 'un-progress';
  if (id === 'finish') burst();          // 彩粒迸发只在进完成屏时打一次
  if (id === 'un-finish') badge();       // 数据去留徽章按「保留我的数据」勾选态落一次（绿/黄）
}

/* 自定义展开区（home 的子状态，不是独立屏）——按钮文案随展开态换 key，文本由 1c 的 t() 渲染 */
function setCustom(open) {
  $('#custom').classList.toggle('open', !!open);
  $('#custtoggle').dataset.i18n = open ? 'installer.collapse' : 'installer.customize';
  applyI18n($('#custtoggle'));
}

/* ── 四段进度（数值/分段语义照 mockup；真数据由件 2 的 IO 回调喂）──────────
 * 段头文案走 t()（1c）：切语言时 refreshHead() 按当前分段重渲染。
 * 两套进度屏的取数口径不同（id 前缀 / 段头 key / 分段阈值）——安装 70·80·92，卸载 60·80·92（直搬） */
const HEAD_KEYS = ['', 'installer.progress.head1', 'installer.progress.head2',
                   'installer.progress.head3', 'installer.progress.head4'];
const UN_HEAD_KEYS = ['', 'installer.uninstall.progress.head1', 'installer.uninstall.progress.head2',
                      'installer.uninstall.progress.head3', 'installer.uninstall.progress.head4'];
const PROG = {
  install: { keys: HEAD_KEYS, ph: '#ph', pn: '#pn', fill: '#fill', li: '#p', track: '#track',
             seg: function (p) { return p < 70 ? 1 : p < 80 ? 2 : p < 92 ? 3 : 4; } },
  uninstall: { keys: UN_HEAD_KEYS, ph: '#uph', pn: '#upn', fill: '#ufill', li: '#u', track: '#utrack',
               seg: function (p) { return p < 60 ? 1 : p < 80 ? 2 : p < 92 ? 3 : 4; } }
};
let lastPct = 0;

/* opt.force=true 用于重置/预览（否则数值只前进不倒退——规格 05 §3.3） */
function setProgress(p, opt) {
  opt = opt || {};
  const g = PROG[MODE];
  p = Math.max(0, Math.min(100, +p || 0));
  if (!opt.force && p < lastPct) p = lastPct;
  lastPct = p;
  $(g.pn).textContent = Math.floor(p);
  $(g.fill).style.width = p + '%';
  const s = opt.step || g.seg(p);
  for (let i = 1; i <= 4; i++) $(g.li + i).className = i < s ? 'done' : i === s ? 'run' : '';
  $(g.ph).textContent = t(g.keys[s]);
  /* 3d #9：解压完成（＝宿主提交点，段 2 起）不再受理取消 ⇒ 按同一段号把按钮置灰。
     段 1 照旧可取消；只有安装侧有这颗按钮（[data-action=cancel]；卸载的 un-cancel 不吃这条选择器）。
     resetProgress() 会再走一遍本函数（s=1）⇒ 新一轮安装自动恢复可用。 */
  const cbtn = $('[data-action=cancel]');
  if (cbtn) cbtn.disabled = (s >= 2);
  $(g.track).setAttribute('aria-valuenow', String(Math.floor(p)));   // 进度条 ARIA（对账表）
}

function resetProgress() { lastPct = 0; setProgress(0, { force: true }); }
function refreshHead() { setProgress(lastPct, { force: true }); }   // 换语言后刷段头（数值不变，纯文案）

/* ── 完成彩粒（D 提案单点混搭；取数顺序同 mockup，配色按亮色底）────────── */
function burst() {
  const box = $('#confetti');
  box.innerHTML = '';
  const cols = ['#8a6ff0', '#2fbf8a', '#e8b04b', '#f2f4ef', '#5a4bd1'];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('i');
    const ang = rnd() * Math.PI * 2, d = 90 + rnd() * 220;
    c.style.setProperty('--dx', Math.cos(ang) * d + 'px');
    c.style.setProperty('--dy', Math.sin(ang) * d - 80 + 'px');
    c.style.setProperty('--rot', (rnd() * 720 - 360) + 'deg');
    c.style.left = '50%'; c.style.top = '34%';
    c.style.background = cols[i % cols.length];
    c.style.animation = 'burst ' + (.9 + rnd() * .7) + 's ' + (rnd() * .15) + 's cubic-bezier(.16,1,.3,1) forwards';
    box.appendChild(c);
  }
}

/* ── 件 2 数据入口（真值都从这里进，别在别处硬编码）───────────────────── */
function setInstallDir(dir) {
  if (!dir) return;
  $('[data-role=path]').value = dir;
  $('#finish-path').textContent = dir;
  clearPathErr();     // 值被换成合法的了（浏览对话框 / 宿主的 dir=），上一句判词即刻作废
}
function setVersion(v) { if (v) $('#ver').textContent = 'v' + v; }
function setError(code, msg) {
  if (code) $('#errcode').textContent = code;
  if (msg) {
    const sub = $('[data-i18n="installer.error.sub"]');
    sub.dataset.i18nLive = '1';   // 真值上屏后不再被静态词条盖回（件 2 的失败文案本地化归 2c）
    sub.textContent = msg;
  }
  go('error');
}
function readOpts() {
  const o = {};
  $$('[data-opt]').forEach(function (el) { o[el.dataset.opt] = el.checked; });
  return o;
}

/* ── 件 2c · 安装路径的行内校验 ────────────────────────────────────────────
 * 分成两半，各判各判得动的：
 *   · **语法**（这里）—— 空 / 非法字符 / 过长 / 盘根 / 不是绝对路径。当场出结果，不必等往返。
 *   · **能不能落地**（宿主 ValidateInstallDir）—— 建目录 ＋ 真写一个探针文件；失败回 `dir-invalid`。
 * 判据刻意取窄：只收「一定装不进去」的，拿不准的一律放行——**宁可不拦，不许误拦**
 * （与版本守卫同一条口径；宽判会把 D:\Apps 这种好路径也拦掉）。 */
const WIN_BAD_CHARS = /[<>"|?*\x00-\x1f]/;
function pathSyntaxError(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 'empty';
  if (s.length >= 248) return 'length';                  // 与宿主 MAX_PATH-12 同口径
  // 🔴 2026-10-02 B-1（台账 §二）：**盘根不再报错**——normalizeInstallDir 会先给它补一层
  // `\linkdesk`（`D:\` ⇒ `D:\linkdesk`），所以这一支已不可达、整条撤掉。
  // 宿主的 root 判（main.cpp ValidateInstallDir）**保留**：它只剩 `--dir=D:\` 这种精确指定一条路。
  // （i18n 的 `installer.path.err.root` 词条**不删**——宿主的 dir-invalid reason=root 仍可能从那条路回来。）
  if (/^\\\\/.test(s)) return WIN_BAD_CHARS.test(s) ? 'chars' : '';         // UNC \\server\share 放行
  if (WIN_BAD_CHARS.test(s)) return 'chars';
  if (!/^[a-zA-Z]:[\\/]/.test(s)) return 'absolute';     // 相对路径会装到安装器的工作目录里
  return '';
}
/* ── B-1（台账 §二 · 2026-10-02 用户拍板）：选中夹子后自动追加一层 `\linkdesk` ──────────
 * 口径：用户**亲手给**的目录，最后一段不是 `linkdesk`（不分大小写）就补一层 ⇒ 再也不会混装
 * （选 `D:\` 得到 `D:\linkdesk`；卸载那条"整树递归删"也从隐患变成安全）。
 * 🔴 规矩一：**只规整「用户亲手给的」**——浏览对话框选完 / 手输后失焦 / 点安装时各一次。
 *    从别处来的目录**一律不碰**：ARP 反推的旧目录（覆盖装必须落回同一处，改了＝另装一份）、
 *    宿主 `?dir=` 注入的默认值、`--silent` 走的 DefaultInstallDir()。
 *    ⇒ 所以**不放进 setInstallDir**（那里同时收宿主注入的值，一放进去就把升级链写坏）。
 * 🔴 规矩二：**输入框显示的永远是最终落点** ⇒ 三个调用点一律"先规整、再上屏/再提交"，
 *    于是"输入框 = 完成屏 #finish-path = 7zr 实际 -o 目标"三者仍然同源。
 * 🔴 规矩三：`--dir=` 仍是**精确指定、不补层**（宿主侧一字不动）⇒ 既有测试一条都不用改。
 * 幂等：已经是 linkdesk 层的原样返回，反复调用不会越补越深。 */
function normalizeInstallDir(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return s;                                      // 空：交给 pathSyntaxError 报 empty
  const sep = s.indexOf('\\') >= 0 ? '\\' : '/';         // 习惯写正斜杠的用户不给他改成反斜杠
  while (s.length > 1 && (s.slice(-1) === '\\' || s.slice(-1) === '/')) s = s.slice(0, -1);
  if (/^[a-zA-Z]:$/.test(s)) return s + '\\linkdesk';    // 只剩盘符（`D:` / `D:\`）：补固定反斜杠
  if (/^[\\/]+$/.test(s)) return s;                      // 怪输入不猜（只有分隔符），留给语法闸
  if (!/^[a-zA-Z]:[\\/]/.test(s) && !/^\\\\/.test(s)) return s;  // 相对路径/怪串：不规整，语法闸会拦
  const parts = s.split(/[\\/]+/);
  const last = parts[parts.length - 1] || '';
  if (last.toLowerCase() === 'linkdesk') return s;       // 幂等：已经是它自己那层
  return s + sep + 'linkdesk';                           // `\\server\share` 也走这条 ⇒ 追加，不是替换
}
const PATH_ERR_KEY = {
  empty: 'installer.path.err.empty', chars: 'installer.path.err.chars',
  length: 'installer.path.err.length', root: 'installer.path.err.root',
  absolute: 'installer.path.err.absolute', write: 'installer.path.err.write'
};
/* 就近显示在输入框正下方；文字才是判据（只染边框等于只有视觉通道，读屏听不到）。
   #patherr 是 role=alert —— 写进去即播报，不需要额外 announce。 */
function showPathErr(reason) {
  const el = $('#patherr');
  if (!el) return;
  el.textContent = t(PATH_ERR_KEY[reason] || PATH_ERR_KEY.write);
  el.hidden = false;
  $('[data-role=path]').classList.add('bad');
}
function clearPathErr() {
  const el = $('#patherr');
  if (!el || el.hidden) return;
  el.hidden = true;
  el.textContent = '';
  $('[data-role=path]').classList.remove('bad');
}

/* ── 件 2c · 版本守卫屏 ────────────────────────────────────────────────────
 * 宿主的 VersionGuard 结论（同版 / 降级）由 version-guard 消息送进来，复用失败屏骨架问一句，
 * **默认答案是「退出安装」**（主按钮 = Enter；与 NSIS 版 MB_DEFBUTTON2 = 否 同一条）。
 * 文案带变量 ⇒ 走 t(key, vars)；kind 留一份，切语言时按当前语言重渲染（同段头那套做法）。 */
let verInfo = null;
function renderVersion() {
  if (!verInfo) return;
  const same = verInfo.kind === 'same', v = same ? 'same' : 'older';
  $('#ver-title').textContent = t('installer.version.title.' + v);
  $('#ver-sub').textContent = t('installer.version.body.' + v, same
      ? { version: verInfo.from }
      : { installed: verInfo.from, incoming: verInfo.to });
  // 版本对是纯标识符，不翻译：同版只写一个，降级写「已装 → 本包」
  $('#ver-code').textContent = same ? verInfo.from
      : (verInfo.from && verInfo.to ? verInfo.from + '  →  ' + verInfo.to : '');
}
function showVersionGuard(kind, from, to) {
  verInfo = { kind: kind === 'same' ? 'same' : 'older', from: from || '', to: to || '' };
  renderVersion();
  go('version');
}

/* 起装的**唯一入口**（按钮 / 守卫屏「仍要安装」/ 预览自动装都走它）：
   语法预检 → 置防重位 → 进进度屏 → 发 install-start。 */
function beginInstall(allowOlder) {
  if (starting) return;
  const inp = $('[data-role=path]');
  // B-1：点安装时**再规整一次**——前两个调用点可能都被跳过（粘贴完直接点按钮、或键盘回车）
  inp.value = normalizeInstallDir(inp.value);
  const bad = pathSyntaxError(inp.value);
  if (bad) { setCustom(true); go('home'); showPathErr(bad); return; }
  clearPathErr();
  starting = true;
  setCustom(false);
  go('progress');
  resetProgress();
  post({ type: 'install-start', dir: inp.value, opts: readOpts(), allowOlder: !!allowOlder });
}

/* 输入框的两条事件（UX 规则「输入时/离焦判，不要只在提交时才报」）：
   input = 边打边撤销上一次判词（别让人打到一半就被红字追着）；blur = 那时候才判、才播报。 */
(function wirePathInput() {
  const inp = $('[data-role=path]');
  if (!inp) return;
  inp.addEventListener('input', clearPathErr);
  inp.addEventListener('blur', function () {
    // B-1：**用户亲手敲的** ⇒ 失焦就规整并上屏（先让他看见"到底会装到哪"），再判语法
    const norm = normalizeInstallDir(inp.value);
    if (norm !== inp.value) inp.value = norm;
    const bad = pathSyntaxError(inp.value);
    if (bad) showPathErr(bad); else clearPathErr();
  });
})();

/* 件 2d：勾回「保留我的数据」⇒ 收起并重置二次确认块 */
$('#keepdata').addEventListener('change', paintDelConfirm);

/* ── 卸载真值（2d 从宿主喂：安装位置 / 体积 / userData 路径）───────────────
 * 这里的占位值 = E-卸载屏 mockup 原文（用户名的真实路径由 2d 的宿主提供）。
 * ⚠️ confirm 的「安装位置」与完成屏的「用户数据」两条词条带 {path}/{size} 变量，
 *    静态 data-i18n 补丁填不了变量 → 走 t(key, vars) 并挂 data-i18n-live（同 setError 口径）。 */
const UNINFO = {
  // 🔴 台账 §三 #2 / §五 C（2026-10-02 用户拍板）：出厂件里**不许**再出现开发机路径
  // （原先这两条写的是 `C:\Users\fengy\…`）。这两值是"宿主还没喂真值"时的兜底显示，
  // 一律用**可展开的标准位文案**：万一本该覆盖它的注入没生效，用户看到的是"该装在哪"，
  // 不是"别人机器上装在哪"。
  dir: '%LocalAppData%\\Programs\\linkdesk',
  size: '420 MB',
  userData: '%APPDATA%\\linkdesk'   // 🔴 小写——Electron 取 package.json 的 name（2d 实测口径）
};
/* 行内二次确认（件 2d）：勾掉「保留我的数据」后点「卸载」⇒ 露这块；勾上「我确认删除」才放行。 */
function keepDeleteAgreed() { return $('#keepdata').checked || $('#delagree').checked; }
function paintDelConfirm() {
  const box = $('#delconfirm');
  if (!box) return;
  const want = !$('#keepdata').checked;
  if (!want) {                    // 勾回「保留」⇒ 收起并清掉确认勾（下次要重新确认）
    box.hidden = true;
    $('#delagree').checked = false;
  }
}
function paintUninstall() {
  if (MODE !== 'uninstall') return;
  const sub = $('[data-i18n="installer.uninstall.confirm.sub"]');
  sub.dataset.i18nLive = '1';   // 真值上屏后不再被静态词条盖回
  sub.innerHTML = t('installer.uninstall.confirm.sub', { path: esc(UNINFO.dir), size: esc(UNINFO.size) });
  badge();
}
/* 数据去留徽章：勾了保留=绿、没勾=黄（如实呈现，不玩文案花招） */
function badge() {
  const el = $('#datbadge');
  if (!el) return;
  const kept = $('#keepdata').checked;
  el.className = 'datbadge' + (kept ? '' : ' gone');
  el.textContent = kept ? t('installer.uninstall.finish.kept', { path: UNINFO.userData })
                        : t('installer.uninstall.finish.gone');
}
function setUninstallInfo(info) {
  if (!info) return;
  ['dir', 'size', 'userData'].forEach(function (k) { if (info[k]) UNINFO[k] = info[k]; });
  paintUninstall();
}

/* ── 动作表（与 markup 的 data-action 一一对应）────────────────────────── */
const ACTIONS = {
  install: function () { beginInstall(false); },
  'toggle-custom': function () { setCustom(!$('#custom').classList.contains('open')); },
  browse: function () { post({ type: 'browse-dir', dir: $('[data-role=path]').value }); },  // 目录对话框在宿主（2b）
  cancel: function () { cancelInstall(); },
  retry: function () { clearPathErr(); setCustom(true); go('home'); },   // 02 §三：换位置直接回自定义展开屏
  exit: function () { post({ type: 'exit' }); },         // 失败屏出口
  done: function () { post({ type: 'install-done', launch: $('#runnow').checked }); },
  license: function () { post({ type: 'open-license' }); },  // 宿主已受理（main.cpp kLicenseUrl → 仓库根 LICENSE；台账 §五 A）
  close: function () { closeByStage(); },
  /* 版本守卫屏（件 2c）：默认出口 = 退出（主按钮 / Enter），「仍要安装」降为幽灵按钮，点了才带
     allowOlder 重发一次 install-start（宿主凭这一位跳过守卫）。 */
  'ver-exit': function () { post({ type: 'close' }); },
  'ver-proceed': function () { beginInstall(true); },

  /* ── 卸载（件 1d 静态 UI；清理逻辑/进程检测 2c-2d 已接）───── */
  uninstall: function () {
    // 件 2d · 行内二次确认：勾掉「保留我的数据」⇒ 必须先勾「我确认删除」才放行
    //（删 userData 不可逆；确认块就地露出来，不打扰想保留数据的人）
    if (!keepDeleteAgreed()) { $('#delconfirm').hidden = false; return; }
    // 检测归宿主（查进程表）——本屏先按住不发话：
    //   在跑 ⇒ 回 uninstall-running（停帧 2 问一句）／没在跑 ⇒ 回 uninstall-norun（直接推帧 3）
    // **不静默杀进程**（02 §三）；宿主侧见 main.cpp 的 IsAppRunning / RequestAppClose。
    post({ type: 'uninstall-start', keep: $('#keepdata').checked });
  },
  'un-continue': function () {
    resetProgress();
    go('un-progress');
    post({ type: 'uninstall-run', keep: $('#keepdata').checked });   // 优雅关（WM_CLOSE）→ 2d 逐条清理
  },
  'un-later': function () { go('confirm'); },                        // 原路返回，什么都没动
  'un-cancel': function () { post({ type: 'close' }); },             // 无任何写入直接退
  'un-done': function () { post({ type: 'uninstall-done' }); }       // 卸载器退出（自删归 2d）
};

function cancelInstall() {
  post({ type: 'cancel' });        // 2c：回滚已解压文件
  starting = false;
  resetProgress();
  go('home');
}
/* ✕ / Esc / Alt+F4 三路汇此，按阶段分流（规格 05 §4.3）。
   件 2c：三路已全部汇到这一个函数——宿主 WM_CLOSE → close-request → 这里；Esc 与 ✕ 直接调它。 */
function closeByStage() {
  if (MODE === 'uninstall') {
    // 卸载进度中：✕ 置灰吞掉（go() 已 disabled），Esc/Alt+F4 走到这里也一律不响应——
    // 点了卸载就走完（E-卸载屏 设计点③：可取消的清理反而不干净）。
    if (cur === 'un-progress') return;
    post({ type: 'close' });   // 确认/运行中=未写入任何内容；完成=等价完成——都是直接退
    return;
  }
  if (cur === 'progress') { cancelInstall(); return; }
  if (cur === 'finish') { post({ type: 'install-done', launch: $('#runnow').checked }); return; }
  // 主屏 / 失败屏 / 版本守卫屏：守卫屏一个字节都还没写，关窗 = 等同于退出安装
  post({ type: 'close' });
}

/* ── 宿主 → 页面（件 2a）：安装在宿主进程里真跑，进度/成败由宿主回报 ─────────
 * 宿主侧见 main.cpp 的 WM_LK_* → PostJson；这条路只走 ICoreWebView2::PostWebMessageAsJson。 */
function onHostMessage(ev) {
  let m = ev && ev.data;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
  if (!m || !m.type) return;
  if (m.type === 'progress') {
    starting = false;   // 宿主开始干活了 ⇒ 解除防重位
    // 件 2d 验收缝：解压段爬到阈值就取消（只发一次；见上面 AUTOCANCEL 的注）
    if (autocancelArmed && typeof m.pct === 'number' && m.pct >= AUTOCANCEL) {
      autocancelArmed = false;
      cancelInstall();
      return;
    }
    // 只前进不倒退：宿主已保证单调，这里再兜一道（IO 抖动 / 迟到消息）
    if (typeof m.pct === 'number' && m.pct > lastPct) setProgress(m.pct);
    return;
  }
  if (m.type === 'install-error') { starting = false; setError(m.code || '', m.msg || ''); return; }   // setError 内含 go('error')
  if (m.type === 'install-canceled') {   // 件 2d：回滚的结果决定「静默回主屏」还是「要说清楚」
    starting = false; resetProgress();
    // removed = 目录是我们这次建的/本来空的，已连目录一起删净 ⇒ 装前什么样就是什么样，静默回主屏；
    // kept    = 装前目录里就有旧版（覆盖装），整树删会误伤旧装，故原样保留 —— **不能装作无事发生**：
    //           复用失败屏如实交代「原目录已保留、本次解压的文件可能覆盖了其中一部分」，并给出重装出口。
    if (m.rollback === 'kept') { setError('CANCEL_KEPT', t('installer.cancel.kept')); return; }
    go('home'); return;
  }
  if (m.type === 'install-done') { starting = false; setProgress(100, { force: true }); go('finish'); return; }
  // 件 2b：宿主选完目录回填。B-1：这是**用户亲手选的** ⇒ 先规整再上屏（输入框＝最终落点）
  if (m.type === 'browse-dir-done') { setInstallDir(normalizeInstallDir(m.dir)); return; }
  /* ── 件 2c ────────────────────────────────────────────────────────────── */
  if (m.type === 'close-request') { closeByStage(); return; }   // Alt+F4 / 任务栏关闭 → 按当前屏分流
  if (m.type === 'version-guard') {                             // 同版/降级：换确认屏，默认答案是退出
    starting = false;
    showVersionGuard(m.kind, m.installed, m.incoming);
    return;
  }
  if (m.type === 'dir-invalid') {                               // 路径写不进去（宿主真试过）
    starting = false;
    setCustom(true);
    go('home');
    showPathErr(m.reason);
    return;
  }
  if (m.type === 'uninstall-running') {
    $('#unwarn').hidden = true;
    go('running');
    // 2c 验收缝（同 ?autoinstall=1 口径：走的是页面真动作，不是宿主短路）
    if (q.get('autocontinue') === '1') setTimeout(function () { ACTIONS['un-continue'](); }, 200);
    return;
  }
  if (m.type === 'uninstall-norun') {          // 没在跑：不必问，直接进帧 3（宿主随即进清理）
    resetProgress();
    go('un-progress');
    post({ type: 'uninstall-run', keep: $('#keepdata').checked });
    return;
  }
  if (m.type === 'uninstall-closed') {         // 它自己退干净了：清掉超时提示，宿主随即开真清理
    $('#unwarn').hidden = true;
    return;
  }
  if (m.type === 'uninstall-finished') {       // 件 2d：清理走完 ⇒ 完成屏（徽章按勾选态如实落）
    setProgress(100, { force: true });
    go('un-finish');
    return;
  }
  if (m.type === 'uninstall-close-timeout') {  // 10s 没等到（多半卡在保存对话上）——如实说，退回帧 2
    $('#unwarn').hidden = false;
    go('running');
    return;
  }
}
if (window.chrome && window.chrome.webview) {
  window.chrome.webview.addEventListener('message', onHostMessage);
}

document.addEventListener('click', function (e) {
  const el = e.target.closest ? e.target.closest('[data-action]') : null;
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn();
});

/* ── 无边框窗拖拽区（brand 行 / 各屏空白区；控件一律排除）────────────────
 * 宿主收到 {"type":"drag"} → ReleaseCapture + WM_NCLBUTTONDOWN(HTCAPTION) */
const NO_DRAG = 'button,input,label,a,select,textarea,#lkdd,.xbtn,.plist,.opts,.actions,.prow,.pathrow,.runrow';
document.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  const el = e.target;
  if (!el || !el.closest) return;
  if (el.closest(NO_DRAG)) return;
  const zone = el.closest('[data-drag]') || (el.classList.contains('scr') ? el : null);
  if (!zone) return;
  e.preventDefault();
  post({ type: 'drag' });
});

/* ── 键盘：Enter = 当前屏主按钮（控件自身处理时不抢）／Esc = 收下拉，否则按屏分流 ──── */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    // 件 2c：Esc 是「三路汇一」的第三路。弹层开着时先收弹层（Esc 的通用语义），
    // 没收的就按当前屏分流——和 ✕ / Alt+F4 走同一个 closeByStage。
    if ($('#lkdd').classList.contains('open')) { openDd(false); return; }
    closeByStage();
    return;
  }
  if (e.key !== 'Enter' || e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (t && t.closest && t.closest('button,a,input,label,select,textarea')) return;
  const primary = $('.scr.on [data-primary]');
  if (primary) { e.preventDefault(); primary.click(); }
});

/* ── 1c i18n 装载器（规格 05 §3.4 / 01 §五）─────────────────────────────
 * 语言清单 = 宿主扫描 i18n/ 目录后经 ?langs= 注入（加语言 = 加文件，零代码改动）；
 * 词条 = fetch 同目录 <code>.json（虚拟主机 installer.local → exe 所在目录；件 3 改内嵌资源也不动这里）；
 * t() 回落链 = 当前语言 → zh-CN → 标记原文 → key 名（开发期漏翻立刻可见）；
 * 持久化读写归件 2（此处只消费 ?lang=、切换时只发 set-lang，不碰注册表）。 */
const DEFAULT_LANG = 'zh-CN';
const LANGS = [];                       // [{code,label}]——顺序 = 宿主注入顺序（zh-CN 打头）
const DICTS = Object.create(null);
let lang = DEFAULT_LANG;
let i18nState = 'loading';              // loading | ready | failed

/* 标记里的中文原文＝最后一道兜底：首帧抓一次，之后任何补丁都不回写它。
   🔴 只在 body 内扫：<html> 自己也会挂标记（首帧隐藏用的 data-i18n-pending），把 <html> 当词条元素
   会让 applyI18n 把整份文档的 innerHTML 换成「pending」——整页 DOM 没了（C2/C4 实测） */
const AUTHORED = Object.create(null);
$$('[data-i18n]', document.body).forEach(function (el) { AUTHORED[el.dataset.i18n] = el.innerHTML; });
/* 段头是状态相关文案，标记里没有挂点（#ph 无 data-i18n）——中文原稿也登记进兜底层，
   否则词条目录整个缺失时会退到 key 名（C5 实测：段头显示 installer.progress.head1）
   ⚠️ 与 i18n/zh-CN.json 的 installer.progress.head* 逐字一致（改词条时同笔改这里） */
[['installer.progress.head1', 'STEP 1 / 4 · 正在解压文件'],
 ['installer.progress.head2', 'STEP 2 / 4 · 注册文件关联'],
 ['installer.progress.head3', 'STEP 3 / 4 · 写系统项'],
 ['installer.progress.head4', 'STEP 4 / 4 · 收尾校验']].forEach(function (p) { AUTHORED[p[0]] = p[1]; });
/* 卸载段头同规（E-卸载屏 mockup 原文；#uph 同样没有标记挂点）
   ⚠️ 与 i18n/zh-CN.json 的 installer.uninstall.progress.head* 逐字一致（改词条时同笔改这里） */
[['installer.uninstall.progress.head1', 'STEP 1 / 4 · 正在移除程序文件'],
 ['installer.uninstall.progress.head2', 'STEP 2 / 4 · 清理系统项'],
 ['installer.uninstall.progress.head3', 'STEP 3 / 4 · 恢复 PATH'],
 ['installer.uninstall.progress.head4', 'STEP 4 / 4 · 收尾校验']].forEach(function (p) { AUTHORED[p[0]] = p[1]; });
/* 件 2c：版本守卫屏的标题/正文与路径行内错**标记里没有挂点**（都是 app.js 填的），
   同样登记进兜底层——词条目录整个缺失时也该看到中文，而不是 key 名。
   ⚠️ 与 i18n/zh-CN.json 的 installer.version.* / installer.path.err.* 逐字一致（改词条时同笔改这里） */
[['installer.version.title.same', '已安装相同版本。'],
 ['installer.version.title.older', '已装的是更新的版本。'],
 ['installer.version.body.same', '这个安装包是同一个版本（{version}）。重新装一遍会覆盖现有文件——设置与数据不受影响。'],
 ['installer.version.body.older', '本机装着 {installed}，而这个安装包是更旧的 {incoming}。装下去会把新版本换成旧版本。'],
 ['installer.path.err.empty', '请填写安装位置。'],
 ['installer.path.err.chars', '路径里含 Windows 不允许的字符（< > " | ? *）。'],
 ['installer.path.err.length', '路径太长，请换一个更短的位置。'],
 ['installer.path.err.root', '请装在一个文件夹里，不要直接选整个盘。'],
 ['installer.path.err.absolute', '请填写完整路径（含盘符，例如 C:\\Apps\\LinkDesk）。'],
 ['installer.path.err.write', '这个位置写不进去（没有权限，或路径被占用）。换个位置再试。']].forEach(function (p) { AUTHORED[p[0]] = p[1]; });

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function t(key, vars) {
  if (!key) return '';
  const d = DICTS[lang] || {}, z = DICTS[DEFAULT_LANG] || {};
  let s = d[key] !== undefined ? d[key]
        : z[key] !== undefined ? z[key]
        : AUTHORED[key] !== undefined ? AUTHORED[key] : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
  return s;
}

function i18nTargets(sel, root) {
  const out = $$(sel, root);
  if (root && root.nodeType === 1 && root.matches && root.matches(sel)) out.unshift(root);
  return out;
}
/* 文案补丁：data-i18n → innerHTML（词条可含 <em>/<span class="cir">/<a>，与 mockup 的补丁同规）
   data-i18n-aria → aria-label；data-i18n-live = 运行时真值已接管，别用静态词条盖回去 */
function applyI18n(root) {
  // 范围默认锁在 body：<html> 上的标记不是文案挂点（见 AUTHORED 处的说明）
  i18nTargets('[data-i18n]', root || document.body).forEach(function (el) {
    if (!root && el.hasAttribute('data-i18n-live')) return;
    el.innerHTML = t(el.dataset.i18n);
  });
  i18nTargets('[data-i18n-aria]', root || document.body).forEach(function (el) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

/* 清单与词条：一个语言一个文件，坏掉的单个语言不拖垮整张清单 */
function loadI18n() {
  const codes = (q.get('langs') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (codes.indexOf(DEFAULT_LANG) < 0) codes.unshift(DEFAULT_LANG);
  const want = (q.get('lang') || '').trim();
  lang = codes.indexOf(want) >= 0 ? want : DEFAULT_LANG;
  const fetches = typeof fetch === 'function' ? codes.map(function (c) {
    return fetch('i18n/' + encodeURIComponent(c) + '.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { return { code: c, dict: j }; })
      .catch(function () { return null; });
  }) : [];
  return Promise.all(fetches).then(function (list) {
    list.forEach(function (it) {
      if (!it || !it.dict) return;
      DICTS[it.code] = it.dict;
      LANGS.push({ code: it.code, label: (it.dict._meta && it.dict._meta.label) || it.code });
    });
    i18nState = DICTS[DEFAULT_LANG] ? 'ready' : 'failed';
  });
}

function openDd(open) {
  $('#lkdd').classList.toggle('open', !!open);
  $('#lkdd-btn').setAttribute('aria-expanded', String(!!open));
}
function buildLangs() {
  const pop = $('#lkdd-pop');
  pop.innerHTML = LANGS.map(function (l) {
    return '<button type="button" class="it' + (l.code === lang ? ' on' : '') + '" role="option" data-code="' + esc(l.code) +
      '" aria-selected="' + (l.code === lang) + '">' +
      '<svg class="ck" viewBox="0 0 14 14" fill="none" stroke-width="2" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>' +
      '<span>' + esc(l.label) + '</span></button>';
  }).join('');
  const sel = LANGS.filter(function (l) { return l.code === lang; })[0] || LANGS[0];
  if (sel) $('#lkdd-cur').textContent = sel.label;
}
function selectLang(code) {
  if (!LANGS.some(function (l) { return l.code === code; })) return;
  lang = code;
  document.documentElement.lang = code;
  document.documentElement.dataset.lang = code;
  $$('#lkdd-pop .it').forEach(function (it) {
    const on = it.dataset.code === code;
    it.classList.toggle('on', on);
    it.setAttribute('aria-selected', String(on));
  });
  const sel = LANGS.filter(function (l) { return l.code === code; })[0];
  if (sel) $('#lkdd-cur').textContent = sel.label;
  applyI18n();     // 整页重渲染（静态词条）
  refreshHead();   // 进度段头是状态相关文案，单独刷
  onLangChange(code);
  post({ type: 'set-lang', lang: code });   // 持久化写注册表归件 2b
}
function onLangChange(/* code */) {
  paintUninstall();   // 卸载侧带 {path}/{size} 的真值文案随语言重渲染（静态补丁填不了变量）
  if (cur === 'version') renderVersion();   // 件 2c：守卫屏整屏都是运行时文案（无 data-i18n 挂点）
  /* 件 2：运行时真值（错误码文案 / 路径 / 版本）的本地化挂这里 */
}

$('#lkdd-btn').addEventListener('click', function (e) {
  e.stopPropagation();
  openDd(!$('#lkdd').classList.contains('open'));
});
$('#lkdd-pop').addEventListener('click', function (e) {
  const it = e.target.closest ? e.target.closest('.it') : null;
  if (!it) return;
  selectLang(it.dataset.code);
  openDd(false);
});
document.addEventListener('click', function (e) {
  if (!$('#lkdd').contains(e.target)) openDd(false);
});

/* ── 启动（等词条到位再首帧；字典坏了也照常起——回落链兜住文案）────────────
 * 预览参数（开发/验收用；产品运行不带）：
 * ?mode=uninstall（宿主 --uninstall 注入）、?screen=uac|home|progress|finish|error|version|confirm|running|
 * un-progress|un-finish、?custom=1、?pct=0..100、?keep=0（预览不保留数据的黄徽章）、?dust=0、?seed=1、
 * ?lang=、?langs=（宿主注入）、?kind=same|older&from=&to=（?screen=version 的守卫屏取图入口）、
 * ?autoinstall=1（安装侧摆好后自动点「立即安装」）、?autouninstall=1&autocontinue=1（卸载侧同规，
 * 供 2c 的进程守卫验收——两点都走**页面真动作**，测的是产品那条路） */
function boot() {
  if (q.get('dust') === '0') $('#dust').remove();
  if (MODE === 'uninstall') {
    // 件 2d：宿主自报家门的真值——安装目录（?dir=）· 体积（?usize=，MB）· userData（?udata=）
    if (q.get('usize') !== null || q.get('udata')) {
      setUninstallInfo({
        dir: q.get('dir') || undefined,
        size: q.get('usize') !== null ? q.get('usize') + ' MB' : undefined,
        userData: q.get('udata') || undefined
      });
    }
    paintUninstall();                          // 真值上屏
    if (q.get('keep') === '0') $('#keepdata').checked = false;
    go(q.get('screen') || 'confirm');
    if (q.get('pct') !== null) setProgress(+q.get('pct'), { force: true });
    // 2c/2d 验收缝：摆到确认帧后自动点「卸载」——宿主随即做运行中检测。
    // ⚠️ 此缝**绕过**行内二次确认（keep=0 走自动路时不再等人勾「我确认删除」）：
    //    它是自动化验收的旁路，产品运行不带这个参数。
    if (q.get('autouninstall') === '1') {
      if (q.get('keep') === '0') $('#delagree').checked = true;
      setTimeout(function () { ACTIONS.uninstall(); }, 250);
    }
    return;
  }
  setInstallDir($('[data-role=path]').value);          // 让完成屏路径与输入框同源
  // 件 2a：宿主自报家门的真值 —— 目标目录（可能来自上次安装的注册表）与版本（marker 里读的）
  if (q.get('dir')) setInstallDir(q.get('dir'));
  if (q.get('ver')) setVersion(q.get('ver'));
  // 件 2c：版本守卫屏的取图入口（宿主没带 payload 时走不到守卫，这条路专供逐屏对照/目检）
  if (q.get('screen') === 'version') {
    showVersionGuard(q.get('kind') === 'same' ? 'same' : 'older', q.get('from') || '', q.get('to') || '');
  } else {
    go(q.get('screen') || 'home');
  }
  if (q.get('custom') === '1') setCustom(true);
  if (q.get('pct') !== null) setProgress(+q.get('pct'), { force: true });
  // 开发/验收开关：摆到 home/progress 后自动点「立即安装」，走的是**页面真动作**（post install-start），
  // 不是宿主短路——这样测的就是产品那条路。产品运行不带此参数。
  // ⚠️ 判「当前在 home 或 progress」而不是「没给 screen」：钉着 screen=home 的取图 URL 也要能自动装
  //  （2026-10-02 实测踩过：`screen=home&autoinstall=1` 在旧判据下静默不触发，guard-test 路 2/4 因此空转）。
  if (q.get('autoinstall') === '1' && (cur === 'home' || cur === 'progress')) {
    setTimeout(function () { ACTIONS.install(); }, 250);
  }
}

(function initI18n() {
  const wanted = (q.get('lang') || '').trim();
  // 非默认语言先藏壳（规则在 app.css）：首帧中文一闪而过是视觉瑕疵；400ms 兜底照常显示
  if (wanted && wanted !== DEFAULT_LANG) document.documentElement.dataset.i18nPending = '1';
  const reveal = function () { delete document.documentElement.dataset.i18nPending; };
  setTimeout(reveal, 400);
  const ready = function () {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    applyI18n();
    buildLangs();
    boot();
    refreshHead();   // 段头是状态相关文案（data-i18n 覆盖不到），首帧也得按当前语言落一次
    reveal();
  };
  loadI18n().then(ready, ready);
})();

/* 供 3c 自动化/排查用（只读入口，产品行为不依赖它） */
window.__lk = {
  mode: MODE,
  go: go, setProgress: setProgress, readOpts: readOpts, setLang: selectLang, t: t,
  setUninstallInfo: setUninstallInfo, badge: badge,
  // 件 2c：3c 的验收腿要能直接摆出守卫屏 / 问出路径判据 / 走一次汇一关闭
  showVersionGuard: showVersionGuard, pathSyntaxError: pathSyntaxError, closeByStage: closeByStage,
  // 台账 §二 B-1：规整函数必须**导出真源**——评审页生成器（tools/gen-review.mjs）调它定格第 3 幕，
  // 生成器里硬编码结果 = 生成器与产品两张皮（评审页绿、产品红也照样看不出来）。
  normalizeInstallDir: normalizeInstallDir,
  state: function () { return cur; },
  i18n: function () { return { lang: lang, state: i18nState, langs: LANGS.map(function (l) { return l.code; }) }; }
};
})();
