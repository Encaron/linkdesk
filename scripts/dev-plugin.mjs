#!/usr/bin/env node
/**
 * dev:plugin——壳侧 dev（E6#28b/#62c）：内置/仓库插件 dev 也走 dist 消费（与第三方同一条
 * loadPlugin bundled 路径）+ 增量重建，dev == prod 单一路径（归一化：别两轨）。
 *
 * 形态：
 *   npm run dev:plugin -- <插件id或路径>          # 浏览器模式（#28a）——委托 SDK dev-host（端口 1421 亚秒 HMR）
 *   npm run dev:plugin -- <插件id或路径> --electron  # 壳侧 dev——单插件 dist 消费 + 真 preload-pool IPC
 *
 * --electron 编排（顺序对齐 package.json electron:dev；显式 spawn 全用 .js/.exe 真路径，
 * 不走 concurrently/.cmd——Windows cmd 引号与 EINVAL 脆弱）：
 *   1. 先单插件 real build 一次（defineLinkdeskPluginConfig({ real: true })）→ 物化
 *      <插件根>/dist/<id>.linkdesk-plugin/（含根级 index.bundle.js）。无 JS 表面 → 报错退出。
 *   2. 设 env LINKDESK_DEV_PLUGIN_ID/DIR（DIR = 物化目录正斜杠）——主进程 dev 门控据此把发现/
 *      三表/loader 判轨收敛到该插件（electron/services/dev-plugin-mode.ts）。
 *   3. 拉起 vite(1420) → wait-on → tsc -p electron/tsconfig.json → electron-commonjs-fix →
 *      electron . --remote-debugging-port=9222（护栏②：插件改动 = renderer reload，不重启 electron）。
 *   4. watch 插件源码 → debounce 200ms → 单插件 real build → CDP 刷「LinkDesk Pool」；
 *      改 plugin.json → 额外刷同源其他窗口（壳侧表面）。
 *
 * 镜像引源：watch/ignore/debounce/CDP reload 逻辑镜像 packages/plugin-sdk/src/dev-real.ts
 * （E6#28.5 真机环）——SDK barrel 不导出 cdpReloadPool（公共面最小）；单份镜像为 .mjs 不在 jscpd
 * 扫描集（ts/tsx/css），不触发 duplication。差异：dev-real 直写 {userData}/plugins 走 linkdesk://；
 * 本脚本物化目录落在仓库内 → 池经 Vite /@fs 消费（resolvePath IPC 返物化目录 → loader isRuntime
 * 翻轨，src/pluginLoader/resolution/state.ts usesSourceGlobTrack）——react 等裸 import 沿仓库
 * node_modules 上溯 = 与壳同一 .vite/deps 单实例（vite.config 零改动）。
 */

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, watch } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { get as httpGet } from "node:http";

const require = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const SDK_DIST = join(REPO_ROOT, "packages", "plugin-sdk", "dist");
const CDP_PORT = Number(process.env.LINKDESK_CDP_PORT ?? 9222);
const SELF = "[dev:plugin]";

/* ── 参数解析 ─────────────────────────────────────────────── */

function usage() {
  return `dev:plugin——壳侧 dev（E6#28b/#62c）

用法：
  npm run dev:plugin -- [插件id | 插件根路径] [--electron]

  [插件id]          仓库内置插件目录名（plugins/<id>，如 editor / serial-monitor / file-tree）
  [插件根路径]      插件工程根（含 plugin.json 的目录，绝对或相对当前目录）
  （缺省）           当前目录含 plugin.json → 用当前目录
  --electron        壳侧 dev（dist 消费 + 真 IPC + CDP 刷池）；缺省 = 浏览器模式委托 SDK dev-host
                    （端口 1421 HMR，只支持带 entry 的视图插件）

示例：
  npm run dev:plugin -- editor                  # 浏览器 dev-host 微迭代（亚秒 HMR）
  npm run dev:plugin -- serial-monitor --electron   # 壳内真机（串口 IPC / 状态栏）
`;
}

