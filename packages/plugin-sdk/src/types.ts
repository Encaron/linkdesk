/**
 * window.linkdesk.* 类型出口——E6#2。
 *
 * **从 E5.8 生成契约派生，不手写第二份真相源**：直接转发 `@linkdesk/contracts`（判据⑧归一性）。
 * 契约 `linkdesk.d.ts` 自带 `export {} + declare global { Window.linkdesk: LinkDeskAPI }`；
 * 本文件经 `export type *` 把契约拉进消费方 program → 全局 `window.linkdesk.` 自动有类型（E6#2b），
 * 作者无需手写 global.d.ts。契约漂移 → 消费方 tsc 立即红，不存在两份真相源失步。
 *
 * 2026-08-20 E5.8#22.6 提示：@linkdesk/contracts 已建好且 types 直指生成契约——plugin-sdk 直接
 * dependencies 转发即可，不必复制生成物。dev 过渡态 = file: 本地引用；#2.5 真发布后改 ^0.1.0（registry）。
 */
export type * from "@linkdesk/contracts";
