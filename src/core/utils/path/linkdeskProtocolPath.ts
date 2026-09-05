/**
 * linkdesk:// 协议路径解析——纯函数（E5.7#82 从 electron/protocol.ts 抽出，供 vitest 实证）。
 *
 * URI 格式：linkdesk://<pluginId>/<相对路径> → <代码根>/<pluginId>/<相对路径>
 * 2026-09-05 塌平单根：代码根直接含插件目录（root-direct）——原 subdirs 参数（E5.7#69 的
 * builtin>user 逐子目录扫描）随双目录废除而删。安全：路径穿越（.. 任意形态）拒绝。
 */
import * as path from "path";
import * as fs from "fs";

export type LinkdeskPathResult =
  | { ok: true; fullPath: string }
  | { ok: false; status: 403 | 404 };

export function resolveLinkdeskPath(pluginsDir: string, urlPath: string): LinkdeskPathResult {
  // 安全检查：拒绝路径穿越（../ 或 ..\）
  if (urlPath.includes("..")) return { ok: false, status: 403 };
  const fullPath = path.join(pluginsDir, urlPath);
  if (!fs.existsSync(fullPath)) return { ok: false, status: 404 };
  return { ok: true, fullPath };
}

/** E6#7（1.2-4）：多根解析的一个根——root = 代码根（2026-09-05 塌平后直接含插件目录，无 subdirs 层） */
export interface LinkdeskPathRoot {
  root: string;
}

/**
 * E6#7（1.2-4）：多根 linkdesk:// 路径解析——单根 root-direct 命中的有序叠加，先命中先赢
 * （app 根在前 → userData 同名遮蔽语义与 plugin-file-service 一致）。".." 穿越仍在最外层拒绝（403）。
 * 纯函数——供 vitest 实证 + protocol.ts 双根接线。
 */
export function resolveLinkdeskPathMulti(roots: LinkdeskPathRoot[], urlPath: string): LinkdeskPathResult {
  if (urlPath.includes("..")) return { ok: false, status: 403 };
  for (const { root } of roots) {
    const res = resolveLinkdeskPath(root, urlPath);
    if (res.ok) return res;
  }
  return { ok: false, status: 404 };
}
