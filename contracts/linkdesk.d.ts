/**
 * 🔥 linkdesk.d.ts——window.linkdesk 插件 API 契约（自动生成，勿手改）
 *
 * 生成源：src/core/api/linkdesk-api.ts + linkdesk-api/（13 域接口 + types.ts）
 *         + src/core/types/ipc/* + src/core/types/pool/*（wire 载荷类型）
 * 生成器：scripts/generate-contract.mjs（Route C——契约类型文件为源，纯类型打包）
 * 改契约源 → 跑 `node scripts/generate-contract.mjs`（npm run check 里 check-contracts 强制）
 *
 * 用法（第三方插件作者）：
 *   拷贝本文件进项目 + tsconfig 引用，或 `npm i -D @linkdesk/contracts`（#22.6）
 *   import type { PluginListEntry } from "linkdesk";
 *   window.linkdesk.filesystem.readFile(...)   // ambient 类型直出
 */

// ── 契约类型 ──
export interface LinkDeskCommand {
    id: string;
    title: string;
    category?: string;
}
/** 配方贡献域——theme 元数据 domains（混搭来源过滤）+ theme:changed 载荷（域级细粒度刷新）共用（06 §2/§6.2）。
 *  六域：colors（配色，colorways 恒贡献） + appearance 五风格域（radius/glass/font/background/surface）。 */
export type ThemeDomain = "colors" | "font" | "radius" | "glass" | "background" | "surface";
/** 配置 schema 中的单个属性定义——E5.8#41.14 🛤 补全 uiHint/minimum/maximum/renderHint/dependsOn
 * （壳 SettingsView renderControl/SettingRow 官方控件切换 + 依赖显隐字段，与 SettingsView/types ConfigProperty 对齐） */
export interface LinkDeskConfigProperty {
    type: string;
    default?: unknown;
    description?: string;
    enum?: string[];
    enumDescriptions?: string[];
    /** 控件提示——uiHint 优先：plugin.json 声明式控件选择（renderControl 读它切 combobox/textarea/color 等） */
    uiHint?: string;
    /** 数值下限——uiHint 数值控件 min 校验 */
    minimum?: number;
    /** 数值上限——uiHint 数值控件 max 校验 */
    maximum?: number;
    /** 渲染提示——renderControl 第二判据（"action" 渲染操作按钮 / "color" 渲染色块预览） */
    renderHint?: string;
    /** 等宽限定——仅 uiHint "fontFamily" 有意义。true/缺省 = 只列等宽族（编辑器字体）；false = 全字族（UI 字体）。E5.8#50.20 */
    monoOnly?: boolean;
    /** 依赖条件——本项仅在 dependsOn.key 配置值 === value 时显示（SettingRow 读它显隐整行） */
    dependsOn?: {
        key: string;
        value: unknown;
    };
    /** 动态下拉数据源——uiHint "select" 时读取（渲染时调 theme.listRecipes() 动态取，E5.8#50.23）。
     *  "theme.colorways" = 活动配方（app.theme）配色变体（选项带预览色块）；
     *  "theme.sources" = 混搭来源（按 optionsFromDomain 过滤 RecipeMeta.domains）。 */
    optionsFrom?: string;
    /** 混搭来源域过滤——optionsFrom "theme.sources" 时按此域过滤 RecipeMeta.domains（10 §2 六域） */
    optionsFromDomain?: ThemeDomain;
    /** E5.8#50.26：renderHint "action" 按钮动作——点击执行此壳命令（第三方设置 UI 经 commands.executeCommand 触发） */
    actionCommand?: string;
    /** E5.8#50.26：renderHint "action" 按钮禁用条件——全部 {key,value} 匹配当前配置值时禁用 */
    actionDisabledAll?: Array<{
        key: string;
        value: unknown;
    }>;
    /** E5.8#78：组内二级标题——SettingsView 把同 group 的 key 归到子标题下渲染；无 group 保持平铺（零侵入） */
    group?: string;
}
/** 配置 schema——key → 属性定义（index signature 保持现有消费方） */
export interface LinkDeskConfigSchema {
    [key: string]: LinkDeskConfigProperty;
}
/** 配置贡献条目——configuration.getConfigurationContributions() 返回形状（E5.8#41.14 🛤 命名）。
 * 与壳 ConfigurationRegistry 组装的 [pluginId, { title, properties }] 对齐——第三方设置 UI 不再 need cast */
export type LinkDeskConfigurationContribution = [
    string,
    {
        title: string;
        properties: Record<string, unknown>;
    }
];
/** 命令 + 配置命名空间面——对标 VS Code vscode.commands + workspace.getConfiguration */
export interface CommandsAPI {
    /** 命令——对标 VS Code vscode.commands */
    commands: {
        /** @deprecated E3j #75——向后兼容别名，新代码用 executeCommand */
        execute<T = void>(commandId: string, ...args: any[]): Promise<T>;
        /** 执行壳侧命令 */
        executeCommand<T = void>(commandId: string, ...args: any[]): Promise<T>;
        /**
         * 注册池内命令——handler 只存在于池渲染进程（视图 mount 时注册）。
         * meta 同步到壳注册表：title 显示名（命令面板/右键菜单，重注册即动态更新——
         * toggle 命令标题随状态翻转）、category 命令面板分组、when context key 过滤
         * （传 "false" = 纯程序化命令，不进命令面板，仅供插件 API 调用）。
         * plugin.json contributes.commands 未声明的命令经 meta 注册后同样可见/可执行。
         * 真相源分工：壳 CommandRegistry = 显示真相源（title/category/when 唯一权威），
         * 池 = 执行真相源（handler 唯一权威，永不跨进程）——meta 只同步显示面。
         */
        registerCommand(commandId: string,
        handler: (...args: any[]) => Promise<unknown> | unknown, meta?: {
            title?: string;
            category?: string;
            when?: string;
        }): void;
        /** 注销插件的池内命令（约定：命令 ID 格式为 "pluginId.commandName"）——随视图 unmount 调用 */
        unregisterCommands(pluginId: string): void;
        /** 获取所有已注册命令列表 */
        getCommands(): Promise<LinkDeskCommand[]>;
        /** 壳侧插件入口模块级注册（双进程执行壳侧半程）——壳 preload 独有 */
        _executeShellLocal?(id: string, ...args: unknown[]): Promise<unknown>;
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
        consumeOpenKeybindings(): Promise<{
            query?: string;
        } | null>;
        /** E5.8#41.14：实时订阅——设置已打开时"打开快捷键设置"命令即时切 tab */
        onRequestOpenKeybindings(cb: (payload: {
            query?: string;
        }) => void): () => void;
    };
    /** @deprecated E3j #75——向后兼容别名，新代码用 configuration */
    config: CommandsAPI["configuration"];
}
/** E5.8#50.6：玻璃 + 悬浮面板质感字段——主题 JSON `surface`（缺省 = 无玻璃无悬浮）。
 * 纹理 texture 与 glass 正交（⑬ 纸纹分区不带玻璃也能用 per-surface 纹理）。 */
export interface ThemeSurface {
    /** 玻璃配方——缺省 = 无玻璃 */
    type?: "glass";
    /** backdrop blur px——0 = 关 */
    blur?: number;
    /** 饱和度增强——1 = 关 */
    saturate?: number;
    /** 玻璃面叠加色 */
    tint?: string;
    /** 玻璃面不透明度——1 = 不透明 */
    opacity?: number;
    /** 液态玻璃顶部高光强度——0 = 关 */
    specular?: number;
    /** E5.8#63：顶部高光基色（发丝光边颜色）——缺省 = 白；alpha 仍走 specular */
    specularColor?: string;
    /** 形变过渡 ms——0 = 关 */
    morph?: number;
    /** 悬浮圆角 px——0 = 直角贴边 */
    radius?: number;
    /** 四周留缝 px——0 = 贴边 */
    inset?: number;
    /** 投影浮起——true = 悬浮投影（引擎映射 --shadow-lift） */
    shadow?: boolean;
    /** E5.8#50.28：可平铺纹理图资产路径（⑬ 纸纹分区）——应用全部 5 zone 表面，与 glass 正交独立生效 */
    texture?: string;
    /** 纹理不透明度——1 = 不透明 */
    textureOpacity?: number;
}
/** E5.8#50.6：图片背景质感字段——主题 JSON `background`（缺省 = 无图） */
export interface ThemeBackground {
    /** 图片路径——作者提供可解析 URL，引擎写入 `--bg-image` 时 url() 包裹 */
    image?: string;
    /** 图片层不透明度——1 = 不透明 */
    opacity?: number;
    /** 图片遮罩明暗（0-1 rgba 透明度）——0 = 无遮罩 */
    mask?: number;
    /** E5.8#63：遮罩基色（暗化层颜色）——缺省 = 黑；alpha 仍走 mask。仅 panorama 生效（同 mask） */
    maskColor?: string;
    /** E5.8#50.29：切片模式——"panorama"（默认）= 现全窗语义零变化；"zones" = 同图连续切片挂 5 zone 表面（⑭ 影像分区） */
    mode?: "panorama" | "zones";
}
export interface LinkDeskTheme {
    name: string;
    type: "dark" | "light";
    /** E5.8#50.6：玻璃/悬浮质感——主题 JSON `surface`（缺省 = 无玻璃无悬浮） */
    surface?: ThemeSurface;
    /** E5.8#50.6：图片背景——主题 JSON `background`（缺省 = 无图） */
    background?: ThemeBackground;
    pluginId?: string;
}
/** E5.8#50.18：配色变体元数据——theme.listRecipes() 返回（colorways[] 元素，06 §2）。
 *  预览色供 ThemePicker 卡片取色；单配色配方 = 1 项。 */
export interface ColorwayMeta {
    /** 配色变体 id——全局唯一（theme.setColorway 入参；app.themeColor 动态 enum 存此） */
    id: string;
    /** 配色显示名 */
    name: string;
    /** 预览色——强调色 + 窗口背景（卡片徽标取色用；缺省配色无该 token → 空串） */
    preview: {
        accent: string;
        bgWindow: string;
    };
}
/** E5.8#50.18：配方元数据——theme.listRecipes() 返回（全部可用配方 + 配色变体 + 预览色，06 §2）。
 *  domains = 该配方贡献哪些域（混搭来源过滤依据，10 §2）；type = 明暗类别。 */
