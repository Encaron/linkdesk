---
name: from-v2
description: V2 踩过的通用坑——需要移植到 V3 语境的经验教训
metadata:
  type: reference
---

# 从 V2 继承的经验

V2 的 41 条硬约束拆开看：约 20 条是 WPF 专有（作废），约 21 条是通用设计原则（保留）。

## 作废的（WPF 专有，V3 不存在这些问题）

- BAML 编译缓存导致 TypeConverterMarkupExtension 崩溃
- DynamicResource 在 Popup/ContextMenu 中找不到资源
- FindResource 缺 key 抛异常（不是返回 null）
- XAML key 不能含逗号/等号
- Path.Stroke 用 Binding 导致崩溃
- 图标栏 Button 悬停出现系统蓝框
- 移动 XAML 文件到子目录 → 启动崩溃
- SnapShapeToPixel + EdgeMode.Aliased → 直线消失
- 每帧重建 Path 几何 → 卡顿
- 代码创建的 Popup 必须设 PlacementTarget

## 保留的（通用原则，写法随框架更新）

| V2 原则 | V3 翻译 |
|------|------|
| DataConverter 四个方法算法不可改 | 照搬为 TypeScript 纯函数 |
| 编辑模式下冻结数据更新（停定时器） | 编辑模式下跳过 OnData 分发 |
| 存原 key 不存翻译结果 | React state 存中文 key，`t()` 显示 |
| 组件拖拽用轻量 Transform，松手重建 | 拖拽用 CSS transform（GPU），松手更新 react-grid-layout 状态 |
| 串口发送节流（不每像素发） | SendQueue + throttle 50ms |
| 离线超时检测（LastSeen > 2s → 灰显） | 同逻辑，Timer → setInterval |
| 卡片分三层色：框架色/类型色/条件色 | CSS 变量赋值分三层：`--card-bg` / `--accent` / 条件覆盖 |
| 删除后不自动重建（DeletedNames） | workspace.json 里删除即永久，除非用户手动加回 |
| 编辑模式下切视图自动退出编辑 | 同逻辑，React Router/state 切换时检测 |
| prefs 和 workspace 独立存储 | prefs.json（全局）+ workspace.json（卡片布局） |
