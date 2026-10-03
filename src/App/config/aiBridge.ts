/**
 * 「AI 接入」分区声明（M4 `AI#38.1`–`#38.3`＋`#38.2` 声明半）——**独立 pluginId "ai-bridge"**。
 *
 * 🔴 为什么必须是独立身份（⛔ 别改成 APP_PLUGIN_ID）：设置页导航项 = 一个 pluginId 一项
 *   （`settings:src/views/SettingsView/loadSettingsData.ts:32-37` 派生）。挂 `app` 会并进「通用」
 *   （`config/update.ts` 就是这么并的），左导航**永远不会出现「AI 接入」**——先例 = `appearance`
 *   （`config/appearance.ts`，独立身份 → 左导航「主题」）。
 *
 * 14 键全账（落地版 mockup = docs/04-软件更新/已落地/AI友好化-全自动操作/mockups/
 * 02-设置页-AI接入分区-落地版.html；组件映射 = 同夹 03-任务档案/M4-设置页.md §0.7）：
 *   · 开关 ×4（`ai.mcp.enabled` / `ai.cli.enabled` / `ai.debug.remoteDebugging` / `ai.auditLog.enabled`）
 *     —— **各带一件伴生只读**（`statusCommand` 指壳命令），主控件右侧同排显示实时状态
 *   · 只读状态 ×1（`renderHint:"readonly"` ＋ `statusCommand`——`AI#38.12` 通用件，值来自运行时
 *     数据源 ⛔ 不写死字符串。仅 `ai.scope.summary`：多行明细，且**没有可挂的主控件**
 *     ——⛔ 不为它新增枚举键，故仍独立成行）
 *   · 按钮 ×9（`renderHint:"action"` ＋ `actionCommand`；**按钮文案 = `description`**——action 行
 *     只有这一个字符串可承载文案，先例 `appearance.ts` 的 `app.mixReset`）
 *
 * 🔴 设置行案 D4（2026-10-03 用户拍板 · 2026-10-04 落仓）：原本「开关一行 ＋ 状态一行」的四对
 *   **合并成一行**——开关键原地加 `statusCommand` 伴生声明；`ai.mcp.status` / `ai.cli.status` /
 *   `ai.debug.status` / `ai.auditLog.status` **四键退役、声明整格删除**（名字随之从设置页消失）。
 *   逐键盘点（判据 = 运行时读数形态，实现见 `core/commands/shell/aiBridgeCommands.ts`）：
 *     ① `statusMcp` / `statusCli` → 「运行中 · 127.0.0.1:9231」单行短句 ⇒ **并**；
 *     ② `statusDebug` → 「已开启 · 9333」⇒ **并**；
 *     ③ `statusAuditLog` → 「记录中」两字，原描述亦自述「跟着上面的开关走」⇒ **并**；
 *     ④ `scopeSummary` → 「读：…／做：…／不开放任意代码执行」**三行明细**，且开放范围无对应
 *        开关键可挂 ⇒ **留独立行**（合并的前置是「有一个主控件」，不是「能塞下就算」）。
 *   ⚠️ 只读键**不落盘**（值来自命令、不来自存储）⇒ 零用户数据迁移（动工前已核实）。
 *   ⚠️ 四键**无需 retired[] 登记**：ledger 的 `configKeys` 家族只扫 `app.*`（1.1 读数③），
 *      `ai.*` 不在其中 ⇒ 无插件占用风险，不涉及「退役不腾位」。
 *   ⛔ `description` 仍是 `t()`——源码串改即全语言改（新串须外仓 lang-defaults 补 patch 版）。
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
      [t("通道")]: t("开关改动后重启软件生效；开关右边的灰字是实时读数（来自运行时命令），不是配置值。"),
      [t("接入引导")]: t("按手里的 AI 类型挑一条路，点一下就行。"),
      [t("开放范围与安全")]: t("AI 只能做白名单里的事，不开放任意代码执行；装/卸插件每次都要你点头。"),
      [t("记录")]: t("AI 的每一次操作都有账；默认不记，开了才有。"),
    },
    properties: {
      /* ── 分节①：通道（5 键·四对合并后）── */
      // 门锁之一：MCP 通道（JSON-RPC over stdio 皮）——内核 resolveBridgeConfig 认这个键。
      "ai.mcp.enabled": {
        type: "boolean",
        group: t("通道"),
        default: false,
        // D4 合并行：主件 = 开关，伴生只读 = 运行时状态（原 ai.mcp.status 键退役）
        statusCommand: "aiBridge.statusMcp",
        description: t("MCP 通道（JSON-RPC）——右边灰字是实时状态与监听地址。开启后 AI 客户端可发现并调用本软件的开放操作；改动重启软件后生效"),
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
        // D4 合并行：伴生只读 = 同一内核监听的实况（原 ai.cli.status 键退役）
        statusCommand: "aiBridge.statusCli",
        description: t("CLI 通道（linkdeskctl）——右边灰字是实时状态。适合脚本与命令行 AI，零常驻；改动重启软件后生效"),
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
        // D4 合并行：伴生只读 = argv 实况（端口真的在不在听；原 ai.debug.status 键退役）
        statusCommand: "aiBridge.statusDebug",
        description: t("调试端口（CDP）——右边灰字是端口实况。默认关；开启期间本机任何程序可连，仅排障时开，日常操作走上面两条通道"),
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

      /* ── 分节④：记录（2 键·状态已并进开关）── */
      // 开关控制**盘上**日志（ai-bridge-log.jsonl）写入；内存账恒记（AI 自己的 log 操作照常可用）
      "ai.auditLog.enabled": {
        type: "boolean",
        group: t("记录"),
        default: false,
        // D4 合并行：伴生只读 = 落盘开关实况（原 ai.auditLog.status 键退役）
        statusCommand: "aiBridge.statusAuditLog",
        description: t("操作日志——右边灰字是记录状态（记录中／未开启）。AI 的每一次连接与操作都记（被拒的调用也记）；改动重启软件后生效"),
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
