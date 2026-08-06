/**
 * 全局类型声明——window.linkdesk 类型安全。
 * E5#89：消除 (window as any).linkdesk，让 TypeScript strict 模式发挥作用。
 *
 * 由 preload-shell.ts / preload-plugin.ts 通过 contextBridge 注入。
 * 注：目前使用宽松类型——消除 any 断言后，后续逐步收窄到 LinkDeskAPI 精确类型。
 */
declare global {
  interface Window {
    /** 插件 API——对标 VS Code vscode 命名空间 */
    linkdesk: Record<string, any>;
  }
}

export {};
