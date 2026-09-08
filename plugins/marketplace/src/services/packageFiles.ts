/**
 * packageFiles — 已装插件包内文件读取（E6#30.6b/30.6e「已装读包通道 K2」）。
 *   已装 README.md / CHANGELOG.md = 插件安装目录内同名文件：plugins.resolvePath(id) → 绝对根目录
 *   （主进程解析，plugins 命名空间双端同面——contracts linkdesk.d.ts:1128），再 filesystem.readTextFile
 *   (<root>/<name>) 读取。复用既有 API，零新 API（04-详情页设计 §4.2 K2）。
 *
 *   ⚠️ 命名注：04 §4.2 写的「workspace.readTextFile」是**壳侧** API 名；marketplace 跑在池渲染进程，
 *   readTextFile 归 **filesystem** 域（electron/preload-pool/namespaces-data.ts:43）——本模块以实机面为准。
 *
 *   失败统一返 null：resolvePath 对未知 id 返回伪造兜底路径 → readTextFile ENOENT；未打包该文件的插件
 *   同理 → 调用方降级（详情 description / 空态）。读包零路径守卫——只读不改，与 guardPoolWrite 写守则正交。
 */

const lk = () => window.linkdesk;

export async function readInstalledPackageFile(pluginId: string, fileName: string): Promise<string | null> {
  const fs = lk()?.filesystem;
  const plugins = lk()?.plugins;
  if (!fs?.readTextFile || !plugins?.resolvePath) return null;
  try {
    const root = await plugins.resolvePath(pluginId);
    if (typeof root !== "string" || !root) return null;
    return await fs.readTextFile(`${root.replace(/[\\/]+$/, "")}/${fileName}`);
  } catch {
    return null;
  }
}
