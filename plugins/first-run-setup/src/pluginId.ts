/**
 * 本插件自识 ID——本插件写死自己的 ID **不违反插件独立铁律**：铁律禁止的是壳/core/pluginLoader
 * 写死插件 ID（那会让新插件必须改壳代码）；插件自知的两侧都在插件作者手里。
 *
 * 本插件对这个常量的用途比其他插件更硬：`notifications.show({ source })` 要求**作者显式报自己的 id**
 * （池是单进程共享 realm，preload 无从知道"这次 show() 是哪个插件的树发的"，无法自动注入）——
 * 见 docs/03-插件制造/01-插件API契约.md §3.2 notifications 行。
 */
export const FIRST_RUN_SETUP_PLUGIN_ID = "first-run-setup";
