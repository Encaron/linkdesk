/**
 * 插件资产 `linkdesk://` URL 构建 —— **唯一实现**（2026-11-24 迁入共享层）。
 *
 * 为什么住共享层：共享件 `plugin-icon/iconUtils.ts` 要构建资产 URL，但 R6 禁止共享件 import 壳 core；
 * 而「URL 形状」又只许一份（主进程协议解析 / 核心贡献解析 / 共享图标渲染同源）。
 * 解法 = 纯函数下沉到共享层，core 反向 re-export（core→shared 有 `OpenSettings` 先例）。
 *
 * 零依赖零副作用：不 import 任何模块（`\`→`/` 与去 `./` 在本文件内联——资产路径是**相对路径**，
 * 不需要 core normalizePath 的盘符大写语义）。
 */

/**
 * 获取插件资产的 linkdesk:// URL。
 * @param pluginId 插件身份（plugin.json pluginId）
 * @param relativePath 插件根相对路径（`README.md` / `resources/icon.svg` / `docs/`）；空 = 插件根
 */
export function getPluginAssetPath(pluginId: string, relativePath: string): string {
  // 共享层不能 import 壳 core 的 normalizePath（R6）——这里只做「\ → /」，资产路径是相对路径，
  // 不需要盘符大写等 core 语义。split/join 而非 replace(/\\/g)：避免与 no-raw-path-replace 的正则写法混淆。
  const normalized = relativePath.split("\\").join("/").replace(/^\.\//, "");
  return `linkdesk://${pluginId}/${normalized}`;
}
