/**
 * 双面覆盖清单——E5.8#20。
 *
 * 支撑清单（非签名真相源）：矩阵 §2 覆盖矩阵的类型化——每面「必须暴露哪些命名空间」。
 * preload-pool.ts expose 对象 `satisfies PoolExposed` / preload-shell.ts `satisfies ShellExposed`——
 * 纯 tsc 即门禁：契约加方法而双端漏暴露 → 编译红；双端补面必须同步加进清单（双向机械强制）。
 *
 * 面类型 = Pick 全显式列举——加面必须列、列了必须实现。桥面（pool/shell/window 等）从
 * 契约 `?` 壳独有语义改为双端必选（矩阵 N1 修正：唯一真壳独有 = bridge）。
 *
 * 🔥 E5.8#20 satisfies 实证（设计 §3.2 边界）：commands/tabs/pool 三命名空间契约声明的是
 * 池侧（插件运行时）全方法，但池/壳各实现自己那半——namespace 级 Pick 在这些"分裂命名空间"
 * 上结构性失效（双方都满足不了对方的那半）。修正 = 这三面改方法级子集面（Pick/Omit 逐方法），
 * 其余命名空间维持 namespace 级 Pick。唯一真壳独有 = bridge；pool 四池侧方法（onLayout/ready/
 * sidebarAction/tabAction）唯一池独有。
 *
 * 设计出处：docs/02-Electron架构/E5.8_归一化基建/契约生成/03-契约生成设计.md §3.2
 * 覆盖矩阵：docs/02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md §2
 */
import type { LinkDeskAPI } from "../linkdesk-api";
import type { DownloadProgress, ReleaseNotes, UpdateState } from "../../types/ipc/update";
import type { ProductInfo } from "../../types/ipc/product";

/** 池 preload 必暴露面（44 = 43 唯一 + config 别名；唯一缺 bridge；E6#72 删 toast 宿主桥面）——E5.8#34.5 加 panel（插件调 reveal 的池侧通道）；E5.8#37 加 floatingPanelHost（壳内悬浮面板哑渲染桥）；E5.8#41.12 加 settings（设置套枚举/切换，设置 UI 在池内渲染）；E5.8#41.14 加 factorySlots（任意 role 候选枚举/切换，设置 UI 通用区数据源）；E5.8#50.11 加 appearance（外观资产——选择图片拷贝入库）；E6#57.2a 加 app（只读产品身份——市场 minAppVersion E6#30.8c 消费） */
export type PoolExposed = Pick<LinkDeskAPI,
  | "commands" | "configuration" | "config" | "theme" | "language" | "app" | "appearance"
  | "tabs" | "keybindings" | "notifications" | "menu" | "contextKey"
  | "dialog" | "quickPick" | "quickPickHost" | "dialogHost" | "floatingPanelHost"
  | "serial" | "clipboard" | "p2p" | "events" | "pluginState"
  | "workspace" | "filesystem" | "path" | "env" | "search" | "encoding"
  | "decorations" | "fileAssociation" | "langDef" | "lsp" | "protocol"
  | "viewContainer" | "plugins" | "pluginManager" | "window"
  | "shell" | "hotExit" | "getFilePath" | "panel" | "settings" | "factorySlots" | "update"> & {
  /** pool 命名空间——分裂面方法级子集：池侧 = 收布局 + 发动作 + beforeClose 通道（壳侧 pushLayout/onReady/… 12 方法为壳→池推送面，池内不存在）。
   *  pool 契约必选（E5.8#22 审视 N1 修正后）——直接 Pick，无需 NonNullable
   *  E5.8#30.16（P8）：beforeClose 三方法唯一池侧（插件注册 handler / GroupTabBar 关闭路径 await）
   *  E5.8#44-B：tabBarRects 唯一池侧（MainZone 上报 TabBar rects——壳侧无发送面）
   *  E5.8#44-C：dragPosition/onAdsorbHint 唯一池侧（池上报拖拽位置 + 订阅壳吸附提示——壳侧无发送/订阅面）
   *  E5.8#46.10：adsorbIndex 唯一池侧（池回传插入缝隙——壳侧无发送面） */
  pool: Pick<LinkDeskAPI["pool"], "onLayout" | "ready" | "sidebarAction" | "tabAction" | "tabBarRects" | "dragPosition" | "onAdsorbHint" | "adsorbIndex" | "registerBeforeClose" | "unregisterBeforeClose" | "beforeClose">;
};

