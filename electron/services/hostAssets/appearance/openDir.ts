/**
 * 宿主资产域 · appearance —— 打开存储目录（「打开存储位置」齿轮项）。
 *
 * 与旧 `appearance:reveal-storage` 同一实现（E5.8#153）：主进程解析域根目录并 `shell.openPath`
 * 开**目录内容**（不是高亮单文件）；目录缺省也建（空目录同样合法）；openPath 失败 fail-loud。
 */

import { shell } from "electron";
import { fileService } from "../../file-service.js";

/** @param dir 域根目录（`getAppearanceDefaults(...).dir`——唯一解析点） */
export async function openAppearanceDirectory(dir: string): Promise<void> {
  await fileService.createDir(dir);
  const err = await shell.openPath(dir);
  if (err) {
    throw new Error(`打开存储位置失败: ${err}`);
  }
}
