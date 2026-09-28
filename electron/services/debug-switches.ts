/**
 * debug-switches——M5 `AI#17`/`AI#18`：调试开关（CDP 家族）的**跨重启保留**与**二次启动路由**。
 *
 * 设计：[01-设计.md §四 M5](../../docs/04-软件更新/待抉择池/AI友好化-全自动操作/01-设计.md)；
 * 详案：[M5-安装版.md `AI#17`/`AI#18`](../../docs/04-软件更新/待抉择池/AI友好化-全自动操作/03-任务档案/M5-安装版.md)。
 *
 * 🔴 **为什么需要这一层（根因链，逐段实读）**：
 *   ① 我们起安装器只传 `/S --force-run`（`update-install.ts` 的 `defaultLaunch`）；
 *   ② 装完把 App 拉回来的 NSIS `StartApp` 宏**只带 `--updated`**
 *      （`app-builder-lib/templates/nsis/common.nsh:122-133`）——我们自己的命令行**一个字节都传不过去**，
 *      且模板**没有** `customStartApp` 挂点可插；
 *   ③ 于是「带 `--remote-debugging-port` 启动 → 应用内自动更新 → 重启」之后端口没了：
 *      AI 的连接在更新这一跳**必然断**（`AI#19` 的判据 ②）。
 * ⇒ 唯一通道 = **装前把参数落进待安装记录，重启时在 app ready 之前重新 `appendSwitch`**
 *   （写侧 `update-install.ts` 的 `getDebugSwitches`，读侧 `applyDebugSwitches`）。
 *
 * 🔴 **三条不出声的坑，各有一处防线**：
 * ① **白名单，不是整串 argv**（详案 `AI#17` 风险条原文「⛔ 不要整串 `argv` 无脑继承」）——只认
 *    `DEBUG_SWITCH_NAMES` 里那两个；其余一律不透传，否则「调试参数」变成一种会被跨重启复活的持久状态。
 * ② **只增不减**（`planDebugAdoption` 的并集语义）：二次启动**没带**调试开关时（= 双击图标）⛔ **不许**
 *    把正在服务的端口掐掉——否则一次误双击就断了 AI 的连接。要关端口只能退出重开（M4 的设置开关另说）。
 * ③ **一份真相**（`applyDebugSwitches` 里那次 `process.argv.push`）：`appendSwitch` **不改** `process.argv`，
 *    而「当前有哪些调试开关」有四个消费方——启动复位自身、安装腿写记录（`getDebugSwitches`）、本文件的
 *    并集裁决、以及**两处既有的 `app.relaunch()`**（其缺省 `args = process.argv.slice(1)`）。
 *    不推回 argv ⇒ 它们各看一份可能过期的盘面（最典型的后果：**第二次**更新时记录里又空了，端口二次丢失）。
 *    ⇒ 三处消费方一律只读 `process.argv`，本模块是**唯一**写入口。
 *
 * 🔴 **④ 换端口这一跳不能立刻重启**（`waitRestartWindow`）——二次启动那个进程**自己就绑着**请求的端口
 *    （开关在它自己的 argv 里），立刻 `app.relaunch()` 出来的并集进程绑不上，而 CDP 端口**绑不上不重试**
 *    ⇒ 结果是一个「跑着但没有调试口」的 App。打包态 5/5 复现（根因与实测见 `freePorts` / `waitRestartWindow`）。
 */

import { connect } from 'node:net';
import { app } from 'electron';

/**
 * 白名单（详案 `AI#17`「只透传调试类 switch」）——**只有这两个**：
 *   · `remote-debugging-port`：AI 连的就是它（「更新后 AI 仍能操作」的唯一必需项）；
 *   · `remote-allow-origins`：CDP 客户端的来源放行（浏览器页发起连接才要；`*` 或逗号分隔 origin）。
 *
 * ⚠️ **故意不收 `remote-debugging-address`**（对外监听，如 `0.0.0.0`）——它是**放大风险**的那一个：
 *    跨重启保留 = 让一个「用户早已忘了的对外调试口」跟着软件一直开着。丢掉它 = 回落默认回环
 *    （更保守的那一侧），本机 AI 照样连得上；真要对外监听就重新带参启动
 *    （[01-设计.md §八 绕行路径](../../docs/04-软件更新/待抉择池/AI友好化-全自动操作/01-设计.md) 的路径本身没被堵）。
 */
const DEBUG_SWITCH_NAMES = new Set(['remote-debugging-port', 'remote-allow-origins']);

