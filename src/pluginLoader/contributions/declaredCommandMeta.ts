/**
 * `contributes.commands[]` 声明面收敛（risk / activation / returns）——从 contributions.ts 拆出。
 *
 * 为什么独立：T3 开闸后这三条是**命令能否注册的判定**（risk/activation 必填），与「往注册表送什么」
 * 分开住，改动面小、测试可直打；contributions.ts 只负责编排。
 *
 * 🔴 T3（2026-11-25）：risk/activation 缺任一或值非法 ⇒ 返回 undefined ⇒ 调用方拒绝注册该命令。
 */

/** 声明面风险级白名单（`contributes.commands[].risk`）——壳只认这四值 */
const DECLARED_RISKS = new Set(["R0", "R1", "R2", "R3"]);

/**
 * `contributes.commands[].risk` 收敛（2026-11-24 · AI 权限档位）。
 * - 未声明 ⇒ `undefined` ⇒ **T3 拒绝该命令**（2026-11-25 起：risk/activation 为必填声明，⛔ 兜底注册）；
 * - 已知值 ⇒ 原样；
 * - 未知值 ⇒ **明确告知作者**并退回兜底（⛔ 不静默当 R1 装作没事，也对齐插件权限系统「壳不认识的能力要出声」口径）。
 */
export function normalizeDeclaredRisk(
  pluginId: string,
  cmd: { id: string; risk?: string },
): "R0" | "R1" | "R2" | "R3" | undefined {
  if (cmd.risk === undefined) return undefined;
  if (DECLARED_RISKS.has(cmd.risk)) return cmd.risk as "R0" | "R1" | "R2" | "R3";
  console.warn(
    `[pluginLoader] 插件 "${pluginId}" 的命令 "${cmd.id}" 声明了未知风险级 "${String(cmd.risk)}"`
      + "——只认 R0–R3；本条已按兜底 R1 处理（请修正 plugin.json）",
  );
  return undefined;
}

/**
 * `contributes.commands[].activation` 收敛（S4 · 2026-11-25）。
 * - 未声明 ⇒ `undefined` ⇒ **T3 拒绝该命令**（与 risk 同批转严）；
 * - 已知值（entry/view）⇒ 原样；
 * - 未知值 ⇒ **明确告知作者**并退回 undefined（⛔ 静默当 entry）。
 * 🔴 T3（2026-11-25 开闸）：risk/activation 缺任一 ⇒ 命令不注册（响亮报错）；官方 14 仓 104 条已全覆盖。
 */
export function normalizeDeclaredActivation(
  pluginId: string,
  cmd: { id: string; activation?: string },
): "entry" | "view" | undefined {
  if (cmd.activation === undefined) return undefined;
  if (cmd.activation === "entry" || cmd.activation === "view") return cmd.activation;
  console.warn(
    `[pluginLoader] 插件 "${pluginId}" 的命令 "${cmd.id}" 声明了未知 activation "${String(cmd.activation)}"`
      + "——只认 entry/view；本条按未声明处理（请修正 plugin.json）",
  );
  return undefined;
}

/**
 * `contributes.commands[].returns` 收敛（S3b/T12）——字段表只到一级键（可一层嵌套由 description 说明）。
 * 坏项一律丢弃（整组不崩），并给作者一条诊断（⛔ 静默吞掉声明）。
 */
export function normalizeDeclaredReturns(
  pluginId: string,
  cmd: { id: string; returns?: unknown },
): Array<{ name: string; type: string; optional?: boolean; description?: string }> | undefined {
  if (cmd.returns === undefined) return undefined;
  if (!Array.isArray(cmd.returns)) {
    console.warn(`[pluginLoader] 插件 "${pluginId}" 的命令 "${cmd.id}" 的 returns 不是数组——已忽略（请修正 plugin.json）`);
    return undefined;
  }
  const out: Array<{ name: string; type: string; optional?: boolean; description?: string }> = [];
  for (const raw of cmd.returns) {
    const f = raw as { name?: unknown; type?: unknown; optional?: unknown; description?: unknown };
    if (!f || typeof f.name !== "string" || !f.name || typeof f.type !== "string" || !f.type) {
      console.warn(`[pluginLoader] 插件 "${pluginId}" 的命令 "${cmd.id}" 的 returns 有坏字段（缺 name/type）——已跳过该项`);
      continue;
    }
    out.push({
      name: f.name,
      type: f.type,
      ...(typeof f.optional === "boolean" ? { optional: f.optional } : {}),
      ...(typeof f.description === "string" && f.description ? { description: f.description } : {}),
    });
  }
  return out;
}
