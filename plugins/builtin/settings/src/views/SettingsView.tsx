/**
 * SettingsView——E5.8#39.5 声明制视图注册入口。
 * 与 entry（src/index.tsx）同源——重导出壳 SettingsView。
 * 存在理由：contributes.views[].render 必须落在 viewRenderModules glob（builtin 下 src/views 子目录）
 * 内才能被池 PluginComponent 按 renderPath O(1) 解析——entry（src/index.tsx）不在该 glob。
 * 声明 floatingPanel.viewId=settings 后，壳内悬浮面板经此路径渲染设置页（I8-3 声明即出现）。
 */
export { default } from "@src/components/views/settings/SettingsView";