function parseArgs(argv) {
  const positional = [];
  let electron = false;
  for (const a of argv) {
    if (a === "--electron") electron = true;
    else if (a.startsWith("-")) throw new Error(`未知参数 ${a}\n\n${usage()}`);
    else positional.push(a);
  }
  if (positional.length > 1) throw new Error(`多余位置参数：${positional.join(" ")}\n\n${usage()}`);
  return { electron, target: positional[0] ?? null };
}

/** 定位插件工程根（含 plugin.json）——目标可为仓库插件 id / 路径 / 当前目录 */
function resolvePluginRoot(target) {
  let cand;
  if (target === null) {
    cand = process.cwd();
  } else if (/[\\/]/.test(target)) {
    cand = resolve(target); // 绝对路径 / 盘符 / 相对路径（./ ../ 含分隔）
  } else {
    cand = join(REPO_ROOT, "plugins", target); // 仓库内置插件 id（无分隔）
  }
  if (!existsSync(join(cand, "plugin.json"))) {
    throw new Error(
      `${SELF} 找不到插件工程：${cand}/plugin.json 不存在` +
        (target ? `（目标「${target}」）` : "（当前目录无 plugin.json）") +
        `\n\n${usage()}`,
    );
  }
  return cand;
}

/* ── 物化 build（defineLinkdeskPluginConfig 全基于 process.cwd()——临时 chdir） ── */

function chdirRun(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

/** 本 build 是否有可装产物——主入口 index.bundle.js 或任一 views/<X>.bundle.js（镜像 dev-real.ts） */
function hasBuildOutput(pkgDir) {
  if (existsSync(join(pkgDir, "index.bundle.js"))) return true;
  const views = join(pkgDir, "views");
  if (!existsSync(views)) return false;
  try {
    return readdirSync(views).some((f) => f.endsWith(".bundle.js"));
  } catch {
    return false;
  }
}

/** 单插件 real build → 物化目录（幂等——reload cycle 复用）。define 在插件根求（读 cwd/plugin.json）。 */
async function runRealBuild(pluginRoot, pkgDir) {
  const { build: viteBuild } = await import("vite");
  // Windows ESM 动态 import 绝对路径需 file:// URL（node 默认 loader 只收 file/data/node scheme）
  const { defineLinkdeskPluginConfig } = await import(pathToFileURL(join(SDK_DIST, "index.js")).href);
  const config = chdirRun(pluginRoot, () => defineLinkdeskPluginConfig({ real: true }));
  await viteBuild(config);
  if (!hasBuildOutput(pkgDir)) {
    throw new Error(
      `build 无 JS 表面产物：${pkgDir}——纯贡献插件无物化可消费，壳侧 dev 只服务有代码表面的插件`,
    );
  }
}

/* ── CDP reload（镜像 dev-real.ts：Network.clearBrowserCache → Page.reload） ── */

function cdpListTargets(port) {
  return new Promise((resolveP, rejectP) => {
    const req = httpGet({ host: "127.0.0.1", port, path: "/json/list", timeout: 1500 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolveP(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (e) {
          rejectP(e);
        }
      });
    });
    req.on("error", rejectP);
    req.on("timeout", () => req.destroy(new Error("CDP /json/list 超时")));
  });
}

function reloadOneTarget(target) {
  return new Promise((resolveP) => {
    const url = target.webSocketDebuggerUrl;
    if (!url) return resolveP(false);
    const Ws = globalThis.WebSocket;
    if (!Ws) return resolveP(false);
    let ws;
    try {
      ws = new Ws(url);
    } catch {
      return resolveP(false);
    }
    const failTimer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolveP(false);
    }, 4000);
    ws.onopen = () => {
      // 顺序发：enable → clearBrowserCache → reload；reload（id 3）回复即前两步已完成
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.id === 3) {
          clearTimeout(failTimer);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolveP(true);
        }
      };
      ws.send(JSON.stringify({ id: 1, method: "Network.enable" }));
      ws.send(JSON.stringify({ id: 2, method: "Network.clearBrowserCache" }));
      ws.send(JSON.stringify({ id: 3, method: "Page.reload", params: { ignoreCache: true } }));
    };
    ws.onerror = () => {
      clearTimeout(failTimer);
      resolveP(false);
    };
  });
}

