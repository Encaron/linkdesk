/**
 * 长任务命令的注册 meta（S6 · 用户裁定 #21）——**仅类型，无运行时导出**。
 *
 * 导入方式：`import type { AsyncCommandMeta } from "@linkdesk/plugin-sdk/runtime";`
 *
 * 用法：`registerCommand(id, handler, { async: true } satisfies AsyncCommandMeta)`。
 * 壳把这条命令自动包成长任务：exec 立即回 `{ commandId, pending:true, opId, startedAt }`，
 * handler 在后台跑；调用方用 `opStatus` 查 `{ state:"running"|"done"|"failed"|"expired" }`，
 * 过期得 `EOPEXPIRED`；结算时 `log` 发 `op.completed`。
 *
 * 🔴 纪律：
 *   · op 注册表 / TTL / 淘汰 / 事件全归**壳**——插件 ⛔ 自建状态机、⛔ 自缓存；
 *   · 插件 ⛔ 调 `runAsync`——该运行时 API 按 #21 取消（SDK 不导出，也没有对应实现）；
 *   · 声明点在 `registerCommand` 的 meta（运行期），⛔ 不在 manifest 里另写一份。
 */
export interface AsyncCommandMeta {
  /** true = 壳把这条命令包成长任务：立即回 `{ pending:true, opId }`，后台跑 handler */
  async?: boolean;
}
