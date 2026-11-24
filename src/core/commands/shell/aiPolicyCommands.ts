/**
 * 「AI 权限档位」壳命令（2026-11-24 · AI 安全 · 权限档位与提权）。
 *
 * 返工（v4）：两个入口、两个弹窗（操作清单 / 敏感能力），弹窗内不再二次切换；
 * 所有显示文案以 **i18n key** 下发，渲染体用 `useTranslation()` 翻译——语言切换即时重绘。
 *
 * 分工：
 *   · **读**：`aiPolicy.getState`（R0）——数据来自主进程 `app:getAiPolicy`，本命令只补
 *     `protectedCommands`（命令面归壳），**不再 t()**（否则语言切换会冻在旧语言）；
 *   · **写**：`aiPolicy.setMode` / `resetToDefault`——`userOnly`（AI 正门 `EPROTECTED`），
 *     **唯一写点** = `setConfigurationValue(ai.policy.mode, …)`；
 *   · **两个清单**：`aiPolicy.openOps` / `aiBridge.openSensitiveManager` 走 DialogHost 内容模式。
 *
 * 🔴 防自提权三层里的 L2／L3：两条写命令是 `userOnly`；提权框的「批准」不经命令面。
 */

import { registerCommand, getCommands, executeCommand } from "../../registry/commands/CommandRegistry";
import i18n from "../../../i18n";
import { getShellExposed } from "../../api/linkdesk-api/surfaces";
import { setConfigurationValue } from "../../services/configuration/ConfigurationService/settings-io";
import { showTransientToast } from "../../services/ui/toast";
import { confirm, confirmContent } from "../../services/ui/DialogService";
import {
  AI_POLICY_MODE_KEY,
  AI_POLICY_RISK_TABLE_HOST_VIEW,
  AI_POLICY_SENSITIVE_VIEW,
  type AiPolicyModeDto,
  type AiPolicyStateDto,
} from "../../types/ipc/aiPolicy";

const PID = "ai-bridge";

/** 四档合法值（与主进程 `PolicyMode` 同值；⛔ 不新造档位） */
const MODES: readonly AiPolicyModeDto[] = ["read", "ask", "auto", "full"];

const t = (key: string) => i18n.t(key);

/** 渲染体拿到的状态（`getState` 返回面）：原样 key + 受保护命令 */
interface AiPolicyViewState extends AiPolicyStateDto {
  /** 带 `userOnly` 元数据的命令 id（L2 判据是元数据，不是名单） */
  protectedCommands: string[];
}

/** 读一次（`null` = 主进程没应答 / 非壳环境——调用方退化） */
async function readViewState(): Promise<AiPolicyViewState | null> {
  let raw: AiPolicyStateDto | null = null;
  try {
    raw = (await getShellExposed()?.app.getAiPolicy()) ?? null;
  } catch {
    raw = null;
  }
  if (!raw) return null;
  return {
    ...raw,
    protectedCommands: getCommands()
      .filter((c) => c.userOnly === true)
      .map((c) => c.id)
      .sort(),
  };
}

/* ── 呈现面的回执（轻提示）——同一事件一个 key，重复切换只更新那一条 ── */

function toastSwitched(mode: AiPolicyModeDto): void {
  const label = t(modeLabelKey(mode));
  if (mode === "full") {
    // 完全访问 = 高危常驻态：一条告警回执，自动收起；同一事件只保留一条
    // 只做「回执」：不带动作按钮（动作在设置页的告警行里，避免用户为点按钮把指针停在 toast 上
    // 触发 hover 暂停而看起来「永不消失」）。ttl 6s，到点由池侧按 expiresAt 收起。
    showTransientToast({
      source: "ai-policy",
      severity: "warning",
      key: "ai-policy-mode",
      ttl: 6000,
      message: t("权限已改为完全访问。可随时恢复默认。"),
    });
    return;
  }
  showTransientToast({
    source: "ai-policy",
    severity: "info",
    key: "ai-policy-mode",
    message: `${t("权限已改为")}「${label}」`,
  });
}

