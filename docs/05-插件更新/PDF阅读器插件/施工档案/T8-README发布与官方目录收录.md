# T8 施工档案 · README＋发布＋官方目录收录（2026-10-08）

> 一格一档（00-README 档案纪律）。本档只记 T8——README/CHANGELOG 起账、发版链、官方目录收录、市场实机验收读数与诚实留档。
> 上一格 = [T7-测试门禁收口.md](T7-测试门禁收口.md)；**T8 是本案最后一格**（走完 = 从「能读」到「用户点得到」）。
> 🔴 **T8 是本案唯一动版本号与 CHANGELOG 的一格**（T1–T7 一律不发版、不动号）。版本号 = **`0.1.0`**（首发，⛔ 全程未改号）。
> 🔴 **出厂种子不进**（判据 line 91）：壳仓 `bundled-plugins.lock.json` 与出厂清单**一行未动**——由壳仓零 diff 旁证。

## 一、落点与产物

| 落点 | 产物 |
|:--|:--|
| 插件仓 `README.md`（新，**8,393 字节**） | 照 [12-README说明区媒体契约](../../../03-插件制造/12-README说明区媒体契约.md)：首屏**展示图标上说明区**＋场景封面 `resources/cover.svg`（正文唯一图片引用）。正文 9 个标题——`它能做什么` / `上手（第一次怎么走）` / `键盘与滚轮` / `设置一览（设置 → PDF 阅读器）` / `命令（12 条）` / `阅读底色为什么不跟壳主题`（把 T3 的「有意不跟主题」定论写给用户看）/ `结构（给维护者）` / `相关` |
| 插件仓 `resources/cover.svg`（新，**12,217 字节**） | 场景封面「纸的窗」——左缘缩略图侧栏（当前页描蓝边）、右侧夜色纸面与**两处搜索命中**（后一处是当前命中）、顶上搜索浮条、底部状态条。**一图说清插件长什么样**，非纯装饰 |
| 插件仓 `CHANGELOG.md`（新，**2,583 字节**） | 起账：段标题 `## v0.1.0（2026-10-08）`——**版本号与 `plugin.json` 逐字相同**（市场按此切段，只改号不写段会显示「此版本未提供变更说明」）。段内六个粗体小标题：打开与渲染 / 读得舒服 / 找得到 / 给命令与 AI 读数 / 设置 / 卸载即退回。文件头留**写法约定注释**（段标题格式、号段同步义务、从新到旧） |
| 插件仓 `marketplace.json`（仓根，改） | 本仓自己的源——由 SDK 的 `publish` 自动 upsert（提交 `f927c78 publish pdf-reader (marketplace.json)`）。⚠️ 这只让**本仓**可被装，⛔ **不收录用户永远点不到**（硬约束 24） |
| 官方目录仓 `E:\linkdesk-plugins\linkdesk-marketplace\marketplace.json` | **收录条目**（提交 `134d9d7`，已 push 到 `Encaron/linkdesk-marketplace` main）——这套仓是**每个用户出厂就带的默认目录源** |
| `plugin.json` | 版本 **`0.1.0`**（⛔ 未动号）；`minAppVersion` 收录时填 **`0.2.32`**（目录既有字段，收录档里 5 个条目在用） |

## 二、发版链（`linkdesk-plugin-sdk publish`，🟢 插件轴已授权走到端）

| 步骤 | 读数 |
|:--|:--|
| 前置断言 | 资产新鲜度 ＋ HEAD 干净——**两关都过**才发（SDK 内建，非人工核对） |
| 产物 | 仓根 `pdf-reader.linkdesk-plugin` **2,159,505 字节**、md5 **`d617e7b4ccdc1aff76ed96f8717adcfc`** |
| GitHub Release | tag **`v0.1.0`** → 上传资产 → upsert 本仓 `marketplace.json`；`publishedAt` = **`2026-10-07T16:46:13.124Z`** |
| 提交 | `f927c78 publish pdf-reader (marketplace.json)` |
| 发完回验 | 代理下载已发布资产 → **2,159,505 字节、md5 `d617e7b4…`——与仓内资产逐字节相同**；zip 内 `index.bundle.js` md5 **`fc438511f4a91a0a285019378c959609`**（＝ T7 三门后那份构建物） |

🔴 **三段同一性（本格最有价值的一条读数）**：`已发布资产` == `仓内 zip` == `商店装到用户机上的副本`（`%APPDATA%\linkdesk\plugins\pdf-reader\index.bundle.js` md5 `fc438511…`）**三者同一份字节**。⇒ 「装上」这一步拿到的就是 T7 实机验过的构建物，无需重跑一遍 T7 的阅读器读数来「证明装对了」。

