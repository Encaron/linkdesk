# 插件源码外移——一插件一仓，壳仓只留产物

- **日期**：2026-09-14
- **状态**：implemented
- **背景**：用户提出把所有插件源码移出壳仓，并问「每个插件独立一个仓库会不会堆成几百个」以及「要不要都堆进 `linkdesk-marketplace` 仓」。同时存在一个真实痛点：安装版里除两只已上架插件外，**一只都不敢卸载**（卸了就真没了）。审计回源发现三处硬约束：① `publish` 的目标仓库 = 工程自己的 `git remote origin` 且 tag = `v{version}`——**monorepo 里两只插件同版本会撞 tag**、且 `marketplace.json` 走 read-sha-merge-PUT 会 409；② 壳仓发布工作流的触发是 `tags: ["v*"]`——**插件 tag 留在壳仓会误触发一次软件发布**；③ 六只含构建产物的插件**零只声明** `@linkdesk/ui` / `@linkdesk/contracts`，build 脚本用相对路径 `../../packages/plugin-sdk/dist/bin.js`，全靠根 `workspaces` 提升才能跑。
- **决策**：
  1. **一个插件一个仓库**（D1）——这是 `publish` 的实现前提，不是口味选择。
  2. **全部外移，出厂套装的源码也在仓外**（D2）；壳仓只留**构建产物**（`bundled-plugins/*.linkdesk-plugin`）+ 文档档案。源码**只能有一个真相源**。
  3. **出厂 = 构建期拉取**（D3）：`sync:bundled` + `bundled-plugins.lock.json` + `check-bundled-freshness`——新用户拿到的出厂插件版本 = 该插件最新已发布版。
  4. **bootstrap 最小集 = 6 只**（D4）：`settings` / `marketplace` / `file-tree` / `editor` / `theme-defaults` / `lang-defaults`，判据 =「**断网、零插件时用户能不能自救**」；其余（含 `serial-monitor`）不随包、纯市场。
  5. **身份 vs 显示名 vs 仓库名三分**（D5）：`plugin.json` 的 id 永不可变（安装目录/合并键/墓碑键），显示名随便改，**仓库名完全自由**（对标 VS Code `publisher.name` 不可变 + `displayName` 自由）。
  6. **本地容器目录**（D6）：插件工程收进一个容器（建议 `E:\linkdesk-plugins\official\` + `third-party\`），**容器本身绝不建仓**——一旦建仓，脚手架的「已在 git 仓内 ⇒ 不 init」规则会把每只新插件都变成容器 repo 的子目录（= 最不想看到的 monorepo）。
  7. **脚手架自带 git init**（D7）：照抄 `cargo new` 三语义（仓内跳过 / 仓外建档 / `--no-git` 退路）。
  8. **命名与版本号规范（N1-N6，展开 → [09-命名规范.md](../../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md)）**：**N1** 插件身份 = `plugin.json.pluginId` 显式声明（今天靠**目录名兜底**、且该字段**不在 schema 里** ⇒ 必须先做身份显式化，否则搬进「名字自由」的仓库会静默改掉插件 id）；**N2** 仓库名完全自由；**N3** 官方插件建议统一惯例（待拍板）；**N4** 显示名随便改；**N5** 本地目录名自由；**N6** 🔴 **版本号四处同源**——在既有「三处锚」（`CHANGELOG.md` 段标题 ↔ `plugin.json.version` ↔ `versions[].version`）上**加第四处 `package.json.version`**（保留该字段并强制相等，**不删**；用户 2026-09-14：「version 版本号我建议加上，能规范就规范一点」）。**bump 判据引用 `.claude/skills/version-bump/SKILL.md`，不另写一套**。
- **影响**：
  - 🔴 **插件身份会漂移（本决策最大的隐藏风险）**：身份 id 今天 = `pluginId ??` **项目目录名**（`derivePluginId`，另有 zip 基名/安装目录名两处兜底），而 **`pluginId` 不在 schema 里**、**仓内 18 只零显式声明**。源码搬进「名字自由」的仓库后，id 会被静默兜底改名 ⇒ 安装目录并存两份 / 墓碑对不上 / catalog 两个 id / 更新链断 / 插件数据看似丢失（**五条全不报错**）。⇒ **前置动作 = 身份显式化**（`E6#98g`：`pluginId` 进 schema + 18 只显式声明 + 兜底打黄灯）；**迁移红线 = `pluginId` 落地前不许改任何插件目录名**。展开 → [09-命名规范.md](../../02-Electron架构/E6_插件生态与发布/插件源码外移层/09-命名规范.md)。
  - **上架是两步，不是一步**：`publish` 只写进插件**自己仓**，默认可见必须走「官方目录收录」（`Encaron/linkdesk-marketplace`）。**这一步才是「不敢卸」的解药**，且第二步在今天仍是手工/PR。
  - **新增跨仓顺序依赖**：插件仓发版 → `sync:bundled` → 壳 `check` → 壳 `publish`。**这是代价，不是免费的。**
  - **壳仓侧要拆 12 类绑定**（`tsconfig` / `vitest` / `eslint` / `knip` / `package.json` / 审计脚本写死路径 / LSP 三脚本 / 五个扫描门禁 / pack 脚本 / 工具脚本 / 物理目录）。
  - **搬出去立刻掉出 `npm run check` 保护伞** ⇒ 每仓 CI 必须重建；**25 个测试文件的运行环境随行**（含 `vitest.setup.ts` 那份 `window.linkdesk` mock）。
  - **风险 R1**：壳 API 面变更会变成「改壳 + 改 N 个插件仓」的跨仓批次（缓解：契约轴独立 + 上架后版本化演进）。
  - ⚠️ **monorepo 并非架构上不可能**——VS Code 的内置扩展就是主仓子目录 + 独立发版。**选独立仓的理由是「工具链单一 + 壳仓历史干净 + 官方插件要能当第三方作者的样板」**，不是「做不到」。
  - 执行载体 = E6 第 7 层（#97-#104），档案 `docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/`。
- **Superseded by**：（无）
