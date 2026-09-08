/**
 * `linkdesk-plugin-sdk dev --real`——E6#28.5 第三方作者真机调试环（生产 LinkDesk 秒级环，壳零新代码）。
 *
 * 作者在自己的插件工程根跑 `dev --real`：
 *   1. 复用 E6#25/#15 SDK 单插件 build（defineLinkdeskPluginConfig({ real: true })）——产物 = 完整物化目录
 *      dist/<id>.linkdesk-plugin/（plugin.json + index.bundle.js + views/*.bundle.js + index.bundle.css +
 *      assets/ + i18n/ + icon…），与 .linkdesk-plugin zip 解包布局一致（壳 loader 发现 = 目录含 plugin.json）。
 *   2. 物化目录**直写** {userData}/plugins/<id>（平台标准 %APPDATA% 等；LINKDESK_USER_PLUGINS_DIR 覆盖）
 *      ——不经 plugins:extract「存在即拒」、不碰 E6#15n boot 门禁：直写磁盘 + reload = dev 覆盖语义
 *      （生产 linkdesk:// 逐请求 readFileSync；但 protocol.handle 响应无 Cache-Control → 会被 Chromium 缓存，
 *      reload 前须清缓存才落盘生效——机制实锤 + 修正见 04-作者真机调试环.md §二/§六）。
 *   3. watch 作者源码 → 变更自动 重建→直写→reload。作者以 `--remote-debugging-port=9222` 启动 LinkDesk
 *      （Chromium 原生 switch，壳零代码）→ SDK 经 CDP Network.clearBrowserCache + Page.reload 刷「LinkDesk Pool」窗口
 *      （清缓存后 reload 重 import 落到磁盘逐请求 readFileSync = 真机生效）；
 *      9222 同时是 CDP/AI 全自动调试入口（沿用 dev-fixtures/toast.mjs 连法）。
 *
 * 边界（04 档案 §六）：作用域 = 作者自研 dev 插件——目标目录若已有同 id 安装（市场装发布版）会被**覆盖且不备份**；
 * 多插件工程并行 dev 需各自独立工程；CSS 等热更走整窗口 reload（秒级，非亚秒 HMR——那是 E6#28.7 B 的候选卖点）。
 * 作者仍不碰壳源码/构建（插件独立铁律），不造第二壳。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, watch, type FSWatcher } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { get as httpGet, type IncomingMessage } from "node:http";
import { build } from "vite";
import { defineLinkdeskPluginConfig } from "./vite-config.js";
import { derivePluginId, readPluginManifest } from "./validate.js";

/** CDP reload 端口默认 9222（与壳 dev electron:dev 尾部 --remote-debugging-port=9222 对齐）；LINKDESK_CDP_PORT 覆盖 */
export const CDP_PORT = Number(process.env.LINKDESK_CDP_PORT ?? 9222);

/** 作者当前平台 LinkDesk userData/plugins 代码根（Electron 默认 userData = appData/<appName>，dev/打包同名 "linkdesk"）。
 *  LINKDESK_USER_PLUGINS_DIR 环境变量可覆盖（自定义安装布局 / CI 隔离 userData 的逃生门）。 */
export function resolveUserPluginsDir(): string {
  const override = process.env.LINKDESK_USER_PLUGINS_DIR;
  if (override && override.trim()) return resolve(override.trim());
  const home = homedir();
  switch (process.platform) {
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "linkdesk", "plugins");
    case "darwin":
      return join(home, "Library", "Application Support", "linkdesk", "plugins");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "linkdesk", "plugins");
  }
}

/** 平台判定代码根目录是否已存在（首启时可能还没有——提示作者先跑一次 LinkDesk，或给 LINKDESK_USER_PLUGINS_DIR） */
function userPluginsDirExists(): boolean {
  return existsSync(resolveUserPluginsDir());
}

/* ── 物化目录直写 ─────────────────────────────────────────────── */

/** 覆盖式深拷贝（dev 覆盖语义——rm 目标后再拷，不残留本 build 已不产出的陈旧文件）。
 *  插件私有数据在 <appData>/linkdesk/plugins/<id>/data（另一根），删代码根不碰数据。 */
function copyTreeOverwrite(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const e of readdirSync(srcDir, { withFileTypes: true })) {
    const s = join(srcDir, e.name);
    const d = join(destDir, e.name);
    if (e.isDirectory()) copyTreeOverwrite(s, d);
    else copyFileSync(s, d);
  }
}

/** 本 build 是否有可装产物——主入口 index.bundle.js 或任一 views/<X>.bundle.js（entry 缺失的纯 views 插件形态） */
function hasBuildOutput(pkgDir: string): boolean {
  if (existsSync(join(pkgDir, "index.bundle.js"))) return true;
  const views = join(pkgDir, "views");
  if (existsSync(views)) {
    try {
      return readdirSync(views).some((f) => f.endsWith(".bundle.js"));
    } catch {
      return false;
    }
  }
  return false;
}

/* ── CDP reload（9222 /json/list 找 "LinkDesk Pool" → Page.reload） ── */

