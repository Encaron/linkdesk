/**
 * 「AI 接入」分区声明（M4 `AI#38.1`–`#38.3`＋`#38.2` 声明半）——**独立 pluginId "ai-bridge"**。
 *
 * 🔴 为什么必须是独立身份（⛔ 别改成 APP_PLUGIN_ID）：设置页导航项 = 一个 pluginId 一项
 *   （`settings:src/views/SettingsView/loadSettingsData.ts:32-37` 派生）。挂 `app` 会并进「通用」
 *   （`config/update.ts` 就是这么并的），左导航**永远不会出现「AI 接入」**——先例 = `appearance`
 *   （`config/appearance.ts`，独立身份 → 左导航「主题」）。
 *
 * 18 键全账（落地版 mockup = docs/04-软件更新/已落地/AI友好化-全自动操作/mockups/
 * 02-设置页-AI接入分区-落地版.html；组件映射 = 同夹 03-任务档案/M4-设置页.md §0.7）：
 *   · 开关 ×4（`ai.mcp.enabled` / `ai.cli.enabled` / `ai.debug.remoteDebugging` / `ai.auditLog.enabled`）
 *   · 只读状态 ×5（`renderHint:"readonly"` ＋ `statusCommand` 指壳命令——`AI#38.12` 通用件，
 *     值来自运行时数据源 ⛔ 不写死字符串）
 *   · 按钮 ×9（`renderHint:"action"` ＋ `actionCommand`；**按钮文案 = `description`**——action 行
 *     只有这一个字符串可承载文案，先例 `appearance.ts` 的 `app.mixReset`）
 *
 * 开关语义（内核读取口已按拍板键留好，`electron/services/aiBridge/index.ts` 的
 * `resolveBridgeConfig`：`ai.cli.enabled` / `ai.mcp.enabled` 任一 true ⇒ 开，两键缺席 = 默认关）：
 *   · **默认 false = 门锁语义**（AI#39）——关着时本机任何程序都连不进来；
 *   · ⛔ 本文件只声明键与默认值，内核**只在启动时读**（改完重启生效；热切换归 AI#39）；
 *   · `ai.debug.remoteDebugging` 消费方 = `main.ts` 启动段（M5 挂账半：true ⇒ 默认 9333 补
 *     `--remote-debugging-port` 并推回 argv 一份真相，更新重启不丢）。
 *
 * 自 startup.ts 拆出（结构对标 config/update.ts）：t() 注入而非模块级捕获——语言切换重跑
 * （HMR/StrictMode）时注册文案取首语言。
 */
import { registerConfiguration } from "../../core/registry/ConfigurationRegistry";
import { OPEN_AI_MANUAL_COMMAND_ID } from "../../core/commands/shell/manualCommands";

/** t() 类型——仅声明组取 key（同 config/update.ts） */
type ConfigT = (key: string) => string;