/** 壳 preload 必暴露面（24；bridge 真壳独有）。commands/tabs/pool/appearance 命名空间方法级子集：
 *  commands 壳 = 注册面（execute/executeCommand/unregisterCommands/getCommands 为池侧执行面，壳不实现）
 *  tabs 壳缺 onDidChangeActiveTab（池侧订阅面——壳是标签权威自身，无订阅需求）
 *  pool 壳 = 推送面（onLayout/ready/sidebarAction/tabAction 为池侧发送面，壳不实现）
 *  appearance 壳 = 仅 revealStorage（E5.8#153：齿轮命令 handler 在壳进程执行，需壳侧触发主进程 openPath；
 *    importImage 池独有——选图拷贝入库只在池设置 UI 发生）
 *  update 壳 = getState 契约面 + 写命令三条与 onStateChanged 壳内私有扩展（E6#57.9c/d——见下方 update 段）
 *  app 壳 = getVersion 契约面（E6#57.2b 双 preload 同步暴露）+ getProductInfo 壳内私有扩展（关于页
 *    E6#57.14 数据源，不在契约）。⚠️ 超额暴露实现要点：satisfies 的 excess-property 检查达字面量每层，
 *    内联 getProductInfo 曾因「上下文类型里没有这个名字」编译红——preload-shell 用 buildShellApp()
 *    工厂构造绕过（返回值走结构兼容）。**E6#57.13 起这一条不再是必需的**：下方 `app:` 段已把
 *    getProductInfo 写进清单（类型上有了这个名字），工厂构造保留（既定写法 + 注释讲清了来由，
 *    为「现在可以不绕了」去改它属无谓改动）；池侧 buildApp() 只暴露契约面 getVersion */
export type ShellExposed = Pick<LinkDeskAPI,
  | "getFilePath" | "serial" | "filesystem" | "path" | "plugins"
  | "fileAssociation" | "pluginManager" | "dialog" | "pluginState" | "menu"
  | "contextKey" | "keybindings" | "p2p"
  | "clipboard" | "app" | "env" | "events" | "bridge" | "window" | "update"> & {
  commands: Pick<LinkDeskAPI["commands"], "registerCommand" | "_executeShellLocal">;
  tabs: Omit<LinkDeskAPI["tabs"], "onDidChangeActiveTab">;
  pool: Omit<LinkDeskAPI["pool"], "onLayout" | "ready" | "sidebarAction" | "tabAction" | "tabBarRects" | "dragPosition" | "onAdsorbHint" | "adsorbIndex" | "registerBeforeClose" | "unregisterBeforeClose" | "beforeClose">;
  appearance: Pick<LinkDeskAPI["appearance"], "revealStorage">;
  /**
   * update 壳 = 契约只读面（`getState`）**＋ 壳内私有扩展**（E6#57.9c/d，06-主软件更新）。
   *
   * 🔴 为什么扩展声明在这里：契约的 update 面**只有 `getState`** 是**设计**（「第三方只读」落在
   * **类型**上——池 preload 只注入契约面 ⇒ 插件侧根本没有写命令入口，见 linkdesk-api/update.ts 的
   * 🔴 段）。壳侧那半（写命令 + 事件订阅）按 `buildShellApp()` 的既有先例用工厂函数**超额暴露**。
   * 但「超额暴露」不等于「无类型」——把壳的完整面写进本清单，`preload-shell` 的
   * `satisfies ShellExposed` 就把它纳入**tsc 门禁**：日后漏暴露一个方法 = 编译红，而不是
   * 「类型上没有、运行时却有」的静默漂移。
   *
   * 消费者只有壳渲染进程的更新 hook（src/hooks/useUpdateState.ts 单点取用）。池侧**不注入**这几个
   * 方法——`PoolExposed` 的 update 仍取自契约（只 getState）。
   */
  update: LinkDeskAPI["update"] & {
    /**
     * 发行说明取数（E6#57.13b）——**壳内私有扩展**，与 `buildShellApp()` 的 `getProductInfo`
     * 同一先例同一理由：壳内视图的数据源属壳不属插件。而**壳内视图与第三方插件共用同一个
     * `window.linkdesk`**（壳视图不是插件、没有 plugin.json），所以「给池开一个」等价于
     * 「给所有插件开一个」——那是 05 §2.4 明文排除的（「发行说明是壳自己的面，第三方插件没有读它的理由」）。
     * ⇒ 走「壳想、池画」：壳取好经 `pushLayout` 挂到标签页上，池哑渲染。
     * 唯一消费者 = `src/hooks/useReleaseNotes.ts`（模块单例）。
     */
    getReleaseNotes(version?: string): Promise<ReleaseNotes>;
    /** 手动（`context=true`）/ 后台（`false`）检查。**壳私事**：两条路都从壳发起（07 §一）。 */
    checkForUpdates(context: boolean): Promise<UpdateState>;
    downloadUpdate(): Promise<UpdateState>;
    /** 抛错面：无安装器 / 校验失败时上抛，壳收成用户可见提示（通知面板 #57.12）。 */
    quitAndInstall(): Promise<void>;
    /** 状态迁移广播订阅——preload 侧落地为 `events.on(IPC.update.stateChanged)`，返回退订函数。 */
    onStateChanged(cb: (state: UpdateState) => void): () => void;
    /**
     * 下载进度订阅（E6#57.12）——**与 `onStateChanged` 是两条不同的通道，缺一不可**。
     *
     * 🔴 为什么不能从 `onStateChanged` 里读进度：`reportProgress` 只把 `DownloadProgress` 写进
     * `this.state`**原地**（服务内部 `getState()` 拿得到），**不发 `stateChanged`**——那条广播
     * 按设计只在**迁移**时发一条（#57.4c）。所以渲染侧手上的 `downloading` 态永远停在
     * 「刚进下载」的那一帧（0%），进度条会一路不动直到落 `downloaded`。
     * （服务层的节流 ≤500ms 也在 `onProgress` 这一路上，见 `PROGRESS_THROTTLE_MS`。）
     *
     * ⚠️ **进度是瞬时量，不是真相**——`storeForReplay:false`（`update-handlers.ts`），新起的窗口
     * 重放不到「刚才的 50%」，这是**有意**的（重放一个过期百分比 = 假进度）。消费方要拿当前值
     * 应当读**状态里**的 `downloading.progress`（`getState()` / `useUpdateState()` 都能拿到，
     * 它是被原地刷新过的最新值），本通道只负责**推进**。
     */
    onProgress(cb: (progress: DownloadProgress) => void): () => void;
  };
  /**
   * app 壳 = 契约的 `getVersion` **＋ 壳内私有扩展** `getProductInfo`。
   *
   * 🔴 与上面 `update` 段**同一条规矩的另一个实例**（`preload-shell` 的 `buildShellApp()` 头注
   * 已写「两格必须同形」）：契约的 app 面只有 `getVersion`（E6#57.2b），而产品身份全量
   * （关于页 8 字段 = `#57.14` 的数据源）属**壳内视图的取数**，不给池插件开
   * （池 preload 只注入契约面 ⇒ 插件侧根本没有这个入口）。
   *
   * ⚠️ **本段是 `#57.13` 补的，不是新暴露**——`getProductInfo` 运行时一直在
   * （`buildShellApp()` 工厂构造），只是**类型上缺这一行**：不补，壳侧消费它就会
   * 「运行时能调到、tsc 说没有」。把这个差额补进清单 = 纳入 tsc 门禁（漏暴露 = 编译红）。
   * 发行说明的「所有版本」链接正是第一个真实消费者（`useReleaseNotes.listPageUrl()`
   * 从 `product.updateUrl` 推页面端点，见 `types/ipc/product.ts` 该字段的注释）。
   */
  app: LinkDeskAPI["app"] & {
    /** 产品身份全量（`electron/product.ts` 的 `productInfo()`）——**壳内私有**，池侧不暴露 */
    getProductInfo(): Promise<ProductInfo>;
  };
  /**
   * shell 壳 = 契约面 **＋ 壳内私有扩展** `onOpenPath`（E6#46b，`buildShellUpdate` 同先例同理由）：
   * 命令行/文件关联打开文件的消费者只有壳 App 顶层 hook（壳级功能不进插件——B79），
   * 第三方插件没有「接收命令行文件」的理由 ⇒ 池 preload 不注入（不进契约 `LinkDeskAPI`）。
   * 传输 = `workspace:openPath` 直发（非 plugin:push 分发）+ `IpcRelay` 缓冲回放（硬约束 20）。
   * ⚠️ 落点为什么是 shell 面：命名空间矩阵门禁只认契约已定义命名空间（新开顶层命名空间会红），
   *    而壳侧没有 workspace 面（那是池的）——shell 是壳自有能力面，天然合适。
   */
  shell: LinkDeskAPI["shell"] & {
    /**
     * 订阅 intake 文件批（主进程 launch-args 路由的文件半）。载荷 = 本次到达的路径数组。
     * 首次订阅先 FIFO 回放订阅前缓冲的批次，此后实时投递；返回退订函数。
     */
    onOpenPath(cb: (paths: string[]) => void): () => void;
  };
};