/** 刷「LinkDesk Pool」（插件代码主消费面）；alsoShell=true 额外刷同源其他非 devtools 页面窗口 */
async function cdpReloadPool(port, alsoShell) {
  let targets;
  try {
    targets = await cdpListTargets(port);
  } catch {
    return false;
  }
  const hits = [];
  for (const t of targets) {
    if (t.title === "LinkDesk Pool") hits.push(t);
    else if (alsoShell && t.type === "page" && t.title && !String(t.url ?? "").includes("devtools")) hits.push(t);
  }
  if (hits.length === 0) return false;
  const results = await Promise.all(hits.map(reloadOneTarget));
  return results.some(Boolean);
}

/* ── watch 忽略（镜像 dev-real.ts isIgnoredRel——build 输出/dist 自激重建挡掉） ── */

function isIgnoredRel(abs, root) {
  // 纵深防御：root 自身 / 非 root 子树路径（null 回退的残留形态）恒忽略——「根自身」绝不作变更源。
  // 正常子路径恒 root + "/" + 尾段 → abs.length > root.length；等长只可能是 abs === root。
  if (abs === root || abs.length < root.length) return true;
  const rel = abs.slice(root.length).split(/[\\/]/).filter(Boolean);
  for (const seg of rel) {
    if (seg === "node_modules" || seg === ".git" || seg === "dist" || seg === ".linkdesk-real") return true;
  }
  if (abs.endsWith(".linkdesk-plugin")) return true;
  return false;
}

/* ── wait-on（轮询 http GET——镜像 wait-on 语义） ── */

