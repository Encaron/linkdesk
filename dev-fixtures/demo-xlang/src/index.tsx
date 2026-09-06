import React from "react";

// E6#15m 纯声明语言插件（仿 plugins/python 的 entry 形态）：零 UI，plugin.json 的
// contributes.langDefs 才是身份来源（硬约束 11）。entry 存在只为让 SDK 打包器有一个可编译表面。
const DemoXlangPlugin: React.FC<{ isActive: boolean }> = () => {
  return null;
};

export default DemoXlangPlugin;