/** 端口形状：纯数字 1–65535。⚠️ **不收 `0`**——Chromium 里 `0` = 每次启动随机挑端口，捡回来也连不上 */
const PORT_RE = /^\d{1,5}$/;
const PORT_MIN = 1;
const PORT_MAX = 65535;

interface ParsedSwitch {
  name: string;
  value: string;
}

/**
 * 解析单个 `--name=value`。
 * ⛔ 不收「空格分隔」形（`--name value`）：Chromium 开关只用 `=`，另一种写法是我们自己发明的歧义；
 * ⛔ 不收无值开关：白名单里两个开关都**必须**带值，缺值 = 无意义（而 `--force-run` 那类无值开关不在白名单里）。
 */
function parseSwitch(raw: unknown): ParsedSwitch | null {
  if (typeof raw !== 'string' || !raw.startsWith('--')) return null;
  const eq = raw.indexOf('=');
  if (eq < 3) return null;
  const name = raw.slice(2, eq).toLowerCase();
  const value = raw.slice(eq + 1);
  if (!value) return null;
  return { name, value };
}

/** 值校验（按名逐个判）——⛔ 不认的值一律丢：写进记录再跨重启，等于把脏值变成持久状态 */
function isValidValue(name: string, value: string): boolean {
  if (name === 'remote-debugging-port') {
    if (!PORT_RE.test(value)) return false;
    const port = Number(value);
    return port >= PORT_MIN && port <= PORT_MAX;
  }
  // `remote-allow-origins`：Chromium 只看「是不是 origin 列表」，我们只拦空白（命令行里带空白 = 拼错了）
  return !/\s/.test(value);
}

function format(s: ParsedSwitch): string {
  return `--${s.name}=${s.value}`;
}

/** 挑出白名单内的开关（**已解析**形）；两个方向的口径都在这里收口：白名单 + 值校验 + 去重 */
function selectDebugSwitches(argv: readonly unknown[]): ParsedSwitch[] {
  const out: ParsedSwitch[] = [];
  for (const raw of argv) {
    const parsed = parseSwitch(raw);
    if (!parsed) continue;
    const normalized = format(parsed);
    if (!DEBUG_SWITCH_NAMES.has(parsed.name)) {
      // 「CDP 家族但不在白名单」= 用户确实在调试、而我们**故意**不跨重启保留它（如 `remote-debugging-address`）
      // ——出声，别让它悄悄消失（手册 07 §2.4 同款说明）。
      if (parsed.name.startsWith('remote-')) {
        console.warn(`[debug-switches] 不在白名单、不跨重启保留: ${normalized}`);
      }
      continue;
    }
    if (!isValidValue(parsed.name, parsed.value)) {
      console.warn(`[debug-switches] 值不合法、已丢弃: ${normalized}`);
      continue;
    }
    if (!out.some((s) => s.name === parsed.name && s.value === parsed.value)) out.push(parsed);
  }
  return out;
}

/**
 * 从命令行参数里挑出白名单内的调试开关（规范化成 `--name=value`，去重保序）。
 *
 * ⚠️ 名字**大小写不敏感**（Chromium 侧就是），落回一律小写——否则 `--Remote-Debugging-Port=9222`
 * 与小写形会被当成两个开关，并集裁决里就成了「同名单值并存」。
 */
export function extractDebugSwitches(argv: readonly string[]): string[] {
  return selectDebugSwitches(argv).map(format);
}

/**
 * 把任意值**收窄成落盘形状**（写侧用；读侧由 `applyDebugSwitches` 再收一次）。
 *
 * 记录是盘上的文件——旧版写的、手编的、别的程序塞的都可能出现 ⇒ 白名单在**两道**上都强制。
 * 非数组 / 元素不是字符串 / 不在白名单 / 值不合法，一律**静默丢**（丢的后果只是「端口不保留」，
 * 而拿脏值去 `appendSwitch` 的后果是「按外部 JSON 开端口」）。
 */
export function sanitizeDebugSwitches(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return extractDebugSwitches(raw.filter((x): x is string => typeof x === 'string'));
}

/** `appendSwitch` 的注入面——缺省真调 `app.commandLine.appendSwitch`（单测给替身） */
export interface ApplyDebugSwitchesDeps {
  appendSwitch?: (name: string, value: string) => void;
  /** 推回目标 argv（缺省 `process.argv`）——注入只为单测不污染测试进程 */
  argv?: string[];
}

