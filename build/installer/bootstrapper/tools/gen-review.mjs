#!/usr/bin/env node
/* 3d 评审页生成器——从**产品源**抽每幕真实标记，拼成一页按用户旅程排序的静态评审页。
 *
 * 为什么生成而不是手写：手抄的副本必然漂移；本页每节都从 app.html/app.css 原文来，改 UI 后重跑即同步。
 *
 * 用法：cd build/installer/bootstrapper && node tools/gen-review.mjs
 * 产出：docs/04-软件更新/待抉择池/安装界面自绘/3d-九幕评审.html（单文件，file:// 直开，无需服务器）
 *
 * 保真手段：
 *   · 每幕 = app.html 里 <div class="scr" id="s-…">…</div> 原文（配对计数抽取，幕内嵌套不限层）
 *   · app.css 原文内嵌；两款 woff2 转 data URI（file:// 下跨目录字体拉不进来 ⇒ 内联自足）
 *   · 卸载侧规则原文挂在 html[data-mode=uninstall] ⇒ 评审页一页装两种模式，改挂 .mode-un（双写类保权值）
 *   · 动态位（进度读数/段头/守卫文案/徽章）按 app.js 同一套 i18n 词条与分段阈值定格
 *   · 微尘粒子照抄 app.js 的 dust()（同取数顺序：左→时长→延迟→透明度；seed 固定 ⇒ 每次打开同图样）
 * 定格页没有的东西（真机才有）：语言切换、confetti 彩带、按钮交互——交互态走 _3d-ui\*.bat。
 * 🔴 产出文件不许手改——手改下次重生成就被冲掉。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));            // …/bootstrapper/tools
const root = dirname(here);                                       // …/bootstrapper
const outPath = process.argv[2] ||
  join(root, '..', '..', '..', 'docs', '04-软件更新', '待抉择池', '安装界面自绘', '3d-九幕评审.html');

const html = readFileSync(join(root, 'app.html'), 'utf8');
let css = readFileSync(join(root, 'app.css'), 'utf8');
const i18n = JSON.parse(readFileSync(join(root, '..', 'i18n', 'zh-CN.json'), 'utf8'));
const t = (key, params) => {
  const raw = i18n[key];
  if (raw == null) throw new Error('i18n 缺词条: ' + key);
  let s = String(raw);
  if (params) for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(v);
  return s;
};

// 字体内联（app.css 里的 url('fonts/…') 相对 bootstrapper/）
css = css.replace(/url\('?(fonts\/[^')]+)'?\)/g, (_, p) => {
  const b = readFileSync(join(root, p));
  return `url(data:font/woff2;base64,${b.toString('base64')})`;
});
// 卸载侧样式键原本挂在根元素上；评审页两种模式同页 ⇒ 改挂 .mode-un（类写两遍补回被 html 选择器占掉的那份权值）
css = css.split('html[data-mode=uninstall]').join('.mode-un.mode-un');

// 整窗抽取：body 内**原文**（grain 噪点＋orb 光球×2＋dust 微尘＋lkdd 语言面板＋xbtn＋shell 玻璃壳＋win＋全部屏）。
// 每节一份、只点亮目标屏——评审页看到的必须是产品窗口本身，不是拼贴。grain 是 fixed，评审页里按住舞台。
const b0 = html.indexOf('<body>') + '<body>'.length;
const b1 = html.lastIndexOf('</body>');
if (b0 < 6 || b1 < 0) throw new Error('app.html 缺 body 标记');
const chrome = html.slice(b0, b1).replace(/<script\b[\s\S]*?<\/script>/g, '');

// 每节的小手术——全部按 app.js 的运行时口径定格（缺标记即抛错，防止静默错位）
function must(s, from, to) { if (!s.includes(from)) throw new Error('定格标记缺失: ' + from); return s.split(from).join(to); }
const UD = 'C:\\Users\\fengy\\AppData\\Roaming\\linkdesk';
const VER = '0.2.33';

// 进度定格：按 app.js 同一套分段阈值（装 70/80/92，卸 60/80/92）＋同一段头词条
function progTweak(install, pct) {
  const seg = install ? (pct < 70 ? 1 : pct < 80 ? 2 : pct < 92 ? 3 : 4)
                      : (pct < 60 ? 1 : pct < 80 ? 2 : pct < 92 ? 3 : 4);
  const p = install ? '' : 'u';        // pn/fill/track：安装无前缀，卸载带 u
  const li = install ? 'p' : 'u';      // 步骤列表 id：p1..p4 / u1..u4
  const headFrom = install ? '>STEP 1 / 4 · 正在解压文件<' : '>STEP 1 / 4 · 正在移除程序文件<';
  const headKey = (install ? 'installer.progress.head' : 'installer.uninstall.progress.head') + seg;
  return s => {
    s = must(s, `<span id="${p}pn">0</span>`, `<span id="${p}pn">${pct}</span>`);
    s = must(s, `<div class="fill" id="${p}fill"></div>`, `<div class="fill" id="${p}fill" style="width:${pct}%"></div>`);
    s = must(s, 'aria-valuenow="0"', `aria-valuenow="${pct}"`);
    for (let i = 1; i <= 4; i++) {
      const cls = i < seg ? 'done' : i === seg ? 'run' : '';
      s = must(s, `<li id="${li}${i}">`, `<li id="${li}${i}"${cls ? ` class="${cls}"` : ''}>`);
    }
    return must(s, headFrom, '>' + t(headKey) + '<');
  };
}
// 错误屏定格：#errcode 由 setError 写纯码、sub 写宿主真话
function errTweak(code, msg) {
  return s => {
    s = must(s, 'id="errcode" data-drag>ERR-DISK-FULL · E-1042<', `id="errcode" data-drag>${code}<`);
    const re = /(data-i18n="installer\.error\.sub">)[\s\S]*?(<\/div>)/;
    if (!re.test(s)) throw new Error('error.sub 标记缺失');
    return s.replace(re, '$1' + msg + '$2');
  };
}
const setPathErr = (s, value, key) => {
  s = must(s, 'id="custom"', 'id="custom" class="open"');
  s = must(s, 'value="C:\\Users\\fengy\\AppData\\Local\\Programs\\linkdesk"', `value="${value}"`);
  s = must(s, '<div class="patherr" id="patherr" role="alert" hidden></div>',
    `<div class="patherr" id="patherr" role="alert">${t(key)}</div>`);
  return must(s, `data-role="path" value="${value}"`, `data-role="path" class="bad" value="${value}"`);
};
const tweaks = {
  homeCustom: s => must(s, 'id="custom"', 'id="custom" class="open"'),
  homeBadRoot: s => setPathErr(s, 'C:', 'installer.path.err.root'),
  homeBadWrite: s => setPathErr(s, 'C:\\Windows', 'installer.path.err.write'),
  guardSame: s => must(must(must(s,
    'id="ver-title"></h1>', `id="ver-title">${t('installer.version.title.same', { version: VER })}</h1>`),
    'id="ver-sub" data-drag></div>', `id="ver-sub" data-drag>${t('installer.version.body.same', { version: VER })}</div>`),
    'id="ver-code" data-drag></div>', `id="ver-code" data-drag>${VER}</div>`),
  guardOlder: s => must(must(must(s,
    'id="ver-title"></h1>', `id="ver-title">${t('installer.version.title.older')}</h1>`),
    'id="ver-sub" data-drag></div>', `id="ver-sub" data-drag>${t('installer.version.body.older', { installed: '0.2.34', incoming: VER })}</div>`),
    'id="ver-code" data-drag></div>', `id="ver-code" data-drag>0.2.34  →  ${VER}</div>`),
  progI47: progTweak(true, 47), progI75: progTweak(true, 75), progI85: progTweak(true, 85), progI95: progTweak(true, 95),
  progU30: progTweak(false, 30), progU73: progTweak(false, 73), progU85: progTweak(false, 85), progU96: progTweak(false, 96),
  errDiskFull: errTweak('DISK_FULL', '需要 2097216 MB，目标盘只剩 719862 MB'),
  errExtract: errTweak('EXTRACT_FAILED', '7zr exit=2'),
  errVerify: errTweak('VERIFY_FAILED', '解压后没找到 LinkDesk.exe——安装包可能不完整'),
  errNoPayload: errTweak('NO_PAYLOAD', '这是开发期引导器壳，不含安装载荷（双击真实安装包才有）'),
  errCancelKept: errTweak('CANCEL_KEPT', t('installer.cancel.kept')),
  confirmKeep0: s => must(s, 'id="keepdata" checked>', 'id="keepdata">'),
  confirmDelconfirm: s => must(must(s,
    'id="keepdata" checked>', 'id="keepdata">'),
    '<div id="delconfirm" hidden>', '<div id="delconfirm">'),
  confirmDelagree: s => must(must(must(s,
    'id="keepdata" checked>', 'id="keepdata">'),
    '<div id="delconfirm" hidden>', '<div id="delconfirm">'),
    '<input type="checkbox" id="delagree">', '<input type="checkbox" id="delagree" checked>'),
  runningTimeout: s => must(s,
    '<div class="unwarn" id="unwarn" role="status" aria-live="polite" hidden',
    '<div class="unwarn" id="unwarn" role="status" aria-live="polite"'),
  badgeKept: s => must(s,
    'id="datbadge" data-drag>用户数据已保留 · C:\\Users\\fengy\\AppData\\Roaming\\LinkDesk</div>',
    `id="datbadge" data-drag>${t('installer.uninstall.finish.kept', { path: UD })}</div>`),
  badgeGone: s => must(s,
    '<div class="datbadge" id="datbadge" data-drag>用户数据已保留 · C:\\Users\\fengy\\AppData\\Roaming\\LinkDesk</div>',
    `<div class="datbadge gone" id="datbadge" data-drag>${t('installer.uninstall.finish.gone')}</div>`),
  lkddOpen: s => {
    s = must(s, '<div id="lkdd">', '<div id="lkdd" class="open">');
    const it = (code, label, on) =>
      `<button type="button" class="it${on ? ' on' : ''}" role="option" data-code="${code}" aria-selected="${on}">` +
      '<svg class="ck" viewBox="0 0 14 14" fill="none" stroke="#2fae7c" stroke-width="2" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>' +
      `<span>${label}</span></button>`;
    return must(s,
      '<div id="lkdd-pop" role="listbox" aria-label="语言" data-i18n-aria="installer.lang.aria"></div>',
      '<div id="lkdd-pop" role="listbox" aria-label="语言" data-i18n-aria="installer.lang.aria">' +
      it('zh-CN', '中文', true) + it('en', 'English', false) + '</div>');
  },
};

// 屏幕序列：产品能显示的**每一个态**，按用户旅程排（pv 列 = 对应真机缝 _3d-ui\*.bat）
const sections = [
  { group: '安装（780×570）', items: [
    { n: '① 欢迎 · 一键装（默认）', key: 'home', pv: '?screen=home',
      look: '标题衬线 Newsreader；路径行默认值＝默认安装位；右上语言下拉与 ✕；主按钮 hover/焦点态。' },
    { n: '② 自定义展开', key: 'home', mod: 'homeCustom', pv: '?screen=home&custom=1',
      look: '展开动画终态：路径行＋「浏览」＋右键菜单等勾选项。' },
    { n: '② 路径非法 · 行内报错（输 C: ⇒ root）', key: 'home', mod: 'homeBadRoot', pv: '页面真动作：输入 C:',
      look: '页侧语法闸先拦：输入框变红＋ role=alert 文案「不要直接选整个盘」；不改全局错误屏。' },
    { n: '② 路径写不进 · 宿主实测（write）', key: 'home', mod: 'homeBadWrite', pv: '宿主 dir-invalid 回话',
      look: '宿主真试过写不进（如 C:\\Windows）就近报「没有权限」；文案不同、形态相同。' },
    { n: '⑥ 守卫 · 同版', key: 'version', mod: 'guardSame', pv: '?screen=version&kind=same&from=0.2.33',
      look: '机器已装同版本：默认取消，仍要安装是次按钮。' },
    { n: '⑥ 守卫 · 降级', key: 'version', mod: 'guardOlder', pv: '?screen=version&kind=older&from=0.2.34&to=0.2.33',
      look: '同版/降级才拦（升级方向不拦直接放行）；kind=older＝「本包更旧」，别配反。' },
    { n: '③④ 进度 · 段1 47%（解压文件）', key: 'progress', mod: 'progI47', pv: '?screen=progress&pct=47',
      look: '段头「STEP 1 / 4 · 正在解压文件」；四步列表第一项运行态；取消按钮。' },
    { n: '③④ 进度 · 段2 75%（注册关联）', key: 'progress', mod: 'progI75', pv: '?screen=progress&pct=75',
      look: '70/80/92 换段：段头与步骤态随段切换（70–80 = 注册文件关联）。' },
    { n: '③④ 进度 · 段3 85%（写系统项）', key: 'progress', mod: 'progI85', pv: '?screen=progress&pct=85',
      look: '段3「正在写系统项」：快捷方式／右键菜单／PATH 都在这段。' },
    { n: '③④ 进度 · 段4 95%（收尾校验）', key: 'progress', mod: 'progI95', pv: '?screen=progress&pct=95',
      look: '段4「正在收尾校验」：ARP 写入＋无残留判据；数值单调不回退。' },
    { n: '⑤ 完成', key: 'finish', pv: '?screen=finish',
      look: '路径＝实际安装位；「运行 LinkDesk」默认勾；彩带由 JS 生成（定格页无，真机/bat 可见）。' },
    { n: '⑧ 失败 · 磁盘空间不足（DISK_FULL）', key: 'error', mod: 'errDiskFull', pv: '实弹：marker 补丁件',
      look: '读数取自 3c 实测（2TiB 假载荷 vs E 盘剩余）；「换个安装位置」直接回自定义展开屏。' },
    { n: '⑧ 失败 · 解压失败（EXTRACT_FAILED）', key: 'error', mod: 'errExtract', pv: '实弹：目标被占用',
      look: 'msg＝7zr 退出码（LinkDesk 在跑覆盖装就是这条路，7zr 写不进锁着的 exe）；码为示意。' },
    { n: '⑧ 失败 · 校验失败（VERIFY_FAILED）', key: 'error', mod: 'errVerify', pv: '宿主分支',
      look: '解压完但没找到 LinkDesk.exe——包不完整/被杀软截胡。' },
    { n: '⑧ 失败 · 开发壳无载荷（NO_PAYLOAD）', key: 'error', mod: 'errNoPayload', pv: '双击 out\\bootstrapper.exe',
      look: '只在没有载荷的壳上出现；产品安装包恒有载荷。' },
    { n: '⑧ 失败 · 取消回滚 · 旧装保留（CANCEL_KEPT）', key: 'error', mod: 'errCancelKept', pv: '覆盖装中途点取消',
      look: '取消有两种结局：全新目录=整树回滚直接回欢迎屏；旧目录在=如实告知保留并建议重装完整。' },
    { n: '⑦ 等待权限', key: 'uac', pv: '?screen=uac',
      look: '仅提权场景出现；进度细条动画。' },
    { n: '语言面板展开', key: 'home', mod: 'lkddOpen', pv: '点右上语言按钮',
      look: '自绘下拉（原生 select 画不进自绘窗）；当前语言带绿勾；条目由 i18n 清单枚举。' },
  ]},
  { group: '卸载（720×540）', items: [
    { n: '帧1 · 确认（保留默认勾）', key: 'confirm', pv: '?mode=uninstall&screen=confirm',
      look: '安装位置/体积真值；「保留我的数据」默认勾；卸载是 danger 色主按钮。' },
    { n: '帧1 · 勾掉「保留我的数据」', key: 'confirm', mod: 'confirmKeep0', pv: '页面真动作：取消勾选',
      look: '勾掉本体无动静——真正的确认在点「卸载」之后（下一节）。' },
    { n: '帧1 · 点「卸载」后露二次确认', key: 'confirm', mod: 'confirmDelconfirm', pv: '页面真动作：勾掉→点卸载',
      look: '红色警示块就地展开（不打扰只想保留数据的人）；「卸载」此时仍不放行。' },
    { n: '帧1 · 勾「我确认删除」（放行前最后一态）', key: 'confirm', mod: 'confirmDelagree', pv: '页面真动作：再勾确认',
      look: '勾上才真正放行；这一步之后就是不可逆删除。' },
    { n: '帧2 · LinkDesk 正在运行', key: 'running', pv: '?mode=uninstall&screen=running',
      look: '进程真检测才停这帧；「关闭并继续」= 发 WM_CLOSE 走软件自己的保存流程，不硬杀。' },
    { n: '帧2 · 等退超时（黄色提示条）', key: 'running', mod: 'runningTimeout', pv: '拒关 10 秒后',
      look: '等了 10s 还没退净（可能停在保存对话上）如实说明；「稍后」原路返回帧1。' },
    { n: '帧3 · 段1 30%（移除程序文件）', key: 'un-progress', mod: 'progU30', pv: '?mode=uninstall&screen=un-progress&pct=30',
      look: '左对齐变体＋墨色条；无取消（卸载一路走完）；keep=false 时 userData 在 56–59 一并删。' },
    { n: '帧3 · 段2 73%（清理系统项）', key: 'un-progress', mod: 'progU73', pv: '?mode=uninstall&screen=un-progress&pct=73',
      look: '60/80/92 换段：右键菜单／关联／RegisteredApplications。' },
    { n: '帧3 · 段3 85%（恢复 PATH）', key: 'un-progress', mod: 'progU85', pv: '?mode=uninstall&screen=un-progress&pct=85',
      look: 'PATH 精确匹配恢复（宁可不删也不误伤用户改过的）。' },
    { n: '帧3 · 段4 96%（收尾校验）', key: 'un-progress', mod: 'progU96', pv: '?mode=uninstall&screen=un-progress&pct=96',
      look: 'ARP 已消失判据＋自删收尾。' },
    { n: '帧4 · 完成（绿徽章 · 数据保留）', key: 'un-finish', mod: 'badgeKept', pv: '?mode=uninstall&screen=un-finish',
      look: '徽章=数据去向：保留＝绿，带 userData 路径（小写 linkdesk）。' },
    { n: '帧4 · 完成（黄徽章 · 数据已删）', key: 'un-finish', mod: 'badgeGone', pv: '?mode=uninstall&screen=un-finish&keep=0',
      look: '勾掉保留并走完 ⇒ 黄徽章如实告知「已删除」；下次新装即全新工作区＋仅出厂插件。' },
  ]},
];

let body = '';
for (const g of sections) {
  body += `\n<h1 class="group">${g.group}</h1>\n`;
  for (const it of g.items) {
    const un = it.key.startsWith('un-') || ['confirm', 'running'].includes(it.key);
    // 先把源里自带的 on（s-home）灭掉，再点亮目标屏——同一套 .scr/.on 显隐机制原样生效
    let s = chrome.replace('class="scr on"', 'class="scr"');
    const plain = `<div class="scr${un ? ' un' : ''}" id="s-${it.key}">`;
    if (!s.includes(plain)) throw new Error('屏标记缺失: ' + plain);
    s = s.replace(plain, `<div class="scr${un ? ' un' : ''} on" id="s-${it.key}">`);
    if (it.mod) s = tweaks[it.mod](s);
    body += `\n<section class="review-item" data-screen="${it.key}"${it.mod ? ` data-state="${it.mod}"` : ''}>
  <h2>${it.n} <code>${it.pv}</code></h2>
  <div class="stage ${un ? 'stage-uninstall mode-un' : 'stage-install'}">${s}</div>
  <p class="look">看点：${it.look}</p>
</section>\n`;
  }
}

const out = `<!doctype html>
<!-- 🔴 生成文件，勿手改——改 UI 后重跑 build/installer/bootstrapper/tools/gen-review.mjs -->
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>3d · 安装器全 UI 评审（生成于产品源）</title>
<style>
${css}
</style>
<style>
/* ── 评审壳（浅色、不碰产品样式；app.css 原文在前，这里只管页面本身）────── */
html,body{overflow:auto!important;height:auto!important}
body{background:#efede9;color:#33332f;font-family:Consolas,monospace;padding:28px 32px 80px;max-width:1040px;margin:0 auto}
.lead{font:13px/1.8 Consolas,monospace;color:#55534e;background:#f7f6f3;border:1px solid rgba(0,0,0,.09);border-radius:8px;padding:12px 16px}
.group{font:600 15px/1 Consolas,monospace;letter-spacing:.08em;color:#8a6ff0;margin:52px 0 4px;text-transform:uppercase}
.review-item{margin:34px 0}
.review-item h2{font:400 14px/1.4 Consolas,monospace;color:#1a1a1a;margin:0 0 4px}
.review-item h2 code{font-size:11px;color:#6b6963;background:rgba(0,0,0,.055);padding:2px 8px;border-radius:6px;margin-left:8px}
/* 舞台＝产品 OS 窗口本体：--desk 底色（窗角露出的就是它）＋DWM 12px 圆角＋系统阴影 */
.stage{position:relative;background:var(--desk);border-radius:12px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.20),0 4px 14px rgba(0,0,0,.10);margin:12px 0 8px}
.stage-install{width:780px;height:570px}
.stage-uninstall{width:720px;height:540px}
/* grain 在产品里是 fixed（贴视口）；评审页里必须按住舞台，否则铺满整页 */
.stage .grain{position:absolute}
.look{font:12px/1.8 Consolas,monospace;color:#6b6963;margin:0}
.look::before{content:'看';display:inline-block;background:#8a6ff0;color:#fff;border-radius:4px;padding:1px 5px;margin-right:8px;font-size:10px}
</style>
</head>
<body>
<h1 style="font:400 20px/1.4 Consolas,monospace;color:#1a1a1a">安装器全 UI 评审 · 3d</h1>
<p class="lead">本页每节＝<b>一扇完整真窗口</b>：噪点、光球、玻璃壳、微尘、语言面板、✕，全部取自产品源
（app.html/app.css）原文，只点亮目标屏——<b>非手抄、非暗色变体</b>。改 UI 后重跑
<code>node tools/gen-review.mjs</code> 同步。定格静态：按钮不可点、语言切换不可用、完成屏彩带由 JS 生成——
<b>交互态/真机态</b>用 <code>E:\\linkdesk-build\\_3d-ui\\</code> 里的 bat（01 真流程 / 15 真卸载）。
验收基线：04 审计 18/20 不跌破。在 ZCode 内置浏览器里直接点元素留言即可。</p>
${body}
<script>
/* 微尘照抄 app.js 的 dust()：同取数顺序（左→时长→延迟→透明度）＋固定 seed ⇒ 每次打开图样一致 */
(function () {
  var s = 0x9E3779B9;
  function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
  document.querySelectorAll('.stage').forEach(function (st) {
    var un = st.classList.contains('stage-uninstall');
    var box = st.querySelector('.dust');
    for (var i = 0, n = un ? 10 : 14; i < n; i++) {
      var d = document.createElement('i');
      d.style.left = rnd() * 100 + '%';
      d.style.animationDuration = ((un ? 10 : 9) + rnd() * 10) + 's';
      d.style.animationDelay = (-rnd() * 15) + 's';
      d.style.opacity = (un ? .08 : .12) + rnd() * (un ? .18 : .25);
      if (un) d.style.animationName = 'rise-un';
      box.appendChild(d);
    }
  });
})();
</script>
</body>
</html>
`;
writeFileSync(outPath, out);
console.log('写出 ' + outPath + ' (' + out.length + ' 字节, ' + sections.reduce((a, g) => a + g.items.length, 0) + ' 幕)');
