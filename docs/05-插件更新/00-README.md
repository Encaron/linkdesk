# 05 — 插件更新

> 2026-09-13 重组定案：原「05-版本更新/官方插件」+「04-出厂制造」留下的插件档案 + 拆出的终端系统/Git 合并至此，改名 **插件更新**。
> **分类退役**：不再有「官方插件/市场插件/内置插件」之分——plugins 目录已铺平，大家都只是普通插件，区别只有 `core:true`（**仅 UI 上禁止点击卸载**，防新手把设置等删了没地方点回来；命令行/工程手段不受限，高手随意，甚至可以自己再做一个设置插件）。
> 软件本体的更新归 [`../04-软件更新/`](../04-软件更新/)。

## 一、每个插件只更新自己

- **版本号各插件独立**（各自 package.json 的 semver），不占软件版本号；插件补丁档案（如 文件树 `FT#` 清单）就是该插件的进度真相源。
- **未来开发工作流**：SDK（`packages/plugin-sdk`）与 `@linkdesk/ui` 已发 npm——单个插件的新版本**在仓外独立工程目录开发**，直接装到安装版上实测，不必回本仓库全量构建。届时为该插件单独建工程目录、单独写新文档；本目录只留「这个插件想往哪更新」的档案，不承担开发目录。

## 二、插件档案索引

| 插件 | 一句话 | 备注 | 档案 |
|:--|:--|:--|:--|
| 文件树 | 资源管理器侧栏（core:true） | 专项补丁独立成套（file-tree 1.0.x），当前在办：打开文件夹侧栏入口 | [文件树/](文件树/00-README.md) |
| 终端系统 | 真正的 shell（PowerShell/cmd/bash），底部面板中的一个面板视图 | 原 v1.2.0 拆出 | [终端系统/](终端系统/00-README.md) |
| Git集成 | Git 状态/暂存/提交 UI | 原 v1.1.0 拆出（菜单补全那一半归 [04 待抉择池](../04-软件更新/待抉择池/菜单补全.md)） | [Git集成/](Git集成/02-Git集成.md) |
| 卡片工作台 | 无限画布仪表盘——10 种卡片 + 网格布局 + 实时数据流 | 7 份完整蓝图 | [卡片工作台/](卡片工作台/00-README.md) |
| OLED | Canvas 逐像素模拟 128×64 OLED 屏幕 | 照抄 E1 串口服务模式 | [OLED/](OLED/00-README.md) |
| AI与智能体 | 内嵌 AI 对话 + 代码补全 + 自主执行任务 | 对标 Copilot Chat | [AI与智能体/](AI与智能体/01-AI与智能体.md) |
| Data-Playground | 数据演示器 | — | [Data-Playground/](Data-Playground/README.md) |
| Marketplace-Store | 插件市场商店视图（橱窗=其顶部「编辑推荐」横幅，已并入作一章） | — | [Marketplace-Store/](Marketplace-Store/00-README.md) |
| Serial-Simulator | 串口模拟器 | — | [Serial-Simulator/](Serial-Simulator/README.md) |
| Snapshot-Share | 快照分享（**普通插件**——旧档案里的「壳级」标记已过时，以本行为准） | — | [Snapshot-Share/](Snapshot-Share/README.md) |
| Theme-Maker | 主题制作器 | ⚠️ **过时**——现主题系统已远超其设想；技术骨架尚可留用，重启前必须重新构思（见其 README 顶部标记） | [Theme-Maker/](Theme-Maker/00-README.md) |

## 三、已销账

| 原条目 | 结论 |
|:--|:--|
| 01-Theme-Carousel-主题轮播（原 04-出厂制造） | 删——主题系统已大迭代，过时 |
| 02-More-Themes-更多主题（原 04-出厂制造） | 删——同上 |
| 06-Plugin-Showcase-插件橱窗（原 04-出厂制造） | 并入 Marketplace-Store 作一章（[03-插件橱窗.md](Marketplace-Store/03-插件橱窗.md)）——它本是商店顶部横幅组件，随 Marketplace 一起分发，不独立成插件 |
