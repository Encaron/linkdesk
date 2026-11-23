/**
 * 「AI 权限档位」壳命令（2026-11-24 · AI 安全 · 权限档位与提权）。
 *
 * 分工（规格 `01-设计/03-UI与交互规格.md` §2.3）：
 *   · **读**：`aiPolicy.getState`（R0）——数据来自主进程 `app:getAiPolicy`（档位/矩阵/风险表只在那里算），
 *     本命令补 `protectedCommands`（命令面归壳）并过 `t()` 出终稿字符串；
 *   · **写**：`aiPolicy.setMode` / `resetToDefault`——标 `userOnly: true`（AI 正门一律 `EPROTECTED`），
 *     **唯一写点** = `setConfigurationValue(ai.policy.mode, …)`；
 *   · **文案**：`aiPolicy.statusSummary` 给设置页只读行（运行时算，⛔ 不写死）。
 *
 * 🔴 防自提权三层里的 L2／L3：本文件的两条写命令是 `userOnly`；提权框的「批准」不经命令面
 * （主进程 elevation handler 在**用户点击后**调 `aiPolicy.setMode`）。AI 能调到的只有 `getState`。
 *
 * 命令 id 用 `aiPolicy.` 前缀；归属 pluginId 复用 `ai-bridge`（同一功能域，⛔ 不新造设置导航项）。
 */

import { registerCommand, getCommands, executeCommand } from "../../registry/commands/CommandRegistry";
import i18n from "../../../i18n";
import { getShellExposed } from "../../api/linkdesk-api/surfaces";
import { setConfigurationValue } from "../../services/configuration/ConfigurationService/settings-io";
import { showTransientToast } from "../../services/ui/toast";
import { alert, confirm } from "../../services/ui/DialogService";
import {
  AI_POLICY_MODE_KEY,
  type AiPolicyDecisionDto,
  type AiPolicyModeDto,
  type AiPolicyOptionDto,
  type AiPolicyRiskDto,
  type AiPolicyRiskRowDto,
  type AiPolicyStateDto,
} from "../../types/ipc/aiPolicy";

const PID = "ai-bridge";

/** 四档合法值（与主进程 `PolicyMode` 同值；⛔ 不新造档位） */
const MODES: readonly AiPolicyModeDto[] = ["read", "ask", "auto", "full"];

const t = (key: string) => i18n.t(key);

/** 风险表摘要的列（顺序 = 用户读得懂的因果：看 → 切 → 改 → 装）——label 是 i18n key */
const RISK_AXIS: ReadonlyArray<{ risk: AiPolicyRiskDto; label: string }> = [
  { risk: "R0", label: "查看" },
  { risk: "R1", label: "打开" },
  { risk: "R2", label: "写文件" },
  { risk: "R3", label: "装更新" },
];

function decisionText(decision: AiPolicyDecisionDto): string {
  if (decision === "allow") return "✅";
  return decision === "ask" ? t("询问") : t("不允许");
}

/** 某档的判定摘要（数据来自主进程矩阵，⛔ 不写死） */
function summaryOf(matrix: AiPolicyStateDto["matrix"], mode: AiPolicyModeDto): string {
  return RISK_AXIS.map(({ risk, label }) => `${t(label)} ${decisionText(matrix[mode][risk])}`).join(" · ");
}

/** 渲染体拿到的终稿状态（`getState` 的返回面）：`options[].summary` 已算好，文案已 t() */
export interface AiPolicyViewState extends Omit<AiPolicyStateDto, "options" | "riskTable"> {
  options: Array<AiPolicyOptionDto & { summary: string }>;
  riskTable: AiPolicyRiskRowDto[];
}

/** 读一次并出终稿（`null` = 主进程没应答 / 非壳环境——调用方退化） */
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
    // 受保护命令 = 壳注册表里带 userOnly 元数据的那些（L2 判据是元数据，不是名单）
    protectedCommands: getCommands()
      .filter((c) => c.userOnly === true)
      .map((c) => c.id)
      .sort(),
    options: raw.options.map((o) => ({ ...o, label: t(o.label), description: t(o.description), summary: summaryOf(raw.matrix, o.value) })),
    riskTable: raw.riskTable.map((r) => ({
      ...r,
      what: r.what ? t(r.what) : undefined,
      why: r.why ? t(r.why) : undefined,
    })),
  };
}

