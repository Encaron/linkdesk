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
 * 定格页没有的东西（真机才有）：语言切换、按钮交互——交互态走 _3d-ui\*.bat。
 * 帧间过渡／完成屏动画（settle · defog · land · pop · draw · 彩粒）由顶部「帧间过渡实演」一节**实演**（R2，装/卸两窗）。
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
// 件 3d-2（#2 透明窗）：`html[data-alpha] …` 那道门（宿主 put_DefaultBackgroundColor 成功后才挂）在定格页里
// 一律当成立——评审页要看的就是落地后的样子。剥掉前缀后 `body{background:transparent}` 与评审壳那句同权值，
// 评审壳写在后面 ⇒ 靠文档序赢，评审页自己的深色底板不受影响。
css = css.split('html[data-alpha] ').join('');

// 整窗抽取：body 内**原文**（frame 外框＋grain 噪点＋orb 光球×2＋dust 微尘＋lkdd 语言面板＋xbtn＋shell 玻璃壳＋win＋全部屏）。
// 每节一份、只点亮目标屏——评审页看到的必须是产品窗口本身，不是拼贴。grain/orb/dust 全挂在 .frame 下
// （件 3d-2 已把 grain 由 fixed 改 absolute），舞台上自动被 32px 弧线收住，评审壳不必再管。
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
    // #9（用户拍板「直接置灰就行」）：宿主的提交点在解压完成（段 2 起，安装侧 pct ≥ 70）——
    //    此后 main.cpp 不再受理取消（段 2/3 的取消检查点是故意撤掉的），但页面原来仍显示可点的
    //    「取消安装」⇒ UI 在承诺一件宿主做不到的事。定格预览把「已禁用」这个结果冻进来，
    //    与真落地 app.js setProgress() 里的 cbtn.disabled = (s >= 2) 一一对应。
    if (install && pct >= 70) s = must(s,
      '<button class="btn ghost" type="button" data-action="cancel"',
      '<button class="btn ghost" type="button" data-action="cancel" disabled');
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

/* 候选组全部撤回（2026-10-02 用户最终拍板「算了都不要了，保持最开始的，但是分开不粘连
   的版本就行」）——三批候选（句子领读 / 放大 / 换字面）已从评审页删除；进度数字维持 app.css
   原样 26/24px，只保留 #10 那条字距修（letter-spacing:0 ＝「分开不粘连」）。
   撤回经过与两条遗留观察见 3d-评审记录.md #11~#13。 */

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

/* 2026-10-02 3d 定稿：原先这里的 previewPatches()（#8 取消按钮换 .btn.ghost、#14 确认屏加 .uncol
   包裹、#16 谢谢→感谢）与文件末尾整块「3d 评审·待落地改动」CSS 已一并撤除——那三处标记手术与
   #1~#18 的样式现都已是产品源（app.html / app.css / app.js）原文，本页只做忠实抽取，不再打补丁。 */

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
  <div class="stage ${un ? 'stage-uninstall mode-un' : 'stage-install'}${it.cls ? ' ' + it.cls : ''}">${s}</div>
  <p class="look">看点：${it.look}</p>
