/**
 * `userOnly` 判定（L2 命令锁）——**按命令元数据判，不按 id 名单**。
 *
 * 规格：`01-设计/02-执行闸与防自提权.md` §二
 *
 * 为什么不是名单：名单会漏——命令一改名，名单就失效且**没人报警**；元数据跟着命令走
 * （`registerCommand({ ..., userOnly: true })`），改名不失效、新命令必须显式声明。
 *
 * 语义：`userOnly: true` = **AI 正门永远不可调**（`EPROTECTED`），只有用户点界面能用。
 * 用途：切档位 / 复位默认 / 任何「能改门本身」的命令。
 */

/** 只需要命令面里的两个字段（结构型——不 import 注册表，避免把壳侧类型拖进主进程） */
export interface ProtectedCommandMeta {
  id?: unknown;
  userOnly?: unknown;
}

/** 这条命令是否只许用户调（未登记 / 元数据缺失 ⇒ false；存在性由调用方先查） */
export function isUserOnlyCommand(
  commands: readonly ProtectedCommandMeta[],
  commandId: string,
): boolean {
  const meta = commands.find((c) => c && c.id === commandId);
  return meta?.userOnly === true;
}
