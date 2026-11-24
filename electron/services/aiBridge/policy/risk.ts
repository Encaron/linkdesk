/**
 * AI 风险登记表（R0–R3）——**唯一真相源**（含确认框的 what/why）。
 *
 * 规格：`docs/04-软件更新/已落地/AI安全-权限档位与提权/01-设计/01-策略模型与风险分级.md` §二/§三
 *
 * 判据三条：**可不可回退 / 影不影响别人 / 动不动程序本体**。
 *   · R0 读：只读、无副作用；
 *   · R1 可撤销写：可一键撤回、不碰盘上用户数据、不跑陌生代码；
 *   · R2 有副作用写：落盘、改插件状态、跑已装代码、发数据；
 *   · R3 不可回退 / 动本体：换掉正在跑的代码、删数据、起任意进程。
 *
 * 🔴 两条纪律（越了就是第二套名单）：
 *   ① 原 `ASK_FIRST_COMMANDS` / `ASK_FIRST_OPS` **已并入本表**——「要问一声」= `risk:"R3"`
 *      （`ask` / `auto` 档对 R3 都问）。⛔ 不要再建一张 `ASK_FIRST_*`。
 *   ② 未登记命令 ⇒ **R2**（保守兜底，⛔ 不静默放行成 R0/R1）；未登记 op ⇒ `kind:"write"` 按 **R2**、`read` 按 R1。
 *      不登记成 R0——「不知道」不等于「无害」。
 *
 * 风险来源分层（S7 · `riskOfCommand` 的唯一实现）：
 *   壳命令（注册属主 = `APP_PLUGIN_ID`）⇒ 壳内建 `COMMAND_RISK`，表外 ⇒ R2；
 *   插件命令 ⇒ 只认 manifest `contributes.commands[].risk` 声明，未声明/非法 ⇒ R2；
 *   🔴 壳表**不覆盖**插件命令（冲突以声明为准 + loader 诊断）——语义归插件，壳不认识业务。
 *   每条判定带 `riskSource`（`shell` / `declared` / `fallback`）供 describe 自述与 doctor 断言。
 */

/** 风险级——**字符串只许出现在本文件**（判红见 `scripts/check-ai-policy.mjs` P4/P5） */
export type Risk = "R0" | "R1" | "R2" | "R3";

/** 四级的密封清单（矩阵列序 / 测试全集对账用） */
export const RISKS: readonly Risk[] = ["R0", "R1", "R2", "R3"];

export function isRisk(value: unknown): value is Risk {
  return typeof value === "string" && RISKS.includes(value as Risk);
}

/** 一条登记：风险级 ＋ 需要用户点头时的两句话（R3 必填，测试钉） */
export interface RiskEntry {
  risk: Risk;
  /** 这是什么动作（人读，进确认框） */
  what?: string;
  /** 为什么要问一声（人读，进确认框） */
  why?: string;
}

