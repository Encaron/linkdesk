/**
 * 文件装饰器注册中心——对标 VS Code FileDecorationProvider。
 * E3f #59b：Git 插件注册装饰器，文件树消费。
 *
 * 插件调 `register(id, provider)` → 文件树调 `getDecorations(uri)` 获取所有装饰。
 * 继承 RegistryBase——插件卸载时自动清理。
 *
 * VS Code 对标：src/vs/workbench/services/decorations/browser/fileDecorations.ts
 */

import { RegistryBase } from "./RegistryBase";

/* ── 类型 ── */

/** 单个文件的装饰信息——对标 VS Code FileDecoration */
export interface FileDecoration {
  /** 徽章文字——如 "M"（修改）、"U"（未跟踪）、"!"（冲突） */
  badge?: string;
  /** 悬浮提示——如 "Modified by Git" */
  tooltip?: string;
  /** 颜色——CSS 颜色值或主题变量，如 "var(--git-modified)" */
  color?: string;
  /** 是否向父目录传播——对标 VS Code propagate */
  propagate?: boolean;
}

/** 装饰器提供方接口——插件实现此接口 */
export interface FileDecorationProvider {
  provideDecoration(uri: string): FileDecoration | null | Promise<FileDecoration | null>;
}

/* ── Registry ── */

class FileDecorationRegistryImpl extends RegistryBase {
  private _providers = new Map<string, FileDecorationProvider>();

  constructor() {
    super();
  }

  /** 注册装饰器提供方 */
  register(pluginId: string, provider: FileDecorationProvider): void {
    this._providers.set(pluginId, provider);
    this.markPlugin(pluginId);
  }

  /** 手动注销（RegistryBase 也会在卸载时自动调用） */
  unregister(pluginId: string): boolean {
    return this._providers.delete(pluginId);
  }

  /** 获取指定文件的所有装饰——按注册顺序返回第一个非空装饰 */
  getDecoration(uri: string): FileDecoration | null {
    for (const provider of this._providers.values()) {
      const deco = provider.provideDecoration(uri);
      // 同步提供方直接返回，异步提供方跳过（文件树应监听变更后重新查询）
      if (deco !== null && deco !== undefined && !(deco instanceof Promise)) {
        return deco;
      }
    }
    return null;
  }

  /** 获取指定文件的异步装饰——含 Promise 提供方，返回全部非空装饰 */
  async getDecorationsAsync(uri: string): Promise<FileDecoration[]> {
    const results: FileDecoration[] = [];
    for (const provider of this._providers.values()) {
      const deco = await Promise.resolve(provider.provideDecoration(uri));
      if (deco) results.push(deco);
    }
    return results;
  }

  /** 是否有装饰器注册 */
  hasProviders(): boolean {
    return this._providers.size > 0;
  }

  /** RegistryBase 要求的清理方法 */
  protected unregisterAll(pluginId: string): void {
    this._providers.delete(pluginId);
  }
}

/** 单例 */
export const FileDecorationRegistry = new FileDecorationRegistryImpl();
