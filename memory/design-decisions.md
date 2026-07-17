---
name: design-decisions
description: V3 已确认的设计决策——不要重新争论
metadata:
  type: project
---

# V3 设计决策

1. **Tauri + React。** 不是 WPF。卡片布局/拖拽/主题/双语全是 Web 舒适区。
2. **协议：`[卡片ID, 字段...]`。** 没有 type，没有 subType，没有方向区分。
3. **三栏布局。** 左图标栏 → 左侧栏 → 右主区。和 V2 一致。
4. **图标栏 = 视图切换器。** 📟 终端 / 📊 工作台 / 🎨 OLED / ⚙ 设置。没有标签页。
5. **默认打开终端视图。** 串口助手的根是收发。
6. **OLED 是独立视图，不是卡片组件。** 不遵循 Card Shell + Component 架构。
7. **接收区 CodeMirror 6，发送栏 Monaco 单行模式。**
8. **拖拽句柄 ⠿ 常驻。** 不需要进入编辑模式即可拖拽重排。
9. **编辑模式只做两件事：插入热区和删除按钮。**
10. **多 workspace 文件。** 不同设备 = 不同 JSON 文件，顶栏下拉框切换。
11. **! 卡片定义可选。** 不发 → generic 卡 + 用户手动配。发了 → 自动配好外观。
12. **V2 旧协议兼容。** 翻译层自动映射旧格式到新路由。
13. **React 渲染进程纯浏览器环境。** 不碰 Node.js API（除主进程 IPC）。
14. **主进程只做串口 I/O。** Node.js serialport（Tauri 的 Rust 串口是主路径，Electron 备用）。
