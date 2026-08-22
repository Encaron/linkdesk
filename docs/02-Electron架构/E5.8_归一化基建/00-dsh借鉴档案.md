# dsh 借鉴档案（E5.8 立项依据）

> 2026-08-16。DeepSeek Harness（dsh）源码四路侦察 + 借鉴清单 v2。**E5.8 全部任务来源于本文档第三部分。**
> 侦察结论的完整过程在当次会话；本文档只存结论映射。仓库本地克隆长期保留，可随时复查原文。

---

## 1. 仓库信息

| 项 | 值 |
|:--|:--|
| 项目 | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek 团队，Cordis 框架 agent harness，"everything is a plugin"） |
| 本地克隆 | `E:\deepseek-harness`（Git Bash `/e/deepseek-harness`）——2026-08-16 克隆，7412 文件，完整工作树 |
| 重克隆配方 | `git clone --depth 1 --filter=blob:none --no-checkout <url>` → `git sparse-checkout disable && git checkout -f HEAD`（曾踩坑：默认 cone 模式只落根文件） |
| 侦察日期 | 2026-08-16，四路并行 |

## 2. 四路侦察摘要

| 侦察面 | 核心发现 |
|:--|:--|
| Cordis 插件系统 | 可逆注册 `ctx.effect` 逆序回滚 + Fiber 状态机（PENDING→ACTIVE→DISPOSED，可诊断"为什么没加载"）；`inject` 依赖编排启动（依赖未就绪挂起、依赖消失连带卸载自动重载）；用户 `cordis.patch.yml` 按稳定 id 覆盖任何插件配置（后写覆盖 + 热加载） |
| 安全沙箱 | `confine(argv, policy) → 替换 argv` 沙箱缝（Linux bwrap/Landlock、Windows WRITE_RESTRICTED token），无沙箱退化路径 = 显式抛错；审批层闭集结果 + `approval/asked+decided` 审计对；凭据四件套（配置只存引用/每操作解析/describe 不返回值/env scrub） |
| host/client 分裂 | 双 ts.Program 契约分裂 + Typert 生成契约 + contracts-ready 门禁（契约未生成 client 编译不过）；本地服务三道 fence；JSONL append-only + 崩溃补闭环不截断 + Windows MoveFileExW write-through |
| 工程门禁 | jscpd 重复检测 + knip 死代码 + pnpm allowBuilds 安装脚本白名单 + lefthook postinstall 自动装（"local checkpoints fast; CI owns the full matrix"）；文档 i18n hash 侧车；Agent Notes 决策记录系统（路径编码状态 + 非平凡改动必落一篇） |

## 3. 借鉴清单 v2（按 10 准则重排）

> 排序原则：**按准则命中率排，不按便宜排**。用户拍板："抄不丢人——像初期抄 VS Code 一样。不怕推翻重做（壳→多WebView→per-tab→双Pool→单Pool 都走过了）。**保留自己的 React + 单 Pool 特点。**"

### 第一梯队：结构级照抄（E5.8 落地）

| # | 项 | 准则命中 |
|:--|:--|:--|
| 1 | **契约生成层**——我们的 "linkdesk.d.ts"（Typert 缩水版：标注 → 生成契约声明 → 契约没生成编译不过） | 归一化 / AI 友好第 3 层 / 插件独立性 / vscode化 |
| 2 | **可逆注册升级**——一切注册返回 disposer 逆序回滚 + 生命周期状态机（RegistryBase 升级路线） | 归一化 / 插件独立性 / 无死代码 / 健壮性 |
| 3 | **依赖声明编排**——plugin.json `requires` + PENDING 挂起 | 插件独立性 / 生态 / 低耦合 / 归一化 |
| 4 | **门禁四件套**——jscpd + knip + lefthook + 供应链纪律（npm 适配版） | 无死代码 / 整洁 / 健壮性 / AI 友好 |

### 第三梯队：只抄规则不抄形态（E5.8 顺手吸收）

| # | 项 | 准则命中 |
|:--|:--|:--|
| 5 | pushLayout 两条规则——whole-value checkpoint（状态事件必须带完整 post-change 值）+ delta 必须带稳定 id、不得依赖 live-only 内存 | 归一化 / 健壮性 |
| 6 | 决策记录义务——"非平凡改动必须落一篇决策记录"（Agent Notes 缩水版） | AI 友好 / 整洁 |

### 第二梯队：已立案——E6#48-#52（2026-08-16 衔接审计拍板）

子进程沙箱缝 / 审批层审计对（保留我们的 remember 模式）/ 崩溃补闭环 append-only 日志 / 凭据隔离四件套 / 用户 patch 层——E6 蓝图新增第 6 层安全加固 5 任务（[../E6_插件生态与发布/E6-执行清单.md](../E6_插件生态与发布/E6-执行清单.md) #48-#52）。→ 详见 memory `deepseek-harness-reference`。

### 明确不抄（与准则 1"插件自由化"冲突或成本过重）

| 项 | 理由 |
|:--|:--|
| 日志派生 UI 全形态（Definition 状态机 → keyed slot 渲染） | **杀死插件自由渲染**——React 自由是我们的身份。只抄它推出来的两条 pushLayout 规则 |
| 每文件 100% 覆盖率 | 200+ 行豁免清单 + 专人维护，单人负担；慢工出细活 ≠ 无限测试基建 |
| Wine 跨平台门禁 | 我们本来就活在 Windows，该门禁为 Linux 团队验证 Windows 构建而设 |
| 双语 i18n 全家桶（1078 侧车文件） | 文档量撑不起；若做用 hash 侧车缩水版 |
| run-gates DAG 调度器 | 两工程规模过度设计 |

## 4. 结论

**抄的是 dsh 的工程纪律，不抄它的产品形态。** React 自由渲染、单 Pool、壳想池画、插件自由化——全部原样保留。四大支柱（契约生成/可逆注册/依赖编排/工程纪律）全是归一化基建——每一支柱都直接命中用户 10 准则。

> 📖 设计总览 → [01-归一化基建设计.md](01-归一化基建设计.md)
> 📖 执行清单 → [E5.8-执行清单.md](E5.8-执行清单.md)
