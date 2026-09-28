/**
 * 「AI 接入」壳命令（M4 `AI#38.5`/`#38.6`/`#38.8`–`#38.11` ＋ `#38.4` 状态数据出口）。
 *
 * 分工：
 *   · **状态五条**（`aiBridge.statusMcp/statusCli/statusDebug/statusAuditLog/scopeSummary`）——
 *     只读、**返回字符串**：设置页的只读状态行（`#38.12` 通用件）按声明里的 `statusCommand` 调它们取值。
 *     数据源 = `app:getAiBridge`（main 直答，`getShellExposed().app.getAiBridge`，surfaces.ts 第四例）；
 *     **这里出人话（t()），主进程只出数据**——显示文字不进主进程（硬约束 2 的分工）。
 *   · **动作八条**（详情/安装说明/复制两路/完整清单/重生成凭据/细分管理/查看日志）——
 *     设置页 `renderHint:"action"` 按钮的 `actionCommand` 指到这里；文案 = 键声明里的 `description`。
 *
 * 🔴 同源纪律：① MCP 配置片段 import `cli/linkdeskctl/lib/mcp-config.mjs`（与 `AI#40` 的
 * `linkdeskctl mcp config --for` 同一把尺，⛔ 不 fork）；② 开放范围「读/做」两栏从白名单
 * `kind` 派生（`AI#38.7`，⛔ 不手抄）；③ token 明文永不显示（`#38.9`——重新生成可以，看明文走详情/CLI）。
 *
 * 命令 id 用 `aiBridge.` 前缀（宿主已占 `ai-bridge` 身份，命令面避让 `ai.*` 配置键形状）。
 * 非壳环境（vitest 无 preload）一律静默退化——handler 不自己判环境（`updateCommands` 同款）。
 */
import { registerCommand } from "../../registry/commands/CommandRegistry";
import i18n from "../../../i18n";
import { getConfigurationValue } from "../../services/configuration/ConfigurationService";
import { getShellExposed } from "../../api/linkdesk-api/surfaces";
import { formatMcpConfig } from "../../../../cli/linkdeskctl/lib/mcp-config.mjs";
import type { AiBridgeInfo } from "../../types/ipc/aiBridge";

/** 取内核快照；非壳环境 / 主进程没应答 ⇒ null（调用方退化） */
async function infoOrNull(): Promise<AiBridgeInfo | null> {
  try {
    return (await getShellExposed()?.app.getAiBridge()) ?? null;
  } catch {
    return null;
  }
}

/** 通道端点的一段人读地址（tcp → host:port；pipe → 管道名） */
function endpointText(info: AiBridgeInfo): string {
  if (!info.endpoint) return "—";
  return info.endpoint.transport === "pipe"
    ? info.endpoint.pipe
    : `${info.endpoint.host}:${info.endpoint.port}`;
}

/** MCP/CLI 共用的通道状态话术（两张皮共用同一个内核监听——状态天然同源） */
async function channelStatus(configKey: string, readyWord: string): Promise<string> {
  const info = await infoOrNull();
  if (!info) return "";
  if (!info.present) return i18n.t("未就绪");
  if (info.listening) return `${readyWord} · ${endpointText(info)}`;
  if (info.lastError) return `${i18n.t("启动失败")}：${info.lastError}`;
  if (getConfigurationValue<boolean>(configKey) === true) return i18n.t("已开启，重启软件后生效");
  return i18n.t("已关闭");
}

