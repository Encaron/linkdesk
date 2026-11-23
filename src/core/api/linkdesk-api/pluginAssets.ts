/**
 * linkdesk-api plugin-assets domain — 2026-11-24 语义归属（M3 / A2）。
 *
 * 插件包内资产的 URL **形状与协议**是宿主知识：`linkdesk://{pluginId}/{相对路径}` 由主进程协议处理器
 * 解析到插件目录。市场过去自行拼 `linkdesk://${id}/${dir}`——换协议/加校验即全生态漂移。
 *
 * 唯一实现 = `src/core/utils/path/pluginAssetPath.ts` 的 `getPluginAssetPath`（主进程协议解析同源）；
 * 本命名空间只把它暴露给池插件（同步纯函数，零 IPC）。
 */

/** Plugin-packaged asset URL surface — pool-only (the shell renderer calls the util directly). */
export interface PluginAssetsAPI {
  pluginAssets: {
    /** Build the controlled `linkdesk://` URL for a plugin-packaged asset (2026-11-24 A2/M3).
     *  @param pluginId plugin identity (`plugin.json` `pluginId`)
     *  @param relativePath plugin-root-relative path (`README.md`, `resources/icon.svg`, `docs/`); empty/omitted = plugin root.
     *  Normalizes `\` → `/` and strips a leading `./`. ⛔ A plugin must not concatenate the protocol itself (K9). */
    getUrl(pluginId: string, relativePath?: string): string;
  };
}