function modeLabelKey(mode: AiPolicyModeDto): string {
  switch (mode) {
    case "read":
      return "只读";
    case "ask":
      return "逐次确认";
    case "auto":
      return "自主";
    case "full":
      return "完全访问";
  }
}

/** 写档位（唯一写点）——GUI 与提权框都走这里 */
async function switchMode(mode: AiPolicyModeDto): Promise<{ mode: AiPolicyModeDto }> {
  if (!MODES.includes(mode)) throw new Error(`${t("未知的权限档位")}: ${String(mode)}`);
  if (mode === "full") {
    // D8：升到完全访问必须二次确认（常驻事实写进文案，⛔ 不藏）
    const ok = await confirm({
      title: t("开启完全访问"),
      message: t("完全访问开启后，所有操作都不再询问。每一步操作都有记录，可随时恢复默认。确定开启吗？"),
      type: "warning",
    });
    if (!ok) return { mode: (await readViewState())?.mode ?? "auto" };
  }
  await setConfigurationValue(AI_POLICY_MODE_KEY, mode, "user");
  toastSwitched(mode);
  return { mode };
}

/** 敏感能力弹窗（表格：能力 / 规则 / 当前）——数据来自 getState，文案由视图翻译 */
export async function openSensitiveManagerDialog(): Promise<void> {
  const state = await readViewState();
  if (!state) return;
  await confirmContent({
    title: t("敏感能力"),
    message: t("这些规则由权限档位统一决定，不会绕过档位。"),
    content: {
      hostView: AI_POLICY_SENSITIVE_VIEW,
      payload: { rows: state.sensitive },
    },
  });
}

export function registerAiPolicyCommands(): void {
  registerCommand(PID, {
    id: "aiPolicy.getState",
    title: "AI 权限档位",
    category: "首选项",
    description: "读取 AI 权限策略：当前档位、档位矩阵、能力摘要、操作清单、敏感能力、受保护命令。只读",
    params: [],
    handler: async () => (await readViewState()) ?? null,
  });

  registerCommand(PID, {
    id: "aiPolicy.setMode",
    title: "切换 AI 权限档位",
    category: "首选项",
    description: "切换 AI 权限档位（read|ask|auto|full）。完全访问需二次确认；设置持续到你改回。仅限用户操作（userOnly），AI 不可调",
    params: [{ name: "mode", type: "string", required: true, description: "目标档位：read | ask | auto | full" }],
    userOnly: true,
    handler: async (mode) => switchMode(mode as AiPolicyModeDto),
  });

  registerCommand(PID, {
    id: "aiPolicy.resetToDefault",
    title: "恢复默认权限（自主）",
    category: "首选项",
    description: "把 AI 权限恢复到默认档「自主」。仅限用户操作（userOnly），AI 不可调",
    params: [],
    userOnly: true,
    handler: async () => switchMode("auto"),
  });

  registerCommand(PID, {
    id: "aiPolicy.openOps",
    title: "操作清单",
    category: "首选项",
    description: "打开操作清单：AI 可以调用的操作、风险等级，以及当前档位下的结论（表格）",
    params: [],
    handler: async () => {
      const state = await readViewState();
      if (!state) return;
      await confirmContent({
        title: t("操作清单"),
        message: t("风险等级由软件统一登记；插件声明的命令按同一标准归类。"),
        content: {
          hostView: AI_POLICY_RISK_TABLE_HOST_VIEW,
          payload: { rows: state.riskTable },
        },
      });
    },
  });

  registerCommand(PID, {
    id: "aiPolicy.openSettings",
    title: "打开 AI 权限设置",
    category: "首选项",
    description: "打开设置页的「AI 接入 → 开放范围与安全」分节（状态栏徽标点击的落点）",
    params: [],
    handler: async () => {
      await executeCommand("core.openSettings", undefined, { pluginId: PID, scrollTo: AI_POLICY_MODE_KEY });
    },
  });
}
