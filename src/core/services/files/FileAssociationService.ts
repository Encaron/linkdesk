/**
 * FileAssociationService——扩展名 → 插件映射。
 * E2c #13a：双击文件 → 由哪个插件打开，是壳的责任。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §3b
 * 对标 VS Code：package.json contributes.languages[].extensions
 *
 * 多个插件注册同一扩展名 → "打开方式…"选择器。默认用第一个注册的。
 */

/* ── 类型 ── */

export interface FileAssociation {
  /** 扩展名——不带点，如 "dxf" / "pdf" / "cpp" */
  extension: string;
  /** 处理此文件类型的插件 ID */
  pluginId: string;
  /** 可选——打开时执行的命令（默认 "workbench.action.openFile"） */
  command?: string;
  /** 可选——"打开方式…"列表中显示的名字 */
  displayName?: string;
}

/* ── 存储 ── */

import { trackRegistration } from "../../registry/registrationTracker";

/** extension（小写，不带点） → FileAssociation[] */
const _associations = new Map<string, FileAssociation[]>();

/** pluginId → Set<extension>——卸载时快速清除 */
const _pluginExtensions = new Map<string, Set<string>>();

/* ── 注册 ── */

/**
 * 注册文件关联——loader 在 parseContributions 阶段调用。
 * 同一扩展名允许多个插件注册——"打开方式…"选择器消费全部。
 */
export function registerFileAssociation(association: FileAssociation): () => void {
  const ext = normalizeExtension(association.extension);
  if (!ext) {
    console.warn(`[FileAssociationService] 忽略无效扩展名: "${association.extension}"`);
    return () => {};
  }

  const list = _associations.get(ext) ?? [];
  // 同插件重复注册 → 静默忽略——首次注册者的 disposer 持有删除权
  if (list.some((a) => a.pluginId === association.pluginId)) return () => {};

  // #59f3：已有其他插件注册同一扩展名——警告（多注册合法，但开发者应知情）
  if (list.length > 0) {
    console.warn(
      `[FileAssociationService] "${ext}" 已有关联（${list.map(a => a.pluginId).join(', ')}），新增: ${association.pluginId}`
    );
  }

  const entry: FileAssociation = { ...association, extension: ext };
  list.push(entry);
  _associations.set(ext, list);

  // 维护 plugin → extensions 反向索引
  const exts = _pluginExtensions.get(association.pluginId) ?? new Set();
  exts.add(ext);
  _pluginExtensions.set(association.pluginId, exts);

  // E5.8#10：引用级删除——只删自己这条，不误删后来注册者（设计 §8 同名覆盖风险表）
  return trackRegistration(association.pluginId, () => {
    const current = _associations.get(ext);
    if (current) {
      const kept = current.filter((a) => a !== entry);
      if (kept.length === 0) {
        _associations.delete(ext);
      } else {
        _associations.set(ext, kept);
      }
    }
    const pluginExts = _pluginExtensions.get(association.pluginId);
    if (pluginExts) {
      pluginExts.delete(ext);
      if (pluginExts.size === 0) _pluginExtensions.delete(association.pluginId);
    }
  });
}

/* ── 查询 ── */

/**
 * 获取处理此扩展名的默认插件。
 * 文件树/Workspace 双击文件时调用。
 */
export function getPluginFor(extension: string): string | undefined {
  const ext = normalizeExtension(extension);
  if (!ext) return undefined;
  const list = _associations.get(ext);
  if (!list || list.length === 0) return undefined;
  return list[0].pluginId;
}

/**
 * 列出所有能处理此扩展名的插件——"打开方式…"菜单用。
 * 按注册顺序返回，第一个是默认。
 */
export function getPluginsFor(extension: string): FileAssociation[] {
  const ext = normalizeExtension(extension);
  if (!ext) return [];
  return [...(_associations.get(ext) ?? [])];
}

/**
 * 获取插件注册的所有文件关联。
 */
export function getAssociationsForPlugin(pluginId: string): FileAssociation[] {
  const exts = _pluginExtensions.get(pluginId);
  if (!exts) return [];
  const result: FileAssociation[] = [];
  for (const ext of exts) {
    const list = _associations.get(ext);
    if (list) {
      for (const a of list) {
        if (a.pluginId === pluginId) result.push(a);
      }
    }
  }
  return result;
}

/* ── 注销 ── */

/** 注销插件的全部文件关联——卸载时调用 */
export function unregisterPluginFileAssociations(pluginId: string): void {
  const exts = _pluginExtensions.get(pluginId);
  if (!exts) return;

  for (const ext of exts) {
    const list = _associations.get(ext);
    if (list) {
      const filtered = list.filter((a) => a.pluginId !== pluginId);
      if (filtered.length === 0) {
        _associations.delete(ext);
      } else {
        _associations.set(ext, filtered);
      }
    }
  }

  _pluginExtensions.delete(pluginId);
}

/* ── 工具 ── */

/** 归一化扩展名：去点、去空白、转小写 */
function normalizeExtension(ext: string): string {
  if (!ext) return "";
  let s = ext.trim().toLowerCase();
  if (s.startsWith(".")) s = s.slice(1);
  return s;
}

/** 清空注册表（测试用） */
export function clearFileAssociations(): void {
  _associations.clear();
  _pluginExtensions.clear();
}
