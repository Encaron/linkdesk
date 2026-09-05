/**
 * Python 语言支持——纯声明式插件。
 *
 * 本插件零逻辑代码。语法高亮走 Monaco 内置 TextMate grammar，
 * 跨文件跳转/补全/诊断走 pyright LSP——由编辑器自动启动。
 * 所有配置均在 plugin.json 的 langDefs 声明。
 */
import React from "react";

const PythonPlugin: React.FC<{ isActive: boolean }> = () => {
  return null; // 纯声明——无 UI
};

export default PythonPlugin;
