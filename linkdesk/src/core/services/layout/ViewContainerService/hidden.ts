/**
 * ViewContainerService 隐藏持久化域——自 collapsed.ts 同款模式拆出（E5.8#34 容器切换器）。
 * loadHiddenState/setHidden 二方法模块化——只走 PluginStateService，零实例私有状态依赖
 * （同 collapsed.ts 委派式拆分模式：模型 _hidden 运行时真相 + 本域持久化落盘）。
 * 依赖方向：hidden → plugins/PluginStateService（getPluginStateValue/setPluginStateValue/APP_PLUGIN_ID）。
 */

import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../../plugins/PluginStateService";

/** 加载持久化的隐藏状态——模型创建时种子 _hidden（重启隐藏态保持） */
export function loadHiddenState(): Set<string> {
  const saved = getPluginStateValue<string[]>(APP_PLUGIN_ID, "hiddenViews") ?? [];
  return new Set(saved);
}

/** 保存单个 view 隐藏状态（visible=false = 隐藏） */
export function setHidden(viewId: string, hidden: boolean): void {
  const saved = loadHiddenState();
  if (hidden) saved.add(viewId);
  else saved.delete(viewId);
  setPluginStateValue(APP_PLUGIN_ID, "hiddenViews", [...saved]).catch((e) => { console.error("[ViewContainer] 保存隐藏状态失败:", e); });
}
