# README 说明区媒体契约

> 2026-09-09 ·文档化（四种形态全部实现后补上的作者契约）。**写给第三方插件作者。**
> 这份文档回答一个问题：**你的 README 在 LinkDesk 软件里会被插件详情页展示——里面想放图 / 动图 / 演示视频，怎么写才对、有什么规矩。** 对标 VS Code 更新页 / 扩展 README 的开放展示画布。
> 性质 = **接口契约**——只定义「作者怎么写得对 + 会显示成什么样」，不写实现代码（实现面 = 壳共享 MarkdownView + 市场 DetailView）。作者不需要知道 App 怎么渲染，把下面几条写对即可。

---

## 一、你的 README 在哪展示、两种来源两套规矩

插件根目录的 `README.md` 显示在**插件详情页的「详情」标签**里（该标签 = 截图画廊 + 这块 README 区域，README 区即项目常说的「说明区」）。详情页横向三个标签：**详情 / 功能 / 更改日志**，README 属「详情」这一格。**但同一份 README 有两种读到它的路，媒体显示能力不一样——这是最容易踩错的一条：**

| 态 | README 从哪来 | 相对路径媒体（随包资源） | https 绝对 URL 媒体 |
|:--|:--|:--:|:--:|
| **已装态**（用户下载安装 / 随壳发货后看详情） | 读**你打包进 zip 的那份** | ✅ 显示 | ✅ 显示 |
| **市场预览态**（未安装，列表/详情读目录条目的远程 README） | 读**远端 readmeUrl** | ❌ 不显示（诚实不显——此刻没有你的包内副本，无从解析） | ✅ 显示 |

> **含义：** 想让图/视频在「用户已装」后必然看到 → 用**相对路径放包内**（下 §三）；想让图/视频连「还没装的浏览者」也看得到 → 用 **https 绝对 URL**。只放相对路径媒体 = 装了才见。

---

## 二、支持的媒体形态（四种，照抄即可用）

| 形态 | 作者怎么写（README markdown / 内嵌 HTML 均可） | 说明区行为 |
|:--|:--|:--|
| **静态图** | `![串口封面](resources/cover.svg)` 或 `<img src="resources/cover.svg" alt="串口封面">` | 显示。png / svg / webp / jpg / gif 通吃。**建议写 alt**（读屏友好，纯装饰图给空串） |
| **动图** | 同一行写法，放真动画 gif | 显示且**真会动**（跟静态图同链路） |
| **封面外链视频**（GitLens 式） | `<a href="https://youtube.com/…"><img src="resources/cover.svg" alt="点封面看演示"></a>` | 说明区显示为**可点封面**；点击 = **系统默认浏览器**打开外链页（App 内永不载外部页） |
| **页内视频**（VS Code 更新页式） | `<video src="resources/demo.mp4" controls poster="resources/cover.svg"></video>`<br>或 `<video controls><source src="resources/demo.mp4" type="video/mp4"></video>` | 说明区**就地播放**：有原生控制条、可拉进度条、可点全屏（一次点满屏、退出一次还原）。mp4 / webm / m4v |

> 任何 **https 外链文字链接**（`[看演示](https://…)`）同样：点击走系统默认浏览器。mailto: 走邮件客户端。**app 内从不弹窗载外部网页。**

---

## 三、图 / 视频文件放哪、src 怎么写（源规则）

1. **写「相对路径 + 随包」**：媒体文件放**插件根目录的 `resources/`**，README 里写相对路径 `resources/cover.svg`。**SDK 构建自动把这些被 README 引用的资产打进 zip**（零声明，见 [04-插件分发格式.md](04-插件分发格式.md)）→ 已装态必然显示。
   🔴 **媒体一律住 `resources/`**——图标同理（`plugin.json` 的 `icon` / `marketIcon` 也写 `resources/…`）。**插件根目录不放散图。**
2. **远程 URL**：`https://…` 绝对地址直接可用（适合市场预览也显）。
3. **别碰的**：`http:` / `data:` / `javascript:` / `file:` 图源**一律不显示**（安全白名单拒绝）；`//` 开头的协议相对 URL 也不显示；**别引用包外**（`../` 上层目录、绝对盘路径）——既不随包也不显示。

> ℹ️ **技术上放插件根目录也能工作**（SDK 只看 README 里写了什么路径，不看目录）。**收口到 `resources/` 是规整性要求，不是正确性要求**——新插件跟齐官方范本的 `resources/` 写法即可。

---

## 四、渲染契约——哪些做不了，别指望（安全硬保证）

- **不能跑脚本。** README 是纯展示画布：`<script>`、事件属性（`onclick` 等）、`javascript:` 协议被消毒层**整枝剥除**——不是你没写对，是设计上就进不去。别用「README 里塞 JS 让详情页执行」的思路。
- **视频永不自动播。** `autoplay` 写了也无效（打开说明区绝不突然出声）。加载策略 = `preload: metadata`（不整片预下载，省带宽）。
- **控制条强制给。** 页内 `<video>` 你没写 `controls` 也会被加上（否则读者无从起播）。
- 危险 / 未知协议的链接整枝不落 DOM。

---

## 五、随包与发布纪律（改了内容要重发，否则用户看不到）

1. **内容变更必 bump `plugin.json.version`**（[04 §四](04-插件分发格式.md) 核心纪律）：已装用户的副本**按版本固化**——软件只补缺失、永不刷新已装。你给 README 加了图 / 换了视频但没 bump → 已装用户永远看旧内容。README 动了 = 内容变更 = 必须 bump + 重新构建 zip。
2. **zip 是一次构建产物，不自动重生。** SDK build（或主题类 `pack`）自动收集 README 引用资产随包——但**改了 README / 媒体 / 或动了 SDK 打包配置**（外部化清单等）后，磁盘上的旧 zip 不会自己变新；**必须重 build + 重发**。判据：装了新包仍不对 → 多半是 zip 本体陈旧 → 重建。
3. **随壳发货的 bundled zip 同理**：重打 zip 必 bump；`npm run check` 的打包 gate 会在「同版本内容 diff」时红拦，别绕过。

---

## 六、活的样板（照抄不会错）

- 官方 8 只已嵌场景封面的插件 README = 现成范本：`editor` / `file-tree` / `serial-monitor` / `settings` / `python` / `theme-terminal` / `theme-aurora-glass` / `lang-defaults`（另有首个第三方真插件 `hello-linkdesk`）。看它们 README 顶部那张 `![…](resources/cover.svg)` 就是封面标准写法。
- 页内 `<video>` / 封面外链写法：串口监视器 README 的 git 历史 commit `2f9a52c6b`（页内真播）与 `8c9d71551`（全屏修复）各带一段当时手测用的完整 `<video>` / `<a><img></a>` 示例，验完即撤——要抄完整写法可看那两次提交。

---

## 相关

- [04-插件分发格式.md](04-插件分发格式.md)——zip 打包、内容变更 bump、`linkdesk://` 资源协议
- [09-插件目录规范.md](09-插件目录规范.md)——文件放哪
- 市场图标双字段 `marketIcon` / 封面 → [06-plugin.json规范](06-plugin.json规范.md)
