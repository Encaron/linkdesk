/**
 * 发行说明的**启动接线**——E6#57.13d（设计：06-主软件更新 / 05-发行说明 §2.2 入口表 + §2.4 缓存 + §2.5 首启自动弹）。
 *
 * 启动期只做两件事，都在这里，都在 `initAll` 之后（配置服务/标签页状态都到位了）：
 *
 * 1. **预热**（`prewarmReleaseNotes`）——让「点帮助菜单打开」这条最常见的路上第一帧就有内容。
 *    05 §2.4 写的是「缓存命中时不经过加载态（直接渲染，避免每次打开闪一下骨架）」，而壳的内存缓存
 *    只在**本次会话第一次取数之后**才存在 ⇒ 不预热的话，本次会话第一次开菜单**必闪骨架**，
 *    与那句话相反。预热就是让「缓存命中不经过加载态」在会话的第一次打开上也成立的机制。
 *    代价可接受：主进程侧 24h 内命中磁盘缓存**不出网**（那条腿见 `#57.8e`）。
 *
 * 2. **首启自动弹**（`maybeAutoOpenReleaseNotes`）——`app.getVersion() !== lastSeenVersion` ⇒
 *    自动打开标签页一次（横幅由 `primeReleaseNotes({ banner: true })` 记账）。
 *
 * ## 两处容易做错的地方（都已在实现里钉住）
 *
 * ① **「失败不打扰、下次启动再试」（05 §2.5）——记 `lastSeenVersion` 必须等取数真的成功**。
 *    账是「这一版我弹过了」，记早了就把**一次离线**变成「这一版永久跳过」：下次启动版本号相同、
 *    直接 return，用户再也不会被弹一次，而 05 明文写的是「下次启动再试」。
 *    判据 = `getReleaseNotesState().state === "content"`（有内容 ⇔ 拿到了 ⇔ 值得记账）。
 *
 * ② **绝不阻塞启动**。取数要走主进程、可能出网，`setReady(true)` 不能等它 ⇒ 调用方**不 await**
 *    （见 `startup.ts` 的调用点），本模块内部也**先开标签页再等取数**（顺序在
 *    `openReleaseNotesTab` 里，那里有完整理由）。最坏情况：首帧之后标签页才冒出来，而不是白屏。
 *
 * ## 与「关闭开关」的关系
 *
 * `app.update.showReleaseNotes === false` ⇒ **不自动弹**，但**入口恒在**（帮助菜单「显示发行说明」
 * 任何时候可用）——开关管的是「弹」，不是「有没有」（03 §2.2 恒显原则）。
 * 关掉时**仍然预热**：预热不是弹，是「用户自己点开时别闪骨架」，与这个开关无关。
 */
import { getConfigurationValue } from "../core/services/configuration/ConfigurationService";
import { getShellExposed } from "../core/api/linkdesk-api/surfaces";
import { openReleaseNotesTab } from "../core/commands/shell/releaseNotesCommands";
import {
  getReleaseNotesState, prewarmReleaseNotes, readLastSeenVersion, writeLastSeenVersion,
} from "../hooks/useReleaseNotes";

/** 首启自动弹的开关（`src/App/config/update.ts` 声明，默认 true）——本文件是它唯一的消费点 */
const SHOW_SETTING = "app.update.showReleaseNotes";

/**
 * 一次启动只跑一遍——**存 Promise 而不是布尔**（硬约束 13）。
 *
 * `useAppStartup` 的 effect 在 StrictMode / HMR 下会双跑：布尔守卫只挡得住「第二次调用」，
 * 挡不住「第二次调用发生在第一次还在飞的时候」（那正是这里的真实情形——本函数中途 await 了
 * 版本号与取数）。存进行中的 Promise ⇒ 第二次拿到的是**同一次**，不会开出第二次取数。
 */
let _launch: Promise<void> | null = null;

async function _run(): Promise<void> {
  // ── 开关只挡「弹」，不挡「预热」（见文件头）──
  const showOnLaunch = getConfigurationValue<boolean>(SHOW_SETTING) !== false;
  if (!showOnLaunch) {
    prewarmReleaseNotes();
    return;
  }

  // 版本号取不到（非壳环境 / preload 未就绪）⇒ 什么都不做：既不开、也不记账。
  // **不记账**是关键——账上写着「见过 0.1.56」而下一次取到了别的版本号，会变成一次白弹。
  const version = await getShellExposed()?.app.getVersion();
  if (typeof version !== "string" || !version) return;

  const lastSeen = await readLastSeenVersion();
  if (lastSeen === version) {
    // 这一版已经弹过（只弹一次）——但**照常预热**：用户随时可能自己点菜单打开。
    prewarmReleaseNotes();
    return;
  }

  await openReleaseNotesTab({ banner: true });

  // 🔴 见文件头 ①——只有内容真的拿到了才记「见过」。拿不到（离线 / 无缓存）⇒ **不记账**，
  //    下次启动版本号仍旧对不上 ⇒ 自然重试一次。这就是「失败不打扰、下次再试」的全部实现。
  if (getReleaseNotesState().state === "content") {
    await writeLastSeenVersion(version);
  }
}

/**
 * 启动接线入口——`useAppStartup` 的 post-init 段调用一次（**不 await**，见文件头 ②）。
 *
 * 🔴 **返回的 Promise 永不 reject**（`.catch` 就在下面这一句里）：调用方是**浮动 Promise**
 * （`void initReleaseNotesOnLaunch()`），一旦漏出去就是一条无人认领的 unhandled rejection。
 * 而这里唯一可能抛的两处（`app.getVersion()` 在残缺替身下不存在、`openReleaseNotesTab` 那句
 * 动态 `import` 失败）都**不构成启动错误**——发行说明是启动路径上的旁支，不是主路。
 * 失败只有一条后果：这次不弹、也没记账，下次启动再来（与「离线」同款降级）。
 */
export function initReleaseNotesOnLaunch(): Promise<void> {
  _launch ??= _run().catch((e) => {
    console.error("[releaseNotes] 首启接线失败（本次不弹，下次启动再试）:", e);
  });
  return _launch;
}

/** 测试辅助：复位「一次启动只跑一遍」的守卫（同 `__resetProductCache` 的既有先例） */
export function __resetReleaseNotesLaunchForTest(): void {
  _launch = null;
}
