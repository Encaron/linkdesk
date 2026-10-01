/* LinkDesk 安装器界面逻辑（件 1b：六屏状态机接线 ／ 件 1c：i18n 装载器 ／ 件 1d：卸载四帧）
 * 来源：docs/04-软件更新/待抉择池/安装界面自绘/mockups/E-混合提案.html 与 E-卸载屏.html 的 <script>（直搬改造）
 * 拆掉的：设计注记/演示控制的写入（.cap/.note/「重新播放」/「演示：失败分支」/enUI 文案补丁）、
 *         9 秒假进度、写死的语言数组、badge() 里按下拉文字判语言的做法（改用 1c 的 t()）
 * 接上的：宿主消息桥（拖窗/关闭/件2 的安装动作）、Enter=主按钮、语言下拉（清单 = 宿主扫描 i18n/ 目录）
 * 件 2 接手点：ACTIONS.install / uninstall 后的真 IO 与进度回调（setProgress）、setInstallDir/setVersion/
 *             setError/setUninstallInfo、set-lang 的注册表持久化（HKCU\Software\LinkDesk\Installer → Language
 *             写侧）、运行时真值的本地化（onLangChange 钩子）、卸载三路关闭的宿主侧分流（2c/2d）
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
  install: ['uac', 'home', 'progress', 'finish', 'error'],
  uninstall: ['confirm', 'running', 'un-progress', 'un-finish']
};
let cur = null;

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

/* ── 卸载真值（2d 从宿主喂：安装位置 / 体积 / userData 路径）───────────────
 * 这里的占位值 = E-卸载屏 mockup 原文（用户名的真实路径由 2d 的宿主提供）。
 * ⚠️ confirm 的「安装位置」与完成屏的「用户数据」两条词条带 {path}/{size} 变量，
 *    静态 data-i18n 补丁填不了变量 → 走 t(key, vars) 并挂 data-i18n-live（同 setError 口径）。 */
const UNINFO = {
  dir: 'C:\\Users\\fengy\\AppData\\Local\\Programs\\linkdesk',
  size: '420 MB',
  userData: 'C:\\Users\\fengy\\AppData\\Roaming\\LinkDesk'
};
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
  close: function () { closeByStage(); },

  /* ── 卸载（件 1d 静态 UI；真清理/真进程检测归 2d）──────────────────────── */
  uninstall: function () {
    post({ type: 'uninstall-start', keep: $('#keepdata').checked });
    // ⚠️ 2d 接真检测后这里要改成由宿主回话驱动：没在运行 → 直接推 un-progress；在运行 → 本屏（帧 2）
    go('running');
  },
  'un-continue': function () {
    resetProgress();
    go('un-progress');
    post({ type: 'uninstall-run', keep: $('#keepdata').checked });   // 2d：优雅关闭 → 逐条清理（禁 taskkill）
  },
  'un-later': function () { go('confirm'); },                        // 原路返回，什么都没动
  'un-cancel': function () { post({ type: 'close' }); },             // 无任何写入直接退
  'un-done': function () { post({ type: 'uninstall-done' }); }       // 卸载器退出（自删归 2d）
};

function cancelInstall() {
  post({ type: 'cancel' });        // 2c：回滚已解压文件
  resetProgress();
  go('home');
}
/* ✕ / Esc / Alt+F4 三路汇此，按阶段分流（规格 05 §4.3；细粒度回滚归 2c） */
function closeByStage() {
  if (MODE === 'uninstall') {
    // 卸载进度中：✕ 置灰吞掉（go() 已 disabled；Esc/Alt+F4 的宿主侧分流归 2c）
    if (cur === 'un-progress') return;
    post({ type: 'close' });   // 确认/运行中=未写入任何内容；完成=等价完成——都是直接退
    return;
  }
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
 ['installer.progress.head2', 'STEP 2 / 4 · 注册 linkdesk:// 协议'],
 ['installer.progress.head3', 'STEP 3 / 4 · 写系统项'],
 ['installer.progress.head4', 'STEP 4 / 4 · 收尾校验']].forEach(function (p) { AUTHORED[p[0]] = p[1]; });
/* 卸载段头同规（E-卸载屏 mockup 原文；#uph 同样没有标记挂点）
   ⚠️ 与 i18n/zh-CN.json 的 installer.uninstall.progress.head* 逐字一致（改词条时同笔改这里） */
[['installer.uninstall.progress.head1', 'STEP 1 / 4 · 正在移除程序文件'],
 ['installer.uninstall.progress.head2', 'STEP 2 / 4 · 清理系统项'],
 ['installer.uninstall.progress.head3', 'STEP 3 / 4 · 恢复 PATH'],
 ['installer.uninstall.progress.head4', 'STEP 4 / 4 · 收尾校验']].forEach(function (p) { AUTHORED[p[0]] = p[1]; });

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
      '<svg class="ck" viewBox="0 0 14 14" fill="none" stroke="#2fae7c" stroke-width="2" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>' +
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
 * ?mode=uninstall（宿主 --uninstall 注入）、?screen=uac|home|progress|finish|error|confirm|running|
 * un-progress|un-finish、?custom=1、?pct=0..100、?keep=0（预览不保留数据的黄徽章）、?dust=0、?seed=1、
 * ?lang=、?langs=（宿主注入） */
function boot() {
  if (q.get('dust') === '0') $('#dust').remove();
  if (MODE === 'uninstall') {
    paintUninstall();                          // 真值上屏（2d 换成宿主喂的真数据）
    if (q.get('keep') === '0') $('#keepdata').checked = false;
    go(q.get('screen') || 'confirm');
    if (q.get('pct') !== null) setProgress(+q.get('pct'), { force: true });
    return;
  }
  setInstallDir($('[data-role=path]').value);          // 让完成屏路径与输入框同源
  go(q.get('screen') || 'home');
  if (q.get('custom') === '1') setCustom(true);
  if (q.get('pct') !== null) setProgress(+q.get('pct'), { force: true });
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
  state: function () { return cur; },
  i18n: function () { return { lang: lang, state: i18nState, langs: LANGS.map(function (l) { return l.code; }) }; }
};
})();