/**
 * 让一批调试开关**在本进程生效**——🔴 **必须在 app ready 之前调用**（`appendSwitch` 的时限）。
 *
 * @returns 生效的开关；空数组 = 本进程没有任何调试开关生效（调用方据此可确认「默认不监听」仍成立）
 *
 * ⚠️ 与头注 ③ 配套：`appendSwitch` 只改 Chromium 的开关表、**不动 `process.argv`**，于是「已经生效了」
 * 这件事从命令行上看不出来。这里**顺手把生效的开关推回 argv**，让四个消费方只认 `process.argv` 一份真相。
 * ⚠️ argv 里**已有**的开关不再 append：新起的进程本来就带着它（Chromium 自己已取走），重复发只是噪声。
 */
export function applyDebugSwitches(
  switches: readonly string[] | undefined,
  deps: ApplyDebugSwitchesDeps = {},
): string[] {
  const list = selectDebugSwitches(switches ?? []);
  if (list.length === 0) return [];
  const append = deps.appendSwitch ?? ((name: string, value: string) => app.commandLine.appendSwitch(name, value));
  const argv = deps.argv ?? process.argv;
  for (const s of list) {
    const normalized = format(s);
    if (argv.includes(normalized)) continue;
    append(s.name, s.value);
    argv.push(normalized);
  }
  return list.map(format);
}

/** 二次启动请求的裁决结果（`AI#18`） */
export interface DebugAdoptionPlan {
  /** true = 必须重启本进程才能让请求生效（Chromium 开关改不了运行中的实例） */
  restart: boolean;
  /** 本次**新采纳**的开关（请求里有、当前没有的）——日志用 */
  adopted: string[];
  /** 重启时传给新进程的完整参数（见 `planDebugAdoption` 注释） */
  args: string[];
  /**
   * 🔴 **重启前必须等它变空闲的端口** = 请求里带的 `--remote-debugging-port` 值（无则空）。
   *
   * 为什么是「请求里的」而不是「合并结果里的」：**二次启动那个进程自己 argv 里就带着这个端口**，
   * Chromium 在它 init 时就绑上了（它随后才因 `!gotLock → app.quit()` 退场）。此刻立刻
   * `app.relaunch()` 出来的并集进程会 bind 失败，而 **CDP 端口绑不上不会重试** ⇒ 得到一个
   * 「能跑但没有调试口」的 App。2026-09-28 打包态实测：`--dir` 产物连跑 5 遍，5/5 新端口不通
   * （App 日志实证：二次启动那个进程先 `DevTools listening on ws://127.0.0.1:9412`，随后
   * 并集进程全程**没有** DevTools 行）。合并结果里的端口若来自现状（= 本进程自己绑着的那个），
   * 等它空闲会死等——本进程退出前不会释放，故**只等请求里那一个**。
   */
  freePorts: number[];
}

/** 去掉白名单内的调试开关（其余原样保留）——与「最后留哪些」分开，两次调用点各自只关心一件事 */
function stripDebugSwitches(args: readonly string[]): string[] {
  const kept = args.filter((a) => {
    const parsed = parseSwitch(a);
    return !parsed || !DEBUG_SWITCH_NAMES.has(parsed.name);
  });
  return [...new Set(kept)];
}

/** 名字 → 值。同一名字出现多次时**取最后那个**（Chromium 自己也是按命令行顺序解析） */
function toMap(list: readonly ParsedSwitch[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of list) m.set(s.name, s.value);
  return m;
}

/** 按**名**合并：请求里出现过的名字以请求为准（换端口 = 真的把旧的换掉），其余保持现状 */
function mergeDebugSwitches(current: readonly ParsedSwitch[], requested: readonly ParsedSwitch[]): ParsedSwitch[] {
  const merged = toMap(current);
  for (const [name, value] of toMap(requested)) merged.set(name, value);
  return [...merged].map(([name, value]) => ({ name, value }));
}

/**
 * 二次启动的调试开关裁决（`AI#18` 的纯函数核）。
 *
 * | 请求（二次启动的命令行） | 现状（本进程） | 裁决 |
 * |:--|:--|:--|
 * | 没带调试开关（双击图标） | 有端口 | **不重启**（② 只增不减：误双击不得掐掉 AI 的连接） |
 * | 带了已生效的那个 | 有端口 | **不重启**（幂等——否则新实例收到同一请求会自激成重启环） |
 * | 带了新的开关 / 新的端口值 | 任何 | **重启**（合并结果 = 请求覆盖同名现状，其余沿用现状） |
 *
 * ⚠️ `requestedArgs` / `baseArgs` 都是**去掉 argv[0]（exe 自身）**的那一段——与 `second-instance`
 * 事件的 `argv.slice(1)`、`app.relaunch` 的 `args` 语义对齐（调用点见 `electron/main.ts`）。
 *
 * ⚠️ 请求里的**非开关**参数（最典型 = 文件路径）**一并带进新进程**：本进程正要退出，交给刚起来的那个
 * 实例 = 不丢；否则「带调试开关 + 顺带开个文件」的组合会把文件丢掉。`baseArgs` 也整段带上（等价于
 * `app.relaunch()` 的缺省语义），其中 `--user-data-dir=<原值>` 必须跟着走——它是单实例锁的键，
 * 丢了就换了一份 userData（等价于换了身份）。⚠️ **冲突值不必管**：不同 userData = 不同的锁键 ⇒
 * 那个进程**根本走不到** `second-instance`（它自己就是新实例），本函数见不到这种输入。
 *
 * ⚠️ `args` 里**同名开关只有一个值**（`mergeDebugSwitches` 的 map 保证）：Chromium 取第一个还是最后
 * 一个属实现定义，我们**不赌**——输出端不留重复，两种取法结果相同。
 */