export function registerAiBridgeCommands(): void {
  const PID = "ai-bridge";

  // ── 状态五条（只读数据出口；设置页只读状态行按 statusCommand 调用）──
  registerCommand(PID, {
    id: "aiBridge.statusMcp",
    title: "MCP 通道状态",
    category: "首选项",
    description: "MCP 通道实时状态（只读数据源：返回「运行中 · 地址」等状态文本，供设置页状态行取用）",
    params: [],
    handler: async () => channelStatus("ai.mcp.enabled", i18n.t("运行中")),
  });

  registerCommand(PID, {
    id: "aiBridge.statusCli",
    title: "CLI 通道状态",
    category: "首选项",
    description: "CLI 通道实时状态（只读数据源：CLI 与 MCP 共用同一个内核监听，状态同源）",
    params: [],
    handler: async () => channelStatus("ai.cli.enabled", i18n.t("已就绪")),
  });

  registerCommand(PID, {
    id: "aiBridge.statusDebug",
    title: "调试端口状态",
    category: "首选项",
    description: "CDP 调试端口实况（只读数据源：argv 是唯一真相，与命令行实况一致不猜）",
    params: [],
    handler: async () => {
      const info = await infoOrNull();
      if (!info) return "";
      if (info.debugPort != null) return `${i18n.t("已开启")} · ${info.debugPort}`;
      if (getConfigurationValue<boolean>("ai.debug.remoteDebugging") === true) {
        return i18n.t("已开启，重启软件后生效");
      }
      return i18n.t("已关闭");
    },
  });

  registerCommand(PID, {
    id: "aiBridge.statusAuditLog",
    title: "操作日志状态",
    category: "首选项",
    description: "操作日志落盘开关状态（只读数据源，跟随 ai.auditLog.enabled 配置值）",
    params: [],
    handler: async () =>
      getConfigurationValue<boolean>("ai.auditLog.enabled") === true ? i18n.t("记录中") : i18n.t("未开启"),
  });

  registerCommand(PID, {
    id: "aiBridge.scopeSummary",
    title: "开放范围明细",
    category: "首选项",
    description: "开放范围只读明细（只读数据源：读/做两栏从白名单 kind 派生，与 linkdeskctl --help 同源）",
    params: [],
    handler: async () => {
      const info = await infoOrNull();
      if (!info) return "";
      const namesOf = (kind: "read" | "write") =>
        info.ops.filter((o) => o.kind === kind).map((o) => o.name).join(" · ");
      return `${i18n.t("读")}：${namesOf("read")}\n${i18n.t("做")}：${namesOf("write")}\n${i18n.t("不开放任意代码执行")}`;
    },
  });

  // ── 动作七条（设置页 action 按钮的落点）──
  registerCommand(PID, {
    id: "aiBridge.mcpDetails",
    title: "打开通道详情",
    category: "首选项",
    description: "打开通道详情对话框（连接地址、凭据存放位置、连不上的原因对照）",
    params: [],
    handler: async () => {
      const info = await infoOrNull();
      if (!info) return;
      const status = await channelStatus("ai.mcp.enabled", i18n.t("运行中"));
      const { alert } = await import("../../services/ui/DialogService");
      await alert({
        title: i18n.t("通道详情"),
        message: [
          `${i18n.t("状态")}：${status}`,
          `${i18n.t("进程 pid")}：${info.pid}`,
          `${i18n.t("凭据文件")}：${info.userData}\\${info.tokenFile}`,
          `${i18n.t("操作日志文件")}：ai-bridge-log.jsonl`,
          info.lastError ? `${i18n.t("上次错误")}：${info.lastError}` : "",
          i18n.t("提示：凭据明文不在设置页显示；终端里看 ai-bridge.token，或用 linkdeskctl ping 验证连通。"),
        ].filter(Boolean).join("\n"),
      });
    },
  });

  registerCommand(PID, {
    id: "aiBridge.cliInstall",
    title: "查看安装说明",
    category: "首选项",
    description: "打开 CLI 安装说明对话框（linkdeskctl 怎么装、PATH 怎么配）",
    params: [],
    handler: async () => {
      const { alert } = await import("../../services/ui/DialogService");
      await alert({
        title: i18n.t("CLI 安装说明"),
        message: [
          i18n.t("安装版默认把 linkdeskctl 加进 PATH（安装器「添加到 PATH」默认勾选，重启终端后生效）。"),
          i18n.t("验证：在终端运行 linkdeskctl --help——能列出全部命令即就位。"),
          i18n.t("对 AI 说一句「用 linkdeskctl 操作 LinkDesk」，它自己 --help 就全懂了。"),
        ].join("\n"),
      });
    },
  });

  registerCommand(PID, {
    id: "aiBridge.copyCliLine",
    title: "复制这句话",
    category: "首选项",
    description: "复制一段可直接贴给终端型 AI 的话（含 linkdeskctl --help 指引）到剪贴板",
    params: [],
    handler: async () => {
      await window.linkdesk.clipboard.writeText(
        i18n.t("请用 linkdeskctl 命令行工具操作 LinkDesk——先运行「linkdeskctl --help」查看全部能力，再按说明调用。"),
      );
      pushToastCopied();
    },
  });

  registerCommand(PID, {
    id: "aiBridge.copyMcpConfig",
    title: "复制 MCP 配置",
    category: "首选项",
    description: "复制 MCP 客户端配置片段到剪贴板（与 linkdeskctl mcp config --for 同一生成器，逐字一致）",
    params: [],
    handler: async () => {
      await window.linkdesk.clipboard.writeText(formatMcpConfig("json"));
      pushToastCopied();
    },
  });

  registerCommand(PID, {
    id: "aiBridge.openScopeList",
    title: "查看完整操作清单",
    category: "首选项",
    description: "打开完整操作清单对话框（每条白名单能力一条，写明怎么调；条数 = 白名单条数）",
    params: [],
    handler: async () => {
      const info = await infoOrNull();
      if (!info) return;
      const lines = info.ops.map((o) => {
        const ps = o.params.map((p) => `${p.name}${p.required ? "" : "?"}:${p.type}`).join(", ");
        return `${o.kind === "read" ? i18n.t("读") : i18n.t("做")} · ${o.name}（${ps || i18n.t("无参数")}）——${o.help}`;
      });
      const { alert } = await import("../../services/ui/DialogService");
      await alert({
        title: i18n.t("完整操作清单"),
        message: [i18n.t("AI 只能执行下面这些白名单操作（不开放任意代码执行）："), ...lines].join("\n"),
      });
    },
  });

  registerCommand(PID, {
    id: "aiBridge.regenerateToken",
    title: "重新生成凭据",
    category: "首选项",
    description: "重新生成 AI 接入凭据（旧凭据立即失效；明文不显示，客户端重读 ai-bridge.token 接上）",
    params: [],
    handler: async () => {
      const { showConfirm, alert } = await import("../../services/ui/DialogService");
      const ok = await showConfirm(i18n.t("重新生成凭据后，旧凭据立即失效（已连接的 AI 要重读凭据文件才能接上）。确定重新生成吗？"));
      if (!ok) return;
      const info = await getShellExposed()?.app.getAiBridge({ action: "regenerateToken" });
      if (!info) return;
      await alert({ title: i18n.t("凭据已重新生成"), message: i18n.t("新凭据已写入 ai-bridge.token——把新配置重新粘给 AI 客户端即可。") });
    },
  });

  registerCommand(PID, {
    id: "aiBridge.openSensitiveManager",
    title: "管理敏感能力细分",
    category: "首选项",
    description: "打开敏感能力细分说明（首版粒度 = 总开关＋白名单整组，装/卸插件每次确认）",
    params: [],
    handler: async () => {
      const { alert } = await import("../../services/ui/DialogService");
      await alert({
        title: i18n.t("敏感能力细分"),
        message: [
          i18n.t("当前粒度（首版）：一个总开关管全部通道 ＋ 白名单整组生效；最高风险项已由「装 = 问一声」覆盖——AI 发起安装时软件里会弹确认框，你点头才装。"),
          i18n.t("按操作逐条设闸（如「允许 AI 发送串口数据」）在后续版本提供；到时这里就是管理入口。"),
        ].join("\n"),
      });
    },
  });

  registerCommand(PID, {
    id: "aiBridge.openLog",
    title: "查看日志",
    category: "首选项",
    description: "打开操作日志对话框（谁在何时调了什么、结果如何；被拒的调用也在账上）",
    params: [],
    handler: async () => {
      const info = await infoOrNull();
      if (!info) return;
      const { alert } = await import("../../services/ui/DialogService");
      const lines = info.ledger.slice(-20).map((e) =>
        `${e.ts}  ${e.op}${e.arg ? ` ${e.arg}` : ""}  ${e.ok ? "OK" : e.code ?? "ERR"}  ${e.ms}ms`,
      );
      await alert({
        title: i18n.t("操作日志"),
        message: lines.length > 0
          ? [`${i18n.t("最近")} ${lines.length} ${i18n.t("条")}：`, ...lines].join("\n")
          : i18n.t("还没有记录——开着通道跑一条命令，这里就会出现账目。"),
      });
    },
  });
}

/** 复制成功的出声——toast 是唯一通知面（coreCommands 同款） */
function pushToastCopied(): void {
  void (async () => {
    const { pushToast } = await import("../../services/ui/toast");
    pushToast({ source: "ai-bridge", severity: "info", message: i18n.t("已复制到剪贴板") });
  })();
}