export function registerAiBridgeConfiguration(t: ConfigT): void {
  registerConfiguration("ai-bridge", {
    title: t("AI 接入"),
    // 分区副标题（AI#38.12 通用件；P-3 拍板 A）
    subtitle: t("让外部 AI（助手 / 脚本 / agent）直接操作本软件：读界面正在发生什么，做白名单内的操作。管外不管内——这里只辖门外的 AI，关着 = 本机任何程序都连不进来；软件里的插件归插件管理管。"),
    groupDescriptions: {
      [t("通道")]: t("开关改动后重启软件生效；状态行是实时读数，不是配置值。"),
      [t("接入引导")]: t("按手里的 AI 类型挑一条路，点一下就行。"),
      [t("开放范围与安全")]: t("AI 只能做白名单里的事，不开放任意代码执行；装/卸插件每次都要你点头。"),
      [t("记录")]: t("AI 的每一次操作都有账；默认不记，开了才有。"),
    },
    properties: {
      /* ── 分节①：通道（8 键）── */
      // 门锁之一：MCP 通道（JSON-RPC over stdio 皮）——内核 resolveBridgeConfig 认这个键。
      "ai.mcp.enabled": {
        type: "boolean",
        group: t("通道"),
        default: false,
        description: t("MCP 通道——标准 AI 接入口（JSON-RPC）。开启后 AI 客户端可发现并调用本软件的开放操作；改动重启软件后生效"),
      },
      "ai.mcp.status": {
        type: "string",
        group: t("通道"),
        default: "",
        renderHint: "readonly",
        statusCommand: "aiBridge.statusMcp",
        description: t("MCP 通道状态——实时运行状态与监听地址，与内核活读数一致"),
      },
      "ai.mcp.openDetails": {
        type: "string",
        group: t("通道"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.mcpDetails",
        description: t("打开通道详情"),
      },
      // 门锁之二：CLI 通道（linkdeskctl 命令行）——与 MCP 共用同一个内核监听（任一 true ⇒ 开）。
      "ai.cli.enabled": {
        type: "boolean",
        group: t("通道"),
        default: false,
        description: t("CLI 通道——命令行直接操作（linkdeskctl <命令>）。适合脚本与命令行 AI，零常驻；改动重启软件后生效"),
      },
      "ai.cli.status": {
        type: "string",
        group: t("通道"),
        default: "",
        renderHint: "readonly",
        statusCommand: "aiBridge.statusCli",
        description: t("CLI 通道状态——命令就位 = 已就绪；通道关着 = 已关闭"),
      },
      "ai.cli.openInstall": {
        type: "string",
        group: t("通道"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.cliInstall",
        description: t("查看安装说明"),
      },
      // 调试端口（CDP）开关——M5 挂账（AI#18 只落了更新重启保参那半，声明/落盘/读取归本格 AI#38.3）。
      // 消费方 = main.ts 启动段：true 且 argv 没带端口 ⇒ 补 --remote-debugging-port=9333 并推回 argv。
      "ai.debug.remoteDebugging": {
        type: "boolean",
        group: t("通道"),
        default: false,
        description: t("调试端口（CDP）——开发/排障用的「万能钥匙」。默认关；开启期间本机任何程序可连，仅排障时开，日常操作走上面两条通道"),
      },
      "ai.debug.status": {
        type: "string",
        group: t("通道"),
        default: "",
        renderHint: "readonly",
        statusCommand: "aiBridge.statusDebug",
        description: t("调试端口状态——端口真的在不在听，与命令行参数实况一致"),
      },

      /* ── 分节②：接入引导（3 键）── */
      "ai.guide.copyCliLine": {
        type: "string",
        group: t("接入引导"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.copyCliLine",
        description: t("复制这句话"),
      },
      // 复制内容与 `linkdeskctl mcp config --for` 同一生成器（cli/linkdeskctl/lib/mcp-config.mjs）
      "ai.guide.copyMcpConfig": {
        type: "string",
        group: t("接入引导"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.copyMcpConfig",
        description: t("复制 MCP 配置"),
      },
      // 落点 = M3 AI#15 的软件内入口（既有命令 app.openAiManual，零新命令）
      "ai.guide.openManual": {
        type: "string",
        group: t("接入引导"),
        default: "",
        renderHint: "action",
        actionCommand: OPEN_AI_MANUAL_COMMAND_ID,
        description: t("打开 AI 操作手册"),
      },

      /* ── 分节③：开放范围与安全（4 键）── */
      "ai.scope.summary": {
        type: "string",
        group: t("开放范围与安全"),
        default: "",
        renderHint: "readonly",
        statusCommand: "aiBridge.scopeSummary",
        description: t("开放范围明细——从白名单唯一真相源生成，与 linkdeskctl --help 同一份数据"),
      },
      "ai.scope.openList": {
        type: "string",
        group: t("开放范围与安全"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.openScopeList",
        description: t("查看完整操作清单"),
      },
      // token 明文永不进设置页（mockup 也没画）——只提供重新生成；查看走通道详情 / CLI
      "ai.token.regenerate": {
        type: "string",
        group: t("开放范围与安全"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.regenerateToken",
        description: t("重新生成凭据"),
      },
      "ai.sensitive.openManager": {
        type: "string",
        group: t("开放范围与安全"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.openSensitiveManager",
        description: t("管理细分…"),
      },

      /* ── 分节④：记录（3 键）── */
      // 开关控制**盘上**日志（ai-bridge-log.jsonl）写入；内存账恒记（AI 自己的 log 操作照常可用）
      "ai.auditLog.enabled": {
        type: "boolean",
        group: t("记录"),
        default: false,
        description: t("操作日志——记录 AI 的每一次连接与操作（被拒的调用也记）；改动重启软件后生效"),
      },
      "ai.auditLog.status": {
        type: "string",
        group: t("记录"),
        default: "",
        renderHint: "readonly",
        statusCommand: "aiBridge.statusAuditLog",
        description: t("操作日志状态——跟着上面的开关走"),
      },
      "ai.auditLog.open": {
        type: "string",
        group: t("记录"),
        default: "",
        renderHint: "action",
        actionCommand: "aiBridge.openLog",
        description: t("查看日志"),
      },
    },
  });
}