/* ── 呈现面的文案（轻提示 / 留痕） —— 与铁律「一条条目只进一个面」同源 ── */

function toastSwitched(mode: AiPolicyModeDto): void {
  const label = t(modeLabelKey(mode));
  if (mode === "full") {
    // 完全访问 = 常驻高危态 ⇒ 走铃铛面板留痕（ttl ≤ 0 = 常驻），并给「改回来」一键降档
    showTransientToast({
      source: "ai-policy",
      severity: "warning",
      ttl: 0,
      message: t("AI 现在可以执行所有操作，不会再询问。这个设置会一直有效，直到你在上面对应位置改回来。"),
      actions: [{ label: t("改成自主"), command: "aiPolicy.setMode", args: ["auto"], onClick: () => void switchMode("auto") }],
    });
    return;
  }
  showTransientToast({ source: "ai-policy", severity: "info", message: `${t("已切换到")}「${label}」` });
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
      message: t("开启后 AI 的所有操作都不再询问，直到你在这里改回来。每一步操作都有记录，随时可以查看。确定开启吗？"),
      type: "warning",
    });
    if (!ok) return { mode: (await readViewState())?.mode ?? "auto" };
  }
  await setConfigurationValue(AI_POLICY_MODE_KEY, mode, "user");
  toastSwitched(mode);
  return { mode };
}

/** 风险表文字版（首版；内容模式表格随后续批落地，数据同一份） */
function riskTableText(state: AiPolicyViewState): string {
  const head = `${t("操作")}\t${t("风险")}\t${t("现在")}`;
  const rows = state.riskTable.map((r) => `${r.what ?? r.id}\t${t(r.risk === "R0" ? "查看" : r.risk === "R1" ? "可撤销" : r.risk === "R2" ? "有改动" : "不可撤销")}\t${decisionText(r.decision)}`);
  return [head, ...rows].join("\n");
}

export function registerAiPolicyCommands(): void {
  registerCommand(PID, {
    id: "aiPolicy.getState",
    title: "AI 权限档位",
    category: "首选项",
    description: "读取 AI 权限策略：当前档位、四档各自的判定摘要（矩阵）、风险表（当前档下允许/询问/不允许）、受保护命令。只读",
    params: [],
    handler: async () => (await readViewState()) ?? null,
  });

  registerCommand(PID, {
    id: "aiPolicy.statusSummary",
    title: "当前权限一览",
    category: "首选项",
    description: "设置页只读行：一行说明 AI 现在能做什么、哪些会先问你（按当前档位实时生成）",
    params: [],
    handler: async () => {
      const state = await readViewState();
      if (!state) return "—";
      const current = state.options.find((o) => o.value === state.mode);
      return current ? `${current.label} · ${current.summary}` : state.mode;
    },
  });

  registerCommand(PID, {
    id: "aiPolicy.setMode",
    title: "切换 AI 权限档位",
    category: "首选项",
    description: "切换 AI 权限档位（read|ask|auto|full）。完全访问需二次确认；设置常驻到用户改回。⚠️ 只许用户操作（userOnly），AI 不可调",
    params: [{ name: "mode", type: "string", required: true, description: "目标档位：read | ask | auto | full" }],
    userOnly: true,
    handler: async (mode) => switchMode(mode as AiPolicyModeDto),
  });

  registerCommand(PID, {
    id: "aiPolicy.resetToDefault",
    title: "恢复默认权限（自主）",
    category: "首选项",
    description: "把 AI 权限恢复到默认档「自主」。⚠️ 只许用户操作（userOnly），AI 不可调",
    params: [],
    userOnly: true,
    handler: async () => switchMode("auto"),
  });

  registerCommand(PID, {
    id: "aiPolicy.openRiskTable",
    title: "查看完整风险表",
    category: "首选项",
    description: "打开完整风险表：每一项操作的风险，以及 AI 在当前档位下能不能做",
    params: [],
    handler: async () => {
      const state = await readViewState();
      if (!state) return;
      await alert({
        title: t("完整风险表"),
        message: `${t("风险由软件统一登记；插件自己的命令也要声明。")}\n\n${riskTableText(state)}`,
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