/** 壳命令的风险登记（按命令 id）——**只对壳命令生效**（插件命令只认声明，⛔ 别把插件命令写进来） */
export const COMMAND_RISK: Record<string, RiskEntry> = {
  /* ── R0 读 ── */
  "workbench.action.getConfiguration": { risk: "R0", what: "读取配置", why: "只看当前值，不改任何东西" },
  "workbench.action.listConfigurations": { risk: "R0" },
  // P1 零插件路径：列目录只读，不装、不改状态——read 档必须允许
  "plugins.listCatalog": { risk: "R0", what: "列出市场目录", why: "只读取目录，不安装、不改任何状态" },
  // 只读弹窗与操作清单同域：只读表格，不该被 read 档拦
  "aiBridge.openSensitiveManager": { risk: "R0", what: "敏感能力", why: "只读表格" },

  /* ── R1 可撤销写 ── */
  // 写非安全键可撤回；`ai.*` 另有 L1 拒写（settingsCommands.ts 的 WRITE_BLOCKED_PREFIXES）
  "workbench.action.setConfiguration": { risk: "R1", what: "修改设置", why: "改的是设置值，可改回来；权限设置本身不在其中" },
  "workbench.action.openKeybindingsSettings": { risk: "R1" },
  "core.closeTab": { risk: "R1", what: "关闭标签页", why: "可撤销：用「重新打开已关闭的编辑器」恢复；不会删除文件或数据" },

  /* ── R2 有副作用写 ── */
  "workbench.action.clearConfiguration": { risk: "R2", what: "清除设置覆盖", why: "把改过的设置恢复默认（可以重新设置）" },

  /* ── R3 不可回退 / 动本体 ── */
  "aiPolicy.getState": { risk: "R0", what: "读取 AI 权限档位", why: "只看当前档位与风险表" },
  "aiPolicy.openOps": { risk: "R0", what: "操作清单", why: "只读表格" },
  "aiPolicy.openRiskTable": { risk: "R0", what: "查看完整风险表", why: "只读表格" },
  "aiPolicy.openSettings": { risk: "R0" },
  // 能改门本身的命令：userOnly（L2 先拦，AI 永远够不着）；登记 R3 只为账本/自述口径完整
  "aiPolicy.setMode": { risk: "R3", what: "切换 AI 权限档位", why: "改的就是门本身——只许用户操作" },
  "aiPolicy.resetToDefault": { risk: "R3", what: "恢复默认权限", why: "改的就是门本身——只许用户操作" },
  // 插件安装/卸载是「陌生代码」与「删已装代码」——⛔ 不许按未登记命令兜底
  "plugins.installFromCatalog": {
    risk: "R3",
    what: "从市场目录安装插件",
    why: "插件是陌生代码，装上就会运行；可卸载，但插件数据可能一并丢失",
  },
  "plugins.retryInstall": {
    risk: "R3",
    what: "重试安装插件",
    why: "仍然会运行陌生代码；确认与校验不因重试而跳过",
  },
  "update.openUpdateFlow": {
    risk: "R3",
    what: "处理主软件更新（有新版本会先下载，下载完重启并安装）",
    why: "装更新 = 换掉正在跑的程序本体，不可回退",
  },
};

/**
 * AI 操作的风险登记（按 op 名）。
 * `exec` / `notifyAction` 的**真正判定对象是目标命令**（`riskOfCommand`），这里的登记只做饭票：
 * op 自身不是动作本体，⛔ 别拿它当判定结果。
 */
export const OP_RISK: Record<string, RiskEntry> = {
  /* R0 */
  describe: { risk: "R0", what: "读取界面状态", why: "看标签页、通知、布局（只读）" },
  opStatus: { risk: "R0", what: "查异步命令相位", why: "只读 op 状态，不改任何东西" },
  ping: { risk: "R0" },
  tabs: { risk: "R0" },
  notifications: { risk: "R0" },
  log: { risk: "R0" },

  /* R1 */
  openTab: { risk: "R1", what: "打开标签页", why: "切到某个页面，可撤销" },
  exec: { risk: "R1" }, // 占位：判的是目标命令
  notifyAction: { risk: "R1" }, // 占位：判的是按钮绑定的命令

  /* R3 */
  // 🔴 D9 拍板（「自主档下 install 仍问」= a）：install 必须按 R3 走，
  //    否则 `auto` 档会**静默安装陌生代码**（与既有「装 = 问一声」判据相悖）。
  //    ⚠️ 规格 01 §二 的示例表把 install 列在 R2、§三 的代码草稿也写 R2，但同一份文档的
  //    §四矩阵 `auto + R2 = allow` ⇒ 自相矛盾；本实现取 **D9（用户可见行为）** 为准。
  install: {
    risk: "R3",
    what: "安装插件",
    why: "插件 = 陌生代码，装上就会运行",
  },
  // 请求本身不改状态，但按最高风险走人工（永远弹提权框）
  requestElevation: {
    risk: "R3",
    what: "请求提高 AI 权限（只是请求——用户在弹框里点「允许」才生效）",
    why: "升档必须由你点头；AI 没有自己批准的路",
  },
};

/** 未登记命令的兜底级（保守规则：⛔ 不是 R0/R1——不知道 ≠ 无害） */
export const UNREGISTERED_COMMAND_RISK: Risk = "R2";