interface CdpTarget {
  title?: string;
  webSocketDebuggerUrl?: string;
}

/** 最小 WS 句柄接口——不依赖全局 WebSocket 类型（tsconfig types:[]，lib 无 dom） */
interface WsHandle {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}
type WsCtor = new (url: string) => WsHandle;

/** GET http://127.0.0.1:<port>/json/list——node:http，避免依赖全局 fetch 类型 */
function cdpListTargets(port: number): Promise<CdpTarget[]> {
  return new Promise((resolveP, rejectP) => {
    const req = httpGet({ host: "127.0.0.1", port, path: "/json/list", timeout: 1500 }, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          resolveP(JSON.parse(Buffer.concat(chunks).toString("utf8")) as CdpTarget[]);
        } catch (e) {
          rejectP(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
    req.on("error", rejectP);
    req.on("timeout", () => {
      req.destroy(new Error("CDP /json/list 超时"));
    });
  });
}

/**
 * 经 CDP 刷新「LinkDesk Pool」窗口——renderer 重 import = 直写产物生效。返回是否找到并刷新成功。
 *
 * E6#28.5 真机自验实证（2026-09-07）：单发 Page.reload 不足——`protocol.handle` 的 linkdesk:// 响应
 * 无 Cache-Control 头 → Chromium 同 URL 二次请求命中缓存，index.bundle.js 陈旧副本永远被喂（直写磁盘
 * 被遮蔽，protocol-debug.log 无新 200 行可证）。修复 = reload 前 Network.enable + Network.clearBrowserCache，
 * 清掉缓存让 reload 后重 import 落到磁盘逐请求 readFileSync（纯 CDP，壳零代码）。
 */
export async function cdpReloadPool(port = CDP_PORT): Promise<boolean> {
  let targets: CdpTarget[];
  try {
    targets = await cdpListTargets(port);
  } catch {
    return false;
  }
  const pool = targets.find((t) => t.title === "LinkDesk Pool");
  const url = pool?.webSocketDebuggerUrl;
  if (!pool || !url) return false;
  const Ws = (globalThis as { WebSocket?: WsCtor }).WebSocket;
  if (!Ws) {
    return false; // 全局 WebSocket 不可用（Node 太旧）——视为找不到，调用方打指引
  }
  const ws = new Ws(url);
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("CDP WebSocket 连接失败"));
  });
  // 顺序发：enable → clearBrowserCache → reload；等 reload（id 3）的回复即代表前两步已完成。
  const reply = new Promise<unknown>((res) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as { id: number };
      if (m.id === 3) res(m);
    };
  });
  ws.send(JSON.stringify({ id: 1, method: "Network.enable" }));
  ws.send(JSON.stringify({ id: 2, method: "Network.clearBrowserCache" }));
  ws.send(JSON.stringify({ id: 3, method: "Page.reload", params: { ignoreCache: true } }));
  await reply;
  ws.close();
  return true;
}

/* ── watch → 重建 → 直写 → reload 循环 ─────────────────────────────── */

/** 该路径是否不该触发重建（build 输出/依赖/元目录）——任一目录段命中即忽略 */
function isIgnoredRel(abs: string, root: string): boolean {
  // 纵深防御：root 自身 / 非 root 子树路径（null 回退的残留形态）恒忽略——「根自身」绝不作变更源。
  // 正常子路径恒 root + "/" + 尾段 → abs.length > root.length；等长只可能是 abs === root。
  if (abs === root || abs.length < root.length) return true;
  const rel = abs.slice(root.length).split(/[\\/]/).filter(Boolean);
  for (const seg of rel) {
    if (seg === "node_modules" || seg === ".git" || seg === "dist" || seg === ".linkdesk-real") return true;
  }
  // 插件分发 zip（真实态不写，防御历史遗留触发重建）
  if (abs.endsWith(".linkdesk-plugin")) return true;
  return false;
}

export interface RealLoopHooks {
  /** 每次成功 build+直写后回调（默认 = CDP reload；测试/工具可注入） */
  onInstalled?: (pluginId: string, targetDir: string) => Promise<void>;
}

/**
 * 跑真机环并挂起进程（Ctrl+C → 关 watcher + 退出）。每次源码变更：debounce → 全量单插件 build →
 * 直写 {userData}/plugins/<id> → CDP reload「LinkDesk Pool」。
 */
