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

/** E6#7（1.2-4）：双根解析的一个根——root = 代码根，subdirs = 该根下插件子目录（scanPluginSubdirs 产物，含优先序） */
export interface LinkdeskPathRoot {
  root: string;
  subdirs: string[];
}

/**
 * E6#7（1.2-4）：多根 linkdesk:// 路径解析——单根 resolveLinkdeskPath 的有序叠加。
 * 逐根调用单根逻辑（root-direct → subdir 扫描，行为字节一致），先命中先赢（app 根在前 →
 * userData 同名遮蔽语义与 plugin-file-service 一致）。".." 穿越仍在最外层拒绝（403）。
 * 纯函数——供 vitest 实证 + protocol.ts 双根接线（旧 resolveLinkdeskPath 与其 7 个单测保留不动）。
 */
export function resolveLinkdeskPathMulti(
  roots: LinkdeskPathRoot[],
  urlPath: string,
): LinkdeskPathResult {
  if (urlPath.includes("..")) return { ok: false, status: 403 };
  for (const { root, subdirs } of roots) {
    const res = resolveLinkdeskPath(root, subdirs, urlPath);
    if (res.ok) return res;
  }
  return { ok: false, status: 404 };
}
