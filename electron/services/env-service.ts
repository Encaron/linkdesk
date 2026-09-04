/**
 * 环境服务——插件数据目录约定。
 * E2c #13b：定义"插件的数据放哪"，对标 VS Code ExtensionContext.storagePath。
 *
 * 约定：
 *   .linkdesk/plugins/<pluginId>/data/         —— 插件专属可写目录
 *   .linkdesk/plugins/<pluginId>/data/cache/    —— 缓存（可安全删除）
 *   .linkdesk/plugins/<pluginId>/data/exports/  —— 导出文件（用户可见）
 *
 * 壳保证：插件安装时调用 ensurePluginDataDir() 自动创建目录。
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';

class EnvService {
  /** 应用数据目录——Electron userData */
  appDataDir(): string {
    return app.getPath('userData');
  }

  /** App 插件源码目录——plugins/builtin/ + plugins/user/ + .disabled/ 所在（只读：dev 项目树 / prod resources，绝不写用户安装） */
  appPluginsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'plugins')
      : path.join(app.getAppPath(), 'plugins');
  }

  /**
   * 用户安装包代码根——E6#7b 新建：{userData}/plugins/{builtin,user}/<id>/。
   * .linkdesk-plugin 解压目标（市场只写 user/）；与只读 appPluginsDir 分离（AI执行守则 陷阱 1「不要混」），
   * 也与下面 pluginsRootDir（linkdesk/plugins/<id>/data 插件私有数据根）不同——代码根 vs 数据根勿混淆。
   */
  userPluginsDir(): string {
    return path.join(this.appDataDir(), 'plugins');
  }

  /** 插件数据根——<appDataDir>/linkdesk/plugins/<id>/data/...（插件私有可写数据，非代码） */
  pluginsRootDir(): string {
    return path.join(this.appDataDir(), 'linkdesk', 'plugins');
  }

  /** 插件数据目录——<appDataDir>/linkdesk/plugins/<id>/data/ */
  pluginDataDir(pluginId: string): string {
    return path.join(this.pluginsRootDir(), pluginId, 'data');
  }

  /** 插件缓存目录 */
  pluginCacheDir(pluginId: string): string {
    return path.join(this.pluginDataDir(pluginId), 'cache');
  }

  /** 插件导出目录 */
  pluginExportsDir(pluginId: string): string {
    return path.join(this.pluginDataDir(pluginId), 'exports');
  }

  /** 确保插件数据目录存在——安装时调用 */
  async ensurePluginDataDir(pluginId: string): Promise<void> {
    const dirs = [
      this.pluginDataDir(pluginId),
      this.pluginCacheDir(pluginId),
      this.pluginExportsDir(pluginId),
    ];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

export const envService = new EnvService();
