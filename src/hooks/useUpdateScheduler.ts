/**
 * 壳侧后台检查更新调度器——E6#57.9d（06-主软件更新 / 01-更新机制设计 §2.2）。
 *
 * 读 `app.update.mode`：`auto` → mount 后延迟 **30 秒**检查一次，此后**每 4 小时**一次；
 * `manual` → 一次都不自动发（手动入口按**恒显原则**始终可用，03 §2.2——与本档无关）。
 *
 * ## 为什么频率是内置常量、不是配置项
 *
 * 01 §2.2「内置常量，不暴露配置项——2026-08-30 拍板」。用户能选的是 auto/manual 两档
 * （`src/App/config/update.ts`），**不是**"每几小时"。常量沉在本文件，不散给配置面。
 *
 * ## 🔴 多窗口下会不会挂 N 份——不会，且**没有守卫**（2026-09-12 拍板）
 *
 * 本 hook 挂载在壳根组件（`src/App.tsx`），而**壳渲染进程在本应用里结构上只有一份**：
 * 壳页面 `index.html` → `src/main.tsx` → `src/App` 全仓只有一个加载点（`electron/main.ts:145/147`，
 * 在 `createWindow()` 内）；脱出/漂移窗加载的是 `pool.html`（`window-manager.ts:205/209`）**不挂壳**。
 * ⇒ 「N 个窗口 = N 份调度器」的前提**不存在**。
 *
 * 原计划写的 `if (!isMainWindow) return;` **不写**——它在本应用里**恒为真**，是死代码（仓库无死代码
 * 规矩），且 `isMainWindow` 这个判据在 `src/` 里**从来不存在**（只有文档提过）。**独任性由架构保证，
 * 不由代码保证**——四条源码实证 + 「将来真出现第二个壳时必须补什么」的判据（含一行前提自检命令）
 * 记在 `docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/08-调度归属与失败重试.md` §一。
 * **后来者：先跑那条自检命令；它若不再只输出 `index.html`，就来这里补真守卫，别直接加个恒真的 if。**
 *
 * ## 🔴 本调度器**不做**下载失败自动重试（2026-09-12 拍板）
 *
 * 「下次自动重试」曾写在 01 §四 验收 7，但下载腿刻意不做（无断点续传时自动重下 = 悄悄重复下载
 * 几十 MB + 把失败吞掉，01 §2.4）。本格只兑现**手动** `[重试]`；自动重试立案 **E6#57.9g**
 * （策略五个待回答项 + 判据草案见 08 §二）——**不许在这里顺手加一个"失败就再试一次"**。
 */
import { useEffect, useState } from "react";
import { getConfigurationValue, onDidChangeConfiguration } from "../core/services/configuration/ConfigurationService";
import { checkForUpdatesAndReport } from "./useUpdateNotifications";

/** 配置键——`app.update.mode` 的**唯一**字面量出处（改键名只改这里） */
const MODE_KEY = "app.update.mode";

/** 首次后台检查延迟——对标 VS Code `_autoCheckDelay`（01 §2.2，内置常量不暴露）。
 *  export 的唯一消费方是单测（`useUpdateScheduler.test.ts` 读它推时间轴）——
 *  测试里复读 `30_000` 会让「改常量」变成假门禁（测试仍绿、行为已变）。 */
export const INITIAL_DELAY_MS = 30_000;

/** 后台检查周期——对标 VS Code `_autoCheckTimer`（01 §2.2，内置常量不暴露）。export 理由同上。 */
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * 发一次**后台**检查。`context=false` 是显式传的语义值，不是省略参数（07 §4.1）。
 *
 * 🔴 走 `checkForUpdatesAndReport` 而不是裸 `api.checkForUpdates`——**这一格是「后台静默」的唯一落点**
 * （E6#57.12d 发起方自消化）：`context=false` 时它**只记账、不出声**，后台失败与手动失败在广播里
 * 形状逐字节相同（`UpdateError` 只有 code+message），谁能出声只有发起方知道。反向也成立——
 * 用户手点那条路必须**出声**，所以两条路不能再共用一处「看态决定说不说话」的推断。
 */
function fireBackgroundCheck(): void {
  void checkForUpdatesAndReport(false).catch((err: unknown) => {
    // 网络/校验错由服务收进态内 `lastError`（**不抛**，07 §4.1）；这里只兜"检查腿契约违反"
    // 那类真 bug（服务会把态先打回 idle 再抛，见 update-service.ts 的 catch 段）。
    console.error("[useUpdateScheduler] 后台检查更新异常：", err);
  });
}

function readMode(): string {
  return getConfigurationValue<string>(MODE_KEY);
}

/**
 * 挂载后台调度器。只在壳根组件调一次（`src/App.tsx`，同 `useHeartbeat`/`useMemoryMonitor`）。
 */
export function useUpdateScheduler(): void {
  const [mode, setMode] = useState<string>(readMode);

  // 切 mode 即时生效（#57.9e 判据）：设置页改 `app.update.mode` → 本 effect 重跑 ⇒ 旧定时器拆、
  // 新定时器按新档起。只监听关心的这一个 key（对标 usePoolSync/useSubscriptions.ts:82 的 key 过滤）。
  useEffect(() => {
    return onDidChangeConfiguration((key) => {
      if (key === MODE_KEY) setMode(readMode());
    });
  }, []);

  useEffect(() => {
    if (mode !== "auto") return; // manual：不自动发（也不留空定时器）
    let initial: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    // 幂等 stop——清理路径（unmount / 切 mode）与「首次触发后转周期」两条路都调得安全
    // （对标 useSubscriptions.ts:251-267 的开/关定时器形状）
    const stop = (): void => {
      if (initial !== undefined) { clearTimeout(initial); initial = undefined; }
      if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    };
    initial = setTimeout(() => {
      initial = undefined;
      fireBackgroundCheck();
      interval = setInterval(fireBackgroundCheck, CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
    return stop;
  }, [mode]);
}
