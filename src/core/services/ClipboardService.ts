/**
 * ClipboardService —— 归一化剪贴板写入，不依赖用户手势或 document 焦点。
 *
 * E5.5#7-fix round 1：IPC 异步调用导致 navigator.clipboard.writeText() 丢失用户手势。
 *   → 改用 execCommand('copy') + 隐藏 textarea。
 * E5.5#7-fix round 2：多 WebView 场景壳 document 失焦 → execCommand('copy') 静默失败
 *   （Chromium 要求 document 有焦点）。第一次成功（壳有焦点），后续失败（焦点在插件 WebView）。
 *   → 主路径走 Electron 主进程 clipboard.writeText()（OS 级 API，零限制）。
 *   → execCommand('copy') 作为极端情况 fallback（window.linkdesk 不可用时）。
 */

/** 写入文本到剪贴板——主路径走 Electron 主进程 API，fallback 走 execCommand('copy') */
export function writeClipboardText(text: string): void {
  // 主路径：Electron 主进程 clipboard.writeText()——OS 级，不检查焦点/手势
  const linkdesk = window.linkdesk;
  if (linkdesk?.clipboard?.writeText) {
    linkdesk.clipboard.writeText(text);
    return;
  }

  // Fallback：隐藏 textarea + execCommand('copy')——需要 document 有焦点
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  // 防止 iOS 缩放 + 读屏干扰
  el.setAttribute("readonly", "");
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand("copy");
  } catch {
    // execCommand 极端情况失败——静默
  }
  document.body.removeChild(el);
}
