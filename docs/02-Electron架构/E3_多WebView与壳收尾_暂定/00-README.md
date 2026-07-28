# E3 — 多 WebView + 壳收尾 🏁 封站

> 2026-07-24~28。**E2 服务补齐后 = E3。架构最后一站。此后框架永远不改——任何新功能 = 写插件。**
> **🏁🏁🏁 2026-07-28 封站。E3a-E3j 核心任务全部完成。**

---

## 子任务

| # | 内容 | 任务数 | 行数 |
|:--:|------|:--:|:--:|
| E3a | **多 WebView 进程隔离**——每个 view 插件独立 WebContentsView | 13 | ~695 |
| E3b | **主题引擎跨进程**——切主题后所有 WebView 同步 CSS 变量 | 57 | ~470 |
| E3c | **语言引擎跨进程**——切语言后所有 WebView 同步 i18n | 13 | ~320 |
| E3d | **Profile + 激活**——多 Profile 切换 + activationEvents 按需激活 | 3 | ~250 |
| E3e | **通知系统全功能**——进度条/DND/Notification Center | 5 | ~575 |
| E3f | **壳 UI 收尾**——TitleBar/齿轮菜单/快捷键/ColorPicker/SelectBox/FileDecoration | 55/70 | ~1,270 |
| E3g | **通用 API + V2 兼容**——StatusBarItem/共享图标/☰完整版 | 3/4 | ~240 |
| E3h | **美化专题**——MenuRenderer 归一化 + TitleBar 扩展 + when 禁用态 | 4/5 | ~150 |
| E3i | **插件改名**——`terminal` → `serial-monitor` 全量净化 | 4 | ~110 |
| E3j | **核心收口**——IPC 消息队列 + `linkdesk` API 边界 + 双份渲染根因 | 12 | ~230 |

> E3j #81（双份渲染根因）是 E3 真正的最后一个任务。ESLint 机械防线 5 条。CLAUDE.md 硬约束 19 条。
> 支线 `serial-port-refresh`：7 commits（多标签页数据串流 + 端口刷新 + i18n）。

## 设计文档

| # | 文档 | 内容 |
|:--:|------|------|
| 1 | `01-E3a-多WebView进程隔离.md` | WindowManager + IpcBridge + preload + SidebarTabSync + 4 插件迁移 |
| 2 | `02-E3b-主题引擎跨进程.md` | 🔥 设计方案 + 敌对审计加固（13 漏洞 + 扩展审计 19 条目） |
| 3 | `03-E3c-语言引擎跨进程.md` | LanguageRegistry + 两层退路 + i18n 同步 + E3b 教训预检 |
| 4 | `04-E3d-Profile与激活.md` | ProfileService 五维验证 + activationEvents + extensionDependencies |
| 5 | `05-E3e-通知系统.md` | 进度条 + 来源过滤/DND + Notification Center |
| 6 | `06-E3f-壳UI收尾.md` | TitleBar + 齿轮菜单 + 快捷键 + ColorPicker + SelectBox + FileDecoration |
| 7 | `06.5-ColorPicker-UI布局规格.md` | ColorPicker 精确像素 token + 状态矩阵 |
| 8 | `07-E3g-API与V2兼容.md` | StatusBarItem + 共享图标 + ☰ 完整版 |
| 9 | `09-E3h-美化专题.md` | MenuRenderer 归一化 + TitleBar 扩展 + when 条件 + CSS 审查 |
| 10 | `10-E3i-插件改名.md` | terminal → serial-monitor 全量净化 + 布局迁移 |
| 11 | `11-E3j-双份渲染完整记录.md` | 🔥 events 归一化 + #77b 假设推翻 + #81 五轮回退 + 三条根因 |
| 🔥 | `08-执行清单.md` | 全部任务执行记录 |

---

> **← 上一 Phase：** `../E2_底层加固与侧栏扩展_暂定/`
> **→ 下一 Phase：** `../E4_文件树与编辑器_暂定/`
> **🏁 E 编号到此为止。** E4 是最后一个编号。此后全是插件。
