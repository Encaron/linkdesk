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

import { Emitter, type Event, CoreEvents } from "../../react/events/CoreEvents";
import { setWorkspaceRoot } from "../configuration/ConfigurationService";
import { normalizePath } from "../../utils/path/pathUtils";
import { shellEvents } from "../../react/events/ShellEvents";
import { setPluginStateValue, getPluginStateValue, APP_PLUGIN_ID } from "../plugins/PluginStateService";
import { read, write } from "../configuration/StorageService"; // E5.5#0e

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
let _activeWorkspaceUri: string | null = null;
const _onDidChangeFolders = new Emitter<WorkspaceFolder[]>();
const _onDidChangeActiveWorkspace = new Emitter<string>();

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

/** 查询当前活跃工作区 URI——对标 VS Code workspace.workspaceFolders 的 active */
export function getActiveWorkspace(): string | undefined {
  return _activeWorkspaceUri ?? _folders[0]?.uri;
}

/** 设置活跃工作区——下游插件（编译/下载/搜索）以活跃工作区为目标 */
export function setActiveWorkspace(uri: string): void {
  const normalized = normalizePath(uri);
  if (_activeWorkspaceUri === normalized) return;
  _activeWorkspaceUri = normalized;
  _onDidChangeActiveWorkspace.fire(normalized);
  // 持久化——走 PluginStateService（与 iconOrder/collapsedViews/currentProfile 归一化）
  setPluginStateValue(APP_PLUGIN_ID, "activeWorkspace", normalized).catch((e) => { console.error("[Workspace] 保存工作区失败:", e); });
}

/** 订阅活跃工作区变更——对标 VS Code onDidChangeActiveWorkspaceFolder */
export const onDidChangeActiveWorkspace: Event<string> = _onDidChangeActiveWorkspace.event;

/* ── 操作 ── */

/**
 * 弹出系统文件夹选择对话框——对标 VS Code File > Open Folder。
 * 用户选择后自动 addFolder + 设置 workspace root。
 */
export async function openFolder(): Promise<void> {
  const lk = window.linkdesk;
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
  // E4V#35g: 根间包含检查——禁止祖先/后代互包含（防递归嵌套）
  if (_folders.some((f) => uri.startsWith(f.uri + "/") || f.uri.startsWith(uri + "/"))) {
    const name = uri.split("/").pop() ?? uri;
    import("../ui/toast").then(({ pushToast }) => {
      pushToast({ message: `无法添加 "${name}"：与已有工作区文件夹存在包含关系`, severity: "warning" });
    });
    return;
  }

  const folder: WorkspaceFolder = {
    uri,
    name: uri.split("/").pop() ?? uri,
    index: _folders.length,
  };

  _folders = [..._folders, folder];
  _onDidChangeFolders.fire([..._folders]);
  CoreEvents.onDidChangeWorkspaceFolders.fire(_folders);

  // 活跃工作区恢复优先级：持久化值 > 首个文件夹自动激活
  // 每次 addFolder 都检查——后续添加的文件夹可能匹配持久化值
  const persisted = getPluginStateValue<string>(APP_PLUGIN_ID, "activeWorkspace");
  if (persisted) {
    const normalizedPersisted = normalizePath(persisted);
    if (_folders.some((f) => f.uri === normalizedPersisted)) {
      // 持久化值的文件夹已加载→恢复
      setActiveWorkspace(normalizedPersisted);
    }
    // 持久化值存在但文件夹尚未加载→不设活跃，等后续 addFolder
  } else if (_folders.length === 1) {
    // 无持久化值→首个文件夹自动激活
    setActiveWorkspace(uri);
  }

  // 联动 ConfigurationService——workspace scope 的 settings.json 路径
  setWorkspaceRoot(uri);

  // E5.5#0e：持久化工作区文件夹列表——退出/重启后恢复
  _persistFolders();
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
  shellEvents.emit("workspace:folderRemoved", { folderUri: normalized });

  // 若移除的是活跃工作区→自动切到第一个剩余文件夹；无剩余→清空
  if (_activeWorkspaceUri === normalized) {
    if (_folders.length > 0) {
      setActiveWorkspace(_folders[0].uri);
    } else {
      _activeWorkspaceUri = null;
      _onDidChangeActiveWorkspace.fire("");
    }
  }

  // 如果移除的是第一个文件夹，更新 workspace root
  setWorkspaceRoot(_folders[0]?.uri ?? null);

  // E5.5#0e：持久化工作区文件夹列表
  _persistFolders();
}

