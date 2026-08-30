# 06-主软件更新（壳更新机制）

> 2026-08-30 建立。**E6 专题：LinkDesk 软件本身（壳）的版本更新机制。**
> 插件侧更新走 E6#33（市场内更新通知 + 版本管理）；**本文档专研壳侧**——软件自身如何发布新版本、用户如何收到、如何查看更新内容、如何延后。两条轨道互不干扰。
> 对应清单任务：E6#57。

---

## 为什么建这个专题

E6 聊的几乎全是**插件侧**（SDK / 市场 / 发布 / 目录 / 更新通知），壳侧「LinkDesk 软件本身怎么更新」一片空白（2026-08-30 用户指出）。

**本地现状（侦察实锤）：**
| 事实 | 实证 |
|:--|:--|
| 版本号 | `package.json` `"version": "0.1.0"`，无 product.json、无 `app.getVersion()` 消费 |
| 打包 | `electron-builder.yml` 只有 NSIS 安装器，**无 update 配置、未接 electron-updater** |
| 更新痕迹 | 全 `electron/` grep 零命中 `updateUrl`/`autoUpdater`/`getVersion` |

---

## 定案（2026-08-30 用户拍板）

1. **自研更新机制，不用 electron-updater**——理由：掌握主权 + 有大量时间 + 手握 VS Code 源码直接抄。
2. **E6 内新增本子文件夹**，专门研究主软件更新。
3. 更新源沿用 **GitHub Releases**（与 E6#29 插件市场同一套基建，不造第二套存储）。

---

## 研究内容（对标 VS Code，从源码抄）

| 块 | VS Code 源码/机制 | LinkDesk 落点 |
|:--|:--|:--|
| 产品身份 | `product.json`：`version`(SemVer) + `commit` + `date` + `updateUrl` 构建时注入 | 壳建 product.json，关于对话框展示三件套 |
| 更新流水线 | updateService：后台检查 → 后台下载 → 用户点「更新」→ 重启安装 | 自研更新服务（主进程） |
| 更新模式 | `update.mode` 四档：`default`(自动定期) / `start`(仅启动) / `manual`(仅手动) / `none`(全禁) | 壳设置「更新」设置组，默认 default |
| 发行说明 | `code.visualstudio.com/raw/v{version}.md` 按版本拉 markdown、缓存、内置 tab 渲染；**更新后自动弹**（版本变化才弹，可关 `Update: Show Release Notes`） | 壳内置发行说明查看器，来源 = GitHub Releases body（零新文件） |
| 关于对话框 | 版本 / 提交 / 日期 / Electron / Chromium / Node / V8 / OS + 复制 + 确定 | 字段全现成（Electron `process.versions` + git commit） |
| 历史版本 | 应用内只认「当前 + 更新到最新」，不列历史 | GitHub Releases 天然是历史版本列表（tag + body + asset） |

---

## 关键架构判断

- **壳更新 = 壳能力，不依赖插件**——检查更新/重启安装不能是插件（卸载插件不能卸掉更新能力）。符合「通用通道」定义。
- **壳更新 ≠ 插件更新**：两条独立轨道（壳更新=安装包本身；插件更新=marketplace.json + .linkdesk-plugin）。
- **自研 vs electron-updater 取舍**：自研 = 更多代码量 + 更慢落地，但完全掌控 + 对标 VS Code + 无第三方依赖；用户已拍板自研。

---

## 待拍板点（研究过程中收敛）

- [ ] 更新通道：只「稳定版」一条，还是现在就设计「稳定版 + 预览版」双通道？
- [ ] 发行说明载体：GitHub Releases body（推荐）还是独立 CHANGELOG.md？
- [ ] 检查频率：默认启动 + 定期多久？（VS Code 后台定期，具体频率实现时定）

---

> **← 上一层：** `../E6-执行清单.md`
