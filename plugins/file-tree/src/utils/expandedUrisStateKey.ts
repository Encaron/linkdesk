/**
 * 展开状态落盘 key——E6#47e 多窗维度。
 *
 * 多窗后每窗文件树的展开态必须互不覆盖 ⇒ key 加窗维度 `expandedUris:ws-N`
 * （窗标识 = 主进程 createWorkspaceWindow 建窗时的 ?wsWindow= 参数）。
 * 无参数（单窗时代/既有数据）保持旧 key `expandedUris`——第一个窗的旧展开态零迁移直接沿用。
 */

function windowIdSuffix(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get("wsWindow");
    // 格式校验——拒绝脏值混进 key
    if (raw && /^ws-\d+$/.test(raw)) return `:${raw}`;
  } catch { /* 非窗环境 */ }
  return "";
}

export function expandedUrisStateKey(): string {
  return `expandedUris${windowIdSuffix()}`;
}
