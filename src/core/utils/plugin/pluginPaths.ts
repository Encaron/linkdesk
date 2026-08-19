/**
 * 插件目录约定——唯一定义位置。
 *
 * E5#35：glob 模式常量化。glob 字面量曾散落 loader.ts（10 处）
 * 与 per-tab 入口 plugin-shell-main.tsx（2 处，已随 E5.7#40 删除）。
 * 收束为工厂函数——改 PLUGIN_SUBDIRS 或 PLUGIN_ENTRY_FILES
 * 则所有 glob 自动覆盖，不需改任何消费方。
 */

/** 插件根目录名（相对于项目根） */
export const PLUGINS_DIR = "plugins";

/**
 * 插件子目录——静态 glob 扫描范围（import.meta.glob 构建时展开，仅 builtin/user）。
 * E5.7#69：运行时插件发现不再限此表——主进程 scanPluginSubdirs（electron/services/plugin-file-service.ts）
 * 扫描全部子目录（builtin > user > 其他字母序）；glob 外的插件走 resolvePath 动态 import。
 * 本表只描述构建期静态打包范围，不是运行期白名单。
 */
export const PLUGIN_SUBDIRS = ["builtin", "user"] as const;

/** 插件入口文件约定——loader 按此顺序查找 */
export const PLUGIN_ENTRY_FILES = ["index.tsx", "src/index.tsx"] as const;

/** 插件 StatusBar 组件约定 */
const PLUGIN_STATUSBAR_FILES = ["statusBar.tsx", "src/statusBar.tsx"] as const;

/* ── 工厂函数 ── */

/**
 * 生成 plugin.json glob 模式。
 * @param eager true=构建时加载（用于 manifest），false=懒加载
 * @param basePrefix glob 路径前缀——消费方按自身相对项目根位置传入（loader.ts 用 "../../"）
 */
export function pluginJsonGlobPatterns(
  eager: boolean,
  basePrefix = "../../",
): Record<string, { eager: boolean }> {
  const patterns: Record<string, { eager: boolean }> = {};
  for (const sub of PLUGIN_SUBDIRS) {
    patterns[`${basePrefix}${PLUGINS_DIR}/${sub}/*/plugin.json`] = { eager };
  }
  return patterns;
}

/**
 * 生成插件入口组件 glob 模式（index.tsx + src/index.tsx）。
 */
export function pluginEntryGlobPatterns(
  eager: boolean,
  basePrefix = "../../",
): Record<string, { eager: boolean }> {
  const patterns: Record<string, { eager: boolean }> = {};
  for (const sub of PLUGIN_SUBDIRS) {
    for (const entry of PLUGIN_ENTRY_FILES) {
      patterns[`${basePrefix}${PLUGINS_DIR}/${sub}/*/${entry}`] = { eager };
    }
  }
  return patterns;
}

/**
 * 生成 StatusBar 组件 glob 模式（statusBar.tsx + src/statusBar.tsx）。
 */
export function pluginStatusBarGlobPatterns(
  eager: boolean,
  basePrefix = "../../",
): Record<string, { eager: boolean }> {
  const patterns: Record<string, { eager: boolean }> = {};
  for (const sub of PLUGIN_SUBDIRS) {
    for (const file of PLUGIN_STATUSBAR_FILES) {
      patterns[`${basePrefix}${PLUGINS_DIR}/${sub}/*/${file}`] = { eager };
    }
  }
  return patterns;
}
