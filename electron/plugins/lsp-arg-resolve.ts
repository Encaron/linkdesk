/**
 * E6#15e：langDef.lsp.args 相对路径 → 插件目录绝对路径（注册处一次性换算）。
 *
 * 纯函数（无 electron import，可直接 vitest）。在 plugin-manifest-loader 把 langDef 注册进
 * LangDefRegistry 之前调用一次——「插件根 → 绝对路径」这个换算全仓库只写这一处（归一化）。
 * 换算后 registry / IPC / spawn 全程持绝对路径：spawn 侧（lsp-handlers）纯透传绝对 args，
 * 不再做任何 ASAR 路径搬运——E5#114d resolveLspArg/extractPackageFromAsar/copyDirFromAsar/
 * _asarPkgCache 安全网已随 E6#15k 整删（args 注册即绝对，.asar 分支永假 = 纯死代码）。
 *
 * 语义：只改「路径式」arg（含 / 或 \ 分隔符 / 绝对路径 / 脚本扩展名）——flag 类（"--stdio"）
 * 原样保留。与 scripts/check-lsp-deps.mjs 的 isPathLike 同判定，双处写清同一不变式。
 *
 * 契约：plugin.json 的 lsp.args 相对路径——**以插件根目录为基准解析**（锚词「插件根目录为基准」，
 * 单点权威门禁 scripts/check-lsp-args-base.mjs 钉 schema×3 / SDK / check-lsp-deps / 本文件 + 单测，
 * E6#15l——基准语义任何一处改漏 → check 红灯）。python 插件即示例：args 里 "node_modules/pyright/
 * dist/pyright-langserver.js" → <插件根>/node_modules/pyright/dist/pyright-langserver.js，随插件自带
 * （打包器按 lsp.args 引用把 node_modules/pyright 打进 .linkdesk-plugin，见
 * packages/plugin-sdk/src/vite-config.ts includeLspRuntimePackages）。
 */

import { existsSync } from "node:fs";
import * as path from "path";

/** 路径式判定——相对路径含分隔符 / 绝对路径 / 脚本扩展名（与 scripts/check-lsp-deps.mjs isPathLike 同语义） */
const PATH_SEP = /[\\/]/;
const BINARY_EXT = /\.(js|mjs|cjs|cmd|exe|bat)$/i;

export function isPathLikeArg(arg: string): boolean {
  return PATH_SEP.test(arg) || path.isAbsolute(arg) || BINARY_EXT.test(arg);
}

/**
 * 把 lsp.args 里相对插件根的路径式参数解析为插件目录下绝对路径。
 * @param args      langDef.lsp.args（作者视角相对路径）
 * @param pluginDir 插件根目录（发现层 dirname(plugin.json)，dev = 仓库 plugins/<id>，prod = {userData}/plugins/<id>）
 * @param exists    存在性判定（默认 fs.existsSync）——可注入以便单测 hermetic（不依赖磁盘 hoist 布局）
 * @returns 换算后的 args；无路径式相对参数 / 全绝对 / args 缺失 → 原样返回（无新分配）
 */
export function resolveLspArgsToPluginRoot(
  args: string[] | undefined,
  pluginDir: string,
  exists: (p: string) => boolean = existsSync,
): string[] | undefined {
  if (!args) return undefined;
  let changed = false;
  const out = args.map((arg) => {
    if (typeof arg !== "string" || !isPathLikeArg(arg)) return arg;
    if (path.isAbsolute(arg)) return arg;
    changed = true;
    // node_modules/ 前缀相对 arg：本地存在 → 本地；缺 → 向上 Node 解析找 hoist/父级/仓库根首命中
    // （E6#16 workspaces 化——python 的 pyright 可被提升到仓库根 node_modules，dev 下插件根不再物理持有）。
    // 非 node_modules 前缀相对 arg（作者本地 bin/…）保持插件根基准原样。
    if (!/^node_modules[\\/]/.test(arg)) return path.resolve(pluginDir, arg);
    const local = path.resolve(pluginDir, arg);
    if (exists(local)) return local;
    const seg = arg.replace(/\\/g, "/").split("node_modules/")[1];
    if (seg) {
      let dir = path.dirname(pluginDir); // 插件根本身已由 local 查过——从上一级 node_modules 起找
      for (;;) {
        const up = path.resolve(dir, "node_modules", ...seg.split("/"));
        if (exists(up)) return up;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    return local; // 上下皆无 → 回落插件根基准位（spawn ENOENT 指向期望路径，不静默换成别处）
  });
  return changed ? out : args;
}
