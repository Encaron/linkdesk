/**
 * E4V#40l EditorContextMenu——编辑器右键菜单注册。
 *
 * 对标 VS Code 编辑器上下文菜单。Monaco 原生菜单保留（剪切/复制/粘贴），
 * 这里注册编辑器专属命令到 editorContext 菜单点（字符串字面量——插件侧不 import 壳模块，见 E5.6#11.5i）。
 */
// E5.6#11.5i：MenuId → 字符串字面量（池独立 WCV 不能 import @src/core）

/** 在插件加载时调用——注册编辑器上下文菜单项 */
export function registerEditorContextMenu(): void {
  window.linkdesk?.menu?.registerItems("editorContext", "editor", [
    {
      command: "editor.goToDefinition",
      group: "navigation",
    },
    {
      command: "editor.peekDefinition",
      group: "navigation",
    },
    {
      command: "editor.findReferences",
      group: "navigation",
    },
    {
      command: "editor.cut",
      group: "clipboard",
    },
    {
      command: "editor.copy",
      group: "clipboard",
    },
    {
      command: "editor.paste",
      group: "clipboard",
    },
    {
      command: "editor.save",
      group: "save",
    },
  ]);
}
