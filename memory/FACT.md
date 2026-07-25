# LinkDesk 当前状态

## 身份
LinkDesk — Electron + React 通用容器。核心是空壳，万物皆插件。比 VS Code 更高级：VS Code 被 Monaco 编辑器锚死，LinkDesk 无锚。

## 当前阶段
- **Tauri P1-P6** ✅ 全部完成（Git 锚点 `52730fc`，分支 `phase6` 冻结）
- **E1 Electron 迁移** ✅ 全部完成（7 步 + 4 打包补丁）
- **E2a ErrorBoundary** ✅ 完成（6 任务）
- **E2b 终端归一化** ✅ 完成（8 任务）
- **E2c 基础设施** 🔄 进行中（#13 FileService）
- **E3 多 WebView + 壳收尾** 📋 待执行（43 任务）

## 架构迁移决策
- 2026-07-24 决定从 Tauri 迁 Electron
- 核心理由：WebContentsView stable vs Tauri add_child unstable
- 插件模型保持 React 组件自由渲染模式，不走 Extension Host + api.* 白名单
- 当前单 WebView，E3a 做进程隔离

## 演进路径（已验证）
1. V2 WPF 串口助手（方括号协议写死）
2. V3 初期 = V2 翻版（Tauri + React）
3. 借鉴 VS Code 加入标签页分屏
4. 发现协议可替换 → 协议插件化
5. 协议能插件化 → 万物皆插件（6 类插件模型）
6. 核心无知原则：核心不知道软件是干什么的
7. 改名 serial-v3 → linkdesk
8. Tauri add_child unstable → 决定迁 Electron

## 最难啃的骨头（已确认）
- E3a #30 terminal 插件 IPC 化（跨进程 stale closure 无 ref 解法）
- E3a #27 IpcBridge 串口高频数据扇出
- E3a #29 MainContent 从 React render 变 WebContentsView 管理
- 串口助手用真实物理板子测试——虚拟数据逼不出的边界条件

## 关键文件
- 工程目录：`E:\linkdesk`
- 记忆目录：`C:\Users\fengy\.claude\projects\e--linkdesk\memory\`
- E1-E3 文档：`docs/02-Electron架构/`
- 当前分支：`electron`

## 记忆操作约定
- 用户说"存记忆"/"看记忆" → 指 `C:\Users\fengy\.claude\projects\e--linkdesk\memory\` 目录
- 存记忆 = 在该目录写/编辑 .md 文件 + 更新 MEMORY.md 索引
- 看记忆 = 读取该目录下的文件
- 这不是 CherryStudio 的记忆，不是 mcp__agent-memory 工具的记忆
