/**
 * 全局类型声明——window.linkdesk 类型安全。
 * E5#89：消除 (window as any).linkdesk，让 TypeScript strict 模式发挥作用。
 * E5.7#97：收窄到 LinkDeskAPI 精确类型（原 Record<string, any> 宽松占位）——
 * linkdesk-api.ts 已成为 preload 双端注入面的完整契约。
 *
 * 由 preload-shell.ts / preload-pool.ts 通过 contextBridge 注入。
 */
import type { LinkDeskAPI } from "../core/api/linkdesk-api";

declare global {
  interface Window {
    /** 插件 API——对标 VS Code vscode 命名空间 */
    linkdesk: LinkDeskAPI;
  }
}

export {};
