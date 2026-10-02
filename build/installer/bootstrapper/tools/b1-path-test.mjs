#!/usr/bin/env node
// b1-path-test.mjs — 台账 §二 B-1（安装路径自动补 `\linkdesk` 层）的**页面侧**回归。
//
// 为什么是"页面侧"而不是端到端：B-1 是**页面**的规整动作（`app.js` 的 normalizeInstallDir），
// 宿主 `--dir=` 保持"精确指定、不补层"（既有测试一条都不用改）。所以真源只有一处——
// 在真页面的真函数上求值，就是这个案子的正确证法；端到端跑安装只能证明宿主，证不到这一层。
//
// 判据两类：
//   A. 规整表（CASES）——输入 → 期望输出，逐条相等（含幂等、正斜杠、UNC、空/相对路径"不规整"）
//   B. 语法闸（ERR_CASES）——🔴 其中「D:\ 不再报错」正是 B-1 的**旧行为红**：
//      B-1 之前 `pathSyntaxError('D:\\')` 回 'root'（页面拦下盘根）；补层之后盘根一定合法。
//      这条若哪天回潮成 'root'，本测试当场红。
//
// 用法（bootstrapper 目录下）：
//   node tools\b1-path-test.mjs                       # 开发态壳 ..\out\bootstrapper.exe
//   node tools\b1-path-test.mjs --exe ..\out\bootstrapper.exe
// 退出码：0 全过；1 有任一案例不符（或无壳可起）。
// 依赖：tools/dom-probe.mjs（CDP 通道）——本脚本只负责**判据表 + 判红**，通道不重复造。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const exeArg = argv.includes('--exe') ? argv[argv.indexOf('--exe') + 1] : path.join(here, '..', 'out', 'bootstrapper.exe');

if (!existsSync(exeArg)) {
  console.error(`🔴 找不到壳：${exeArg}\n   先在 bootstrapper 目录跑 build.cmd（或 --exe <路径> 指一个）。`);
  process.exit(1);
}

/** A · 规整表：输入 → 期望（含幂等与"不规整"边界） */
const CASES = [
  ['D:\\', 'D:\\linkdesk', '台账 §二 B-1 本体：选盘根 ⇒ 自动补一层'],
  ['D:', 'D:\\linkdesk', '只剩盘符（无分隔符）⇒ 补固定反斜杠'],
  ['D:/', 'D:\\linkdesk', '盘根写正斜杠 ⇒ 仍补固定反斜杠'],
  ['D:\\Apps', 'D:\\Apps\\linkdesk', '普通目录 ⇒ 追加一层'],
  ['D:\\Apps\\', 'D:\\Apps\\linkdesk', '尾部分隔符先吃掉，不出现双斜杠'],
  ['D:/Apps', 'D:/Apps/linkdesk', '正斜杠习惯不给他改成反斜杠（sep 跟随输入）'],
  ['D:\\Apps\\linkdesk', 'D:\\Apps\\linkdesk', '幂等：已经是它那层，原样返回'],
  ['D:\\Apps\\LinkDesk', 'D:\\Apps\\LinkDesk', '幂等不挑大小写，且不改写用户的大小写'],
  ['D:\\Apps\\ness', 'D:\\Apps\\ness\\linkdesk', '深层目录同样追加'],
  ['\\\\server\\share', '\\\\server\\share\\linkdesk', 'UNC 也追加（不是替换）'],
  ['\\\\server\\share\\linkdesk', '\\\\server\\share\\linkdesk', 'UNC 幂等'],
  ['', '', '空 ⇒ 不规整（留给语法闸报 empty）'],
  ['relative\\dir', 'relative\\dir', '相对路径 ⇒ 不规整（语法闸会拦）'],
];

/** B · 语法闸：输入 → 期望 reason；第三列是「这条为什么在表里」 */
const ERR_CASES = [
  ['D:\\', '', '🔴 B-1 旧行为红：盘根**不再**报 root（补层后一定落得下去）'],
  ['D:\\linkdesk', '', '补层的结果本身必须是合法路径'],
  ['D:\\Apps', '', '普通绝对路径照常放行'],
  ['', 'empty', '空仍然报 empty'],
  ['relative', 'absolute', '相对路径仍然拦（会装到安装器工作目录里）'],
  ['D:\\a<b', 'chars', '非法字符仍然拦'],
];

const report = `(() => {
  const n = window.__lk && window.__lk.normalizeInstallDir;
  const e = window.__lk && window.__lk.pathSyntaxError;
  if (typeof n !== 'function' || typeof e !== 'function') {
    window.__b1 = { pass: false, missing: true };
    return { missing: true };
  }
  const normFails = [];
  for (const [inp, want] of ${JSON.stringify(CASES.map((c) => c.slice(0, 2)))}) {
    const got = n(inp);
    if (got !== want) normFails.push({ inp, want, got });
  }
  const errFails = [];
  for (const [inp, want] of ${JSON.stringify(ERR_CASES.map((c) => c.slice(0, 2)))}) {
    const got = e(inp);
    if (got !== want) errFails.push({ inp, want, got });
  }
  window.__b1 = { pass: normFails.length === 0 && errFails.length === 0 };
  return { normFails, errFails };
})()`;

console.log(`壳：${exeArg}`);
console.log(`规整表 ${CASES.length} 条 · 语法闸 ${ERR_CASES.length} 条`);
console.log('判据表（人读版）：');
for (const [inp, want, why] of CASES) console.log(`   ${JSON.stringify(inp)} → ${JSON.stringify(want)}   ${why}`);
for (const [inp, want, why] of ERR_CASES) console.log(`   pathSyntaxError(${JSON.stringify(inp)}) === ${JSON.stringify(want)}   ${why}`);
console.log('');

const r = spawnSync(
  process.execPath,
  [path.join(here, 'dom-probe.mjs'), '--exe', exeArg, '--preview', 'screen=home',
   '--eval', report, '--assert', 'window.__b1 && window.__b1.pass === true'],
  { stdio: 'inherit' },
);

console.log('\n（--eval 打出的 normFails/errFails 为空数组即全过；--assert 那行的 ✅/🔴 就是判决）');
process.exit(r.status === 0 ? 0 : 1);
