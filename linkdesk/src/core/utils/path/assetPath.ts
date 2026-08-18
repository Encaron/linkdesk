/**
 * 资产路径解析——单一真相来源。
 *
 * E1 步 7 教训：3 个硬编码绝对路径 bug（Vite base/file-service/iconUtils）
 * 根因都是拼 `/assets/...` 绝对路径，打包后 file:// 协议下解析失败。
 *
 * 使用此函数替代任何手写路径拼接。插件作者的自定义图标也走这条路。
 */
// E5.7#98：import.meta.env 已由 vite/client 类型定型——as any 删除
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

/** 获取应用资产的完整路径（兼容 dev http:// 和打包后 file://） */
export function getAssetPath(relativePath: string): string {
  return `${BASE}${relativePath}`;
}
