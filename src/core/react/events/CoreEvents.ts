/**
 * 核心事件系统——对标 VS Code Event / Emitter。
 * Phase 5 盲区 3（P1）：插件感知系统状态变化的唯一渠道。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区3
 * VS Code 对标：vscode.Event<T> + Emitter<T>
 * VS Code 源码：src/vs/base/common/event.ts — Event, Emitter
 */

/* ── 通用 Event<T> 类型 ── */

/** 对标 VS Code Event<T>——订阅/取消订阅模式 */
export interface Event<T> {
  (listener: (data: T) => void): () => void;
}

/** 对标 VS Code Emitter<T>——内部触发，对外暴露 Event<T> */
export class Emitter<T> {
  private _listeners = new Set<(data: T) => void>();
  private _event?: Event<T>;

  /** 外部订阅此事件 */
  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (data: T) => void): (() => void) => {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
      };
    }
    return this._event;
  }

  /** 内部触发事件——Phase 5 盲区 8（P1）：包 try/catch 做错误隔离 */
  fire(data: T): void {
    for (const fn of this._listeners) {
      try { fn(data); } catch (err) {
      }
    }
  }

  /** 当前监听器数量（调试用） */
  get listenerCount(): number {
    return this._listeners.size;
  }

  /** 移除所有监听器（测试用） */
  dispose(): void {
    this._listeners.clear();
  }
}

/* ── 依赖类型（import type——零运行时开销，不产生循环依赖） ── */

import type { FileChangeEvent } from "../../services/files/FileService";
import type { WorkspaceFolder } from "../../services/layout/WorkspaceService";

/* ── 5 个核心事件 ── */

/**
 * 核心事件——对标 VS Code 的系统级事件。
 * Phase 5 启动时挂上这 5 个，Phase 6 追加 onDidChangeWorkspaceFolders / onDidChangeFileSystem / onDidChangeProfile。
 */
export const CoreEvents = {
  /** 配置变更——对标 VS Code onDidChangeConfiguration */
  onDidChangeConfiguration: new Emitter<{ key: string; value: unknown; scope: "user" | "workspace" }>(),

  /** 主题切换——对标 VS Code onDidChangeTheme */
  onDidChangeTheme: new Emitter<{ theme: string }>(),

  /** 活跃标签页切换——对标 VS Code onDidChangeActiveEditor */
  onDidChangeActiveTab: new Emitter<{ tabId: string; pluginId?: string; filePath?: string }>(),

  /** 收到数据源数据——sourceId 标识数据源，raw 为文本。串口/网络/文件等通用。插件间数据走 events 频道 */
  onDidReceiveData: new Emitter<{ sourceId: string; raw: string }>(),

  /** 快捷键绑定变更——对标 VS Code onDidChangeKeybindings（E2c #17） */
  onDidChangeKeybindings: new Emitter<void>(),

  /** 文件系统变更——FileService.watch 检测外部变动时 emit（E2c #19） */
  onDidChangeFileSystem: new Emitter<FileChangeEvent[]>(),

  /** 工作区文件夹变更——WorkspaceService 打开/关闭文件夹时 emit（E2c #19） */
  onDidChangeWorkspaceFolders: new Emitter<WorkspaceFolder[]>(),
};

/* ── CustomEvent 名称常量（B8 fix——拼错一端就断开通信） ── */

/**
 * 壳级 CustomEvent 名称——Phase 5 遗留的 window.dispatchEvent 模式。
 * Phase 6 迁移到 Emitter<T>（CoreEvents 已有基础设施）。
 */
export const CUSTOM_EVENTS = {
  SHOW_PALETTE: "linkdesk:show-palette",
  SHOW_THEME_BROWSER: "linkdesk:show-theme-browser",
  SHOW_LANGUAGE_PICKER: "linkdesk:show-language-picker",
  SHOW_OUTPUT: "linkdesk:show-output", // E3f #54
  RESTORE_WORKSPACE: "linkdesk:restore-workspace", // E3f #56
  SHOW_DEVTOOLS_PICKER: "linkdesk:show-devtools-picker", // E3f #58
  CHORD_CHANGED: "linkdesk:chord-changed",
  OPEN_SETTINGS: "linkdesk:open-settings", // E3f #59
  // E5.8#41.14：OPEN_KEYBINDINGS_SETTINGS 已删——死路由（kebab dispatch vs camel listen 错配，永不命中）。
  // 切快捷键 tab 改契约双通道（ConfigurationRegistry.onRequestOpenKeybindings）
  PLUGIN_REMOVED: "plugin-removed",
} as const;

// TODO Phase 6：CoreEvents 5 个 Emitter 当前零订阅——Phase 6 系统事件总线启用时接线
