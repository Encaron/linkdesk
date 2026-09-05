/**
 * 插件目录约定——唯一定义位置。
 *
 * 2026-09-05 塌平：`plugins/builtin/` + `plugins/user/` 双目录废除（用户拍板「全面塌平」——
 * 内置≠特殊插件，仅 `core: true` 声明字段区分，见 01-插件独立构建/09-插件目录塌平决策.md）。
 * repo / userData / 发货夹三层全平铺 `plugins/<id>` / `<id>.linkdesk-plugin`。
 *
 * 历史遗留清理：原 PLUGIN_SUBDIRS（["builtin","user"]）+ 三个 glob 工厂函数
 * （pluginJsonGlobPatterns/pluginEntryGlobPatterns/pluginStatusBarGlobPatterns）随双目录废除——
 * 工厂零消费者（import.meta.glob 须字符串字面量做静态分析，消费方 state.ts/PluginComponent/
 * PoolStatusBar 一直手写 spread，见其文件内注释），PLUGIN_ENTRY_FILES/PLUGIN_STATUSBAR_FILES
 * 仅被死工厂引用，一并删。
 */

/** 插件根目录名（相对于项目根 / resources / userData） */
export const PLUGINS_DIR = "plugins";
