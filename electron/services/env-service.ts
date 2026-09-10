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
import { readdirSync } from 'fs';
import { app } from 'electron';

class EnvService {
  /** 应用数据目录——Electron userData */
  appDataDir(): string {
    return app.getPath('userData');
  }

  /** App 插件代码根槽位——dev 独存（<repo>/plugins/ 源码树），prod 缺位 = 正常态（E6#17a 消费切换相摘除源拷贝）。
   *  ⚠️ 打包版 resources/ 不含任何插件：此槽仅供双根发现/协议保持「app 根在前 → userData 在后」的遮蔽序形状，
   *  消费方对不存在的根一律空目录容错（listPluginDirs/_findPluginDir/resolveLinkdeskPathMulti 全查 existsSync）。
   *  prod 实际运行根 = envService.userPluginsDir()（boot 解压 bundled-plugins 发货 zip 落点）。 */
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

  /**
   * 数据目录——**只在插件真落过盘时**给路径，否则 null（E6#78）。
   * 判据同 VS Code 详情页「缓存」行（`computeSize` 非零才画那一行）：目录不存在（该插件从没写过数据）
   * 或存在但空 → 整行不画，不造一个点开是空文件夹的入口。纯 UI 插件恒 null——**不是人人都有**。
   * 返回正斜杠路径（与 `pluginFileService.resolvePath` 同规——Windows 反斜杠在 URL 里不兼容）。
   */
  pluginDataDirIfAny(pluginId: string): string | null {
    const dir = this.pluginDataDir(pluginId);
    try {
      if (readdirSync(dir).length === 0) return null;
    } catch {
      return null; // ENOENT = 从未落盘 = 正常态，不是错误
    }
    return dir.replace(/\\/g, '/');
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
