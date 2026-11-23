/**
 * 宿主资产域 · appearance —— 选图（系统对话框）＋ 入库一步完成。
 *
 * 2026-11-24 语义归属（V1/V5）：插件只调 `appearance.pickImage({domain,target})`；
 * 起始目录、过滤器、扩展名白名单、拷贝入库全部由主进程决定（`defaults.ts` 唯一源）。
 * `target` 是落点语义（app / zone），只决定 UI 写回哪个配置键——同域内目录/过滤器相同（D5-a）。
 *
 * 与旧 `dialog.open({defaultPathKind:"appearance"})` 的关系：那条兼容路保留一个兼容期，
 * 映射同样走 `defaults.ts`（dialog-handlers 已改委托），到期条件见规格 02 §四。
 */

import { dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import { fileService } from "../../file-service.js";
import { importAppearanceImage } from "./importAsset.js";
import type { AssetDomainDefaults, AssetPickResult } from "../types";

/**
 * 弹系统选图框并入库。
 * @param defaults 域默认值（起始目录/过滤器/扩展名——`getAppearanceDefaults` 生成）
 * @param target 落点语义（app / zone）——由 UI 用于写回对应配置键，宿主当前同域同目录
 * @param hostWindow 宿主窗（modal 父窗；缺省 = Electron 居中于活动屏，兜底不崩）
 */
export async function pickAppearanceImage(
  defaults: AssetDomainDefaults,
  target: string,
  hostWindow?: BrowserWindow,
): Promise<AssetPickResult> {
  void target; // 落点语义由 UI 消费；宿主当前同域同目录/同过滤器
  await fileService.createDir(defaults.dir);

  const dialogOptions: OpenDialogOptions = {
    title: defaults.title,
    filters: defaults.filters,
    properties: ["openFile"],
    defaultPath: defaults.dir,
  };
  const result = hostWindow
    ? await dialog.showOpenDialog(hostWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return { picked: false };
  }

  const { url, name } = await importAppearanceImage(result.filePaths[0], defaults.dir);
  return { picked: true, url, name };
}
