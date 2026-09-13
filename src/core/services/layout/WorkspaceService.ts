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
import { read, readSync, write } from "../configuration/StorageService"; // E5.5#0e
import { getShellExposed } from "../../api/linkdesk-api/surfaces"; // E6#47f：活跃工程上报主进程

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


/** E6#47f：把本窗活跃工程报给主进程（冷启动恢复最后活跃窗用）——非壳环境/池侧静默跳过 */
function reportActiveToMain(folder: string | null): void {
  try {
    getShellExposed()?.shell?.reportActiveWorkspace?.(folder);
  } catch { /* 非壳环境（测试/池）——上报是便利不是正确性 */ }
}

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
  // 持久化——走 PluginStateService（与 iconOrder/collapsedViews/currentProfile 归一化）。
  // E6#47e：key 加窗维度——每窗一个活跃工作区。
  setPluginStateValue(APP_PLUGIN_ID, activeWorkspaceKey(), normalized).catch((e) => { console.error("[Workspace] 保存工作区失败:", e); });
  reportActiveToMain(normalized); // E6#47f
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
  // 每次 addFolder 都检查——后续添加的文件夹可能匹配持久化值（E6#47e：key 加窗维度）
  const persisted = getPluginStateValue<string>(APP_PLUGIN_ID, activeWorkspaceKey());
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
  reportActiveToMain(_activeWorkspaceUri ?? uri); // E6#47f：新窗/新工程即活跃工程
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
  reportActiveToMain(_activeWorkspaceUri); // E6#47f
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

/* ── E6#47e：每窗一份——持久化 key 加窗维度 ──
 * 多窗后每窗独立壳渲染进程（内存天然隔离），但落盘共用同一个 userData 文件——
 * key 不加窗维度必然互相覆盖。主进程 createWorkspaceWindow（#47b）建窗时带
 * ?wsWindow=ws-N，本模块据此派生全部持久化 key；无参数（单窗时代/老数据）回落 ws-1。 */

/** 当前壳的窗标识——格式 ws-<数字>，非窗环境或格式不符回落 ws-1（拒绝脏值写进 key） */
export function getWorkspaceWindowId(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get("wsWindow");
    if (raw && /^ws-\d+$/.test(raw)) return raw;
  } catch { /* 非窗环境（测试） */ }
  return "ws-1";
}

function foldersStorageKey(): string {
  return `workspace-folders:${getWorkspaceWindowId()}`;
}

function activeWorkspaceKey(): string {
  return `activeWorkspace:${getWorkspaceWindowId()}`;
}

/** E6#47b-2：启动文件夹参数（`?folder=…`，主进程 createWorkspaceWindow/createWindow 下发）——非窗环境空串 */
function readLaunchFolderParam(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get("folder");
    return raw && raw.trim() ? raw : "";
  } catch { return ""; }
}

/** 将 _folders 写入 StorageService——退出/重启后恢复（与 LayoutService/PluginStateService 同路径） */
function _persistFolders(): void {
  write(foldersStorageKey(), _folders)
    .catch((e) => { console.error("[Workspace] 保存工作区文件夹失败:", e); });
}

/**
 * 初始化——从 StorageService 恢复工作区文件夹列表。
 * 对标 VS Code storage.json 中 windowsState.lastActiveWindow.folderUris。
 * 与 initLayoutService/initPluginStates 归一化——统一走 StorageService。
 */
export async function initWorkspaceService(): Promise<void> {
  try {
    // E6#47b-2/#47c（真机实证定案）：**显式文件夹参数优先**——该窗工作区 = 该文件夹，**不叠加恢复项**。
    //   理由两条：① 一个窗口一份工作区的模型下，「参数」就是用户点名要的东西（对标 `code A` 开 A）；
    //   ② 叠加会撞 addFolder 的包含关系检查——实测：恢复出来的 `_testfiles` 把点名要的 `nested`（其子目录）
    //      静默挡掉，用户看到的是"参数没生效"。标签页/布局的恢复不受影响（它们按窗走 layout:<id>）。
    const launchFolder = readLaunchFolderParam();
    if (launchFolder) {
      addFolder(launchFolder);
      reportActiveToMain(_activeWorkspaceUri);
      return;
    }

    // E5.8#71：read() 已文件优先归一——workspace-folders 的 beforeunload 保底（syncWriteWorkspaceFolders）
    // 与 layout 同款，显式 readSync 优先（仅 localStorage 无数据才落 read() 文件兜底）。
    // E6#47e：先读本窗 key；空且未迁移过 → 回落读全局旧 key（单窗时代数据归 ws-1 第一窗），
    // 迁移标记防每次启动重复回落——旧值不该在多窗时代被再次读进任何新窗。
    let saved = readSync<WorkspaceFolder[]>(foldersStorageKey()) ?? (await read<WorkspaceFolder[]>(foldersStorageKey()));
    const migratedFlagKey = `workspace-migrated:${getWorkspaceWindowId()}`;
    let migratedLegacyActive = false;
    // 🔴 **仅首窗**回落旧全局 key（2026-09-13 真机实证）：第二窗起若也回落，会把主窗遗留的工程当自己的
    //   ——后果不只是"多一个工程"：新窗真正该载入的 `?folder=` 目标若恰好是它的子目录，会被 addFolder 的
    //   包含关系检查挡掉（实测 ws-2 拿到 _testfiles、nested 被拒）。与 LayoutService 的回落闸同款。
    const isFirstWindow = getWorkspaceWindowId() === "ws-1";
    if ((!saved || !Array.isArray(saved) || saved.length === 0)
        && isFirstWindow
        && !getPluginStateValue<boolean>(APP_PLUGIN_ID, migratedFlagKey)) {
      const legacy = readSync<WorkspaceFolder[]>("workspace-folders") ?? (await read<WorkspaceFolder[]>("workspace-folders").catch(() => null));
      if (legacy && Array.isArray(legacy) && legacy.length > 0) {
        saved = legacy;
        migratedLegacyActive = true; // 旧 activeWorkspace（无维度 key）只随本次迁移读一次
      }
      void setPluginStateValue(APP_PLUGIN_ID, migratedFlagKey, true).catch(() => {});
    }
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

    // 恢复活跃工作区——E6#47e：先读本窗 key；随迁移进来时回落读旧全局 key（只此一次）
    const persistedActive = getPluginStateValue<string>(APP_PLUGIN_ID, activeWorkspaceKey())
      ?? (migratedLegacyActive ? getPluginStateValue<string>(APP_PLUGIN_ID, "activeWorkspace") : undefined);
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

    reportActiveToMain(_activeWorkspaceUri); // E6#47f：恢复完把本窗活跃工程报到主进程
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
    // E6#47e：key 加窗维度（与 _persistFolders 同 key）
    writeSync(foldersStorageKey(), _folders);
  }).catch(() => {});
}