## 三、官方目录收录（`Encaron/linkdesk-marketplace`）

### 3.1 条目（逐字段照 editor 先例）

```json
{
  "id": "pdf-reader",
  "name": "PDF 阅读器",
  "version": "0.1.0",
  "description": "单击 pdf 开真阅读器——渲染、翻页、缩放、搜索；卸载即退回。",
  "author": { "name": "Encaron" },
  "icon": "https://raw.githubusercontent.com/Encaron/linkdesk-plugin-pdf-reader/v0.1.0/resources/icon.svg",
  "iconSource": "url",
  "minAppVersion": "0.2.32",
  "readmeUrl": "https://raw.githubusercontent.com/Encaron/linkdesk-plugin-pdf-reader/v0.1.0/README.md",
  "downloadUrl": "https://github.com/Encaron/linkdesk-plugin-pdf-reader/releases/download/v0.1.0/pdf-reader.linkdesk-plugin",
  "size": 2159505,
  "publishedAt": "2026-10-07T16:46:13.124Z",
  "versions": [ { "version": "0.1.0", "downloadUrl": "…", "publishedAt": "…", "changelog": "首个版本：一份 `.pdf` 在 LinkDesk 里第一次真正「能读」——从双击打开到卸载退回，一条链走完。…" } ],
  "repository": "https://github.com/Encaron/linkdesk-plugin-pdf-reader"
}
```

- **键序照先例**（settings / serial-monitor / file-tree 同序）——⛔ 不按自己顺手的顺序写。
- **`author` = Encaron**：照 `geme-tihu-bicycle`、`theme-twilight-forest` 先例（同作者的条目就是这么写的）。
- **`minAppVersion` = `0.2.32`**：该字段是**目录既有**字段（收录档里 5 个条目在用），⛔ 不是本格新造。
- 改动量：**26 插入 / 1 删除**（唯一删除是顶层 `updatedAt` 从 `2026-10-06T16:33:53.886Z` 推到 `2026-10-07T16:48:34.076Z`）。**外科式**——其余 19 行逐字未动。
- 条目落点：`marketplace` 之后、**下标 4**（0-based），收录后共 **19 个插件**。

### 3.2 收录过程里的两起真事故（都当场归零，⛔ 未用绕过）

1. **rebase 撞上远端推进（含冲突标记让 JSON 不可解析）**：本地改完后发现远端已走 2 个提交（`316e2e0..23dd701`——editor 1.0.25 ＋ file-tree 1.0.31），rebase 出冲突。
   **处置**：`git rebase --abort` → `git reset --hard origin/main` → **在新鲜基线上重做一次插入**。⛔ 不 merge、⛔ 不 `--allow-drift`、⛔ 不手工拼冲突块。**先取再改**这条纪律是「外科式改动」能成立的前提。
2. **`reset --hard` 后锚点匹配 0 次（autocrlf 的坑）**：仓库自动把文件检出成 CRLF（1733 CRLF / 0 LF），LF 锚点 `'    {\n      "id": "python",'` 匹配不到 → 脚本当场抛 `AssertionError`（**幸好是断言不是静默**）。
   **处置**：读文件用 `newline=''` 再 `.replace('\r\n','\n')` 归一后匹配，写出时保持 LF。教训 = **对文本做精确插入时，换行归一必须在匹配之前**。

### 3.3 收录后回验（远端真字节，走代理）

| 检查 | 读数 |
|:--|:--|
| 远端 raw `marketplace.json` | HTTP **200**、**176,833 字节**、**19 个插件**、`pdf-reader` 在下标 **4** ✅ |
| 条目 `icon` | 200 / **687 字节** / `image/svg+xml` ✅ |
| 条目 `readmeUrl` | 200 / **8,393 字节** ✅ |
| 条目 `downloadUrl` | 200 / **2,159,505 字节** / `application/octet-stream` ✅ |
| 条目 `repository` | 200 ✅ |
| 封面 `resources/cover.svg`（README 内引用） | 200 / **12,217 字节** / `image/svg+xml` ✅ |

⚠️ 探针曾整批返回 `000`——原因是 Python 文本模式写文件时给每个 URL 尾部补了 `\r`；`tr -d '\r'` 后全部 200。**记账：探针脚本一律二进制/显式 LF 写。**

