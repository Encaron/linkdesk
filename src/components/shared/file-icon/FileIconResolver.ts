/**
 * FileIconResolver——数据驱动文件图标解析器（共享服务单一副本）。E6#69g 归一化铁律。
 * E4a #93：按扩展名/文件名解析图标，消费 fileIconMappings.ts 默认数据。
 *
 * 🔥 自 plugins/file-tree/src/services/FileIconResolver.ts 上移共享（#69g：禁 file-tree 私有双源 /
 *  禁 editor 跨插件 import file-tree / 禁复制一份）。消费方：
 *   - 壳 windowLayout.serializeGroups——文件标签图标（随 app.iconTheme mappings 即时重算）
 *   - file-tree 插件——树行 + 搜索行（经 @linkdesk/ui 同源 import）
 *  三方同消费同一解析器 + 同一默认表 + 同一 theme mappings → 同文件同图。
 *
 * v2 扩展点：customMappings 注入——图标主题插件（IconRegistry 贡献）替换全部映射。
 * E5.8#133.3 双形态：class → codicon span / imagePath → linkdesk:// img（消费方按边界各自转渲染）。
 *
 * 形状 = core IconThemeMappings（@linkdesk/contracts 类型，零 @src/core 运行时耦合）；
 * 方法签名取元数据基元（文件名/是否根目录）——零插件类型耦合，任何消费方传路径基名即可解析。
 */

import type { IconThemeMappings, IconThemeMapping } from "@linkdesk/contracts";
import {
  FILE_ICON_MAP,
  EXT_ICON_MAP,
  FOLDER_ICON_MAP,
  DEFAULT_FILE_ICON,
  DEFAULT_FOLDER_ICON,
  DEFAULT_FOLDER_OPEN_ICON,
  DEFAULT_ROOT_ICON,
} from "./fileIconMappings";

/** 解析结果渲染描述符——双形态（E5.8#133 ④ 拍板：class → span / imagePath → img） */
export type IconDescriptor =
  | { kind: "class"; className: string; color?: string }
  | { kind: "image"; url: string };

/** 保底 codicon 类名 → 类描述符（统一出口，禁止各调用方手拼） */
const cls = (className: string): IconDescriptor => ({ kind: "class", className });

/** 硬编码 codicon 字符串表 → IconThemeMappings 形状（`"codicon-file"` ≡ `{ class: "codicon-file" }`） */
function toMapping(map: Record<string, string>): Record<string, IconThemeMapping> {
  const out: Record<string, IconThemeMapping> = {};
  for (const [k, v] of Object.entries(map)) out[k] = { class: v };
  return out;
}

export class FileIconResolver {
  private _fileMap: Record<string, IconThemeMapping>;
  private _extMap: Record<string, IconThemeMapping>;
  private _folderMap: Record<string, IconThemeMapping>;
  private _folderOpenMap: Record<string, IconThemeMapping>;
  // E5.8#133.6：主题顶层默认图标——未命中匹配表时用主题默认而非 codicon（缺省 = 壳 codicon 保底）
  private _defaultFile?: IconThemeMapping;
  private _defaultFolder?: IconThemeMapping;
  private _defaultFolderOpen?: IconThemeMapping;
  private _defaultRoot?: IconThemeMapping;
  private _defaultRootOpen?: IconThemeMapping;

  constructor(custom?: IconThemeMappings) {
    this._fileMap = { ...toMapping(FILE_ICON_MAP), ...custom?.files };
    this._extMap = { ...toMapping(EXT_ICON_MAP), ...custom?.extensions };
    this._folderMap = { ...toMapping(FOLDER_ICON_MAP), ...custom?.folders };
    // foldersExpanded——图标主题可选；未指定则复用 folders（契约语义）
    this._folderOpenMap = { ...toMapping(FOLDER_ICON_MAP), ...custom?.foldersExpanded };
    this._defaultFile = custom?.file;
    this._defaultFolder = custom?.folder;
    this._defaultFolderOpen = custom?.folderExpanded;
    this._defaultRoot = custom?.rootFolder;
    this._defaultRootOpen = custom?.rootFolderExpanded;
  }

  /** 解析映射条目 → 渲染描述符（glyph → class / image → 壳解析好的 linkdesk:// url） */
  private resolve(mapping: IconThemeMapping | undefined, fallbackClass: string): IconDescriptor {
    if (!mapping) return cls(fallbackClass);
    if ("imagePath" in mapping) return { kind: "image", url: mapping.imagePath };
    return { kind: "class", className: mapping.class, color: mapping.color };
  }

  /** 文件图标——按文件名解析（E6#69g：tab 传路径基名即可） */
  getFileIcon(name: string): IconDescriptor {
    return this.resolve(
      this._fileMap[name] ?? this._extMap[this._getExt(name)] ?? this._defaultFile,
      DEFAULT_FILE_ICON,
    );
  }

  /** 文件夹图标 */
  getFolderIcon(name: string, isRoot: boolean): IconDescriptor {
    if (isRoot) return this.resolve(this._defaultRoot, DEFAULT_ROOT_ICON);
    return this.resolve(this._folderMap[name] ?? this._defaultFolder, DEFAULT_FOLDER_ICON);
  }

  /** 获取展开状态的文件夹图标 */
  getFolderIconOpened(name: string, isRoot: boolean): IconDescriptor {
    if (isRoot) return this.resolve(this._defaultRootOpen ?? this._defaultRoot, DEFAULT_ROOT_ICON);
    return this.resolve(
      this._folderOpenMap[name] ?? this._folderMap[name] ?? this._defaultFolderOpen ?? this._defaultFolder,
      DEFAULT_FOLDER_OPEN_ICON,
    );
  }

  private _getExt(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? filename.slice(dot) : "";
  }
}
