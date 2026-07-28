/**
 * 🔥 linkdesk API 命名空间——类型安全的插件 API 入口
 *
 * E3j #74：对标 VS Code `vscode` 命名空间。插件通过此模块获得：
 *   - 完整的 TypeScript 类型提示（IDE 自动补全、参数校验）
 *   - 零 IPC 知识——不需要知道 channel 名、action 格式、参数结构
 *   - 所有方法内部走 ipcRenderer.invoke()——自动经过 #72 的 IPC 消息队列
 *
 * 使用方式：
 *   import { linkdesk } from "@src/core/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("myCommand", arg1, arg2);
 *
 * 运行时实现：window.linkdesk（由 preload-plugin.ts 通过 contextBridge 注入）。
 * 本文件是纯类型层——不包含运行时逻辑，只是给 window.linkdesk 加类型。
 */

// ── 类型定义 ──

export interface LinkDeskCommand {
  id: string;
  title: string;
  category?: string;
}

export interface LinkDeskTheme {
  name: string;
  type: "dark" | "light";
  pluginId?: string;
}

export interface LinkDeskLanguage {
  id: string;
  label: string;
  pluginId: string;
}

/** 配置 schema 中的单个属性定义 */
export interface LinkDeskConfigSchema {
  [key: string]: {
    type: string;
    default?: unknown;
    description?: string;
    enum?: string[];
    enumDescriptions?: string[];
  };
}

/**
 * linkdesk API——插件代码的类型安全入口。
 * 对标 VS Code `vscode` 对象的全局命名空间结构。
 */
export interface LinkDeskAPI {
  /** 命令——对标 VS Code vscode.commands */
  commands: {
    /** @deprecated E3j #75——向后兼容别名，新代码用 executeCommand */
    execute<T = void>(commandId: string, ...args: unknown[]): Promise<T>;
    /** 执行壳侧命令 */
    executeCommand<T = void>(commandId: string, ...args: unknown[]): Promise<T>;
    /** 获取所有已注册命令列表 */
    getCommands(): Promise<LinkDeskCommand[]>;
  };

  /** 配置—新名——对标 VS Code vscode.workspace.getConfiguration */
  configuration: {
    /** 读取配置值 */
    get<T = unknown>(key: string): Promise<T>;
    /** 写入配置值 */
    set(key: string, value: unknown): Promise<void>;
    /** 获取配置 schema */
    getSchema(key?: string): Promise<LinkDeskConfigSchema>;
    /** 订阅配置变更——返回 unsubscribe 函数 */
    onChange(key: string, cb: (value: unknown) => void): () => void;
  };

  /** @deprecated E3j #75——向后兼容别名，新代码用 configuration */
  config: LinkDeskAPI["configuration"];

  theme: {
    /** 获取当前主题 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用主题列表 */
    getAvailable(): Promise<LinkDeskTheme[]>;
    /** 应用主题 */
    apply(themeId: string): Promise<void>;
  };

  language: {
    /** 获取当前语言 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用语言列表 */
    getAvailable(): Promise<LinkDeskLanguage[]>;
    /** 切换语言 */
    set(langId: string): Promise<void>;
  };

  /** 通知——插件弹出壳侧 toast，对标 VS Code vscode.window.showInformationMessage */
  notifications: {
    /** 弹出通知。progress=true 时返回 ProgressHandle（含 update/finish/cancel） */
    show(message: string, options?: { type?: "info" | "warning" | "error"; progress?: boolean }): Promise<NotificationHandle | undefined>;
  };

  /** 通用事件订阅 */
  events: {
    on(channel: string, cb: (payload: unknown) => void): () => void;
  };
}

/** 进度通知句柄——progress=true 时 show() 返回 */
export interface NotificationHandle {
  /** 更新进度消息 */
  update(message: string): Promise<void>;
  /** 完成——关闭进度通知，可选弹完成 toast */
  finish(message?: string): Promise<void>;
  /** 取消——直接关闭，不弹完成 toast */
  cancel(): Promise<void>;
}

// ── 获取 typed API 实例 ──

/**
 * 返回类型安全的 linkdesk API 对象。
 * 运行时 window.linkdesk 由 preload 注入——此函数只加类型标注。
 */
export function getLinkDesk(): LinkDeskAPI {
  return (window as unknown as { linkdesk: LinkDeskAPI }).linkdesk;
}

/**
 * 便捷导出：类型安全的 linkdesk API 实例。
 *
 * @example
 *   import { linkdesk } from "@src/core/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("editor.action.formatDocument");
 */
export const linkdesk: LinkDeskAPI = getLinkDesk();