export function planDebugAdoption(
  requestedArgs: readonly string[],
  baseArgs: readonly string[],
): DebugAdoptionPlan {
  const current = selectDebugSwitches(baseArgs);
  const currentValues = toMap(current);
  const requested = selectDebugSwitches(requestedArgs);
  const merged = mergeDebugSwitches(current, requested);
  const adopted = merged.filter((s) => currentValues.get(s.name) !== s.value).map(format);
  const passthrough = [...new Set([...stripDebugSwitches(baseArgs), ...stripDebugSwitches(requestedArgs)])];
  const freePorts = requested
    .filter((s) => s.name === 'remote-debugging-port')
    .map((s) => Number(s.value));
  return { restart: adopted.length > 0, adopted, args: [...passthrough, ...merged.map(format)], freePorts };
}

/**
 * 端口探测：**没人听 = 空闲**。
 *
 * 判据只能是「连得上吗」——Windows 上查表（`netstat`）要起进程、还要区分 LISTEN/TIME_WAIT，
 * 而我们要的结论只有一句「那个进程放开它了吗」。连上 = 还被占着；`ECONNREFUSED` = 放了。
 * ⚠️ 超时也按「空闲」算（回环上真在听必然秒回；超时说明这端口不可达，等下去没有意义）。
 */
export function probePortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    let settled = false;
    const finish = (free: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(free);
    };
    socket.setTimeout(PORT_PROBE_MS);
    socket.once('connect', () => finish(false));
    socket.once('timeout', () => finish(true));
    socket.once('error', () => finish(true));
  });
}

/** 等重启窗口的注入面（单测给替身，不碰真时钟与真端口） */
export interface RestartWindowDeps {
  isPortFree?: (port: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  settleMs?: number;
}

export interface RestartWindow {
  /** 每个待等端口的最终结论（true = 已空闲）——日志用 */
  freed: boolean[];
  waitedMs: number;
  /** true = 到超时还没等到（调用方出声，但**照旧重启**：用户已经要求重启了，不能把他晾在这儿） */
  timedOut: boolean;
}

const PORT_PROBE_MS = 400;
const POLL_MS = 100;
/** 二次启动那个进程的**实测寿命** ~0.7–0.9s（2026-09-28 打包态：777/784/789/794/801ms 五遍）
 *  ⇒ 即使请求里没有端口（只换了 `--remote-allow-origins` 之类），也等这么久——把「它还没退场就
 *    重启」这一跳避掉（那会引出一次多余的 relaunch 接力：日志里两个进程互相采纳、各重启一次）。 */
const DEFAULT_SETTLE_MS = 900;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 重启前的等待窗口：**请求里的端口都空闲 且 至少过了 settleMs**，或到超时。
 *
 * 两件事都要满足：
 *   · 端口空 ⇒ 并集进程才绑得上那个端口（否则 CDP 永久哑掉，见 `freePorts` 注释）；
 *   · settle  ⇒ 二次启动那个进程退场（否则它还会收到并集进程的 `second-instance`，多走一跳重启）。
 */
export async function waitRestartWindow(
  ports: readonly number[],
  deps: RestartWindowDeps = {},
): Promise<RestartWindow> {
  const isPortFree = deps.isPortFree ?? probePortFree;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS;
  const start = now();
  for (;;) {
    const freed: boolean[] = [];
    for (const port of ports) freed.push(await isPortFree(port));
    const waitedMs = now() - start;
    if (freed.every(Boolean) && waitedMs >= settleMs) return { freed, waitedMs, timedOut: false };
    if (waitedMs >= timeoutMs) return { freed, waitedMs, timedOut: true };
    await sleep(POLL_MS);
  }
}
