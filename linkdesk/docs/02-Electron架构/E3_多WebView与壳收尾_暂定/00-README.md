# E3 — 多 WebView 与壳收尾

> 2026-07-24。**E2 服务补齐后 = E3。多进程隔离基础设施 + 主题/语言引擎 + Profile。**
> **E3 是架构最后一站。此后框架永远不改——任何新功能 = 写插件。**

---

## 定位

| | |
|---|---|
| Phase | **E3**——架构完工 |
| 输入 | E2 完成——核心服务就绪、侧栏扩展位就绪 |
| 输出 | 每个插件独立 WebContentsView + 主题跨进程广播 + 语言跨进程生效 + Profile 可用 |
| 依赖 | E2 完成 |

## 子任务

| # | 内容 | 来源 | 性质 |
|---|---|---|---|
| E3a | **多 WebView 进程隔离**——每个 view 插件独立 WebContentsView | 原 P7a | 架构核心 |
| E3b | **主题引擎跨进程**——切主题后所有 WebView 同步 CSS 变量 | 原 P7c 的主题部分 | 架构级 |
| E3c | **语言引擎跨进程**——切语言后所有 WebView 同步 i18n | 原 P7c 的语言部分 | 架构级 |
| E3d | **Profile + 激活**——多 Profile 切换 + activationEvents 按需激活 | 原 P7d Profile 部分 | 架构收尾 |
| E3e | **通知系统全功能**——进度条/DND/Notification Center | 原 P7d 通知部分 | 壳级能力 |
| E3f | **壳 UI 收尾**——标题栏/☰菜单/输出面板/欢迎页/Workspace/会话持久化 | 原 P7d 壳完善部分 | 壳收尾 |
| E3g | **通用 API + V2 兼容**——StatusBarItem/共享图标/☰完整版/V2导入 | 原 P7d API/V2 部分 | 壳收尾 |

> 旧 E3d "Profile与壳完善"（18 任务/1,060 行）太胖——拆为 E3d/E3e/E3f/E3g 四个独立可验证的子任务。

## 完工标准（架构终点）

卸载全部插件后，剩下的壳：
- 多进程隔离就绪——创建 WebContentsView 加载任意插件
- ErrorBoundary 兜底——任意插件崩不影响壳和其他插件
- 主题/语言引擎可切换——所有进程同步
- Profile 可用——切换 Profile 后插件/配置/布局独立
- 核心服务齐全——文件/配置/对话框/命令/菜单/快捷键/侧栏扩展位

**此后任何人往 LinkDesk 加功能——写 `plugin.json` + `index.tsx`，扔进 `plugins/` 文件夹。不碰 `src/`，不碰 `electron/`，不碰架构。**

## 任务总览

| 子任务 | 任务数 | 总行数 |
|------|:--:|:--:|
| E3a — 多 WebView 进程隔离 | 12 | ~670 |
| E3b — 主题引擎跨进程 | 5 | ~290 |
| E3c — 语言引擎跨进程 | 5 | ~240 |
| E3d — Profile 与激活 | 3 | ~250 |
| E3e — 通知系统全功能 | 5 | ~230 |
| E3f — 壳 UI 收尾 | 9 | ~450 |
| E3g — API + V2 兼容 | 4 | ~240 |
| **合计** | **43** | **~2,370 行** |

任务 ID 从 `#24` 到 `#63` + `#25a` + `#29a` + `#32a`，承接 E2 的 `#1`-`#23` + `#12a` + `#12b` + `#13a` + `#13b` + `#17a` + `#19a`-`#19l`。

## 详细设计文档

| # | 文档 | 内容 |
|:--:|------|------|
| 1 | `01-E3a-多WebView进程隔离.md` | WindowManager + IpcBridge + preload + SidebarTabSync 归一化 + 四个插件逐个迁移（12 任务） |
| 2 | `02-E3b-主题引擎跨进程.md` | ThemeRegistry 三层退路 + CSS 变量广播 + 主题浏览器 + 产品图标主题 |
| 3 | `03-E3c-语言引擎跨进程.md` | LanguageRegistry 两层退路 + i18n 同步 + 语言选择器 + 插件内联翻译 |
| 4 | `04-E3d-Profile与激活.md` | ProfileService 五维验证 + activationEvents + extensionDependencies |
| 5 | `05-E3e-通知系统.md` | 进度条 + 来源过滤/DND + "不再提示" + Notification Center + 分组 |
| 6 | `06-E3f-壳UI收尾.md` | 标题栏暗色化 + ☰ 基础四组 + 齿轮菜单 + 输出面板 + 欢迎页 + Workspace IO + 会话持久化 |
| 7 | `07-E3g-API与V2兼容.md` | StatusBarItem + 共享图标 + ☰ 完整版（快捷键/禁用态/插件菜单） + V2 配置导入 |

## 做完 E3 后的事——不占用编号

```
插件_文件树与编辑器/      ← 第一批消费者插件
插件_工作台与OLED/        ← 第二批消费者插件
插件_地图/               ← 来了就做
插件_逻辑分析仪/          ← 来了就做
...                      ← 无限延续
```

## E2 → E3 承接链

```
E2 建好                              E3 消费
─────────────────────                ─────────────────
ErrorBoundary 全覆盖                  插件 WebView 崩了 → fallback，不白屏
心跳看门狗                            多 WebView 插件死循环 → 心跳检测 + 可单独重载
终端 = 串口工具参考实现                  文件树/主题浏览器参考终端的 IPC 桥接模式——但不照搬串口逻辑
FileService                          文件树读目录 + Monaco 读文件 + 会话持久化写文件
WorkspaceService                     文件树根路径 + Workspace scope 设置
DialogService                        Profile 切换确认 / 插件卸载确认（不再用 window.confirm）
Chord + keybindings                  文件树键盘操作 (F2/Delete/Ctrl+XCV)
                                     主题浏览器 Ctrl+K Ctrl+T
CoreEvents                           文件树监听 onDidChangeFileSystem
                                     WorkspaceService → onDidChangeWorkspaceFolders
侧栏扩展位 (E2d)                      文件树侧栏常驻（sidebarRole: "persistent"）
```

## 历史参考

- 原 P7 设计已吸收到 E3a-E3g + 插件_文件树与编辑器_暂定
- 七个坑分析已吸收到 `01-E3a-多WebView进程隔离.md` 附录

---

> **← 上一 Phase：** `../E2_底层加固与侧栏扩展_暂定/`
> **🏁 E 编号到此为止。** 此后全是插件。
