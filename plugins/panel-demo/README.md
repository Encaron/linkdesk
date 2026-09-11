# 面板演示

用来验证「容器位置是声明出来的」的演示插件。

## 这是什么

它在 `plugin.json` 里声明了两个容器，一个挂在**侧栏**、一个挂在**面板**位置；面板里放两块视图：**输出**和**待办**。

它证明的是——`viewsContainers` 写什么位置，壳就把它放哪，核心不写死任何容器。顺带演示了视图标题栏上的**动作按钮**（`titleActions`）：主按钮 + 下拉菜单（添加信息 / 警告 / 错误）+ 清空。

- 插件 ID：`panel-demo`
- 两个容器：`location: "sidebar"` 与 `location: "panel"`
- 演示插件，**可以安全卸载**

## 结构

```
src/views/DemoOutputView.tsx     面板·输出（标题栏动作：添加日志 / 清空）
src/views/DemoTodoView.tsx       面板·待办
src/views/DemoSidebarView.tsx    侧栏视图
plugin.json                      声明（两个容器 + 三块视图 + titleActions）
```
