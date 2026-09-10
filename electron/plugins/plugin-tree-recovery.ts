/**
 * plugin-tree-recovery——E6#73j（G8 后半）：启动复原被中断的更新替换。
 *
 * 更新提交是**两步 rename**（`plugin-install-handlers.ts` 的 `plugins:commitUpdate`）：
 *   `rename(<id>, <id>.bak)` → `rename(<staged>, <id>)` → `rm <id>.bak`
 * 两步之间进程死掉（断电 / 任务管理器 / 崩溃）⇒ 磁盘上**只剩 `.bak`，`<id>` 不存在**。
 * 此前 `.bak` 无人认领：启动不扫、下轮 commit 靠 `rm -rf .bak` 顺手清掉——那一步直接**删掉旧版唯一副本**，
 * 用户丢插件且不可恢复。
 *
 * 故启动时按「目录在不在」二选一，而不是盲删（G8 的初稿是盲删，会吃掉数据）：
 *   - `<id>` 缺失 → **复原**：`rename(<id>.bak, <id>)`（回滚到更新前的旧版，宁旧勿丢）；
 *   - `<id>` 存在 → 上一轮 commit 收尾没删掉的遗留（或复原成功的残余）→ 删。
 *
 * 调用点必须在 `loadAllPluginManifests()` / `ingestPluginBundles()` / `installBundledPlugins()`
 * **之前**（`main.ts` whenReady）——否则三表扫描和发货夹幂等判定看到的是「插件不存在」，
 * 发货夹还会拿内置版覆盖掉本该复原的用户版。
 *
 * 单实例保证：启动瞬间无在途更新（同上 `cleanupStaleDownloads` 的前提）。错误隔离——单条失败
 * 只 console.warn 不阻断启动。
 */

import { app } from "electron";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";

/** 更新提交的备份后缀（`plugins:commitUpdate` 单复本） */
const BAK_SUFFIX = ".bak";

/** 用户安装代码根——{userData}/plugins（与 plugin-install-handlers 的 userPluginsRoot 同义） */
function userPluginsRoot(): string {
  return path.join(app.getPath("userData"), "plugins");
}

/**
 * 启动复原：把「进程死在两次 rename 之间」留下的 `.bak` 放回原位。
 * 返回实际复原的插件 ID（调用方/测试可断言）；无可复原则空数组。
 */
export async function recoverInterruptedUpdates(): Promise<string[]> {
  const root = userPluginsRoot();
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return []; // 根尚未创建/不可读 → 无可复原
  }

  const restored: string[] = [];
  for (const name of names) {
    if (!name.endsWith(BAK_SUFFIX)) continue;
    const pluginId = name.slice(0, -BAK_SUFFIX.length);
    if (!pluginId) continue; // 裸 ".bak" 不是本机制的产物，不动它
    const bak = path.join(root, name);
    const target = path.join(root, pluginId);
    try {
      if (existsSync(target)) {
        // 新版已在位 = 提交成功、收尾清理没跑完 → 备份是纯遗留
        await fs.rm(bak, { recursive: true, force: true });
        console.warn(`[plugin-tree-recovery] 清理遗留备份: ${name}（${pluginId} 新版已在位）`);
      } else {
        await fs.rename(bak, target);
        restored.push(pluginId);
        console.warn(`[plugin-tree-recovery] 复原被中断的更新: ${pluginId}（回滚到 <id>.bak 的旧版）`);
      }
    } catch (e) {
      console.warn(
        `[plugin-tree-recovery] 处理备份失败（非致命，跳过）: ${name} — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return restored;
}
