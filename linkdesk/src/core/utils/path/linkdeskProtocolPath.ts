/**
 * linkdesk:// 协议路径解析——纯函数（E5.7#82 从 electron/protocol.ts 抽出，供 vitest 实证）。
 *
 * URI 格式：linkdesk://<pluginId>/<相对路径> → <pluginsDir>/<子目录>/<pluginId>/<相对路径>
 * 解析顺序：pluginsDir 直接命中 → 逐子目录扫描（E5.7#69，builtin > user > 其他字母序；
 * 子目录命中覆盖根目录命中——与 protocol.ts 原实现逐字节一致）。
 *
 * 这是 E6 打包格式适用性的关键一环：预构建 chunk（vite.config 多入口产物
 * dist/plugins/<sub>/<id>.js，插件目录内约定为 `<id>.js`）经
 * linkdesk://{id}/{id}.js 由子目录扫描透明命中——解析方（loader）无需知道
 * 插件在哪个子目录。安全：路径穿越（.. 任意形态）拒绝。
 */
import * as path from "path";
import * as fs from "fs";

export type LinkdeskPathResult =
  | { ok: true; fullPath: string }
  | { ok: false; status: 403 | 404 };

export function resolveLinkdeskPath(
  pluginsDir: string,
  subdirs: string[],
  urlPath: string,
): LinkdeskPathResult {
  // 安全检查：拒绝路径穿越（../ 或 ..\）
  if (urlPath.includes("..")) return { ok: false, status: 403 };

  let fullPath = path.join(pluginsDir, urlPath);
  for (const sub of subdirs) {
    const candidate = path.join(pluginsDir, sub, urlPath);
    if (fs.existsSync(candidate)) {
      fullPath = candidate;
      break;
    }
  }

  if (!fs.existsSync(fullPath)) return { ok: false, status: 404 };
  return { ok: true, fullPath };
}
