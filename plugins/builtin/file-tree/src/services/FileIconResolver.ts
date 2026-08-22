/**
 * FileIconResolver——数据驱动文件图标解析器。
 * E4a #93：按扩展名/文件名解析图标，消费 icon-mappings.ts 数据。
 *
 * 🔥 v2 扩展点：customMappings 注入——图标主题插件替换全部映射。
 * 🔥 R19：响应 IconRegistry——主题切换时自动重建。
 *
 * 对标 VS Code seti 图标主题 + getIconClasses()。
 */

import type { ExplorerItem } from "./FileTreeModel";
import {
  FILE_ICON_MAP,
  EXT_ICON_MAP,
  FOLDER_ICON_MAP,
  DEFAULT_FILE_ICON,
  DEFAULT_FOLDER_ICON,
  DEFAULT_FOLDER_OPEN_ICON,
  DEFAULT_ROOT_ICON,
} from "../utils/icon-mappings";

export interface IconMappings {
  files?: Record<string, string>;
  extensions?: Record<string, string>;
  folders?: Record<string, string>;
}

export class FileIconResolver {
  private _fileMap: Record<string, string>;
  private _extMap: Record<string, string>;
  private _folderMap: Record<string, string>;

  constructor(custom?: IconMappings) {
    this._fileMap = { ...FILE_ICON_MAP, ...custom?.files };
    this._extMap = { ...EXT_ICON_MAP, ...custom?.extensions };
    this._folderMap = { ...FOLDER_ICON_MAP, ...custom?.folders };
  }

  /** 获取文件/文件夹的 codicon CSS 类名 */
  getIcon(item: ExplorerItem): string {
    if (item.isDirectory) return this.getFolderIcon(item);
    return this._fileMap[item.name]
      ?? this._extMap[this._getExt(item.name)]
      ?? DEFAULT_FILE_ICON;
  }

  /** 获取文件夹图标 */
  getFolderIcon(item: ExplorerItem): string {
    if (item.parent === null) return DEFAULT_ROOT_ICON;
    return this._folderMap[item.name] ?? DEFAULT_FOLDER_ICON;
  }

  /** 获取展开状态的文件夹图标 */
  getFolderIconOpened(): string {
    return DEFAULT_FOLDER_OPEN_ICON;
  }

  private _getExt(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? filename.slice(dot) : "";
  }
}

/** 全局默认实例 */
let _resolver = new FileIconResolver();

/** 更新图标解析器——图标主题切换时调用（E5 接线） */
export function updateIconResolver(mappings?: IconMappings): void {
  _resolver = new FileIconResolver(mappings);
}

/** 获取当前生效的图标解析器 */
export function getIconResolver(): FileIconResolver {
  return _resolver;
}
