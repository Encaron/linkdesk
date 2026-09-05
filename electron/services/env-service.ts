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

  /** App 插件源码目录——plugins/<id>/ + .disabled/ 所在（只读：dev 项目树 / prod resources，绝不写用户安装）。
   *  2026-09-05 塌平单根：平铺树直接含插件目录，无 builtin/user 子目录层。 */
  appPluginsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'plugins')
      : path.join(app.getAppPath(), 'plugins');
  }

  /**
   * 随壳发货的插件安装包夹——E6#15c：bundled-plugins/*.linkdesk-plugin（2026-09-05 塌平单根：
   * 发货夹直接放 zip，无 builtin/user 子目录层——core:true 与第三方插件同一棵树）。
   * 内置插件 pre-bundle 独立化后的发货形态（electron-builder extraResources 原样搬）：
   *   dev：<repo>/bundled-plugins/（仓库内暂存 = 发货源，boot 自动装同走此夹，dev/prod 一致）
   *   prod：<resources>/bundled-plugins/（打包搬入）
   * 只读发货源——boot 自动装解压到 userPluginsDir，不删此夹（它是永久备份，重装/恢复的来源）。
   */
  bundledPluginsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'bundled-plugins')
      : path.join(app.getAppPath(), 'bundled-plugins');
  }

  /**
   * 用户安装包代码根——E6#7b 新建：{userData}/plugins/<id>/（2026-09-05 塌平单根：平铺，无 builtin/user
   * 子目录层——core:true 发货插件与第三方手动装插件同根并列）。.linkdesk-plugin 解压目标；
   * 与只读 appPluginsDir 分离（AI执行守则 陷阱 1「不要混」），也与下面 pluginsRootDir
   * （linkdesk/plugins/<id>/data 插件私有数据根）不同——代码根 vs 数据根勿混淆。
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
