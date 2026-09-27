/**
 * 壳侧命令表序列化——04「悬停提示系统」件 1（设计详案 §四·4.2「命令 → 快捷键」同源）。
 *
 * ── 这张表是干什么的 ──
 * 池/插件里的提示点只写 `data-hint-command="workbench.action.closeTab"`，**不用自己抄文案、更不抄快捷键**：
 * 文案取命令 `title`、快捷键取该命令的绑定——两者都在壳侧算好，池**哑渲染**。
 *
 * ── 为什么必须在壳侧算（⛔ 不许池侧自己查注册表）──
 * 菜单今天读的是「CommandRegistry + KeybindingRegistry + `formatKeyLabel`」这一组；
 * 提示条若在池里另查一遍，同一条命令在两处就会有两个说法（改了一个忘改另一个）。
 * memory `two-rulers-one-caliber`：**同一判断实现两遍 = 两把尺子**，迟早对不上。
 * ⇒ 一处算（本文件）、两处用（菜单序列化 `titlebar.ts` / 提示条命令表），尺子只有一把。
 *
 * ── 三条口径（与菜单**逐条对齐**，不是巧合）──
 * ① **文案**：`cmd.title` 过 `t()`——菜单项 label 的兜底路径同款（`resolveItemNode`：
 *    `item.label ? t(item.label) : t(getCommand(...).title)`）。命令的 title 是 i18n key。
 * ② **快捷键**：`getKeybindings().find(k => k.command === id)`——**取第一个**匹配，
 *    ⛔ 不按 `when` 挑「当前上下文里生效的那个」。理由：菜单就是取第一个（`titlebar.ts:79`），
 *    提示条若挑出另一个，用户会在同一命令上看到两个快捷键（菜单一个、提示一个）——那正是本节要消灭的东西。
 *    同命令多绑定的取舍要改就**两处一起改**（改在 `hints.ts` 与 `titlebar.ts` 的共同口径上）。
 * ③ **空 title 跳过**：注册表里 `title: ""` 的命令不进表（`resolveHintPayload` 空文案也不出条——
 *    两层都拦，防「一条没有字的提示」）。
 *
 * ── 成本（说清楚，别以后当坑）──
 * 表是**全量命令**（每窗每次 pushLayout 随布局发一份），不是只发「有快捷键的」。
 * 为什么不少发：`data-hint-command` 的语义是「文案我自己不写，问命令」——命令没有快捷键是**常态**
 * （几十个命令一个键都没有），若只发有键的，那些提示点就会**静默不出条**（属性写了、什么都没发生 =
 * 最难查的一类 bug）。发全量则「写了就有」。
 * 量级：命令数是百量级、每条 ~60 字节 ⇒ 每次推送十几 KB 增量；布局快照本就整份重发
 * （`PoolLayout` 头注释铁律 1：whole-value checkpoint，禁裸 delta），同一条通道同一种量级。
 * 若哪天这十几 KB 真成了瓶颈——**改这一处**（比如加一个「已引用命令」回传）即可，调用方零改。
 *
 * 依赖方向：hints → core/registry（Command/Keybinding）+ core/utils（formatKeyLabel）。
 * ⛔ 池侧不得 import 本文件（`src/hooks/*` 是壳侧；池吃的是推送下来的快照）。
 */

import type { TFunction } from "i18next";
import type { PoolCommandHints } from "../../core/types/pool/poolLayout";
import { getCommands } from "../../core/registry/commands/CommandRegistry";
import { getKeybindings } from "../../core/registry/commands/KeybindingRegistry";
import { formatKeyLabel } from "../../core/utils/formatKeyLabel";

/**
 * 命令表：`commandId → { title, keybinding? }`（`title` 已 `t()`，`keybinding` 已格式化）。
 *
 * 现场算、不缓存：注册表随插件装卸/激活而变化，`usePoolSync` 每次推送现取现算
 * （与该 effect 里其他的「现场读注册表」同款——如 `resolveActiveMarketDetailContribution`）。
 * 命令数在百量级，一次遍历 + 一次 Map 查是微秒级。
 *
 * @param t 壳侧翻译函数（命令 title 是 i18n key）
 */
export function buildCommandHints(t: TFunction): PoolCommandHints {
  const hints: PoolCommandHints = {};
  for (const cmd of getCommands()) {
    if (!cmd.title) continue;
    const title = t(cmd.title);
    if (!title) continue;
    hints[cmd.id] = { title };
  }
  for (const kb of getKeybindings()) {
    if (!kb.key) continue;
    const entry = hints[kb.command];
    // 命令不在表里（上游 filtered 掉）或已有绑定 ⇒ 跳过——「取第一个」口径见文件头 ②
    if (!entry || entry.keybinding) continue;
    entry.keybinding = formatKeyLabel(kb.key);
  }
  return hints;
}