/** 未登记 op 的兜底级：写按 R2、读按 R1 */
export function unregisteredOpRisk(kind: "read" | "write"): Risk {
  return kind === "write" ? "R2" : "R1";
}

/** 风险来源（⛔ 布尔开关——以后加来源就扩这个枚举） */
/** 风险来源（本文件内使用；describe 只消费 riskSource 字符串值） */
type RiskSource = "shell" | "declared" | "fallback";

/** 一次风险判定：risk ＋ 它从哪来（describe 自述 / doctor 断言用） */
export interface RiskResolution {
  risk: Risk;
  source: RiskSource;
}

/** 壳命令：壳表唯一；壳表也没有 ⇒ R2 兜底 */
export function riskOfShellCommand(commandId: string): RiskResolution {
  const entry = COMMAND_RISK[commandId];
  return entry ? { risk: entry.risk, source: "shell" } : { risk: UNREGISTERED_COMMAND_RISK, source: "fallback" };
}

/** 插件命令：只认声明；未声明 ⇒ R2 兜底（非法声明值 loader 已诊断并退回 undefined） */
export function riskOfPluginCommand(declared: Risk | undefined): RiskResolution {
  return declared ? { risk: declared, source: "declared" } : { risk: UNREGISTERED_COMMAND_RISK, source: "fallback" };
}

/**
 * 命令风险（**唯一实现**）——按归属分流，⛔ 不按 id 猜：
 *   `shellOwned` = 注册归属是壳（getCommands DTO 的 `pluginId` === `APP_PLUGIN_ID`）。
 *   `declared` = manifest `contributes.commands[].risk`（只对插件命令生效；壳命令的声明被壳表覆盖）。
 * 🔴 壳表**不覆盖**插件命令：插件命令与壳表撞 id 时以声明为准（loader 已有异归属诊断）。
 */
export function riskOfCommand(commandId: string, shellOwned: boolean, declared?: Risk): RiskResolution {
  return shellOwned ? riskOfShellCommand(commandId) : riskOfPluginCommand(declared);
}

/** op 风险（未登记按 kind 兜底） */
export function riskOfOp(op: string, kind: "read" | "write"): Risk {
  return OP_RISK[op]?.risk ?? unregisteredOpRisk(kind);
}

/** 登记里的确认文案（R3 才有；⛔ 别在调用点手抄第二份） */
export function askTextForCommand(commandId: string): { what?: string; why?: string } {
  const entry = COMMAND_RISK[commandId];
  return entry ? { what: entry.what, why: entry.why } : {};
}

export function askTextForOp(op: string): { what?: string; why?: string } {
  const entry = OP_RISK[op];
  return entry ? { what: entry.what, why: entry.why } : {};
}

/** 一条「要问一声」的自述（`describe.askFirst` 的形状——CLI/MCP 认这个字段，⛔ 不改名） */
export interface AskFirstRule {
  id: string;
  what: string;
  why: string;
}

/**
 * `describe.askFirst` 的自述面——**从本表派生**（⛔ 不手抄）。
 * 判据：R3 = 必问（`ask` / `auto` 档都会停下等人）。
 */
export function askFirstCatalog(): { note: string; ops: AskFirstRule[]; commands: AskFirstRule[] } {
  const pick = (table: Record<string, RiskEntry>, id: string): AskFirstRule | null => {
    const entry = table[id];
    if (!entry || entry.risk !== "R3") return null;
    return { id, what: entry.what ?? id, why: entry.why ?? "" };
  };
  const ops = Object.keys(OP_RISK)
    .map((id) => pick(OP_RISK, id))
    .filter((r): r is AskFirstRule => r !== null);
  const commands = Object.keys(COMMAND_RISK)
    .map((id) => pick(COMMAND_RISK, id))
    .filter((r): r is AskFirstRule => r !== null);
  return {
    note: "以下动作会先在软件里弹确认框、等用户点头；用户不点头 = EUSERDENIED，动作不执行（装 = 问一声，AI#29；R3 在自主档仍问）",
    ops,
    commands,
  };
}
