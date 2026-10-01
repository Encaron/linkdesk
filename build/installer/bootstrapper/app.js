/* LinkDesk 安装器界面逻辑（件 1b：六屏状态机接线）
 * 来源：docs/04-软件更新/待抉择池/安装界面自绘/mockups/E-混合提案.html 的 <script>（直搬改造）
 * 拆掉的：设计注记/演示控制的写入（.cap/.note/「重新播放」/「演示：失败分支」）、9 秒假进度
 * 接上的：宿主消息桥（拖窗/关闭/件2 的安装动作）、Enter=主按钮、语言下拉控件
 * 件 2 接手点：ACTIONS.install 后的真 IO 与进度回调（setProgress）、setInstallDir/setVersion/setError
 */
(function () {
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const q = new URLSearchParams(location.search);

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

/* ── 微尘粒子（常驻；与 mockup 同 14 粒、同取数顺序）────────────────────── */
(function dust() {
  const box = $('#dust');
  for (let i = 0; i < 14; i++) {
    const d = document.createElement('i');
    d.style.left = rnd() * 100 + '%';
    d.style.animationDuration = (9 + rnd() * 10) + 's';
    d.style.animationDelay = (-rnd() * 15) + 's';
    d.style.opacity = .12 + rnd() * .25;
    box.appendChild(d);
  }
})();

/* ── 屏幕状态机（类名/ID 与 mockup 一致 = 规格）────────────────────────── */
const SCREENS = ['uac', 'home', 'progress', 'finish', 'error'];
let cur = null;

function go(id) {
  if (SCREENS.indexOf(id) < 0) return;
  cur = id;
  $$('.scr').forEach(function (s) { s.classList.remove('on'); });
  $('#s-' + id).classList.add('on');
  if (id === 'finish') burst();          // 彩粒迸发只在进完成屏时打一次
}

/* 自定义展开区（home 的子状态，不是独立屏）——『收起』文案 1c 随装载器换成 t() */
const custLabel = $('#custtoggle').textContent;
function setCustom(open) {
  $('#custom').classList.toggle('open', !!open);
  $('#custtoggle').textContent = open ? '收起' : custLabel;
}

/* ── 四段进度（数值/分段语义照 mockup；真数据由件 2 的 IO 回调喂）────────── */
const PH = ['', 'STEP 1 / 4 · 正在解压文件', 'STEP 2 / 4 · 注册 linkdesk:// 协议',
            'STEP 3 / 4 · 写系统项', 'STEP 4 / 4 · 收尾校验'];
let lastPct = 0;

function segOf(p) { return p < 70 ? 1 : p < 80 ? 2 : p < 92 ? 3 : 4; }

/* opt.force=true 用于重置/预览（否则数值只前进不倒退——规格 05 §3.3） */
function setProgress(p, opt) {
  opt = opt || {};
  p = Math.max(0, Math.min(100, +p || 0));
  if (!opt.force && p < lastPct) p = lastPct;
  lastPct = p;
  $('#pn').textContent = Math.floor(p);
  $('#fill').style.width = p + '%';
  const s = opt.step || segOf(p);
  for (let i = 1; i <= 4; i++) $('#p' + i).className = i < s ? 'done' : i === s ? 'run' : '';
  $('#ph').textContent = PH[s];
  $('#track').setAttribute('aria-valuenow', String(Math.floor(p)));   // 进度条 ARIA（对账表）
}

function resetProgress() { lastPct = 0; setProgress(0, { force: true }); }

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
}
function setVersion(v) { if (v) $('#ver').textContent = 'v' + v; }
function setError(code, msg) {
  if (code) $('#errcode').textContent = code;
  if (msg) $('[data-i18n="installer.error.sub"]').textContent = msg;
  go('error');
}
function readOpts() {
  const o = {};
  $$('[data-opt]').forEach(function (el) { o[el.dataset.opt] = el.checked; });
  return o;
}

/* ── 动作表（与 markup 的 data-action 一一对应）────────────────────────── */
const ACTIONS = {
  install: function () {
    setCustom(false);
    go('progress');
    resetProgress();
    post({ type: 'install-start', dir: $('[data-role=path]').value, opts: readOpts() });  // 件 2 接真装
  },
  'toggle-custom': function () { setCustom(!$('#custom').classList.contains('open')); },
  browse: function () { post({ type: 'browse-dir', dir: $('[data-role=path]').value }); },  // 目录对话框在宿主（2b）
  cancel: function () { cancelInstall(); },
  retry: function () { setCustom(true); go('home'); },   // 02 §三：换位置直接回自定义展开屏
  exit: function () { post({ type: 'exit' }); },         // 失败屏出口（2c：清理后退出）
  done: function () { post({ type: 'install-done', launch: $('#runnow').checked }); },
  license: function () { post({ type: 'open-license' }); },  // ⚠️ 许可协议地址待定（发版前定，勿硬编码假 URL）
  close: function () { closeByStage(); }
};

function cancelInstall() {
  post({ type: 'cancel' });        // 2c：回滚已解压文件
  resetProgress();
  go('home');
}
/* ✕ / Esc / Alt+F4 三路汇此，按阶段分流（规格 05 §4.3；细粒度回滚归 2c） */
function closeByStage() {
  if (cur === 'progress') { cancelInstall(); return; }
  if (cur === 'finish') { post({ type: 'install-done', launch: $('#runnow').checked }); return; }
  post({ type: 'close' });         // 主屏/确认屏：未写入任何内容，直接退
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

/* ── 键盘：Enter = 当前屏主按钮（控件自身处理时不抢）─────────────────── */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { openDd(false); return; }
  if (e.key !== 'Enter' || e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (t && t.closest && t.closest('button,a,input,label,select,textarea')) return;
  const primary = $('.scr.on [data-primary]');
  if (primary) { e.preventDefault(); primary.click(); }
});

/* ── 自绘语言下拉（原生 select 画不进自绘界面）──────────────────────────
 * 清单与文案切换归 1c 装载器：此处只管开关/选中态/键盘可达 */
const LANGS = [{ code: 'zh-CN', label: '中文' }, { code: 'en', label: 'English' }];  // 1c：改为扫描 i18n/ 目录
let lang = document.documentElement.dataset.lang || 'zh-CN';

(function buildLangs() {
  const pop = $('#lkdd-pop');
  pop.innerHTML = LANGS.map(function (l) {
    return '<button type="button" class="it' + (l.code === lang ? ' on' : '') + '" role="option" data-code="' + l.code +
      '" aria-selected="' + (l.code === lang) + '">' +
      '<svg class="ck" viewBox="0 0 14 14" fill="none" stroke="#2fae7c" stroke-width="2" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>' +
      '<span>' + l.label + '</span></button>';
  }).join('');
  const it = pop.querySelector('.it.on');
  if (it) $('#lkdd-cur').textContent = it.querySelector('span').textContent;
})();

function openDd(open) {
  $('#lkdd').classList.toggle('open', !!open);
  $('#lkdd-btn').setAttribute('aria-expanded', String(!!open));
}
function selectLang(code) {
  lang = code;
  document.documentElement.dataset.lang = code;
  $('#lkdd-cur').textContent = (LANGS.filter(function (l) { return l.code === code; })[0] || LANGS[0]).label;
  $$('#lkdd-pop .it').forEach(function (it) {
    const on = it.dataset.code === code;
    it.classList.toggle('on', on);
    it.setAttribute('aria-selected', String(on));
  });
  onLangChange(code);
}
function onLangChange(/* code */) { /* 1c：t() 全量重渲染（含运行时错误文案的占位符） */ }

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

/* ── 预览参数（开发/验收用；产品运行不带）───────────────────────────────
 * ?screen=uac|home|progress|finish|error   ?custom=1   ?pct=0..100   ?dust=0   ?seed=1 */
if (q.get('dust') === '0') $('#dust').remove();
setInstallDir($('[data-role=path]').value);            // 让完成屏路径与输入框同源
go(q.get('screen') || 'home');
if (q.get('custom') === '1') setCustom(true);
if (q.get('pct') !== null) setProgress(+q.get('pct'), { force: true });

/* 供 3c 自动化/排查用（只读入口，产品行为不依赖它） */
window.__lk = { go: go, setProgress: setProgress, readOpts: readOpts, state: function () { return cur; } };
})();
