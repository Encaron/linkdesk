/**
 * linkdesk-api 命令/配置域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9b）。
 * commands + configuration + config 别名三命名空间面 verbatim。
 * 依赖方向：commands → ./types（LinkDeskCommand）；被聚合器交叉组装。
 */

import type { LinkDeskCommand, LinkDeskConfigSchema, LinkDeskConfigurationContribution } from "./types";

/** 命令 + 配置命名空间面——对标 VS Code vscode.commands + workspace.getConfiguration */
export interface CommandsAPI {
  /** 命令——对标 VS Code vscode.commands */
  commands: {
    /** @deprecated E3j #75——向后兼容别名，新代码用 executeCommand */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
    execute<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /** 执行壳侧命令 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
    executeCommand<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /**
     * 注册池内命令——handler 只存在于池渲染进程（视图 mount 时注册）。
     * meta 同步到壳注册表：title 显示名（命令面板/右键菜单，重注册即动态更新——
     * toggle 命令标题随状态翻转）、category 命令面板分组、when context key 过滤
     * （传 "false" = 纯程序化命令，不进命令面板，仅供插件 API 调用）。
     * plugin.json contributes.commands 未声明的命令经 meta 注册后同样可见/可执行。
     * 真相源分工：壳 CommandRegistry = 显示真相源（title/category/when 唯一权威），
     * 池 = 执行真相源（handler 唯一权威，永不跨进程）——meta 只同步显示面。
     * 🔴 **E6#111b：`meta.pluginId` = 注册方显式申报的真身份**（可选，只做加法）。
     *   命令归属解析优先级 = ① plugin.json 声明面 → ② 本字段 → ③ 名字第一段推定。
     *   声明过的命令**不必填**（① 已权威）；只有「声明里没有、名字又不带自己前缀」的命令需要它，
     *   否则该命令会被算到名字第一段那个属主头上（借他人前缀 ⇒ 归属错、且异归属顶替拦不住）。
     *   照 `notifications.source` 先例（`ui.ts:26-32`）：池是单进程共享 realm，
     *   所有插件共用同一个 `window.linkdesk` ⇒ **无从自动注入，只能作者显式报**。
     */
    registerCommand(
      commandId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令 handler 入参类型由插件调用方决定，对标 VS Code registerCommand 的 (...args: any[]) => any
      handler: (...args: any[]) => Promise<unknown> | unknown,
      meta?: { title?: string; category?: string; when?: string; pluginId?: string },
    ): void;
    /** 注销插件的池内命令（约定：命令 ID 格式为 "pluginId.commandName"）——随视图 unmount 调用 */
    unregisterCommands(pluginId: string): void;
    /** 获取所有已注册命令列表 */
    getCommands(): Promise<LinkDeskCommand[]>;
    /** 壳侧插件入口模块级注册（双进程执行壳侧半程）——壳 preload 独有 */
    _executeShellLocal?(id: string, ...args: unknown[]): Promise<unknown>;
    /** E6#62e 池 preload 独有内部钩——池 renderer 注册 on-command 激活回调（命令 miss → import 属主插件入口）。
     *  underscore 内部面（对标 _executeShellLocal），非插件作者 API——纯命令插件按需激活的接线位。 */
    _setCommandMissHandler?(handler: (pluginId: string) => Promise<boolean>): void;
  };

  /** 配置—新名——对标 VS Code vscode.workspace.getConfiguration */
  configuration: {
    /** 读取配置值——运行时动态值，无类型参数默认 unknown；调用方显式 get<number>("k") 窄化或自行收窄 */
    get<T = unknown>(key: string): Promise<T>;
    /** 写入配置值 */
    set(key: string, value: unknown): Promise<void>;
    /** 获取配置 schema */
    getSchema(key?: string): Promise<LinkDeskConfigSchema>;
    /** 订阅配置变更——返回 unsubscribe 函数。值运行时动态，T 由订阅方 cb 推断（events.on 同款泛型，防逆变报错） */
    onChange<T = unknown>(key: string, cb: (value: T) => void): () => void;
    // ══ E5.7#76：以下 9 个方法为设置页专用（SettingsView 渲染/实时刷新/跳转）。
    // 池 preload 注入（SettingsView 在池渲染）——required，壳 preload 无此面。
    // 通用插件请用上面的 get/set/getSchema/onChange。 ══
    getConfigurationContributions(): Promise<LinkDeskConfigurationContribution[]>;
    inspectConfiguration(key: string): Promise<unknown>;
    getUserSettings(): Promise<Record<string, unknown>>;
    onDidChangeConfiguration(cb: (key: string, value: unknown) => void): () => void;
    onPluginLifecycleChange(cb: () => void): () => void;
    consumeSettingsGroup(): Promise<string | null>;
    onRequestSettingsGroup(cb: (pluginId: string) => void): () => void;
    consumeScrollToSetting(): Promise<string | null>;
    onRequestScrollToSetting(cb: (key: string) => void): () => void;
    /** E5.8#41.14 🔴 修复：切快捷键 tab——M1 同款双通道（替代错配 window 事件死路由）。
     *  mount 时消费 pending（未打开时"打开快捷键设置"命令的请求）；无请求返回 null */
    consumeOpenKeybindings(): Promise<{ query?: string } | null>;
    /** E5.8#41.14：实时订阅——设置已打开时"打开快捷键设置"命令即时切 tab */
    onRequestOpenKeybindings(cb: (payload: { query?: string }) => void): () => void;
  };

  /** @deprecated E3j #75——向后兼容别名，新代码用 configuration */
  config: CommandsAPI["configuration"];
}