export async function runPluginDevReal(root: string): Promise<void> {
  const pluginJson = join(root, "plugin.json");
  if (!existsSync(pluginJson)) {
    throw new Error(`当前目录不是插件工程——找不到 ${pluginJson}。请 cd 进插件项目根再跑 linkdesk-plugin-sdk dev --real`);
  }
  const manifest = readPluginManifest(pluginJson);
  const pluginId = derivePluginId(manifest, dirname(pluginJson).split(/[\\/]/).pop() ?? "plugin");
  const pluginsRoot = resolveUserPluginsDir();
  const targetDir = join(pluginsRoot, pluginId);
  const pkgDir = join(root, "dist", `${pluginId}.linkdesk-plugin`); // defineLinkdeskPluginConfig 默认 outDir="dist"

  // 纯 manifest 无任何 js 表面（无 entry、无 contributes.views[].render）→ 无物化产物可直写，真机环无意义
  const entry = (manifest as { entry?: unknown })?.entry;
  const contributes = (manifest as { contributes?: { views?: Record<string, Array<{ render?: unknown }>> } })
    ?.contributes;
  const views = contributes?.views ?? {};
  const hasView = Object.values(views).some(
    (arr) => Array.isArray(arr) && arr.some((vd) => typeof vd?.render === "string"),
  );
  if (typeof entry !== "string" && !hasView) {
    throw new Error(
      `「${pluginId}」无 js 表面（无 entry、无 contributes.views[].render）——dev --real 为代码迭代环，纯 manifest 插件无需直写。`,
    );
  }

  console.log("");
  console.log(`  LinkDesk 真机环（E6#28.5）→ 插件「${pluginId}」`);
  console.log(`  直写目标：${targetDir}`);
  console.log(`    ${userPluginsDirExists() ? "✓ 定位到运行中 LinkDesk 的插件目录" : "⚠ userData/plugins 尚不存在——先启动一次 LinkDesk（首次运行会建目录）"}`);
  console.log(`  覆盖语义：目标已存在同名安装 → 被 dev 直写覆盖且不备份（作用域 = 自研 dev 插件）`);
  console.log(`  reload：需 LinkDesk 以 --remote-debugging-port=${CDP_PORT} 启动（CDP 连不上会跳过，改码后自动重试）`);
  console.log(`  改码 → 自动 build → 直写 → reload；Ctrl+C 停止`);
  console.log("");

  let stopped = false;
  const watchers = new Set<FSWatcher>();
  let building = false;
  let dirty = false;
  let reloadWarned = false;

  /** 单次完整 cycle：build → 有产物才直写 → 通知（默认 CDP reload） */
  async function cycle(why: string): Promise<void> {
    console.log(`[${new Date().toLocaleTimeString()}] ${why}`);
    try {
      await build(defineLinkdeskPluginConfig({ real: true }));
    } catch (e) {
      // plugin.json 正在编辑/表面编译失败 → 保留旧产物继续监听（失败不阻断循环）
      console.error(`  ✗ build 失败（保持既有直写产物）：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!hasBuildOutput(pkgDir)) {
      console.error(`  ✗ build 无产物（${pkgDir}）——跳过直写`);
      return;
    }
    rmSync(targetDir, { recursive: true, force: true });
    copyTreeOverwrite(pkgDir, targetDir);
    console.log(`  ✓ 直写 ${targetDir}`);
    const reloaded = await cdpReloadPool(CDP_PORT);
    if (reloaded) {
      console.log(`  ✓ LinkDesk Pool 已刷新（CDP ${CDP_PORT}）`);
    } else if (!reloadWarned) {
      reloadWarned = true;
      console.log(
        `  ⚠ 未连上 CDP ${CDP_PORT}——LinkDesk 没开？或启动时加 --remote-debugging-port=${CDP_PORT}。` +
          `（dev electron:dev 已内置；安装版/win-unpacked 手动加同参数）后续改码会自动重试。`,
      );
    }
  }

  /** debounce + 串行化（build 进行中再变更 → 记 dirty，结束后补一轮） */
  let timer: NodeJS.Timeout | undefined;
  const schedule = (why: string): void => {
    if (stopped) return;
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
          await cycle(why);
          if (dirty) {
            dirty = false;
            await cycle("变更累积，补一轮");
          }
        } finally {
          building = false;
        }
      })();
    }, 200);
  };

  // 首轮：初始 build → 直写 → reload（不依赖文件事件）
  schedule("初始 build → 直写 → reload");
  if (stopped) return;

  // 源码 watch（root 递归；node_modules/.git/dist 等事件按路径忽略——不触发自激重建）
  try {
    const w = watch(root, { recursive: true }, (_event, filename) => {
      // ⚠ Windows recursive fs.watch：目录树大量 churn（本工具自身 build 清空/重写 dist/ 的输出）时，
      // Node 发 filename=null 聚合事件（无法枚举具体文件，无路径可滤）。若按 root 处理必自激重建
      // ——dev-plugin.mjs 上轮真机实测 26 轮死循环同源。真实源码保存必带 filename，null 一律丢弃
      // （唯一代价：源码树极端批量 churn 溢出时漏一次重建，作者重存一次即补）。
      if (!filename) return;
      const abs = resolve(root, String(filename));
      if (isIgnoredRel(abs, root)) return;
      schedule(`文件变更 → 重建（${String(filename)}）`);
    });
    watchers.add(w);
  } catch {
    // recursive watch 不可用（罕见平台/权限）→ 降级不 watch（作者改码后手动 Ctrl+C 重启），不阻断已装产物
    console.error("  ⚠ 递归文件监听不可用——dev --real 降级为一次性 build 直写；改码后重启本命令生效");
  }

  await new Promise<void>((stop) => {
    const shutdown = (): void => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // 忽略关闭失败
        }
      }
      stop();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