function waitForServer(urlStr, timeoutMs) {
  return new Promise((resolveP, rejectP) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const req = httpGet(urlStr, (res) => {
        res.resume();
        resolveP();
      });
      req.on("error", () => {
        if (Date.now() > deadline) rejectP(new Error(`等待 ${urlStr} 超时（${timeoutMs}ms）`));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

/* ── 主流程 ─────────────────────────────────────────────────── */

const { electron: wantElectron, target } = parseArgs(process.argv.slice(2));
const pluginRoot = resolvePluginRoot(target);
const pluginId = basename(pluginRoot);
// derivePluginId = manifest.pluginId ?? 目录名——仓库内置均无 pluginId → 恒目录名
const pkgDir = join(pluginRoot, "dist", `${pluginId}.linkdesk-plugin`);

if (!wantElectron) {
  // 浏览器模式（#28a）——委托 SDK dev-host（端口 1421 HMR），不造新宿主
  const bin = join(SDK_DIST, "bin.js");
  console.log(`${SELF} 浏览器模式 → 委托 SDK dev-host（cwd=${pluginRoot}，端口 1421 HMR）`);
  const child = spawn(process.execPath, [bin, "dev"], { cwd: pluginRoot, stdio: "inherit" });
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      try {
        child.kill();
      } catch {
        /* 已退出 */
      }
    });
  }
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  await runShellDev(pluginRoot, pluginId, pkgDir);
}

/** 壳侧 dev 主流程（--electron）——env/子进程/cleanup/监听全部在函数内收口 */
async function runShellDev(pluginRoot, pluginId, pkgDir) {
  console.log(`\n${SELF} 壳侧 dev（E6#28b/#62c）→ 插件「${pluginId}」（${pluginRoot}）`);
  console.log(`${SELF} 物化目标：${pkgDir}`);
  console.log(`${SELF} 1/4 初始单插件 build（real）…`);

  try {
    await runRealBuild(pluginRoot, pkgDir);
  } catch (e) {
  console.error(`${SELF} ❌ 初始 build 失败：${e instanceof Error ? e.message : String(e)}`);
  console.error(
    `${SELF}    纯贡献插件（无 entry / 无 contributes.views[].render）请用浏览器 dev-host 或直接 electron:dev；` +
      `${SELF}    壳侧 dev 只服务有 JS 表面的代码迭代`,
  );
  process.exit(1);
}
console.log(`${SELF} ✓ 物化产物就绪`);

// dev 门控 env——electron 进程读取；vite/tsc 不读无副作用
const env = {
  ...process.env,
  LINKDESK_DEV_PLUGIN_ID: pluginId,
  LINKDESK_DEV_PLUGIN_DIR: pkgDir.replace(/\\/g, "/"),
  PATH: `${join(REPO_ROOT, "node_modules", ".bin")}${isWin ? ";" : ":"}${process.env.PATH ?? ""}`,
};
// ⚠ ELECTRON_RUN_AS_NODE：本会话 harness 注入=1，Electron 以纯 Node 运行 → require('electron')
// 返回 exe 路径字符串 → main 崩 electron_1.app undefined（memory electron-run-as-node-trap，三实证）。
// 显式剥除，防 electron 子进程继承后以 node 模式启动 main.js 崩溃。
delete env.ELECTRON_RUN_AS_NODE;
// ⚠ NODE_ENV：壳/池全部模块经 `import.meta.env.DEV` 三元选 URL（dev→/@fs 即时编译、prod→linkdesk:// 原样
// 裸 import）。父进程若带 NODE_ENV=production（部分 shell/npm/CI），vite dev 会烤出 DEV=false/PROD=true →
// 池/壳全走 prod 分支 linkdesk:// → 物化 bundle 裸 react 无 import-map 解析即崩 "Failed to resolve module
// specifier react/jsx-runtime"（#62c 真机实证 2026-09-07）。壳侧 dev 恒要 dev 语义——钉死 NODE_ENV=development。
env.NODE_ENV = "development";

const children = [];
let exiting = false;
function cleanup(code) {
  if (exiting) return;
  exiting = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(code ?? 0);
}
process.once("SIGINT", () => cleanup(130));
process.once("SIGTERM", () => cleanup(143));
process.once("uncaughtException", (e) => {
  console.error(`${SELF} ❌ ${e instanceof Error ? e.message : String(e)}`);
  cleanup(1);
});

// shell 生态——顺序对齐 package.json electron:dev：vite → wait-on → tsc → fix → electron
const viteChild = spawn(process.execPath, [join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js")], {
  cwd: REPO_ROOT,
  env,
  stdio: "inherit",
});
children.push(viteChild);

console.log(`${SELF} 2/4 等 Vite dev server（http://localhost:1420）…`);
try {
  await waitForServer("http://localhost:1420", 60000);
} catch (e) {
  console.error(`${SELF} ❌ ${e instanceof Error ? e.message : String(e)}`);
  cleanup(1);
}

console.log(`${SELF} 3/4 编译 electron 主进程（tsc + commonjs-fix）…`);
const tscJs = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
const fixJs = join(REPO_ROOT, "scripts", "electron-commonjs-fix.cjs");
for (const [cmd, args] of [
  [process.execPath, [tscJs, "-p", join(REPO_ROOT, "electron", "tsconfig.json")]],
  [process.execPath, [fixJs]],
]) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, env, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`${SELF} ❌ electron 主进程编译失败（exit ${r.status}）`);
    cleanup(1);
  }
}

