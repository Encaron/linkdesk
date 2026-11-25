/**
 * 事件投递审计缝（Block 3b）——把 `event.publish` 记进 aiBridge 账本（`log` 可读）。
 *
 * 为什么是注入式：aiBridge 账本住在 `services/aiBridge/index.ts`（模块私有），而事件 handler 在 IPC 层；
 * 两边直接互相 import 会把启动顺序绑死。这里只留一个 sink 指针，aiBridge 启动时注册，handler 调用。
 */

export interface EventAuditEntry {
  eventId: string;
  from: string;
  recipients: number;
  dropped: number;
}

let _sink: ((entry: EventAuditEntry) => void) | null = null;

export function setEventAuditSink(sink: ((entry: EventAuditEntry) => void) | null): void {
  _sink = sink;
}

export function auditEventPublish(entry: EventAuditEntry): void {
  try {
    _sink?.(entry);
  } catch {
    /* 审计失败不该影响投递 */
  }
}