/**
 * 壳侧私有面的**唯一运行时转型点**——本文件是类型清单，运行时的取用口只此一个。
 *
 * 🔴 为什么需要它：`window.linkdesk` 的静态类型是**插件契约** `LinkDeskAPI`
 * （`src/types/global.d.ts`），而壳渲染进程里跑的对象其实是 `preload-shell` 的**超额暴露体**
 * （= 上面的 `ShellExposed`，由 `satisfies` 用 tsc 兜住形状）。契约面是壳面的**真子集**，
 * 差额（`app.getProductInfo` / `update` 的写命令与订阅）在契约类型上**根本不存在** ⇒
 * 壳侧消费方直接 `window.linkdesk.app.getProductInfo()` 会「运行时调得到、tsc 说没有」。
 * 本函数把那层差额**一次收窄**，消费方零 `any`、零第二处转型。
 *
 * ⚠️ **不要在各消费方各写一处 `as`**——那正是本函数存在的原因（转型点一多，
 * 「运行时面」与「声明面」之间的差额就没人能一眼看全了）。
 *
 * 非壳环境（vitest 无 preload / 纯前端预览）返回 `undefined`，消费方各自决定怎么退化。
 */
export function getShellExposed(): ShellExposed | undefined {
  return window.linkdesk as unknown as ShellExposed | undefined;
}