export interface RecipeMeta {
    id: string;
    name: string;
    type: "light" | "dark";
    colorways: ColorwayMeta[];
    domains: ThemeDomain[];
}
export interface LinkDeskLanguage {
    id: string;
    label: string;
    pluginId: string;
}
/** 主题 + 语言 + 外观资产命名空间面——对标 VS Code 外观面 */
export interface AppearanceAPI {
    theme: {
        /** 获取当前主题 ID */
        getCurrent(): Promise<string>;
        /** 获取所有可用主题列表 */
        getAvailable(): Promise<LinkDeskTheme[]>;
        /** 应用主题 */
        apply(themeId: string): Promise<void>;
        // ── E5.8#50.18：配方/配色 06 §2 六方法——列表走 API（数据），选中走配置（持久化 app.*）──
        /** 全部可用配方（含各配色变体 + 预览色）——ThemePicker 卡片 / 配色与混搭动态 SelectBox 数据源 */
        listRecipes(): Promise<RecipeMeta[]>;
        /** 当前活动配方/配色——合并配置计算（getActiveRecipe + app.theme/app.themeColor 回退） */
        getActive(): Promise<{
            recipeId: string;
            colorwayId: string;
        } | null>;
        /** 当前生效 token 集（合并后）——appearanceMode→custom 播种、混搭预览 */
        getEffectiveTokens(): Promise<Record<string, string>>;
        /** 应用配方——落 app.theme（配色随配方自动跟随） */
        setRecipe(recipeId: string): Promise<void>;
        /** 应用配色变体——落 app.themeColor */
        setColorway(colorwayId: string): Promise<void>;
        /** 复位外观——清设置层外观覆盖（回主题基线） */
        resetAppearance(): Promise<void>;
    };
    language: {
        /** 获取当前语言 ID */
        getCurrent(): Promise<string>;
        /** 获取所有可用语言列表 */
        getAvailable(): Promise<LinkDeskLanguage[]>;
        /** 切换语言 */
        set(langId: string): Promise<void>;
        /** 获取初始语言数据（WebView 加载时壳已推送） */
        getInitial(): {
            lang: string;
            resources: Record<string, unknown>;
        } | null;
        /** 订阅语言变更——返回 unsubscribe */
        onChange(cb: (data: {
            lang: string;
            resources: Record<string, unknown>;
        }) => void): () => void;
    };
    /** E5.8#50.11：外观资产——本地选图拷贝入库（受控来源——用户任选路径不能 file:// 直读） */
    appearance: {
        /** 导入图片到 userData/appearance/（重名去重）——返回受控协议 URL（linkdesk-userdata://…，E5.8#64），
         *  供 app.backgroundImage 持久化；沙箱经特权协议加载（plain 绝对路径被拦截） */
        importImage(sourcePath: string): Promise<string>;
    };
}
/** 标签页命名空间面——对标 VS Code vscode.window.createTerminal() */
export interface TabsAPI {
    tabs: {
        create(type: string, opts?: Record<string, unknown>): Promise<unknown>;
        openOrFocus(type: string, opts?: Record<string, unknown>): Promise<unknown>;
        focus(tabId: string): Promise<void>;
        close(tabId: string): Promise<void>;
        focusBySourceId(sourceId: string): Promise<void>;
        updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
        closeBySourceId(sourceId: string): Promise<void>;
        /** E5.6#11.5g3：标签页激活订阅——文件树 autoReveal 消费（preload-pool 实有面，#98 补录契约） */
        onDidChangeActiveTab(cb: (data: {
            tabId: string;
            pluginId?: string;
            filePath?: string;
        }) => void): () => void;
    };
}
/**
 * KeybindingRegistry 类型层——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8a）。
 * 纯类型零逻辑。依赖方向：无（被 normalization / registry / chord / persistence / dispatch 消费）。
 */
export interface Keybinding {
    /** 命令 ID */
    command: string;
    /** 快捷键字符串——如 "ctrl+k" / "ctrl+shift+b" */
    key: string;
    /** context key when 条件 */
    when?: string;
    /** 来源：user / plugin / builtin——同 key 时 user 优先 */
    source: "user" | "plugin" | "builtin";
    /** 插件 ID——卸载时精确匹配（B3 fix：原实现 source === "plugin" 会误删所有插件快捷键） */
    pluginId?: string;
    /** E3f #59-F：执行时透传给 executeCommand 的额外参数 */
    args?: unknown[];
}
/** 壳→主进程快捷键表同步载荷（KeybindingRegistry.getKeybindingSyncData 输出） */
export interface KeybindingSyncData {
    shortcuts: string[];
    chordPrefixes: string[];
    chordCombos: string[];
}
/** 键盘输入快照——主进程 before-input-event 归一化后转发的 executeShortcut 载荷 */
export interface KeyboardInput {
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    key: string;
    code: string;
}
/**
 * E5.8#46.8：主进程 before-input-event 转发的 executeShortcut 载荷——键盘快照 + 来源窗标注。
 * KeyboardInput 保持纯净（纯键盘字段）；来源作为组合类型必选字段（attachKeyboardRouting 恒有 windowId）。
 * 壳 dispatch 据此按聚焦窗裁决快捷键（Ctrl+W 关本窗 tab）——与 ShellTabAction 顶层 sourceWindowId 同构（#46.4 归一化）。
 */