// electron 可执行路径——electron npm 包在 node 环境 require 即返回二进制路径
const electronPath = require("electron");
const electronArgs = [".", `--remote-debugging-port=${CDP_PORT}`];
// 隔离 profile 逃生舱（#28c 边界注记 + 清单§残余账本瞬态）：默认 userData 可能带着已卸载插件账本/
// 僵尸 workspace 标签（gated 会话只加载被 dev 插件，其余全部报错）。作者常设独立 profile 隔离真实
// 工作区。可选：LINKDESK_DEV_USER_DATA_DIR=<绝对路径> → 追加 electron --user-data-dir。
const isoProfile = process.env.LINKDESK_DEV_USER_DATA_DIR;
if (isoProfile) electronArgs.push(`--user-data-dir=${isoProfile.replace(/\\/g, "/")}`);
console.log(`${SELF} 4/4 启动 Electron（dev 门控：仅「${pluginId}」走 dist 消费；--remote-debugging-port=${CDP_PORT}` +
  (isoProfile ? `；隔离 profile=${isoProfile}` : "") + "）…");
const electronChild = spawn(electronPath, electronArgs, {
  cwd: REPO_ROOT,
  env,
  stdio: "inherit",
});
children.push(electronChild);

console.log(`${SELF} 监听 ${pluginRoot}——改码 → 单插件重建 → renderer reload（Ctrl+C 停止）\n`);

// watch → debounce 200ms → 重建 → CDP 刷池（串行化：build 中变更记 dirty 补一轮——镜像 dev-real.ts）
let building = false;
let dirty = false;
let reloadWarned = false;
let timer = undefined;

async function cycle(why, alsoShell) {
  console.log(`${SELF} ${why}`);
  try {
    await runRealBuild(pluginRoot, pkgDir);
  } catch (e) {
    console.error(`${SELF}   ✗ build 失败（保留旧物化产物继续监听）：${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const reloaded = await cdpReloadPool(CDP_PORT, alsoShell);
  if (reloaded) {
    console.log(`${SELF}   ✓ LinkDesk ${alsoShell ? "窗口" : "Pool"} 已刷新（CDP ${CDP_PORT}）`);
  } else if (!reloadWarned) {
    reloadWarned = true;
    console.log(
      `${SELF}   ⚠ CDP ${CDP_PORT} 连不上——Electron 未起/已退出？改码后会自动重试` +
        `（linkdesk:// 主进程三表类改动须重启 electron 生效，护栏②作用域 = renderer）`,
    );
  }
}

const schedule = (why, alsoShell) => {
  if (exiting) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void (async () => {
      if (building) {
        dirty = true;
        return;
      }
      building = true;
      try {
        await cycle(why, alsoShell);
        if (dirty) {
          dirty = false;
          await cycle("变更累积，补一轮", alsoShell);
        }
      } finally {
        building = false;
      }
    })();
  }, 200);
};

try {
  watch(pluginRoot, { recursive: true }, (_ev, filename) => {
    // ⚠ Windows recursive fs.watch：目录树大量 churn（本工具自身 build 清空/重写 dist/ 的输出）时，
    // Node 发 filename=null 聚合事件（无法枚举具体文件，无路径可滤）。若按 pluginRoot 处理必自激重建
    // ——上轮真机实测 26 轮死循环、build 互相打断把物化目录清到一半。真实源码保存必带 filename，
    // null 一律丢弃（唯一代价：源码树极端批量 churn 溢出时漏一次重建，作者重存一次即补）。
    // 镜像 dev-real.ts 同款处理（镜像源同步修，两处保持同构）。
    if (!filename) return;
    const abs = resolve(pluginRoot, String(filename));
    if (isIgnoredRel(abs, pluginRoot)) return;
    const alsoShell = /(^|[\\/])plugin\.json$/.test(String(filename));
    schedule(`文件变更 → 重建（${String(filename)}）`, alsoShell);
  });
} catch {
  console.error(`${SELF} ⚠ 递归文件监听不可用——降级为一次性 build；改码后重启本命令生效`);
}

  // 挂起直到 electron 退出
  await new Promise((resolveP) => {
    electronChild.on("exit", resolveP);
  });
  cleanup(0);
}