</section>\n`;
  }
}

/* 评审页自身（R2 · 用户 2026-10-02「两帧之间的过渡是什么动画，当前 html 只有静态，我无法观测」）：
   产品切帧**只有入场**——app.css 的 `.scr{animation:settle…,defog…}`（3d #18 定稿版：屏面落定 10px/.42s、
   去雾 .26s、子元素按阅读顺序每层错开 40ms；原 enter .8s/18px/6px 模糊已废）；旧屏则是硬切（app.js go()
   摘 .on ⇒ display:none，无出场动画、无交叉淡化）。定格页每节只点亮一屏、且 30 屏只在页面加载时各播一次
   （都在首屏之外）⇒ 这件事在定格页里天然看不见。这里把**卸载四帧装进同一扇真窗**，
   点按钮切帧／连播——机制与产品同（摘/加 .on），动画由产品那份 CSS 播，不是另写一套。
   ⚠️ 这是评审工具的功能，不是产品改动，不进 app.css；真机看仍走 _3d-ui\15-真卸载.bat。 */
let demoUn = chrome.replace('class="scr on"', 'class="scr"');
demoUn = tweaks.progU73(demoUn);        // 帧3 停在 73%（段2），四步态与真机一致
demoUn = tweaks.badgeKept(demoUn);      // 帧4 绿徽章（保留数据）
demoUn = must(demoUn, '<div class="scr un" id="s-confirm">', '<div class="scr un on" id="s-confirm">');
/* 安装窗：源里 #s-home 自带 .on ⇒ 先灭再点亮（否则两屏同亮）；进度定格 47%（段1）。 */
let demoIn = chrome.replace('class="scr on"', 'class="scr"');
demoIn = tweaks.progI47(demoIn);
demoIn = must(demoIn, '<div class="scr" id="s-home">', '<div class="scr on" id="s-home">');
const demoHtml = `
<section class="review-item" id="demo-frames">
  <h2>▶ 帧间过渡实演（评审页自身，不是产品改动） <code>点按钮切帧 · 动画跑的是产品真 CSS</code></h2>
  <p class="look prop">#18 切屏动效（<b>2026-10-02 定稿，已落地 app.css</b>）＝<b>窗不动 · 屏面落定 · 内容按阅读顺序逐层落定</b>：
屏面只落 10px、走指数级减速（.42s）；去雾拆成独立一条且更短（.26s）——先变清楚、后到齐；屏面里的直接子元素
每层错开 40ms、各落 8px（标题 → 正文 → 按钮）。首层合计位移仍≈18px（与旧版同一血缘），越靠后越少 ⇒ 收束而非发散；
全程 ≤.54s（旧版 enter 是 .8s/18px/6px 全域模糊）。⚠️ 只含<b>入场</b>；出场（旧屏硬切）保持现状、本次未动。</p>
  <p class="look">切帧本身只有<b>入场</b>、没有出场：旧屏是硬切（go() 摘 .on ⇒ display:none，不可过渡），新屏才播入场动画
（现版＝<code>settle</code>＋<code>defog</code>＋子元素 <code>land</code>：屏面落 10px/.42s、去雾 .26s、逐层错开 40ms；令牌见 app.css :root 的 --mo-*）。
两个完成屏另有两段共用动画：环 <code>pop</code>（0.6 倍长大到 1，0.8s —— 你说的「圆跳一下」）＋对勾 <code>draw</code>
（延迟 .25s、历时 .7s 自己画出来）。安装侧还多一层<b>彩粒迸发</b>（40 颗 5 色、自环心向上炸开，参数照
<code>app.js</code> 的 <code>burst()</code> 原样）——切到「⑤ 装好了」即可看到，且每次切进去都重播。</p>
  <div class="demo-bar"><span class="demo-lab">安装窗 780×570</span>
    <button type="button" class="dbtn on" data-stage="in" data-go="home">① 欢迎</button>
    <button type="button" class="dbtn" data-stage="in" data-go="progress">③④ 进度 47%</button>
    <button type="button" class="dbtn" data-stage="in" data-go="finish">⑤ 装好了（环跳一下＋彩粒）</button>
    <button type="button" class="dbtn play" data-play="in">▶ 依次播放（连播两轮）</button>
  </div>
  <div class="stage stage-install" id="demo-stage-in" data-frames="home,progress,finish">${demoIn}</div>
  <div class="demo-bar sec"><span class="demo-lab">卸载窗 720×540</span>
    <button type="button" class="dbtn on" data-stage="un" data-go="confirm">帧1 · 确认</button>
    <button type="button" class="dbtn" data-stage="un" data-go="running">帧2 · 运行中</button>
    <button type="button" class="dbtn" data-stage="un" data-go="un-progress">帧3 · 进度 73%</button>
    <button type="button" class="dbtn" data-stage="un" data-go="un-finish">帧4 · 完成（环同样跳一下）</button>
    <button type="button" class="dbtn play" data-play="un">▶ 依次播放（连播两轮）</button>
  </div>
  <div class="stage stage-uninstall mode-un" id="demo-stage-un" data-frames="confirm,running,un-progress,un-finish">${demoUn}</div>
  <p class="look">同一个 <code>.fin-ring</code> 两侧共用 ⇒ <code>pop</code>／<code>draw</code> 两段动画装/卸都有（卸载侧只覆盖尺寸与配色，没动动画）；
