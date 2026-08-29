/**
 * 受控外观图片 URL 构建与解析——E5.8#64：userData/appearance 拷贝入库的图（importImage）
 * 经 `linkdesk-userdata://` 协议加载。纯函数零副作用，壳/electron 双进程 graph 皆可编
 * （同 pluginAssetPath.ts 先例——electron tsconfig 是 CommonJS，import.meta 依赖不可入）。
 *
 * 🔥 为什么需要：importImage 把用户选图拷进 `<userData>/appearance/`，旧版返回 plain 绝对路径
 * （`C:\...\AppData\Roaming\linkdesk\appearance\xxx.png`）。sandboxed pool 不能读 file://
 * 绝对路径——Chromium 归一化 file:// 后拦截，console 报「Not allowed to load local resource」
 * （用户实机 bug 13）。主进程注册特权协议映射 userData/appearance（白名单目录 + 只读），
 * 值统一走协议 URL 才能在沙箱里加载。
 *
 * 格式：`linkdesk-userdata://appearance/<编码文件名>` → `<userData>/appearance/<文件名>`
 * （与 linkdesk://{pluginId}/{相对路径} 同族；appearance 子路径 + encodeURIComponent 编码）。
 */

import { normalizePath } from "./pathUtils";

/** 受控外观图片协议 scheme——linkdesk-userdata://appearance/<file> 由主进程 protocol.handle 解析 */
export const USERDATA_IMG_SCHEME = "linkdesk-userdata";

/** 受控子目录——映射到 `<userData>/appearance/`（appearance-handlers importImage 拷贝目标） */
export const APPEARANCE_SUBDIR = "appearance";

/**
 * 受控图片文件名 → linkdesk-userdata:// URL（importImage 返回 / importImage 值持久化统一走此）。
 * 文件名 encodeURIComponent 编码（空格/中文/parens 安全进 URL 路径）。
 */
export function getUserDataImageUrl(basename: string): string {
  return `${USERDATA_IMG_SCHEME}://${APPEARANCE_SUBDIR}/${encodeURIComponent(basename)}`;
}

/**
 * app.backgroundImage 配置值 → CSS background-image 可加载 URL 串（不含 url() 包裹）。
 * 输入可能形态：
 *  - 已 `url("…")` 包裹（旧配置/主题资产）→ 解包取内
 *  - 协议 URL（`linkdesk://` 主题资产 / `linkdesk-userdata://` 受控图 / http(s):// / data:）→ 原样
 *  - 绝对路径（importImage 旧版 plain 路径——唯一写家是 userData/appearance 拷贝）→ basename 映射受控协议
 *  - 相对路径（作者主题内资源路径）→ 原样（作者保证可解析）
 * 返回 null = 不可用（空/纯空白）。
 */
export function resolveBackgroundImageUrl(value: string): string | null {
  const v = normalizePath(String(value).trim());
  if (!v) return null;
  // 已 url() 包裹 → 解包（url(inner) / url("inner") 两种都解）
  let inner = v.startsWith("url(") && v.endsWith(")") ? v.slice(4, -1).trim() : v;
  inner = inner.replace(/^["']|["']$/g, "");
  if (!inner) return null;
  // scheme:// URL（linkdesk:// / linkdesk-userdata:// / http(s):// …）——原样返回
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(inner)) return inner;
  // data: URI——原样返回
  if (/^data:/i.test(inner)) return inner;
  // 绝对路径（Windows 盘符 `C:/…` 或 POSIX `/…`）→ basename 映射进受控协议命名空间。
  // 安全前提：app.backgroundImage 的唯一绝对路径写家是 importImage（拷进 userData/appearance），
  // 旧版 plain 值 = 受控拷贝 → basename 必在该目录。
  if (/^[A-Za-z]:\//.test(inner) || inner.startsWith("/")) {
    const base = inner.split("/").filter(Boolean).pop() ?? "";
    return base ? getUserDataImageUrl(base) : null;
  }
  // 相对路径（主题资产）——原样返回
  return inner;
}