## 四、市场实机验收（安装版 LinkDesk 0.2.53 · CDP 9333 · 池页驱动）

### 4.1 搜到 ✅

展开「探索插件」时**仍看到 18 条的旧缓存**（目录缓存 5 分钟）⇒ 点「检查更新」（该钮**绕过**缓存）后，商店行出现：

> 「PDF 阅读器 v0.1.0　单击 pdf 开真阅读器——渲染、翻页、缩放、搜索；卸载即退回。　Encaron　encaron/linkdesk-marketplace　2.1 MB　已安装」

### 4.2 卸载退回 ✅（三证齐）

| 证 | 卸载前 | 卸载后 |
|:--|:--|:--|
| 插件表 | `pluginManager.list()` **19** 条 | **18** 条 |
| 关联台账 | `…/os-associations-dynamic.json` 含 `.pdf` | **`{"written":[]}`**（台账归零） |
| 系统注册表 | `HKCU\Software\Classes\.pdf\OpenWithProgids` 有 `LinkDesk.Document` | 该值**消失**，而**同键下其他应用的值原封未动**（`QuarkHTM.pdf` / `DoubaoPDF…` / `AppX…` 全在） |

⇒ 商店行当场翻成**未装态**（图标回落到 **raw URL**、按钮变「安装」）。**边界③ 兑现**：只摘自己那一份，不动别人的。

### 4.3 装上 ✅

点「安装」→ 确认框 → 「安装中...」 → 约 **30 s** 后 `{装:true, 版本:"0.1.0"}`，商店行变「已安装 v0.1.0」；`getPluginFor('pdf') === 'pdf-reader'`（editor 退为次选）；**台账回到含 `.pdf`**、**注册表值回来**。**走的是正门**（⛔ 未手工复制目录）。

### 4.4 README / 更改日志 真渲染 ✅

- **详情**页：真渲染本仓 README，封面经 `linkdesk://pdf-reader/resources/cover.svg` 加载，`naturalWidth/Height` = **640×640**（**真渲染**，非坏图）；渲染面读出 **86 个 `code` 元素 / 4 张表**。
- **更改日志**页：真渲染 `## v0.1.0（2026-10-08）` 那一整段。

### 4.5 打开方式候选 ✅（判据取可实现读数的等价物）

`.pdf` **不在**安装器的静态关联表里（静态表只收 12 个可执行类扩展名）⇒ `.pdf` 的处理**完全由插件声明驱动**、注册表键的存废跟随插件（见 4.2/4.3 的翻转）。⚠️ **诚实边界**：本格验的是**产出该候选的注册表键**（`OpenWithProgids` ＋ 台账），⛔ **未在 Windows 右键「打开方式」菜单里肉眼点选**。

### 4.6 可更新（判据要求项，读数如实）

| 面 | 读数 |
|:--|:--|
| 市场 UI | 「**已是最新 · 00:53**」，**0 个更新角标** |
| 壳侧 API | `plugins.packageUpdateCheck("pdf-reader", <官方目录 URL>, "0.1.0")` → `{current:"0.1.0", latestVersion:"0.1.0", downloadUrl:"…/v0.1.0/pdf-reader.linkdesk-plugin", update:false}` |

🔴 **诚实限定**：**「真升级」这一步本格走不到**——线上只有 `v0.1.0`（首发），拿不到更高版本可比。⇒ 本条判据的读数是**更新检查回执正确（同版判 `update:false` ＋ 指向正确资产）**，⛔ 不等于「已验过一次真升级」。升级路径的首次实测要等**下一个版本**发版时补（已记入 §五 与交接）。

### 4.7 收尾状态

自开的「PDF 阅读器」详情标签**已关**；侧栏切回**文件树**；其余标签为用户原有（发行说明 v0.2.53 / 鹈鹕骑行 / ● 开发板焊接测试程序使用说明.pdf / 设置）。⛔ 未留下任何自开面。

## 五、诚实留档（三条，⛔ 不粉饰）