export interface ForwardedKeyboardInput extends KeyboardInput {
    sourceWindowId: string;
}
/** 快捷键——壳/池双端注入（syncToMainProcess/onForwardedEvent 为壳侧独有）。池插件消费 setKeybindingCaptureActive（file-tree），必选 */
export interface KeybindingsAPI {
    keybindings: {
        getKeybindings(): Promise<Keybinding[]>;
        getConflicts(): Promise<unknown>;
        registerKeybinding(binding: unknown): Promise<void>;
        saveUserKeybindings(): Promise<void>;
        removeKeybindingForCommand(commandId: string): Promise<void>;
        resetKeybindingToDefault(commandId: string): Promise<void>;
        findKeybindingForCommand(commandId: string): Promise<Keybinding | undefined>;
        setKeybindingCaptureActive(active: boolean): Promise<void>;
        // 纯数据形参——contextBridge 结构化克隆丢 KeyboardEvent 原生属性（.key/.code 是 C++ getter），
        // 调用方先提取字段再传（KeybindingSettingsView 同款）。真实 KeyboardEvent 天然满足此形状。
        keyboardEventToKeyString(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string;
        onChange(cb: () => void): () => void;
        /** 壳→主进程同步快捷键表（chord 状态机查表） */
        syncToMainProcess?(data: KeybindingSyncData): Promise<void>;
        /** 接收主进程 before-input-event 转发的拦截事件（E5.8#46.8：载荷含 sourceWindowId——按聚焦窗裁决） */
        onForwardedEvent?(cb: (input: ForwardedKeyboardInput) => void): () => void;
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
/** 插件在 plugin.json 里声明的菜单项——command 或 submenu 二选一 */
export type ManifestMenuItem = string | {
    command: string;
    label?: string;
    when?: string;
    group?: string;
    /** E5.8#33：排序权重——同 group 内越小越靠前（壳招牌用于菜单栏组序） */
    order?: number;
    /** E3f #52a：嵌套子菜单——有 children 时 command 可为空 */
    children?: ManifestMenuItem[];
};
/** 菜单项描述——menu.getItems() 返回（壳侧 when 过滤 + t() 翻译 + 快捷键解析后） */
export interface MenuItemDescriptor {
    command: string;
    label?: string;
    group?: string;
    order?: number;
    when?: string;
    /** 壳侧解析后的命令标题（E5.7#14 显示文本铁律） */
    title?: string;
    /** 已解析快捷键 "ctrl+shift+p" 形式 */
    shortcut?: string;
    /** E5.8#37.7：当前项 √ 标记（单选语义——壳侧 getItems 动态解析，VS Code 菜单当前项同款）。
     *  位置/对齐子菜单（当前 edge/align 命中项）+ #37.7.1 视图显隐列表（visible 视图项）共用。 */
    checked?: boolean;
    /**
     * E5.8#37.7.1：每项命令载荷——动态菜单项（如面板视图显隐清单）携带数据传给命令 handler。
     * ContextMenu 的 context 是整菜单共享的（非 per-item），per-item 身份（如 containerId+viewId）
     * 必须走命令载荷：executeCommand(id, undefined, ...commandArgs, context) → 壳 handler 收 args
     * = [...commandArgs, context]。池哑渲染原文透传，不解释内容。
     */
    commandArgs?: unknown[];
    children?: Array<string | MenuItemDescriptor>;
}
/**
 * 对话框 wire 契约——E5.7#97。
 *
 * 曾双份定义：linkdesk-api.ts（E5.7#73 插件侧）与 dialog-handlers.ts 内联结构体
 * 手工对齐——一边改另一边静默失效。本模块一处定义：
 * 插件 API re-export（保持既有 import 路径）+ preload + 主进程三端 import type。
 */
export interface DialogOpenOptions {
    title?: string;
    /** true = 选目录，默认选文件 */
    directory?: boolean;
    filters?: {
        name: string;
        extensions: string[];
    }[];
}
/** 插件侧条目——对标 VS Code QuickPickItem 三字段（label 第一行左 / description 第一行右 / detail 第二行左） */
export interface PluginQuickPickItem {
    label: string;
    /** 第一行右 */
    description?: string;
    /** 第二行左 */
    detail?: string;
}
/** 插件侧 show() 选项——v1 最小面：items + 输入框占位/前缀（buttons/onHighlight 留待消费方出现） */
export interface PluginQuickPickOptions {
    items: PluginQuickPickItem[];
    placeholder?: string;
    prefix?: string;
}
/**
 * 插件 quickPick 请求——preload show() 经 contextBridge 函数代理桥接给池 QuickPickHost 的形状。
 * 池内本地桥（零 IPC）：Promise resolve 的正是 opts.items 里的原对象（身份保持，非序列化副本）。
 */
export interface PluginQuickPickRequest {
    opts: PluginQuickPickOptions;
}
/** 行内操作按钮——池哑渲染，点击回传 actionId */
export interface PoolQuickPickButton {
    /** 动作 ID——壳 onItemAction(item, actionId) 执行 */
    actionId: string;
    /** codicon 图标名（不含 "codicon-" 前缀） */
    icon: string;
    tooltip?: string;
}
export interface PoolQuickPickItem {
    /** getKey(item)——壳侧动作重解析的唯一键 */
    key: string;
    /** getSearchText(item)——池本地模糊匹配 */
    searchText: string;
    /** E5.8#32：已激活项勾选标记——label 左侧 ✓。undefined = 无勾选（通用 QuickPick 不受影响）；true/false = 渲染固定占位保对齐 */
    checked?: boolean;
    /** 第一行左——已 t() 解析 */
    label: string;
    /** 第一行右——已 t() 解析 */
    category?: string;
    /** 第二行左——已 t() 解析 */
    detail?: string;
    /** 快捷键 "ctrl+shift+p" 形式——池渲染 keycap pill（哑） */
    keybinding?: string;
    /** 行内操作按钮 */
    buttons?: PoolQuickPickButton[];
}
export interface PoolQuickPickData {
    open: boolean;
    placeholder: string;
    prefix?: string;
    items: PoolQuickPickItem[];
}
/** 行内操作按钮——onClick 闭包留在壳，池只回传 actionId（位置序号）。
 *  E5.8#20-c：改名 PoolToastButton——与 poolActions.ts PoolToastAction（IPC 回传动作）同名，
 *  契约平铺进单文件会声明合并成幽灵复合型；按钮描述型用 Button 后缀消歧。 */
export interface PoolToastButton {
    /** 位置序号字符串——壳按 actions[Number(actionId)] 重解析 onClick */
    actionId: string;
    label: string;
    isPrimary?: boolean;
}
export interface PoolToastItem {
    id: string;
    message: string;
    /** 壳侧已解析的图标类（codicon + severity 类）——池原样渲染 */
    iconClass: string;
    /** 壳侧已 t() 解析的 "来源: xxx"——池原样渲染 */
    sourceText?: string;
    actions?: PoolToastButton[];
}
export interface PoolToastData {
    toasts: PoolToastItem[];
    /** NotificationCenter 打开时壳推 true——池整体隐藏（对标壳 ToastContainer） */
    suppressed: boolean;
}
/**
 * Pool Dialog 哑渲染数据——E5.7#17（浮层归一化设计.md §7）。
 *
 * 聪慧→哑数据流：壳 DialogService 桥（renderer 注册）把 options 序列化成 DTO 推送
 * （显示文本铁律——按钮文案已由壳侧 t() 解析，池原样渲染）。
 * Promise 的 resolve 闭包留壳——池只回传动作类型（confirm/cancel），壳侧 settle。
 */
export type PoolDialogData = {
    open: false;
} | {
    open: true;
    title: string;
    message: string;
    /** 壳侧已 t() 解析——池原样渲染 */
    confirmLabel?: string;
    cancelLabel?: string;
    /** alert 模式——只有确定按钮，无取消/Escape/backdrop 关闭 */
    isAlert: boolean;
};
/** 标题栏动作按钮——池渲染 + 回传壳侧重解析业务语义（池零语义，UI 机械知识除外）。
 *  E5.8#20-c：改名 PoolFloatingPanelButton——与 poolActions.ts PoolFloatingPanelAction（IPC 回传动作）
 *  同名，契约平铺进单文件会声明合并成幽灵复合型；按钮描述型用 Button 后缀消歧（poolToast 同款）。 */
export interface PoolFloatingPanelButton {
    /** 动作 id——open-in（在主窗口中打开）/ maximize（最大化）/ close（关闭），壳侧重解析 */
    id: string;
    /** 壳 t() 已解析的动作名——mockup：hover tooltip（open-in 展开全文） */
    label: string;
    /** 内建图标 id——池按 id 选 SVG（open-in/maximize/restore/close） */
    icon: string;
    /** 本地 toggle 专用（I8-9 最大化→还原 同按钮）——切换态图标，缺省 = 非 toggle 动作（回传壳） */
    toggledIcon?: string;
    /** 本地 toggle 切换态文案（如「还原」）——池零自产文本，两态文案都壳 t() 给 */
    toggledLabel?: string;
    /** open-in 类型——默认纯图标、hover 展开全文（mockup .fp-act.open-in） */
    expandOnHover?: boolean;
}
export type PoolFloatingPanelData = {
    open: false;
} | {
    open: true;
    /** 面板身份——壳 FloatingPanelService 单实例语义按 viewId 裁决（I8-10：同 viewId 聚焦 / 异 viewId 替换） */
    viewId: string;
    /** 标题——壳 t() 已解析，池原样渲染 */
    title: string;
    /** 内容插件——池经 PluginComponent(pluginId, renderPath) 渲染（壳不持渲染器） */
    pluginId: string;
    /** 内容视图 renderPath——池视图注册表寻址 */
    renderPath: string;
    /** 标题栏动作按钮（顺序 = 渲染顺序：open-in / maximize / close） */
    actions: PoolFloatingPanelButton[];
    /** 语言切换文案重推标记（refreshPanelText）——池仅更新标题/动作渲染，跳过焦点获取（I8-8 首次打开才入焦点） */
    refresh?: boolean;
};
/** UI 浮层/菜单/通知命名空间面——对标 VS Code vscode.window + ContextKey + 池内 QuickPick/Toast/Dialog 宿主桥 */
export interface UiAPI {
    /** 通知——插件弹出壳侧 toast，对标 VS Code vscode.window.showInformationMessage */
    notifications: {
        /** 弹出通知。progress=true 时返回 ProgressHandle（含 update/finish/cancel） */
        show(message: string, options?: {
            type?: "info" | "warning" | "error";
            progress?: boolean;
        }): Promise<NotificationHandle | undefined>;
    };
    /** E5#69：菜单——插件声明式读写 */
    menu: {
        registerItems(menuId: string, pluginId: string, items: ManifestMenuItem[]): Promise<void>;
        getItems(menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]>;
    };
    /** E5#70：ContextKey——插件 SET 状态供壳 when 子句读 */
    contextKey: {
        set(key: string, value: unknown): Promise<void>;
        _getValue?(key: string): unknown;
    };
    /** E5#67：弹窗——确认/提示/文件选择 */
    dialog: {
        confirm(message: string): Promise<boolean>;
        alert(message: string): Promise<void>;
        /** 文件/目录选择器——对标 Tauri dialog.open（E5.7#73：openFile 为插件侧规范名，本方法保留给既有消费方） */
        open(opts?: DialogOpenOptions): Promise<string | null>;
        /** 打开文件选择器——返回用户选中路径，取消 → null。安全由主进程控制 */
        openFile(opts?: DialogOpenOptions): Promise<string | null>;
    };
    /** E5.7#63：插件 quickPick 选择器——池内本地桥（零 IPC，QuickPickHost 渲染）。结算 null → undefined */
    quickPick: {
        show(opts: PluginQuickPickOptions): Promise<unknown>;
    };
    /** E5.7#63：QuickPick 宿主渲染桥——池 QuickPickHost 消费（壳 preload 无此面） */
    quickPickHost: {
        registerHost(fn: (req: PluginQuickPickRequest, settle: (key: string | null) => void) => void): () => void;
        onShow(cb: (data: PoolQuickPickData) => void): () => void;
        select(key: string): void;
        highlight(key: string): void;
        close(): void;
        itemAction(key: string, actionId: string): void;
    };
    /** E5.7#16：Toast 哑渲染订阅——池 ToastHost 消费（壳 preload 无此面） */
    toast: {
        onShow(cb: (data: PoolToastData) => void): () => void;
        dismiss(id: string): void;
        action(id: string, actionId: string): void;
    };
    /** E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费（壳 preload 无此面）。命名 dialogHost——
     * dialog 命名空间已是插件侧 confirm/alert/open API */
    dialogHost: {
        onShow(cb: (data: PoolDialogData) => void): () => void;
        confirm(): void;
        cancel(): void;
    };
    /** E5.8#37（Phase 8 类型 B）：悬浮面板哑渲染订阅——池 FloatingPanelHost 消费（壳 preload 无此面）。
     * 命名 floatingPanelHost——面板请求 API（panel.revealFloating）归 PanelAPI，宿主渲染桥归本面 */
    floatingPanelHost: {
        onShow(cb: (data: PoolFloatingPanelData) => void): () => void;
        /** 动作回传——open-in（在主窗口中打开）/ close，壳侧 settle（业务语义壳侧重解析） */
        action(actionId: string): void;
    };
}
/** 端口列表条目——listPorts() 返回 */
export interface SerialPortInfo {
    name: string;
    description: string;
}
/** 串口状态快照——F5 刷新 / getStatus() 返回 */
export interface SerialStatus {
    isOpen: boolean;
    portName: string;
    baudRate: number;
}
/** 打开串口配置——插件 API 入参 + 主进程 serial-service 消费 */
export interface OpenPortConfig {
    portName: string;
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    encoding?: string;
    /** E5.8#26 D8——资源归属声明：由插件 openPort 时自声明（pool WCV 多插件同 JS 上下文，
     *  主进程无法从 sender 识别插件），卸载时 closePortsByOwner 按此回收硬件资源。 */
    ownerPluginId?: string;
}
/** 串口数据载荷——serial.data 推送（E5.8#28：由原无口名 string 演化——D6 载荷对象化）。 */
export interface SerialDataPayload {
    /** 数据源端口 = 路由键——消费方按 portName 收自己的口的数据（多口并存各口各收） */
    portName: string;
    /** 解码后的行文本 */
    text: string;
}
/** 串口统计载荷——serial.stats 推送（E5.8#28：由原无口名 SerialStats 演化——S10 每口计数器的数据源）。
 *  tx/rx 为推送增量（非累计值）——消费方自行累加。 */
export interface SerialStatsPayload {
    /** 统计归属端口 = 路由键——各口计数器独立累加 */
    portName: string;
    tx?: number;
    rx?: number;
}
/** 串口系统消息载荷——serial.system 推送（E5.8#28：由原无口名 string 演化——S12 正则挖口名 hack 的修根）。
 *  message 保留 V2 消息格式（如 `---- 已打开串行端口 COM3 ----`），portName 结构化免解析。
 *  E5.8#30.11（P1）——type 分类标签（审视 ①：来源端分类，一个概念一处写，不做消费端文案关键词判断）：
 *  status = 正常成功流程（开/关/波特率切换）；error = 非正常流程（同口二开拒绝 D8 / 驱动错误 / 拔线）。
 *  消费端按键路由：status 按口过滤（他口操作不显示）、error 全局可见（非活动标签页也显示）。 */
export interface SerialSystemPayload {
    /** 消息归属端口 = 路由键——本端口会话专属消费（开/关状态切换）；不匹配的会话仍可显示文本但不触发状态切换 */
    portName: string;
    message: string;
    /** 消息分类——status 成功流程 / error 失败异常（D8 拒绝、驱动错误、拔线） */
    type: "status" | "error";
}
/** 串口/剪贴板/插件间通信/事件/持久化存储命名空间面——对标 VS Code SerialPort API + p2p + EventEmitter + state */
export interface DataAPI {
    /** 串口——读/写/监听，对标 VS Code SerialPort API */
    serial: {
        listPorts(): Promise<SerialPortInfo[]>;
        /** E5.8#26 D5 双形态：无参 → SerialStatus[]（全部打开口，空数组 = 全关）/ 有参 → 单口快照（F5 遍历恢复用） */
        getStatus(): Promise<SerialStatus[]>;
        getStatus(portName: string): Promise<SerialStatus>;
        openPort(cfg: OpenPortConfig): Promise<void>;
        /** E5.8#26 D2——portName 可选：缺省 = 唯一打开口（0 口抛「串口未打开」/ ≥2 口抛「多串口已打开，请指定 portName」） */
        closePort(portName?: string): Promise<void>;
        sendData(data: number[], portName?: string): Promise<void>;
        sendText(text: string, enc: string, portName?: string): Promise<void>;
        setDtr(enable: boolean, portName?: string): Promise<void>;
        setRts(enable: boolean, portName?: string): Promise<void>;
        /** E5.8#28：载荷对象化——SerialDataPayload.portName = 路由键（多口并存各口各收） */
        onData(cb: (payload: SerialDataPayload) => void): () => void;
        onStats(cb: (payload: SerialStatsPayload) => void): () => void;
        onSystem(cb: (payload: SerialSystemPayload) => void): () => void;
    };
    /** 剪贴板——读/写系统剪贴板 */
    clipboard: {
        readText(): Promise<string>;
        writeText(text: string): Promise<void>;
        /** 写入文件列表——文件树复制粘贴用 */
        writeFileList(paths: string[]): Promise<void>;
    };
    /** E5#65：p2p 插件间定向推流——和 bridge.broadcast 同模式（fire-and-forget） */
    p2p: {
        send(target: string, channel: string, data: unknown): void;
        on(channel: string, cb: (data: unknown) => void): () => void;
    };
    /** 通用事件订阅 + 发布——插件间数据管道。channel 为自由字符串，载荷按通道分型——订阅方收窄 */
    events: {
        /** E5.7#98：on 泛型化——载荷类型按订阅方 cb 推断（event-system EventSystemApi 同款，#97 已泛型化 impl），通道契约类型（ConfigurationChangedPayload 等）可直传 */
        on<T = unknown>(channel: string, cb: (payload: T) => void): () => void;
        emit(channel: string, payload: unknown): void;
        heartbeat?(): void;
        notifyTheme?(isDark: boolean): void;
    };
    /** E5#71：插件持久化存储——集中缓存 + 文件持久化 */
    pluginState: {
        /** 读取持久化状态——运行时动态值，默认 unknown；调用方显式 get<string>(...) 窄化或自行收窄 */
        get<T = unknown>(pluginId: string, key: string): Promise<T | undefined>;
        set(pluginId: string, key: string, value: unknown): Promise<void>;
        /** 订阅持久化状态变更——按 pluginId+key 精确匹配（通配键名订阅走 events.on("plugin-state:changed")，见 E5.8#20 补导出 PluginStateChangedPayload）。返回 unsubscribe */
        onChange(pluginId: string, key: string, cb: (value: unknown) => void): () => void;
    };
}
export interface WorkspaceFolder {
    /** 文件夹完整路径（file:// URI） */
    uri: string;
    /** 文件夹名——路径最后一段 */
    name: string;
    /** 索引——第一个打开的文件夹 index=0 */
    index: number;
}
/** 文件/目录条目——前后端共用 */
export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    size?: number; // 字节
    modifiedAt?: number; // Unix 时间戳 ms
    /** E4V#10: 文件是否只读（不可写） */
    isReadonly?: boolean;
}
export interface FileChangeEvent {
    path: string;
    type: "created" | "changed" | "deleted";
}
/** 环境信息——env.get() 返回（主进程 env-handlers 组装） */
export interface EnvInfo {
    appDataDir: string;
    pluginsRootDir: string;
    appPluginsDir: string;
    pluginDataDir?: string;
    pluginCacheDir?: string;
    pluginExportsDir?: string;
}
/** IPC search:searchFiles 载荷——FileSearcher.SearchOptions 的 wire 子集（无 signal） */
export interface SearchWireOptions {
    roots: string[];
    query: string;
    include?: string;
    exclude?: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    maxResults?: number;
}
/** 单个匹配——1-based lineNumber；matchStart/matchEnd 为该行内 0-based 列区间（不含 end） */
export interface SearchWireMatch {
    filePath: string;
    lineNumber: number;
    lineText: string;
    matchStart: number;
    matchEnd: number;
}
/** IPC search:searchFiles 返回——FileSearchResult 的 wire 形状 */
export type SearchWireResult = Array<{
    filePath: string;
    matches: SearchWireMatch[];
}>;
/** 工作区/文件系统/路径/环境/搜索/编码命名空间面——对标 VS Code vscode.workspace + env + ExtensionContext */
export interface WorkspaceAPI {
    /** 工作区——池 preload 注入（壳侧经 WorkspaceService 直用）。池权威命名空间——插件必用面（file-tree），必选 */
    workspace: {
        getFolders(): Promise<WorkspaceFolder[]>;
        getActive(): Promise<string | undefined>;
        setActive(uri: string): Promise<void>;
        openFolder(): Promise<void>;
        addFolder(path: string): Promise<void>;
        removeFolder(path: string): Promise<void>;
        onDidChangeFolders(cb: () => void): () => void;
        onDidChangeActiveWorkspace(cb: (uri: string | null) => void): () => void;
    };
    /** 文件系统——插件读写（路径校验由主进程执行） */
    filesystem: {
        readTextFile(p: string): Promise<string>;
        writeTextFile(p: string, d: string): Promise<void>;
        exists(p: string): Promise<boolean>;
        createDir(p: string): Promise<void>;
        copy(src: string, dest: string): Promise<void>;
        /** E5.8#25.2：重命名/移动文件或目录（主进程 fs.rename 原子；对标 POSIX rename / VS Code fs.rename） */
        rename(src: string, dest: string): Promise<void>;
        remove(p: string): Promise<void>;
        listDir(p: string): Promise<FileEntry[]>;
        readBinaryFile(p: string): Promise<Uint8Array>;
        writeBinaryFile(p: string, d: Uint8Array): Promise<void>;
        /** 监听目录变更——返回 unsubscribe（内部走 filesystem:changed:<watcherId> 通道） */
        watch(dirPath: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
        /** 列出条目名——壳 preload 独有（池侧请用 listDir） */
        readdir?(p: string): Promise<string[]>;
    };
    /** 路径工具——壳/池双端注入（editor/file-tree 池插件消费 normalize/join 等）；appDataDir 双端同款（E5.8#0d.5：池侧补上——settings 插件池内解析 userData 路径） */
    path: {
        appDataDir?(): Promise<string>;
        normalize(p: string): string;
        join(...parts: string[]): string;
        basename(p: string): string;
        dirname(p: string): string;
        extname(p: string): string;
    };
    /** 环境信息——对标 VS Code ExtensionContext */
    env: {
        get(pluginId?: string): Promise<EnvInfo>;
    };
    /** E5.6#11.5a：文件搜索——全文搜索/替换（IPC 到壳/主进程执行） */
    search: {
        // E5.8#1c：wire 契约归口 src/core/types/ipc/search.ts——与 preload-pool buildSearch 双端同源
        searchFiles(opts: SearchWireOptions): Promise<SearchWireResult>;
    };
    /** E5.6#11.5a：编码检测/转换（主进程 EncodingService） */
    encoding: {
        detect(buffer: Uint8Array): Promise<string>;
        decode(buffer: Uint8Array, encoding: string): Promise<string>;
        encode(text: string, encoding: string): Promise<Uint8Array>;
    };
}
/** 文件装饰——E5.7#60 池内本地注册表。形状对标插件 API 契约 §3.24 */
export interface FileDecoration {
    badge?: string;
    tooltip?: string;
    color?: string;
    propagate?: boolean;
}
/** 文件装饰提供方——插件注册（registerProvider）。同步查询契约：跳过返回 Promise 的 provideDecoration */
export interface FileDecorationProvider {
    provideDecoration(uri: string): FileDecoration | null | undefined;
    onDidChangeFileDecorations?(cb: (uris: string[]) => void): () => void;
}
/** 文件装饰/关联/语言定义/LSP/协议/视图容器命名空间面——编辑器配套服务（主进程/池内直答） */
export interface EditorAPI {
    /** E5.7#60：文件装饰——池内本地注册表（零 IPC）。形状对标契约 §3.24 */
    decorations: {
        registerProvider(pluginId: string, provider: FileDecorationProvider): void;
        unregisterProvider(pluginId: string): void;
        getDecoration(uri: string): Promise<FileDecoration | null>;
        onDidChange(cb: (uris: string[]) => void): () => void;
    };
    /** E5.7#50：文件关联——扩展名→插件 ID（主进程 FileAssociationService 直答） */
    fileAssociation: {
        getPluginFor(ext: string): Promise<string | undefined>;
    };
    /** E5.7#49：langDef——语言定义注册表（主进程直答）。只返回可序列化字段（monarch tokenizer 函数主进程侧剥壳） */
    langDef: {
        get(extension: string): Promise<{
            id: string;
            lsp?: {
                command: string;
                args?: string[];
            };
        } | null>;
    };
    /** E5.6#14-lsp：LSP 桥——自动补全/F12/诊断/重命名 */
    lsp: {
        spawn(command: string, args: string[] | undefined, pluginId: string): Promise<string>;
        write(channelId: string, data: string): void;
        dispose(channelId: string): Promise<unknown>;
        onData(cb: (channelId: string, data: string) => void): () => void;
    };
    /** E5.7#49：protocol——协议注册表（主进程直答）。返回前剥 parseLine/detect（JS 函数不可跨进程） */
    protocol: {
        listProtocols(): Promise<Array<{
            id: string;
            name: string;
            pluginId: string;
            mode: string;
        }>>;
        getActiveProtocolId(): Promise<string>;
        setActiveProtocolId(protocolId: string): Promise<void>;
    };
    /** E5.7#58：viewContainer——真 IPC 查询/更新（问壳侧注册表）。DTO 只含可序列化公开字段 */
    viewContainer: {
        getViewContainer(id: string): Promise<Record<string, unknown> | undefined>;
        getViews(containerId: string): Promise<Array<Record<string, unknown>>>;
        // E5.8#41.9.2：getView 复合寻址——(pluginId, viewId) 精确查视图元数据（#41.8 碰撞面 #2）
        getView(pluginId: string, viewId: string): Promise<Record<string, unknown> | undefined>;
        registerView(pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void>;
    };
}
/**
 * Phase 4 核心类型定义。
 * 插件元数据、标签页扩展字段、视图注册表条目。
 *
 * 设计依据：[[phase4-design-decisions]] + public/schemas/plugin.schema.json
 */
export type PluginType = "view" | "card" | "theme" | "language" | "protocol" | "resource" | "datasource";
export interface TabBehavior {
    /** 场上无标签页时自动创建此标签页，且不可关闭。只有欢迎页声明。 */
    isFallback?: boolean;
    /** 全局只允许一个实例，重复创建 → 聚焦已有。如设置页。 */
    singleton?: boolean;
    /** 关闭前弹确认框，值为提示文本。如终端。 */
    confirmOnClose?: string;
    /** 关闭前调用的 Tauri invoke 命令（在 confirmOnClose 确认之后，closeTab 之前）。如终端声明 "close_port"。 */
    invokeBeforeClose?: string;
    /** CreateTabOptions 中用于判断标签页身份的唯一字段。null=允许多实例不去重（默认）。
     *  如 workspace 声明 "workspaceName"——同名工作台只允许一个标签页。 */
    identityField?: string;
}
export interface StatusBarItem {
    id: string;
    icon?: string;
    label: string;
    align?: "left" | "right";
    onClick?: string;
    /** 声明 true → 壳自动注册配置项（<pluginId>.statusBar.<id>）+ 注入 visible prop。
     *  插件作者只写一行 JSON，用户可在 Settings Editor 开关。 */
    configurable?: boolean;
}
export interface PluginManifest {
    $schema?: string;
    /** @deprecated 使用 contributes + tabBehavior 等声明字段代替——贡献点由 manifest 的实际声明字段检测（对标 VS Code contributes） */
    type?: PluginType;
    core?: boolean;
    /** 插件角色——只管加载策略。view=有 UI 组件，data=纯数据。不填自动推导 */
    pluginRole?: "view" | "data";
    name: string;
    version: string;
    icon?: string;
    iconSource?: "codicon" | "svg" | "url" | "lucide";
    description?: string;
    author?: string;
    entry?: string;
    sidebar?: string;
    tabBehavior?: TabBehavior;
    /** 系统插槽角色——声明此插件填充哪个系统级功能。settings=设置页，marketplace=插件市场。
     *  多个插件声明同一 role → 第一个 core: true 的胜出。
     *  E5.7#65：开放 string——第三方可声明新角色名，壳零改动（FactorySlots 按字符串查表）。 */
    factoryRole?: string;
    statusBar?: StatusBarItem[];
    /** @deprecated E5#12——已迁移到 contributes.themes。仅 normalizeManifest 向后兼容用。 */
    file?: string;
    /** @deprecated E5#12——已迁移到 contributes.themes。仅 normalizeManifest 向后兼容用。 */
    themes?: {
        id: string;
        name: string;
        file: string;
    }[];
    /** @deprecated E5#12——已迁移到 contributes.languages。仅 normalizeManifest 向后兼容用。 */
    languages?: {
        code: string;
        name: string;
        file: string;
    }[];
    mode?: "text" | "binary";
    resources?: string[];
    recommends?: {
        plugin: string;
        reason: string;
    }[];
    suggests?: {
        plugin: string;
        reason: string;
    }[];
    /** 插件级激活顺序依赖（E5.8#13）——按 pluginId 声明，loader 先加载依赖再加载本插件。
     *  纯声明：无版本约束（版本语义属 E6 市场范畴，激活顺序不承载）；缺依赖 → loader 状态机挂 PENDING。
     *  与 ConfigurationRegistry 的配置项级 dependsOn（同一 manifest 内某配置项依赖另一配置项）不同域。 */
    requires?: string[];
    changelog?: {
        version: string;
        date: string;
        changes?: string[];
    }[];
    screenshots?: string[];
    minAppVersion?: string;
    /** 激活事件——对标 VS Code activationEvents。空或含 "*" = 启动时立即加载。
     *  具体事件：onCommand:id / onFileOpen:.ext / onPortOpen / onLanguage:id / onView:id */
    activationEvents?: string[];
    /** @deprecated E5.8#14——归并到 requires（插件级激活依赖统一由 requires 声明）。
     *  零插件使用；loader 兼容读取直到 #14 落地迁移。 */
    extensionDependencies?: string[];
    docs?: string;
    cardDocMap?: Record<string, string>;
    /** @deprecated E5#109——使用 contributes.i18n 代替。每插件 `i18n/{lang}.json`，key=中文原文。见 [[i18n-round2-leftovers]] */
    i18n?: Record<string, string>;
    cssVars?: Record<string, {
        dark: string;
        light: string;
    }>;
    permissions?: ("serial" | "filesystem" | "network")[];
    /**
     * Phase 5g：视图元数据——声明视图和壳的交互方式。
     * 这些字段替代 Phase 3/4 的硬编码特殊判断（isSidebarOnlyView / BOTTOM_ICONS 等）。
     */
    /** 插件 UI 出现位置——声明式。替代 iconLocation + viewRole + keepSidebarOnFocus。
     *  对标 VS Code：viewsContainers + views 的组合推导出 Activity Bar / Sidebar / Panel */
    appearsIn?: {
        iconBar?: "top" | "bottom";
        sidePanel?: boolean;
        tabBar?: boolean;
        statusBar?: boolean;
    };
    /** @deprecated E5#14——用 appearsIn.iconBar 替代。仅 viewRegistry.ts 向后兼容兜底。 */
    iconLocation?: "top" | "bottom";
    /** @deprecated E5#14——用 appearsIn.tabBar / appearsIn.sidePanel 替代。 */
    viewRole?: "sidebarPrimary" | "tabOnly";
    /** @deprecated E2c #19d 后已无 shellRendered 概念——壳级视图直接写 App.tsx，不走 plugin.json 声明。保留仅用于向后兼容。 */
    shellRendered?: boolean;
    /** @deprecated E5#14——appearsIn 归一化后不再需要。 */
    keepSidebarOnFocus?: boolean;
    /**
     * Phase 5：对标 VS Code package.json contributes。
     * 使用 Record<string, unknown> 兼容未知 key——parseContributions 按 key 逐项检测。
     * 已知 key 的类型见下方 ContributesViewsContainers / ContributesViews。
     */
    contributes?: Record<string, unknown>;
}
/** list() 的 manifest 序列化子集——与 handlePluginsCall "list" 7 字段对齐 */
export interface PluginListSubset {
    name?: string;
    description?: string;
    version?: string;
    core?: boolean;
    author?: string;
    statusBar?: PluginManifest["statusBar"];
    contributes?: PluginManifest["contributes"];
}
/** 插件列表条目——pluginManager.list() 返回（主进程序列化后的 manifest 子集）。
 *  E5.7#98：Partial<PluginManifest> 过宽（component 等字段 IPC 不可达）——收窄为
 *  IpcBridgeHandler.handlePluginsCall "list" 分支实际序列化的 7 字段，marketplace 消费。
 *  E5.8#15.5：pendingReason——缺依赖挂起原因（"等待依赖: xxx"）；无挂起 = undefined。
 *  有值 = 插件已安装但依赖未就绪（PENDING），列表/详情显示等待状态。 */
export interface PluginListEntry {
    pluginId: string;
    manifest: PluginListSubset;
    /** 缺依赖挂起原因——marketplace 显示 PENDING 徽标 + 详情提示条（E5.8#15.5） */
    pendingReason?: string;
}
/** E5.7#81：安装结果——success:false 时 error 为中文失败原因（校验 / 版本冲突 / 复制失败）。
 *  安装进度事件：events.on("plugin:installProgress", ({ stage, pluginId, message }) => ...)
 *  stage: validating | copying | loading | done | error
 *  E5.7#83：装卸广播（壳 loader → 唯一 Pool）：
 *  events.on("plugin:installed", ({ pluginId, version, reason }) => ...) reason: install | reinstall
 *  events.on("plugin:uninstalled", ({ pluginId, reason }) => ...) reason: uninstall */
export interface PluginInstallResult {
    success: boolean;
    pluginId?: string;
    version?: string;
    needRestart?: boolean;
    error?: string;
}
/** 禁用/卸载列表条目——loader getDisabledPluginInfo/getUninstalledPluginInfo 序列化形状（PluginListSubset 的再子集） */
export interface PluginInfoEntry {
    pluginId: string;
    name: string;
    description?: string;
    version?: string;
}
/** 插件发现/管理命名空间面——桥接 IpcBridgeHandler → loader 函数 */
export interface PluginsAPI {
    /** 插件发现——双端注入：resolvePath 双端同面；读面（listDirs/listDisabledDirs/readManifest）壳 preload 独有（loader 只在壳跑） */
    plugins: {
        resolvePath(id: string): Promise<string>;
        listDirs?(): Promise<string[]>;
        listDisabledDirs?(): Promise<string[]>;
        /** 返回 plugin.json 原始 JSON 文本——消费方自行 JSON.parse */
        readManifest?(id: string): Promise<string>;
    };
    /** 插件管理——桥接 IpcBridgeHandler → loader 函数。池权威（marketplace 插件消费），必选 */
    pluginManager: {
        list(): Promise<PluginListEntry[]>;
        enable(id: string): Promise<unknown>;
        disable(id: string): Promise<unknown>;
        uninstall(id: string): Promise<unknown>;
        install(path: string): Promise<PluginInstallResult>;
        reinstall(id: string): Promise<unknown>;
        getDisabled(): Promise<PluginInfoEntry[]>;
        getUninstalled(): Promise<PluginInfoEntry[]>;
        isDisabled(id: string): Promise<boolean>;
        /** E5.7#48：装/卸/重装成功 → 通知主进程全量重扫三表 */
        notifyManifestChanged?(): void;
    };
}
/**
 * bridge 请求信封契约——E5.7#97。
 *
 * 插件 IPC 请求经主进程转发到壳侧服务（IpcBridgeHandler）的信封：
 * requestId 用于 respond 关联，args 是命令自定参数（shell 侧 switch 收窄）。
 * preload-shell 的 IpcRelay 缓冲 + IpcBridgeHandler onRequest 同用此型。
 */
export interface BridgeRequestPayload {
    requestId: string;
    channel: string;
    args: unknown[];
    /**
     * E5.8#46.12：信封来源窗盖章——主进程按 sender 反查 windowId（池不知自身 windowId，#43-4 铁律），
     * 池→壳每一请求自带来源窗身份。壳按此路由按窗操作（sourceId 族：标签改/关/聚焦落到来源窗注册表，
     * 主窗照旧）——窗口身份丢失类（黑点/面板/弹窗）同根归一化。壳侧 switch 收窄时按需消费，无消费方忽略。
     */
    sourceWindowId?: string;
}
/** 菜单项——壳侧已解析（显示文本铁律：label 已 t()，池哑渲染）。titlebar 下拉与 ☰ 汉堡共用。 */
export interface PoolMenuItem {
    /** 显示标签——壳 t(label ?? command.title ?? command) */
    label: string;
    /** 点击执行的命令 ID——无 command 父项为 ""（汉堡不展平父项，点击 no-op） */
    command: string;
    /** 快捷键显示文本——formatKeyLabel 后。仅汉堡（showKeybindings）；titlebar 下拉无快捷键（同壳行为） */
    shortcut?: string;
    /** 子菜单——titlebar 仅 command+children 父项携带（无 command 父项由壳展平）；汉堡不展平 */
    children?: PoolMenuItem[];
}
/** 菜单组——titlebar 每个 group = 顶栏一个按钮（如"文件""查看"）；汉堡 = 分组区块 */
export interface PoolMenuGroup {
    /** group 名——排序/定位键 */
    group: string;
    /** 组显示标签——壳 t(首项 label ?? group) */
    label: string;
    items: PoolMenuItem[];
}
/** 标题栏槽位按钮——插件 contributes.titleBar 声明（when 已由壳过滤） */
export interface TitleBarSlotButton {
    command: string;
    /** codicon 类名或图片路径 */
    icon?: string;
    /** tooltip——与壳 TitleBar title={item.command} 行为一致 */
    title: string;
}
/** 标题栏布局——Phase 2 #5 TitleBarZone 消费 */
export interface TitleBarLayout {
    title: string;
    /** Logo 资源 URL——壳 getAssetPath 解析（Path B：池不 import core） */
    logoUrl: string;
    menuBarVisible: boolean;
    /** 菜单栏数据——壳分组/展平/翻译后推送 */
    menuGroups: PoolMenuGroup[];
    /** 插件贡献槽位按钮（left/right） */
    slots: {
        left: TitleBarSlotButton[];
        right: TitleBarSlotButton[];
    };
    /** 窗口控件 tooltip——显示文本铁律：壳 t() 解析后推送（E5.8#46.18：pin/unpin 置顶两态） */
    windowControls: {
        minimize: string;
        maximize: string;
        restore: string;
        close: string;
        pin: string;
        unpin: string;
    };
}
/** 图标栏图标——壳 resolvePluginIcon 序列化（池不 import pluginLoader，Lucide 名由池映射组件渲染） */
export type IconBarIcon = {
    kind: "lucide";
    name: string;
} // E5#100 Lucide 优先
 | {
    kind: "codicon";
    name: string;
} // codicon CSS 类
 | {
    kind: "img";
    src: string;
} // linkdesk:// 协议 URL
 | {
    kind: "emoji";
    text: string;
}; // 回退 emoji

/** 图标栏条目——序列化自壳 viewRegistry（pluginId + 图标 + 名称 + 位置） */
export interface IconBarItem {
    pluginId: string;
    icon: IconBarIcon;
    /** tooltip / aria-label——壳 t(manifest.name) */
    label: string;
    /** 图标位置——getIconLocation：顶部活动图标 / 底部齿轮 */
    location: "top" | "bottom";
}
/** 图标栏布局——Phase 2 #6 IconBarZone 消费 */
export interface IconBarLayout {
    icons: IconBarItem[];
    /** 激活图标——当前侧栏容器所属插件（侧栏折叠/无容器时不亮，壳 isActive 同款双重守卫） */
    activePluginId?: string;
    /** E3f #52h：☰ 汉堡可见——menuStyle hamburger/both */
    hamburgerVisible: boolean;
    /** 导航 aria-label——壳 t("导航")（显示文本铁律） */
    navLabel: string;
    /** ☰ 下拉——壳 MenuRenderer showGroups+showKeybindings+checkWhen 语义（不展平父项），仅 hamburgerVisible 时推 */
    hamburger?: {
        /** ☰ tooltip——壳 t("菜单") */
        title: string;
        groups: PoolMenuGroup[];
    };
}
/** 动作区下拉条目——label 显示文本（i18n key），command 执行，args 作为单个位置参数透传 */
export interface TitleActionItem {
    /** 显示文本——i18n key（中文原文；池 t() 解析——显示文本铁律） */
    label: string;
    /** 点击执行的命令 ID */
    command: string;
    /** 命令参数——executeCommand(command, args) 单个位置参数透传（JSON 可序列化，无则省略） */
    args?: unknown;
}
/** 动作区 widget——三形态：icon 按钮 / 下拉菜单 / 主按钮+下拉复合（VS Code 终端 [+] + [▾] 同款）。
 *  widget 是通用件不是给终端造的——谁声明谁用（通用 API 壳先行建设不等消费方，插件独立铁律）。 */
export type TitleActionWidget =
/** 单图标按钮——点击执行 command */
{
    type: "icon";
    id: string;
    command: string;
    /** codicon 类名（如 "codicon-add"）——池渲染 `<span className={`codicon ${icon}`} />` */
    icon: string;
    /** tooltip / aria-label——i18n key */
    title: string;
    args?: unknown;
}
/** 纯下拉——chevron 按钮展开 items 列表 */
 | {
    type: "dropdown";
    id: string;
    items: TitleActionItem[];
    /** chevron tooltip——i18n key */
    title?: string;
}
/** 主按钮+下拉复合——主按钮执行 command（默认动作），右侧 chevron 展开 items 备选 */
 | {
    type: "split";
    id: string;
    command: string;
    /** 主按钮图标——无 icon 时用 title（t() 后）作文本按钮 */
    icon?: string;
    /** 主按钮 tooltip / aria-label / 无 icon 时的文本——i18n key */
    title: string;
    items: TitleActionItem[];
    args?: unknown;
};
/** 侧栏 view 元数据——从 ViewContainerService 序列化，经 PoolLayout 推送到 SidebarPool */
export interface SidebarViewMeta {
    id: string; // view ID（"folders" / "search" / "installed"）
    title: string; // 显示标题
    pluginId: string; // _pluginId——PluginComponent 用它找 import.meta.glob
    renderPath: string; // loader.ts 构建的 glob key——池 O(1) 查找 view 组件
    role?: "toolbar" | "section"; // 默认 "section"
    order?: number;
    collapsed?: boolean; // 插件声明的初始折叠态（collapsed: true）
    badge?: string | number;
    titleDescription?: string;
    titleTooltip?: string;
    singleViewPaneContainerTitle?: string; // mergeHeaderWhenSingle 时替代 containerTitle
    minHeight?: number; // 声明最小高度——PaneSash effectiveMinHeight
    /** E5.8#36.6：视图动作区声明透传——侧栏 section header 右侧（#36.5 同一声明，两处消费） */
    titleActions?: TitleActionWidget[];
}
/** E5.7#84：单个侧栏容器的池渲染数据——SidebarLayout.containers[] 元素（keep-alive 容器清单） */
export interface SidebarContainerLayout {
    containerId: string;
    containerTitle: string;
    mergeHeaderWhenSingle?: boolean;
    views: SidebarViewMeta[];
}
/** 侧栏布局——仅 SidebarPool 接收 */
export interface SidebarLayout {
    visible: boolean;
    width: number;
    /** 🆕 E5.8#36.8：侧栏所在边——#37.6 dockTo("sidebar", ...) 消费方（swap 规则：与 rightSidebar 恒占对边）。
     *  池 grid（#37.5）据此决定 sidebar 落左槽还是右槽。缺省 "left"。 */
    edge?: "left" | "right";
    // ── E5.6#11a：容器元数据 ──
    containerId: string | null; // "file-explorer" / "marketplace" / "serial-monitor"
    containerTitle: string; // "资源管理器" / "插件市场" / "串口监视器"
    mergeHeaderWhenSingle?: boolean;
    views: SidebarViewMeta[];
    /** E5.7#84：keep-alive 容器清单——全部侧栏容器（非仅活动）序列化。
     *  池按 containerId 常驻挂载、display:none 切换——切容器不卸载视图，插件组件状态不丢。
     *  容器随插件卸载从清单消失 → 池自然卸载（真相源在壳，池零缓存）。旧布局（无此字段）回退单容器渲染。 */
    containers?: SidebarContainerLayout[];
    collapsedViews?: string[]; // 持久化折叠的 view ID 集合——壳 loadCollapsedState()
    /** E5.6#11-fix7：壳通知池侧栏是否折叠——width ≤ 48 时池渲染 ▶ 展开按钮而非裁剪内容 */
    collapsed?: boolean;
    // ── E5.7#10：侧栏 UI 文本壳侧 t() 推送（显示文本铁律——池渲染零自产文本） ──
    emptyText?: string; // 空状态主文案——"此容器没有已注册的视图"
    emptyHint?: string; // 空状态提示——"安装插件以添加视图"
    expandTooltip?: string; // ▶ 展开按钮 tooltip
    collapseTooltip?: string; // ◀ 折叠按钮 tooltip
    // ── E5.7#13：拖拽钳制界——壳 LayoutEngine dock 声明推送（池本地钳制对齐壳 resizeZone，零硬编码） ──
    minWidth?: number; // 拖拽最小宽——壳 dock.minWidth（170）
    maxWidth?: number; // 拖拽最大宽——壳 dock.maxWidth（600）
    // ── 向后兼容 ──
    /** @deprecated 被 views[] 取代——保留给未迁移的代码 */
    viewId?: string | null;
}
/** 🆕 E5.8#36.8：右侧栏布局——右侧栏真 zone（决策 6，E5.8#36.7 addZone("rightSidebar") 消费方）。
 *  与 SidebarLayout 对齐（消费字段同集），但**不携带自身 edge**——swap 规则保证 sidebar ↔ rightSidebar
 *  恒占对边，右栏 edge = sidebar 对边（池 grid #37.5 推导，防两处字面量）。
 *  E5.8#37.5 RightSidebarZone 真渲染：折叠/展开按钮 + tooltip 全壳 t() 推送（显示文本铁律）。 */
export interface RightSidebarLayout {
    visible: boolean;
    width: number;
    // ── 容器元数据（与 SidebarLayout 同语义）──
    containerId: string | null;
    containerTitle: string;
    mergeHeaderWhenSingle?: boolean;
    views: SidebarViewMeta[];
    containers?: SidebarContainerLayout[];
    collapsedViews?: string[];
    /** 🆕 E5.8#36.8 + #37.5：右栏折叠态——宽度 ≤48 派生（池），▶/◀ 按钮切换 emit 安全 no-op（壳接线归 Phase 12） */
    collapsed?: boolean;
    // ── 拖拽钳制界 + 空态文案 + 折叠 tooltip（与 SidebarLayout 同语义）──
    minWidth?: number;
    maxWidth?: number;
    emptyText?: string;
    emptyHint?: string;
    /** 🆕 E5.8#37.5：▶ 展开按钮 tooltip（壳 t() 推送） */
    expandTooltip?: string;
    /** 🆕 E5.8#37.5：◀ 折叠按钮 tooltip（壳 t() 推送） */
    collapseTooltip?: string;
}
/** 标签页在池中的表示——壳 pushLayout 时序列化 */
export interface PoolTab {
    id: string;
    pluginId: string;
    title: string;
    sourceId?: string;
    dirty?: boolean;
    // 🆕 E5.6#16.5：TabBar 渲染所需元数据
    /** 插件图标 URL——getAssetPath() 解析后的路径 */
    icon?: string;
    /** 固定标签页（对标 VS Code pinned tabs） */
    pinned?: boolean;
    /** 标签页关闭行为——from plugin.json tabBehavior.closeBehavior */
    closeBehavior?: "normal" | "confirm" | "blocked";
    /** 单例插件（settings/marketplace 等）——TabBar 不显示 [×] 关闭按钮 */
    singleton?: boolean;
    /** 壳内部视图（欢迎页/插件详情/输出面板）——MainPool 内容区不渲染 PluginComponent */
    shellRendered?: boolean;
    /** 壳内部视图类型——"welcome" | "plugin-detail" | "output"，池侧路由到对应组件 */
    shellType?: string;
    /** plugin-detail 视图的目标插件 ID（哪个插件的详情页） */
    detailPluginId?: string;
}
/** 分屏组——每个 group 占一个 flex 区域，内含 N 个 keep-alive 标签页 */
export interface PoolGroup {
    id: string;
    flex: number;
    activeTabId: string;
    tabs: PoolTab[];
}
/** 递归分裂树节点——要么是叶子（含一个 TabGroup），要么是分叉（含两个子树） */
export type SplitNode = {
    type: "leaf";
    groupId: string;
} | {
    type: "branch";
    direction: "horizontal" | "vertical";
    children: [
        SplitNode,
        SplitNode
    ];
    sizes: [
        number,
        number
    ]; // 百分比，如 [50, 50]
};
/** [+] 按钮可创建的视图类型——壳 pushLayout 时从 getTabCreatableViews() 动态计算 */
export interface CreatableViewMeta {
    pluginId: string;
    label: string;
}
/** 底部面板 view 元数据——面板视图注册序列化 */
export interface PanelViewMeta {
    id: string;
    title: string;
    pluginId: string;
    /** E5.7#63.7：视图渲染入口路径——loader 解析（_renderPath），池 PluginComponent 动态 import。
     *  ShellViewMeta 同款（sidebar 贡献），面板视图零特殊通道。 */
    renderPath: string;
    /** E5.8#36.5：视图动作区声明透传——PanelZone 标签栏右侧按活动视图渲染（无声明 → 右侧空白） */
    titleActions?: TitleActionWidget[];
}
/** E5.8#34：容器切换器下拉 item——含隐藏视图 + 显隐/激活标记（mockup 帧 2 拍板） */
export interface PanelSwitcherItem {
    viewId: string;
    /** 视图名——壳 t() 已解析（显示文本铁律） */
    title: string;
    /** 所属插件 ID——sub 标签（如 "panel-demo"） */
    pluginId: string;
    /** 当前可见性——✓ 勾选 = 可见 */
    visible: boolean;
    /** 是否激活视图 */
    active: boolean;
}
/** E5.8#34：容器切换器下拉分组——dd-group 容器标题 + dd-item 列表 */
export interface PanelSwitcherGroup {
    containerId: string;
    /** 容器标题——壳 t() 已解析 */
    containerTitle: string;
    items: PanelSwitcherItem[];
}
/** 底部面板布局——Phase 5 #21 PanelZone 消费 */
export interface PanelLayout {
    visible: boolean;
    height: number;
    /** 🆕 E5.8#36.8：面板 dock 边——#37.7 dockTo 消费方（面板位置）。顶/底=横带（align 控列跨度）；
     *  左/右=主区与对应侧栏间竖条（5 带排布）。缺省 "bottom"。 */
    edge?: "bottom" | "top" | "left" | "right";
    /** 🆕 E5.8#36.8：面板横向对齐——#37.7 setAlign 消费方。几何由池 grid 推导（#37.5），壳只推配置。
     *  center=主栏宽 / left=延伸到左侧栏之下 / right=延伸到右侧栏之下 / justify=全宽。缺省 "center"。 */
    align?: "left" | "center" | "right" | "justify";
    /** 🆕 E5.8#36.8：面板宽——edge∈{left,right} 时使用（竖条宽）；顶/底仍用 height。缺省 300。 */
    width?: number;
    activeViewId: string;
    views: PanelViewMeta[];
    // ── E5.7#21 + #37.5：拖拽钳制界——#13 同款（壳 LayoutEngine dock 声明推送，池零硬编码）。
    //   轴感知：横带（edge∈{bottom,top}）用 minHeight/maxHeight；竖条（edge∈{left,right}）用 minWidth/maxWidth。 ──
    minHeight?: number;
    maxHeight?: number;
    /** 🆕 E5.8#37.5：竖条面板（左/右）拖拽最小/最大宽——壳 dock.minWidth/maxWidth 推送 */
    minWidth?: number;
    maxWidth?: number;
    /** E5.7#63.7：[+] 按钮 tooltip——壳 t("新建面板视图") 推送（显示文本铁律；面板创建归 Phase 12，目前壳侧 no-op） */
    createTooltip?: string;
    /** E5.8#34：容器切换器下拉 DTO——按容器分组列全部视图（含隐藏），mockup 帧 2 */
    switcher?: PanelSwitcherGroup[];
    /** E5.8#34：空态占位主文本——全隐藏 / 无贡献视图时壳 t() 推送 */
    emptyText?: string;
    /** E5.8#34：空态占位指路——同 emptyText 壳 t() 推送 */
    emptyHint?: string;
    /** 🆕 E5.8#45：面板可脱出（PanelZone ⤢ 按钮显隐）——true 时渲染脱出按钮，点击 emit "panel:detach"（壳 detachPanel 接）
     *  ——脱出后漂移面板窗独占渲染本面板（主区空占位 I9-13），drift 窗内置 false（面板已在外，无需再脱出） */
    detachable?: boolean;
    /** 🆕 E5.8#45：⤢ 按钮 tooltip——壳 t("面板独立窗口") 推送（显示文本铁律） */
    detachTooltip?: string;
}
/** 状态栏条目——序列化自壳 StatusBar 三源（贡献/动态/事件）+ 壳固定项（显示文本铁律：壳 t() 已解析）。
 *  E5.8#20-c：改名 PoolStatusBarItem——与 api/types.ts StatusBarItem（manifest 贡献型）同名，
 *  契约平铺进单文件会声明合并成幽灵复合型（pluginId 变必选）；池线用 Pool 前缀消歧。 */
export interface PoolStatusBarItem {
    id: string;
    pluginId: string;
    /** codicon 图标名（不带 codicon- 前缀——池补） */
    icon?: string;
    label: string;
    title?: string;
    align: "left" | "right";
    /** 点击执行的命令 ID */
    onClick?: string;
    /** 插件有 statusBarComponent——池侧懒加载渲染（serial-monitor TX/RX 实时计数） */
    component?: boolean;
    /** 前导分隔线——壳 StatusBar 渲染语义（左区每项除首个；右区组内除首个） */
    dividerBefore?: boolean;
}
/** 通知动作——壳 ToastAction 序列化（onClick 是壳侧闭包——池点击回传壳执行） */
export interface NotifAction {
    label: string;
    isPrimary?: boolean;
}
/** 通知条目——壳侧已解析（icon 类/时间/来源标签/动作全部壳侧完成） */
export interface NotifItem {
    id: string;
    /** 完整 codicon 类串（如 "codicon codicon-error notif-severity-error"） */
    iconClass: string;
    message: string;
    /** 壳 formatTimeAgo（i18n t()） */
    timeLabel: string;
    /** 壳 t("来源: {{source}}")——无 source 则缺省 */
    sourceLabel?: string;
    actions: NotifAction[];
}
/** 通知分组——壳 NotificationCenter buildSourceGroups（source 第一段归类 + 未读排序） */
export interface NotifGroup {
    key: string;
    /** source 第一段或 t("其他") */
    label: string;
    unread: number;
    items: NotifItem[];
}
/** 通知中心数据——壳侧序列化（未读计数/文案/分组全壳侧完成） */
export interface NotifLayout {
    unread: number;
    /** 铃铛 tooltip——t("{{count}} 条通知") / t("通知") */
    bellTitle: string;
    panelTitle: string;
    clearLabel: string;
    emptyLabel: string;
    dismissTitle: string;
    groups: NotifGroup[];
}
/** 状态栏布局——Phase 2 #8 StatusBarZone 消费 */
export interface StatusBarLayout {
    items: PoolStatusBarItem[];
    /** Chord 提示——壳 CHORD_CHANGED 构建的完整字符串（按键名是技术标识符，不走 i18n） */
    chordLabel?: string;
    /** 通知中心——壳 toast 存储序列化（面板开闭/清除/动作回传壳执行） */
    notif: NotifLayout;
}
/**
 * PoolLayout v2——E5.7 唯一的 Pool 收到全量布局快照。
 * titleBar 必有（窗口 chrome——池恒渲染）；iconBar/sidebar/statusBar/panel/rightSidebar 可选——
 * 主池恒推全量，脱出窗（E5.8#43-2 窗口模式策略表）只推 titleBar+groups 子集（池按字段条件渲染，无空列/空条）。
 */
export interface PoolLayout {
    version: 2;
    titleBar: TitleBarLayout;
    /** 图标栏——缺省 = 池不渲染该 zone（脱出窗子集；主池恒推） */
    iconBar?: IconBarLayout;
    /** 侧栏——缺省 = 池不渲染该 zone（脱出窗子集；主池恒推） */
    sidebar?: SidebarLayout;
    /** E5.8#36.8：右侧栏真 zone 布局——RightSidebarLayout（edge 反推 = sidebar 对边，不携带自身 edge） */
    rightSidebar?: RightSidebarLayout;
    groups: PoolGroup[];
    /** E5.8#30.15（P5）：聚焦面板 id——点面板空白/点标签设置（壳 reduceFocusGroup/FocusTab）。
     *  池侧消费：accent 聚焦环 + isActive 单聚焦判定（tab.id === activeTabId && group.id === activeGroupId）。 */
    activeGroupId?: string;
    /** E5.6#16.7：递归分屏树——MainRenderer 递归渲染，替代平铺 groups.map。
     *  leaf = 单 GroupPane，branch = 水平/垂直 flex 容器。 */
    root?: SplitNode;
    /** E5.6#16.7k-3：可创建为标签页的视图列表——池 GroupTabBar [+] 按钮动态菜单。
     *  空数组 = [+] 不提供创建菜单（脱出窗 I9-6）；缺省 = 池兜底欢迎页 */
    creatableViews?: CreatableViewMeta[];
    panel?: PanelLayout;
    /** 状态栏——缺省 = 池不渲染该 zone（脱出窗子集；主池恒推） */
    statusBar?: StatusBarLayout;
}
/**
 * 池→壳侧栏动作 wire 契约——E5.7#97。
 *
 * 原定义在 PoolSectionStack.tsx（池组件内部类型），但走 IPC pool.sidebarAction 到壳
 * （preload-shell → usePoolSync → ViewContainerService）——跨堆协议，归口本目录。
 */
export interface SidebarAction {
    action: "reorder" | "setCollapsed" | "setVisible" | "toggleSidebarCollapse" | "setSidebarWidth";
    containerId?: string;
    viewId?: string;
    /** E5.8#41.9.2：setCollapsed 复合键持久化——池侧 view 自带 pluginId（SidebarViewMeta），壳侧精确寻址同名视图 */
    pluginId?: string;
    newIndex?: number;
    collapsed?: boolean;
    visible?: boolean;
    /** E5.7#13：分隔线拖拽 commit——resizeZone("sidebar", width)。E5.7#97 补入（原契约漏此变体） */
    width?: number;
}
/** 分屏方向——池侧 onDropSplit 已从 drop zone 归一化（MainZone:382） */
export type TabSplitDirection = "horizontal" | "vertical";
/**
 * 标签页拖拽分屏——类型 + drop zone 检测算法。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §9]
 */
export type DropZone = "left" | "right" | "up" | "down" | "center" | null;
/** 池→壳 tab 动作——union literal 即 wire 枚举 */
export type PoolTabAction = {
    action: "focusTab";
    tabId: string;
}
// E5.8#30.15（P5）：点击面板空白聚焦该面板——只改 activeGroupId 不改 activeTabId
//（activeTabId 已是该组活跃标签；焦点=用户在看哪个面板，命令路由/聚焦环依赖它）
 | {
    action: "focusGroup";
    groupId: string;
} | {
    action: "closeTab";
    tabId: string;
}
// closeOtherTabs/closeTabsToRight/closeAllTabs/duplicateTab 树内零发送方——
// 但 tabAction 是插件可见 API（第三方插件可发），壳 switch 保留为契约面
 | {
    action: "closeOtherTabs";
    groupId: string;
    tabId: string;
} | {
    action: "closeTabsToRight";
    groupId: string;
    tabId: string;
} | {
    action: "closeAllTabs";
    groupId: string;
} | {
    action: "reorderTab";
    groupId: string;
    tabId: string;
    newIndex: number;
    oldIndex: number;
}
// E5.8#51：newIndex = 目标组内插入缝（跨组拖拽落点 = 竖杠缝隙；缺省 append 末尾）
 | {
    action: "moveTab";
    tabId: string;
    targetGroupId: string;
    newIndex?: number;
} | {
    action: "splitTab";
    tabId: string;
    direction: TabSplitDirection;
    zone?: DropZone;
    targetGroupId?: string;
} | {
    action: "duplicateTab";
    tabId: string;
} | {
    action: "pinTab";
    tabId: string;
} | {
    action: "createTab";
    pluginId?: string;
    workspaceName?: string;
} | {
    action: "updateSplitSizes";
    anchorGroupId: string;
    sizes: [
        number,
        number
    ];
    branchIndex?: number;
}
// E5.8#44-B：标签页拖出窗口后释放——screenX/Y = 释放点屏幕坐标（壳侧命中检测：TabBar→并窗 / 空白→新窗）
 | {
    action: "releaseOutsideWindow";
    tabId: string;
    screenX: number;
    screenY: number;
};
/**
 * E5.8#43-4 ① 同款：壳侧接收的 tab 动作——主进程按 sender 解析注入 sourceWindowId（#44-B 权威窗口身份）。
 * 池永远不知自身 windowId；壳读 sourceWindowId 判源窗（detach 源 / 同窗不并）。
 */
export type ShellTabAction = PoolTabAction & {
    sourceWindowId: string;
};
/** E5.8#44-B：TabBar viewport rect——池侧 getBoundingClientRect 上报（吸附/释放并窗命中检测数据源）。
 *  坐标 = 视口相对（0,0 = 窗口内容区左上），壳持权威 window bounds 后转 screen（bounds.x + rect.left）。
 *  groupId 携带——命中后 mergeTabToWindow 直落目标组。 */
export interface TabBarViewportRect {
    groupId: string;
    left: number;
    top: number;
    width: number;
    height: number;
}
/** 池→壳：TabBar rects 上报载荷——主进程按 sender 解析附上 windowId（E5.8#44-B） */
export interface TabBarRectsPayload {
    windowId: string;
    rects: TabBarViewportRect[];
}
/** E5.8#44-C：拖拽位置上报载荷——池拖出手势（拎起后 mousemove 全程）上报，壳排除源窗转 screen 吸附命中检测。
 *  坐标 = 屏幕坐标（e.screenX/screenY——窗口 bounds 同为屏幕坐标，可直接命中）。canceled = Esc 取消（keydown 无坐标）。 */
export interface TabDragPositionPayload {
    tabId: string;
    screenX: number;
    screenY: number;
    /** Esc 取消拖拽——壳清吸附提示（keydown 无坐标，仅置标志；screenX/screenY 填 0） */
    canceled?: boolean;
    /** E5.8#46.19：被拖标签标题——池上报供主进程幽灵窗渲染文字（主进程不持 tabState，标题由池带）。壳/吸附忽略此字段 */
    title?: string;
    /** E5.8#46.19：光标是否在源窗外（屏坐标对照 winScreenX+视口尺寸，与 onMouseUp 窗外判定同源）——
     *  窗外 → 主进程 OS 幽灵显示（DOM 浮块出窗被裁剪）；窗内 → OS 幽灵隐藏（DOM 浮块可见）。壳/吸附忽略此字段 */
    outside?: boolean;
    /** E5.8#46.19 进化：拖拽幽灵外观——主题三色（源池 getComputedStyle 读 --bg-card/--border/--text-primary，
     *  均为纯 hex 值）+ 被拖标签图标（tab.icon：emoji 字符或 getAssetPath 解析的图片 URL，iconKind 区分渲染）。
     *  仅 outside=true（窗外）时主进程消费；壳/吸附忽略此字段。可选用——旧池不带上限。
     *  iconKind 判定与 DragOverlays 浮块同款（emoji：len≤2 且命中 emoji 正则；img：其余一律当图片 URL）。 */
    ghost?: {
        theme: {
            bg: string;
            border: string;
            text: string;
        };
        icon: string | null;
        iconKind: "emoji" | "img" | null;
    };
}
/** 池→壳：拖拽位置上报载荷——主进程按 sender 解析附上 sourceWindowId（E5.8#44-C 源窗排除——池永远不知自身 windowId） */
export type ShellTabDragPosition = TabDragPositionPayload & {
    sourceWindowId: string;
};
/** 壳→池：吸附提示载荷——目标窗 TabBar 插入指示（groupId 命中）/ 清除（groupId null = 无吸附目标，清光）。
 *  E5.8#46.10：groupId 命中时携带 viewportX/Y——光标在目标窗 viewport 坐标（壳由屏坐标 − 窗口 bounds 原点换算），
 *  目标池用它算插入缝隙（竖线落点，复用 computeTabInsertIndex）。 */
export interface AdsorbHintPayload {
    groupId: string | null;
    viewportX?: number;
    viewportY?: number;
}
/** 池→壳：吸附插入缝隙回传——目标池每次算出新的缝隙（竖线落点）就上报，壳存吸附注册表供释放并窗精确落位。
 *  windowId 由主进程按 sender 注入（池永远不知自身 windowId，E5.8#44 定案）。 */
export interface AdsorbIndexPayload {
    windowId: string;
    groupId: string;
    /** 插入缝隙 0..tabs.length（竖线落点）——松手 merge 落位 = 竖线指的那根缝（提示不撒谎） */
    insertIndex: number;
}
/** QuickPick 动作——select/highlight/close/itemAction 按 key 回传 */
export interface PoolQuickPickAction {
    type: string;
    key?: string;
    actionId?: string;
}
/** Toast 动作——dismiss/action 按 id + actionId 回传 */
export interface PoolToastAction {
    type: string;
    id: string;
    actionId?: string;
}
/** Dialog 动作——confirm/cancel 回传，壳侧 settle Promise */
export interface PoolDialogAction {
    type: string;
}
/** 悬浮面板动作——action 按 actionId 回传（open-in/close），壳侧 settle Promise（E5.8#37 类型 B） */
export interface PoolFloatingPanelAction {
    type: string;
    actionId?: string;
}
/** 内存压力通知——主进程 window-manager 采样超阈值（E5.7#39） */
export interface MemoryPressureData {
    totalRSS: number;
    threshold: number;
}
/** 壳→主：创建池窗请求——windowId 壳生成（tabState 归属），bounds 可选（E5.8#43-1 A4 多窗口底座） */
export interface CreatePoolWindowRequest {
    windowId: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
}
/** E5.8#43-3：池窗位置/大小变更矩形——主进程 moved/resized 事件上报（壳据 windowId 更新注册表 + 落盘 A6）。
 *  非独立契约入口（契约生成器 walkRefs 命中引用即强制 export 进 linkdesk.d.ts）——源码不 export，knip 不报死面。 */
export interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** 主→壳：脱出池窗 bounds 变更通知（用户移动/缩放窗口）——壳持久化浮窗位置（I9-14 位置/大小记录） */
export interface PoolWindowBoundsPayload {
    windowId: string;
    bounds: WindowBounds;
}
/** 壳↔插件中继/池控制/窗口/壳级命令/热退出暂存命名空间面——双端注入面（bridge 真壳独有 / hotExit 池侧独有） */
export interface ShellAPI {
    /** 壳↔插件通信中继——壳 preload 独有 */
    bridge?: {
        onRequest(cb: (req: BridgeRequestPayload) => void): () => void;
        respond(requestId: string, result?: unknown, error?: string): void;
        broadcast(channel: string, payload: unknown): void;
        notifyConfigChanged(key: string, value: unknown): void;
    };
    /** 池控制——壳 preload：推送布局 + 注册池→壳动作回调；池 preload：收布局 + 发动作。双端各实现自己那半（方法级子集面，surfaces.ts） */
    pool: {
        // ── 壳侧（池 preload 无） ──
        /** E5.8#43-2：windowId 可选定向推送（缺省 'main'）——壳窗口注册表遍历按 id 推送各窗布局 */
        pushLayout(layout: PoolLayout, windowId?: string): void;
        /** E5.8#43-1 A3：回调收 windowId（主池='main'，脱出池=壳生成 id）——壳据 id 定向推该窗布局 */
        onReady(cb: (windowId: string) => void): () => void;
        toggleDevTools(): void;
        onSidebarAction(cb: (action: SidebarAction) => void): () => void;
        // E5.8#44-B：壳侧收 action = ShellTabAction（主进程按 sender 注入 sourceWindowId——#43-4 权威窗口身份）
        onTabAction(cb: (action: ShellTabAction) => void): () => void;
        // E5.8#44-B：池→壳 TabBar viewport rects 上报（吸附/释放并窗命中检测数据源）——windowId 由主进程注入
        onTabBarRects(cb: (payload: TabBarRectsPayload) => void): () => void;
        // E5.8#44-C：池→壳 拖拽位置上报（拎起后 mousemove 全程）——sourceWindowId 由主进程注入（壳排除源窗命中）
        onDragPosition(cb: (pos: ShellTabDragPosition) => void): () => void;
        // E5.8#44-C：壳→池 吸附提示（目标窗 TabBar 插入指示/清除）——windowId 壳命中解析后定向推送（#46.10 载荷带 viewport 坐标）
        pushAdsorbHint(hint: AdsorbHintPayload, windowId: string): void;
        // E5.8#46.10：池→壳 吸附插入缝隙回传（壳侧——windowId 由主进程注入，壳存吸附注册表供释放并窗精确落位）
        onAdsorbIndex(cb: (payload: AdsorbIndexPayload) => void): () => void;
        pushQuickPick(data: unknown): void;
        onQuickPickAction(cb: (action: PoolQuickPickAction) => void): () => void;
        pushToast(data: unknown): void;
        onToastAction(cb: (action: PoolToastAction) => void): () => void;
        pushDialog(data: unknown): void;
        onDialogAction(cb: (action: PoolDialogAction) => void): () => void;
        // E5.8#37（Phase 8 类型 B）：壳内悬浮面板——pushPanel 哑渲染数据 + 动作回传
        pushFloatingPanel(data: unknown): void;
        onFloatingPanelAction(cb: (action: PoolFloatingPanelAction) => void): () => void;
        onMemoryPressure(cb: (data: MemoryPressureData) => void): () => void;
        // ── E5.8#43-1（A4）：多窗口底座——壳驱动创建/关闭池窗 + 监听 OS 关窗（主进程执行窗口生命周期）──
        createWindow(opts: CreatePoolWindowRequest): void;
        closeWindow(windowId: string): void;
        onWindowClosed(cb: (windowId: string) => void): () => void;
        // ── E5.8#43-3：主→壳 池窗 bounds 变更（moved/resized 上报）——壳注册表更新 + 落盘浮窗位置（I9-14）──
        onWindowBoundsChanged(cb: (payload: PoolWindowBoundsPayload) => void): () => void;
        // ── 池侧（壳 preload 无） ──
        onLayout(cb: (layout: PoolLayout) => void): () => void;
        ready(): void;
        sidebarAction(action: SidebarAction): void;
        tabAction(action: PoolTabAction): void;
        // E5.8#44-B：池→壳 TabBar viewport rects 上报（池侧——MainZone useTabDrag 报告 getBoundingClientRect）
        tabBarRects(rects: TabBarViewportRect[]): void;
        // E5.8#44-C：池→壳 拖拽位置上报（池侧——useDragReorder 拎起后 mousemove 上报，壳吸附命中）
        dragPosition(pos: TabDragPositionPayload): void;
        // E5.8#44-C：壳→池 吸附提示订阅（池侧——MainZone 订阅目标窗 TabBar 插入指示/清除）
        onAdsorbHint(cb: (hint: AdsorbHintPayload) => void): () => void;
        // E5.8#46.10：池→壳 吸附插入缝隙回传（池侧——目标池算竖线落点后上报，壳释放并窗精确落位）
        adsorbIndex(payload: {
            groupId: string;
            insertIndex: number;
        }): void;
        // ── E5.8#30.16（P8）：通用「beforeClose 可取消」通道（池侧）──
        // 插件注册 handler（自己定逻辑：弹确认/清理资源/返回 boolean 决定是否允许关标签页）；
        // GroupTabBar 关闭路径 `await beforeClose`——handler 返回 false（或 Promise<false>）则关闭被取消。
        registerBeforeClose(pluginId: string, handler: (tab: PoolTab) => boolean | Promise<boolean>): void;
        unregisterBeforeClose(pluginId: string): void;
        beforeClose(pluginId: string, tab: PoolTab): Promise<boolean>;
    };
    /** 窗口控制——TitleBar 按钮映射，双端注入（11 方法同通道，共享模块 electron/window-namespace.ts） */
    window: {
        minimize(): void;
        maximize(): void;
        unmaximize(): void;
        close(): void;
        /** E5.7#79：缩放因子 → 主进程 setZoomFactor(池 WCV) */
        setZoom(factor: number): void;
        toggleDevTools(): Promise<void>;
        isMaximized(): Promise<boolean>;
        onMaximizeChange(cb: (maximized: boolean) => void): () => void;
        /** E5.8#46.18：OS 级置顶（盖过其他应用）——true 置顶 / false 解除；按 sender 路由宿主窗 */
        setAlwaysOnTop(pinned: boolean): void;
        isAlwaysOnTop(): Promise<boolean>;
        onAlwaysOnTopChange(cb: (pinned: boolean) => void): () => void;
    };
    /** 壳级命令——revealInOS / openInTerminal / startDrag，双端注入 */
    shell: {
        showItemInFolder(p: string): Promise<void>;
        openInTerminal(dirPath: string, terminalExe?: string, customCommand?: string): Promise<void>;
        startDrag(filePath: string, iconPath?: string): void;
    };
    /** 热退出暂存——编辑器未保存内容落盘（E5.7#53）。`?`：池侧独有（壳 preload 不注入） */
    hotExit?: {
        save(filePath: string, content: string): Promise<void>;
        load(filePath: string): Promise<string | null>;
        clear(filePath: string): Promise<void>;
    };
    /** OS 拖入文件路径获取——双端注入 */
    getFilePath: (file: File) => string;
}
/** 底部面板命名空间面——对标 VS Code vscode.window.createTreeView 后 focus / 视图提升语义 */
export interface PanelAPI {
    panel: {
        /** 聚焦底部面板视图——面板隐藏则展开并切到该视图；已显示则切换聚焦。viewId 不在 panel 容器时 no-op */
        reveal(viewId: string): Promise<void>;
        /** 壳内悬浮面板（类型 B）——按声明弹出某视图（I8-2 身份开关键）。viewId 未声明视图时 no-op。
         *  E5.8#41.18：可选 pluginId 复合寻址——两插件同名 viewId（双设置套并存）时插件侧携带
         *  pluginId 精确命中目标套（壳侧路径 Ctrl+,/右键已带；裸 viewId 多命中 fail-loud no-op） */
        revealFloating(viewId: string, pluginId?: string): Promise<void>;
    };
}
/** 设置套条目——settings.list() 返回的一行。
 * 非导出（模块内接口）——契约生成器经 SettingsAPI.list 传递引用自动收集并 emit export；
 * 壳内无第三方消费方，导出会被 knip 报未用（linkdesk-api.ts 排除域不算消费）。 */
export interface SettingsPluginInfo {
    /** 插件 ID——getActive/setActive 的句柄 */
    pluginId: string;
    /** 插件显示名（manifest.name 原文，消费方自做 i18n） */
    title: string;
}
/** 设置套命名空间面——双端注入（设置 UI 在池内渲染，壳侧实现走 IPC 桥） */
export interface SettingsAPI {
    settings: {
        /** 全部声明 factoryRole:"settings" 的设置套（含默认/内置），注册序 */
        list(): Promise<SettingsPluginInfo[]>;
        /** 当前活动设置套 ID——读持久化激活（#41.12 落盘），无记录/已卸载回退默认（内置） */
        getActive(): Promise<string | undefined>;
        /** 切换活动设置套——校验候选后落盘持久化（重启保持）。非候选 fail-loud 抛错 */
        setActive(pluginId: string): Promise<void>;
    };
}
/** 插槽条目——factorySlots.list(role) 返回的一行。
 * 非导出（模块内接口）——契约生成器经 list 传递引用自动收集并 emit export；
 * 壳内无第三方消费方，导出会被 knip 报未用（linkdesk-api.ts 排除域不算消费）。 */
export interface FactorySlotEntry {
    /** 插件 ID——getActive/setActive 的句柄 */
    pluginId: string;
    /** 插件显示名（manifest.name 原文，消费方自做 i18n） */
    title: string;
    /** E5.8#41.18：该插件 contributes.floatingPanel.viewId（无声明 = undefined）——切换/打开候选悬浮面板用 */
    viewId?: string;
}
/** factorySlots 命名空间面——双端注入（池内渲染侧实现走 IPC 桥） */
export interface FactorySlotsAPI {
    factorySlots: {
        /** 全部已填充角色的名字（注册序）——设置页「任何 factoryRole ≥2 候选 → 该角色名组出现」先枚举角色再 list(role) 判候选数 */
        listRoles(): Promise<string[]>;
        /** 全部声明指定 factoryRole 的候选插件 [{pluginId, title}]，注册序 */
        list(role: string): Promise<FactorySlotEntry[]>;
        /** 指定角色的活动插件 ID——读持久化激活（#41.12 落盘），无记录/已卸载回退默认（内置） */
        getActive(role: string): Promise<string | undefined>;
        /** 切换指定角色活动插件——校验候选后落盘持久化（重启保持）。非候选 fail-loud 抛错 */
        setActive(role: string, pluginId: string): Promise<void>;
    };
}
/**
 * linkdesk API——插件代码的类型安全入口。
 * 对标 VS Code `vscode` 对象的全局命名空间结构。
 * 池 preload 注入的命名空间为插件运行时真相源（required）；
 * 仅 bridge（真壳独有）/ hotExit（池侧独有）为 `?` 可选——另一侧不注入（E5.8#22 审视 N1 修正：
 * 其余桥面 window/pool/shell/getFilePath 双端实有注入，契约标必选）。
 * E5.8#0d.10-9e：由 12 个命名空间域接口交叉组装（interface→type intersection，
 * 索引访问 LinkDeskAPI["pool"]/["configuration"] 等消费方契约不变）。
 */
export type LinkDeskAPI = CommandsAPI & AppearanceAPI & TabsAPI & KeybindingsAPI & UiAPI & DataAPI & WorkspaceAPI & EditorAPI & PluginsAPI & ShellAPI & PanelAPI & SettingsAPI & FactorySlotsAPI;
/** 插件状态变更——plugin-state:changed 载荷（跨 WebView 状态同步原语） */
export interface PluginStateChangedPayload {
    pluginId: string;
    key: string;
    value: unknown;
}

declare global {
  interface Window {
    /** 插件 API——对标 VS Code vscode 命名空间（由 preload-pool.ts / preload-shell.ts 注入） */
    linkdesk: LinkDeskAPI;
  }
}

export {};
