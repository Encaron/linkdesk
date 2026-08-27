/**
 * 外观资产 IPC 处理器——E5.8#50.11：选择图片拷贝入库（受控来源）。
 * 对标 getAssetPath 受控来源：用户对话框任选路径不能 file:// 直读（Electron 安全模型）——
 * importImage 把源文件拷贝进 userData/appearance/（重名去重），返回受控协议 URL
 * （linkdesk-userdata://appearance/<名>，E5.8#64）供 app.backgroundImage 持久化——沙箱可加载。
 * 依赖方向：appearance-handlers → electron/ipc（channels）+ services/file-service + 路径工具；无反向。
 */

import { ipcMain } from 'electron';
import { IPC } from '../channels.js';
import { fileService } from '../../services/file-service.js';
import { resolveAssetDestination } from '../../services/asset-dedup.js'; // E5.8#152：内容去重目标解析（资产入库通用规则）
import { getUserDataImageUrl } from '../../../src/core/utils/path/userDataImagePath.js'; // E5.8#64：受控图协议 URL

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerAppearanceHandlers(): void {
  if (_registered) return;
  _registered = true;

  // 源路径 → userData/appearance/<名>（内容去重）→ 返回受控路径
  ipcMain.handle(IPC.appearance.importImage, async (_event, sourcePath: string) => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('importImage: 源路径为空');
    }
    const s = await fileService.stat(sourcePath).catch(() => null);
    if (!s || !s.isFile) {
      throw new Error(`importImage: 源不是文件——${sourcePath}`);
    }

    const dir = fileService.join(fileService.appDataDir(), 'appearance');
    await fileService.createDir(dir);

    // E5.8#152：内容哈希去重——同图重选 → 返回已有文件名零拷贝（去重判据从「目标名存在」改「内容已入库」）；
    // 不同内容才复制（resolveAssetDestination 保留 -N 命名处理同名不同图）。
    const destName = await resolveAssetDestination(dir, sourcePath, fileService);
    const dest = fileService.join(dir, destName);
    if (!fileService.exists(dest)) {
      await fileService.copy(sourcePath, dest);
    }
    // E5.8#64：返回受控协议 URL（linkdesk-userdata://appearance/<编码名>）而非 plain 绝对路径——
    // sandboxed pool 经特权协议加载（file:// 绝对路径被拦截——实机 bug 13）。值即协议 URL，可直接持久化。
    return getUserDataImageUrl(destName);
  });
}