1. **已装态同版本不刷新 README**：重装前，「详情」页显示的是**旧的脚手架 README**——因为机上是 T8 之前的 zip，而**同版本副本永不刷新**。⇒ 「包里的 README 是最新的」与「机上那份 README 是最新的」是两件事；本格靠 4.3 重装（先卸载再装）才让详情页读到新 README。**换 README 必须换版本号**，这是机制不是缺陷。
2. **「可更新」走不到真升级**（见 4.6）——已明确记账。
3. **仓里那个开着的 `.pdf` 标签是编辑器插件的「二进制文件提示页」**（`.editor-binary-notice`，带「在市场搜索阅读器」/「仍旧以该编辑器插件打开」两颗钮），**读数面 `.pdf-reader-root` 计数为 0**；双击文件树该行（`click` ＋ `dblclick` 都派发过）**未把它换挂成阅读器面**（标签表未变）。
   ⇒ **⛔ 不当成「阅读器面已复验」**。阅读器面本身的实机读数由 **T7 结清**（目录/缩略图/搜索/错误态四组），而**关联确实生效**由两条硬证据支撑：`getPluginFor('pdf') === 'pdf-reader'` ＋ 机上副本 bundle md5 与 T7 验过的构建物**同一份字节**（§二 三段同一性）。**待下一个版本发版时顺手复验「双击即起阅读器面」。**

## 六、教训与工具面坑（供后续格）

1. **「先取再改」是外科式收录的前提**：远端可能已推进 ⇒ 每次改前 `git fetch`，撞了就用 `reset --hard` ＋ **重做插入**，⛔ 不 merge、⛔ 不拼冲突块。
2. **换行归一必须在匹配之前**（autocrlf 会让 LF 锚点匹配 0 次）——脚本要**断言匹配次数**，静默 0 次替换是最贵的 bug。
3. **探针写文件别用文本模式**（会自动补 `\r`）⇒ 整批 URL 探针返回 `000`，看着像网络挂了。
4. **`pluginManager.list()` 的条目字段是 `pluginId`，不是 `id`**（按 `id` 取会得一排 `undefined@?`）。
5. **`plugins.packageUpdateCheck` 只挂在壳文档（index.html）上**，池文档（pool.html）里不是函数。
6. **`listTargets()` 只收 `/^https?:/`**（`scripts/dev/lib/cdp.mjs`）——安装版各面是 `file://` ⇒ 数目标得自己写 `/json/list` 列举（T7 已知，本格复用）。
7. **市场目录有 5 分钟缓存**：改完目录后要看新条目，点「检查更新」（该钮绕过缓存），⛔ 别干等。
8. **确认框要瞄准 `.ldk-dialog-host`**——按 `[class*=dialog]` 取第一个会命中 `.ldk-dialog-host-message`（里面没有按钮），点 `确定` 会「找不到钮」。
9. **双击文件树行别用文字匹配**：会先命中 `.ldk-group-tab-label`（分栏标签）；行选择器要带 `file-tree-node` 且按 `/item|row|node|entry/` 过滤。
10. **复验阅读器面时先看清那条标签是谁的**：本机的 `.pdf` 标签是**编辑器插件**开的二进制提示页，双击文件树行会**聚焦已有标签**而非另起阅读器面——⛔ 别把「标签数没变」读成「插件坏了」。

## 七、判据对账（对照 [02-执行清单.md](../02-执行清单.md) line 93）

| 判据 | 结果 | 依据 |
|:--|:--|:--|
| 壳仓**零 diff** | ✅ | 本格对壳仓只写 `docs/05-插件更新/PDF阅读器插件/`；`git status --porcelain` 在该目录外为空 |
| 市场实机**搜到** | ✅ | §4.1（检查更新后商店行出现，含图标/描述/体积/已装态） |
| 市场实机**装上** | ✅ | §4.3（正门安装 → `{装:true,0.1.0}` → 关联台账与注册表回位） |
| 市场实机**可更新** | ⚠️ **回执正确，真升级走不到**（见 §4.6 ——线上只有 0.1.0） | §4.6 两行读数 ＋ §五.2 |
| **卸载退回**如实记录 | ✅ | §4.2 三证 ＋「其他应用的值原封未动」 |
| Windows「**打开方式**」候选出现 | ✅（取注册表键这一等价读数，⛔ 未肉眼点选系统菜单） | §4.5 |
| 收录条目逐字段照 editor 先例核对 | ✅ | §3.1（键序/author/minAppVersion/URL 五条全探通） |
| 发完**验「用户点得到更新」** | ✅ | §3.3 远端真字节 + §2 三段同一性 |
| 出厂种子**不进** | ✅ | 壳仓零 diff（`bundled-plugins.lock.json` 一行未动） |

**本案（T1–T8）至此全格收口。** 唯一的开口是 §五.2 / §4.6 的「真升级未实测」——留待**下一版发版**时顺手补一次（届时同时复验 §五.3 的「双击即起阅读器面」）。
