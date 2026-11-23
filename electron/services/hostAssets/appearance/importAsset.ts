/**
 * 宿主资产域 · appearance —— 拷贝入库（受控来源）。
 *
 * 与旧 `appearance:importImage` 同一实现（E5.8#50.11 / #152 / #64），只是从 handler 里抽出：
 * `pickImage`（选图＋入库一步）与 `importImage`（两步兼容）共用这一份，⛔ 不再各写一遍。
 *
 * 规则不变：
 *   · 源路径必须是文件（不是目录 / 不存在 ⇒ fail-loud）；
 *   · 内容哈希去重（`resolveAssetDestination`——同图重选返回已有文件名，零拷贝）；
 *   · 返回值 = 受控协议 URL `linkdesk-userdata://appearance/<编码名>`（沙箱只能经特权协议加载）。
 */

import { fileService } from "../../file-service.js";
import { resolveAssetDestination } from "../../asset-dedup.js";
import { getUserDataImageUrl } from "../../../../src/core/utils/path/userDataImagePath";

export interface ImportedAppearanceAsset {
  /** 受控协议 URL —— 可直接持久化到 `app.backgroundImage` / `app.zoneBackgroundImage` */
  url: string;
  /** 入库后的文件名（去重后） */
  name: string;
}

/**
 * 把用户选中的图片拷入 `<userData>/appearance/`（内容去重）。
 * @param sourcePath 用户选择的任意源路径
 * @param dir 域根目录（`getAppearanceDefaults(...).dir`——唯一解析点）
 */
export async function importAppearanceImage(
  sourcePath: string,
  dir: string,
): Promise<ImportedAppearanceAsset> {
  if (!sourcePath || typeof sourcePath !== "string") {
    throw new Error("importImage: 源路径为空");
  }
  const s = await fileService.stat(sourcePath).catch(() => null);
  if (!s || !s.isFile) {
    throw new Error(`importImage: 源不是文件——${sourcePath}`);
  }

  await fileService.createDir(dir);

  const destName = await resolveAssetDestination(dir, sourcePath, fileService);
  const dest = fileService.join(dir, destName);
  if (!fileService.exists(dest)) {
    await fileService.copy(sourcePath, dest);
  }
  return { url: getUserDataImageUrl(destName), name: destName };
}
