/**
 * WorkspaceService——"当前打开的文件夹"全局状态。
 * E2c #14：对标 VS Code vscode.workspace.workspaceFolders。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §二
 *
 * 消费方：
 *   文件树 → 知道以什么路径为根
 *   欢迎页 → 显示"打开文件夹"还是"最近文件"
 *   标题栏 → 显示文件夹名
 *   设置   → Workspace scope settings.json 的路径
 */

import { Emitter, type Event, CoreEvents } from "./CoreEvents";
import { setWorkspaceRoot } from "./ConfigurationService";
import { normalizePath } from "./pathUtils";

/* ── 类型 ── */

export interface WorkspaceFolder {
  /** 文件夹完整路径（file:// URI） */
  uri: string;
  /** 文件夹名——路径最后一段 */
  name: string;
  /** 索引——第一个打开的文件夹 index=0 */
  index: number;
}

/* ── 状态 ── */

let _folders: WorkspaceFolder[] = [];
const _onDidChangeFolders = new Emitter<WorkspaceFolder[]>();

/* ── 查询 ── */

/** 当前所有打开的文件夹 */
export function getWorkspaceFolders(): WorkspaceFolder[] {
  return [..._folders];
}

/** 当前工作区根路径——多文件夹工作区返回第一个 */
export function getWorkspaceRoot(): string | undefined {
  return _folders[0]?.uri;
}

/** 订阅文件夹变化——对标 VS Code onDidChangeWorkspaceFolders */
export const onDidChangeFolders: Event<WorkspaceFolder[]> = _onDidChangeFolders.event;

/* ── 操作 ── */

/**
 * 弹出系统文件夹选择对话框——对标 VS Code File > Open Folder。
 * 用户选择后自动 addFolder + 设置 workspace root。
 */
export async function openFolder(): Promise<void> {
  const lk = (window as any).linkdesk;
  if (!lk?.dialog?.open) {
    console.warn("[WorkspaceService] dialog API 不可用——非 Electron 环境");
    return;
  }

  const selectedPath: string | null = await lk.dialog.open({ directory: true });
  if (!selectedPath) return; // 用户取消

  addFolder(selectedPath);
}

/**
 * 添加工作区文件夹——命令行 / "最近文件"点击等场景。
 * 自动更新 workspace root 传递给 ConfigurationService。
 */
export function addFolder(folderPath: string): void {
  // 归一化——确保跨平台路径一致
  const uri = normalizePath(folderPath);
  // 去重——同一路径不重复添加
  if (_folders.some((f) => f.uri === uri)) return;

  const folder: WorkspaceFolder = {
    uri,
    name: uri.split("/").pop() ?? uri,
    index: _folders.length,
  };

  _folders = [..._folders, folder];
  _onDidChangeFolders.fire([..._folders]);
  CoreEvents.onDidChangeWorkspaceFolders.fire(_folders);

  // 联动 ConfigurationService——workspace scope 的 settings.json 路径
  setWorkspaceRoot(uri);
}

/**
 * 移除工作区文件夹。
 */
export function removeFolder(folderPath: string): void {
  const normalized = normalizePath(folderPath);
  const idx = _folders.findIndex((f) => f.uri === normalized);
  if (idx === -1) return;

  _folders = [..._folders.slice(0, idx), ..._folders.slice(idx + 1)];
  // 重新分配 index
  _folders = _folders.map((f, i) => ({ ...f, index: i }));

  _onDidChangeFolders.fire([..._folders]);
  CoreEvents.onDidChangeWorkspaceFolders.fire(_folders);

  // 如果移除的是第一个文件夹，更新 workspace root
  setWorkspaceRoot(_folders[0]?.uri ?? null);
}

/** 清空缓存（测试用） */
export function clearWorkspaceFolders(): void {
  _folders = [];
  _onDidChangeFolders.dispose();
}