/** 清空缓存（测试用） */
export function clearWorkspaceFolders(): void {
  _folders = [];
  _onDidChangeFolders.dispose();
}

/**
 * E5.6#11-fix7：跨上下文桥接——池侧 WorkspaceService 是独立实例，本地 emitter 永远不触发。
 * 壳 IpcBridgeHandler 在文件夹变更时通过 IpcBridge 广播 workspace:changed 事件，
 * 池侧监听后调用此函数通知本地订阅者（FoldersView 的 onDidChangeFolders → syncRoots）。
 *
 * 🔥 watcher 安全：syncRoots 内部通过 _syncGuardRef 防 StrictMode 竞态，
 *    _watchersRef 先清理旧 watcher 再创建新的——和 git 历史中 c9ca947d/80bc939d 修复一致。
 */
export function triggerFoldersChanged(): void {
  _onDidChangeFolders.fire([..._folders]);
}

/* ── E5.5#0e：持久化 ── */

/** 将 _folders 写入 StorageService——退出/重启后恢复（与 LayoutService/PluginStateService 同路径） */
function _persistFolders(): void {
  write("workspace-folders", _folders)
    .catch((e) => { console.error("[Workspace] 保存工作区文件夹失败:", e); });
}

/**
 * 初始化——从 StorageService 恢复工作区文件夹列表。
 * 对标 VS Code storage.json 中 windowsState.lastActiveWindow.folderUris。
 * 与 initLayoutService/initPluginStates 归一化——统一走 StorageService。
 */
export async function initWorkspaceService(): Promise<void> {
  try {
    const saved = await read<WorkspaceFolder[]>("workspace-folders");
    if (!saved || !Array.isArray(saved) || saved.length === 0) return;

    // 验证磁盘上文件夹仍存在——已删除的跳过
    const valid: WorkspaceFolder[] = [];
    for (const folder of saved) {
      if (!folder || typeof folder.uri !== "string") continue;
      try {
        const lk = window.linkdesk;
        if (lk?.filesystem?.exists) {
          const ok = await lk.filesystem.exists(folder.uri);
          if (ok) {
            valid.push(folder);
          } else {
            import("../ui/toast").then(({ pushToast }) => {
              pushToast({ message: `工作区文件夹 "${folder.name}" 已不存在，已移除`, severity: "warning" });
            });
          }
        } else {
          // 非 Electron 环境——信任持久化数据
          valid.push(folder);
        }
      } catch {
        // 磁盘检查失败——保守保留
        valid.push(folder);
      }
    }

    if (valid.length === 0) return;
    _folders = valid;
    _onDidChangeFolders.fire([..._folders]);
    CoreEvents.onDidChangeWorkspaceFolders.fire(_folders);

    // 恢复活跃工作区
    const persistedActive = getPluginStateValue<string>(APP_PLUGIN_ID, "activeWorkspace");
    if (persistedActive) {
      const normalized = normalizePath(persistedActive);
      if (valid.some((f) => f.uri === normalized)) {
        _activeWorkspaceUri = normalized;
        _onDidChangeActiveWorkspace.fire(normalized);
      } else if (valid.length > 0) {
        _activeWorkspaceUri = valid[0].uri;
        _onDidChangeActiveWorkspace.fire(valid[0].uri);
      }
    } else if (valid.length > 0) {
      _activeWorkspaceUri = valid[0].uri;
    }

    // 联动 workspace root
    setWorkspaceRoot(valid[0].uri);
  } catch (e) {
    console.error("[Workspace] 恢复工作区文件夹失败:", e);
    // 降级：从空开始，不崩启动
  }
}

/**
 * E5.5#0e：beforeunload 同步写——与 syncWriteLayout 归一化。
 * 退出时不能做异步 I/O，用 writeSync 写 localStorage。
 * 下次启动 initWorkspaceService 再读回。
 */
export function syncWriteWorkspaceFolders(): void {
  import("../configuration/StorageService").then(({ writeSync }) => {
    writeSync("workspace-folders", _folders);
  }).catch(() => {});
}
