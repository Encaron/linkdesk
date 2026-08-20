/**
 * E5.8#29——端口键控过滤 helper（插件本地，三态）：
 *   无 key → 收（旧数据/单口兜底——key=portName 是通用路由键模式，缺键时不过滤）
 *   不匹配 → 滤（payload 属于别的端口——多口并发下各收各的）
 *   匹配 → 收
 * S12（index.tsx 正则挖口名）/ S13（portOpenRef 全局门控）收敛到这一处。
 */
export function matchesPort(payloadPortName: string | undefined, sessionPort: string | null): boolean {
  if (!payloadPortName) return true; // 无路由键——旧数据/单口，不过滤
  if (!sessionPort) return false;    // 本会话未配置端口——一律滤
  return payloadPortName === sessionPort;
}