只有<b>彩粒</b>是安装专属（真源 <code>#confetti</code> 只写在 <code>#s-finish</code> 里，app.css 卸载段落注释明写「收场，不用安装时的彩条与粒子」）。
「依次播放」每 1.4s 切一帧（&gt; 0.8s，看得完整）；<code>prefers-reduced-motion</code> 下彩粒被整条关掉、两段动画压到瞬时。</p>
</section>`;

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
/* ⚠️ 评审壳只许在 body 上设「页面级」属性（底色/内边距/居中），**不许设 color / font-family**：
   产品窗口整棵子树挂在 body 下，这里设了就会被窗内元素继承走（.nm、.hero h1 em 自己不写 color ⇒ 变灰）。
   评审壳自己的文字一律在各自规则里显式声明字体与颜色。 */
body{background:#22222a;padding:28px 32px 80px;max-width:1040px;margin:0 auto}
.lead{font:13px/1.8 Consolas,monospace;color:#b6b2ab;background:#2c2c35;border:1px solid rgba(255,255,255,.10);border-radius:8px;padding:12px 16px}
.group{font:600 15px/1 Consolas,monospace;letter-spacing:.08em;color:#a892ff;margin:52px 0 4px;text-transform:uppercase}
.review-item{margin:34px 0}
.review-item h2{font:400 14px/1.4 Consolas,monospace;color:#f0ede8;margin:0 0 4px}
.review-item h2 code{font-size:11px;color:#b6b2ab;background:rgba(255,255,255,.08);padding:2px 8px;border-radius:6px;margin-left:8px}
/* 舞台＝产品 OS 窗口本体的**外沿**。件 3d-2（#2）后真窗口逐像素透明 ⇒ 窗口轮廓＝产品自己 .frame 的 32px 弧线
   （桌面色也由 .frame 自己画，舞台不再铺 --desk），窗外露出的就是桌面——评审页里用页面深色底板顶当「桌面」。
   圆角跟着对齐 32px；这圈阴影是评审页加的**参照**：无边框窗真机没有系统阴影，别当成真机行为。 */
.stage{position:relative;background:transparent;border-radius:32px;overflow:hidden;box-shadow:0 26px 70px rgba(0,0,0,.55),0 4px 16px rgba(0,0,0,.40);margin:12px 0 8px}
.stage-install{width:780px;height:570px}
.stage-uninstall{width:720px;height:540px}
/* grain 原先在产品里是 fixed（贴视口 ⇒ 会逃出圆角裁切、铺满整页），评审页才需要「.stage .grain{position:absolute}」压住。
   件 3d-2 已把它改成 absolute 并由 .frame（overflow:hidden）收着 ⇒ 产品自己就按住舞台，那条覆盖随之撤销。 */
.look{font:12px/1.8 Consolas,monospace;color:#a8a49d;margin:0}
.look::before{content:'看';display:inline-block;background:#8a6ff0;color:#fff;border-radius:4px;padding:1px 5px;margin-right:8px;font-size:10px}
.look.prop::before{content:'案';background:#2fbf8a}
/* 评审壳（R2）「帧间过渡实演」那一节的控件——在页面顶部，方便一眼看到；不属产品样式、不进 app.css */
.demo-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 0}
.demo-bar.sec{margin-top:26px}      /* 第二个窗（卸载）与上方安装窗拉开 */
.demo-lab{font:12px/1 Consolas,monospace;color:#8d8880;margin-right:2px}
.dbtn{font:12px/1 Consolas,monospace;color:#d8d4cd;background:#2c2c35;border:1px solid rgba(255,255,255,.14);
      border-radius:8px;padding:8px 12px;cursor:pointer}
.dbtn:hover{color:#fff;border-color:rgba(255,255,255,.32)}
.dbtn.on{color:#fff;background:#4a3f7a;border-color:#8a6ff0}
.dbtn.play{background:#8a6ff0;color:#fff;border-color:#8a6ff0}
.dbtn.play.playing{background:#5c4bb0}

</style>
</head>
<body>
<h1 style="font:400 20px/1.4 Consolas,monospace;color:#f5f2ed">安装器全 UI 评审 · 3d</h1>
<p class="lead">本页每节＝<b>一扇完整真窗口</b>：噪点、光球、玻璃壳、微尘、语言面板、✕，全部取自产品源
（app.html/app.css）原文，只点亮目标屏——<b>非手抄、非暗色变体</b>。改 UI 后重跑
<code>node tools/gen-review.mjs</code> 同步。窗角那圈系统小圆角已去掉（件 3d-2／#2 已落地：真窗口逐像素透明，
轮廓＝玻璃壳自己的 32px 弧线，窗外露出的深色＝评审页底板顶当的「桌面」）。定格静态：按钮不可点、语言切换不可用、完成屏彩带由 JS 生成（唯一例外＝顶部
「帧间过渡实演」一节，那几颗按钮只为演示切帧动画）——
<b>交互态/真机态</b>用 <code>E:\\linkdesk-build\\_3d-ui\\</code> 里的 bat（01 真流程 / 15 真卸载）。
验收基线：04 审计 18/20 不跌破。在 ZCode 内置浏览器里直接点元素留言即可。</p>
${demoHtml}
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

/* 帧间过渡实演（R2）：切帧＝摘/加 .on，与产品 app.js go(id) 同一套机制 ⇒ 入场动画由产品 CSS 真播。
   安装窗的「⑤ 装好了」另按 app.js burst() 的原参数补发彩粒（#confetti 只写在真源 #s-finish 里）。 */
(function () {
  var seed = 0x9E3779B9;
  function crnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var COLS = ['#8a6ff0', '#2fbf8a', '#e8b04b', '#f2f4ef', '#5a4bd1'];
  function burst(st) {
    var box = st.querySelector('#confetti');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < 40; i++) {              /* 40 颗、5 色、环心(50%/34%)向上炸开——逐项同 app.js */
      var c = document.createElement('i');
      var ang = crnd() * Math.PI * 2, d = 90 + crnd() * 220;
      c.style.setProperty('--dx', Math.cos(ang) * d + 'px');
      c.style.setProperty('--dy', Math.sin(ang) * d - 80 + 'px');
      c.style.setProperty('--rot', (crnd() * 720 - 360) + 'deg');
      c.style.left = '50%'; c.style.top = '34%';
      c.style.background = COLS[i % COLS.length];
      c.style.animation = 'burst ' + (0.9 + crnd() * 0.7) + 's ' + (crnd() * 0.15) + 's cubic-bezier(.16,1,.3,1) forwards';
      box.appendChild(c);
    }
  }
  [].forEach.call(document.querySelectorAll('.stage[id^="demo-stage-"]'), function (st) {
    var key = st.id.replace('demo-stage-', '');
    var ids = st.getAttribute('data-frames').split(',');
    var btns = [].slice.call(document.querySelectorAll('.dbtn[data-stage="' + key + '"][data-go]'));
    var play = document.querySelector('.dbtn.play[data-play="' + key + '"]');
    if (!play) return;
    var PLAY = play.textContent;
    var timer = null, i = 0;
    function go(id) {
      [].forEach.call(st.querySelectorAll('.scr'), function (s) { s.classList.remove('on'); });
      var t = st.querySelector('#s-' + id);
      if (t) {
        void t.offsetWidth;        /* 强制回流：同一屏再点亮也要重播动画（否则 display 同帧内不变化） */
        t.classList.add('on');
      }
      btns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === id); });
      if (id === 'finish') burst(st);           /* 只有安装的完成屏有彩粒 */
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer); timer = null;
      play.textContent = PLAY; play.classList.remove('playing');
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () { stop(); go(b.getAttribute('data-go')); });
    });
    play.addEventListener('click', function () {
      if (timer) { stop(); return; }
      play.textContent = '⏸ 停止'; play.classList.add('playing');
      go(ids[0]); i = 0;
      timer = setInterval(function () {
        i++;
        go(ids[i % ids.length]);
        if (i >= ids.length * 2) stop();        /* 连播两轮 */
      }, 1400);
    });
  });
})();
</script>
</body>
</html>
`;
writeFileSync(outPath, out);
console.log('写出 ' + outPath + ' (' + out.length + ' 字节, ' + sections.reduce((a, g) => a + g.items.length, 0) + ' 幕)');
