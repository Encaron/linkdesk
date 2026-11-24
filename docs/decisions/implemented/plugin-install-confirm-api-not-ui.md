# 插件安装确认——**API 归壳、UI 归市场**（D1/D8 修订）

- **日期**：2026-11-24
- **状态**：implemented（本条推翻/收窄 2026-11-24 早先的 D1「壳绘制确认卡」与 D8「壳默认渲染器」的**默认形态**，但保留其兜底档）
- **关联**：[插件安装/更新确认 P1 提案](../../04-软件更新/待抉择池/插件安装更新确认-壳托管与批量更新/00-提案.md)（§三/§3.7）、[`01-原型.html`](../../04-软件更新/待抉择池/插件安装更新确认-壳托管与批量更新/01-原型.html)、[AI 权限档位](../../04-软件更新/已落地/AI安全-权限档位与提权/)、AI 操作手册 `docs/07-AI操作手册/`
- **前置状态**：P1 第一版已实现「壳算 plan → 壳画默认卡 → 市场可整套替换渲染器（`contributes.renderers`）」并已发版（壳 dev 0.2.63 / marketplace 1.4.26 / lang-defaults 1.0.76 / ui 0.2.76 / sdk 0.1.115）

---

## 一、背景：用户 2026-11-24 的动摇与三个追问

1. **「万物皆可插件」的推演**——既然万物皆可插件，壳该给的不是"某个界面"，而是**稳定且丰富的 API**；确认这件事也应如此：市场想怎么画就怎么画，**但前提是必须调这个 API**。不调 API 就让用户确认 ⇒ 装不上。
2. **零插件可用性**——一个市场 UI 都没装时，用户仍应能"添加源 → 看目录 → 装插件"。这条成立才证明"市场只是 UI"。由此逼出：**命令行怎么确认？**（CLI 没有弹窗）
3. **设置语义**——「通用」组里并排的「更新」与「插件更新」读不出区别，前者应叫「软件更新」；另：设置项底下那行小字（`description`）是**配置声明**的能力，不是设置插件的私有功能。

## 二、决策（8 条，逐条可判）

### D1′ 确认是**壳的能力**，不是壳的 UI

- 壳暴露**两步确认 API**：
  ```ts
  prepareInstall(req)  → { planId, plan }   // 壳算判定，⛔ 不弹 UI、零副作用
  commitInstall(planId, { confirmed })      // 用户已确认 → 壳签一次性令牌 → 执行
  discardInstall(planId)                    // 用户取消 / 页面关闭 → 释放句柄
  ```
- `planId` 短 TTL（默认 5 分钟）＋ 绑定请求指纹（`pluginId+version+downloadUrl+sha256`）；过期 `commit` 返回 `expired`。
- `requestInstall(req)` **保留**，语义 = `prepare` ＋ 壳默认卡 ＋ `commit` 的快捷路径（给不自绘 UI 的市场；行为与今日一致）。
- **不调 `commitInstall` 就装不上**——这条比"必须调 requestInstall"更硬（少一步都不行）。

### D8′ UI 归市场；壳只保留**最小默认卡**

- 市场可以：① 用 `@linkdesk/ui` 的 `PluginInstallConfirm` / `PluginUpdateBatchSummary`；② 完全自绘；③ 用 `contributes.renderers` 整套替换壳默认卡。
- 壳**必须**保留默认卡（DialogHost 属壳，零插件可用）——理由：零插件可用性 + 安全信息兜底 + AI 全权档位的确认面要有壳级落点。
- **自绘不许自造数据**：`plan` 里的来源/发布者/版本/大小/哈希/风险/来源变更**是唯一来源**，市场只能画这份；⛔ 自己从 catalog 重拼来源语义（`audit-duplicate-facts` 口径）。

### D9′ 零插件路径必须成立（命令面）

零插件时以下动作全可用，且全部是**结构化命令**（AI 可读可操作，硬约束 26）：

| 动作 | 命令 | 确认形态 |
|:--|:--|:--|
| 添加市场源 | `plugins.addSource({url, name?})` | 无需确认（只是登记来源） |
| 列目录 | `plugins.listCatalog({sourceId?, query?})` | 无需确认（只读） |
| 装 / 更新 | `plugins.install({pluginId, sourceId, version?, sha256?})` | 走确认（见 §三） |
| 卸载 | `plugins.uninstall({pluginId})` | 走确认（沿用插件管理既有语义） |

### D10′ 命令行确认规则（`--yes` 铁律）

| 场景 | 行为 |
|:--|:--|
| 有 TTY（人机交互） | 打印计划（来源/版本/大小/哈希/风险）→ 等 `y/N`，**默认 N** |
| 非交互（管道/脚本/AI）且无 `--yes` | **拒绝执行**（退出码非 0），提示显式加 `--yes`；⛔ 绝不把"没人应答"当同意 |
| 非交互 + 显式 `--yes` | 执行，并记一条**同意凭据**（谁/何时/pluginId/version/sha256/source） |

配套硬规矩：① `--yes` **不能由配置文件默认打开**、不做长期记忆，只对**本条命令**生效；② `--yes` 只跳过**确认**，⛔ 不跳过任何安全校验（HTTPS-only / sha256 / minApp / 来源变更）；③ GUI 卡与 `--yes` 是同一件事的两种形态，**进同一个同意账本**。

### D11′ 与 AI 权限档位的接缝

- 档位判定进**壳的 policy**（`aiTier === "silent"` ⇒ 免确认），⛔ 市场无权决定免不免问。
- AI 的安装动作走 aiBridge 命令面：低档位 = 壳拦下并要求人工；全权档位 = 允许自带 `--yes`。
- 两条路最终落到同一个 `policy` ＋ 同一个令牌 ⇒ 不存在"AI 绕开确认"的缝。

### D12′ 设置文案

- 「通用」组「更新」节改名 **「软件更新」**（与「插件更新」并列时语义可辨）；词条进 lang-defaults。
- 设置项下的小字 = 配置声明的 `description` 字段（**声明方**写、**设置插件**画）；设置插件被替换后新插件也必须渲染——这是配置渲染契约。

### D13′ 夹具（验收载体）

- **夹具市场插件** `market-fixture`：内置假目录 + 24 个场景按钮，点一个走真实壳 API（不自建任何逻辑）。
- **假插件包**（7 只）：正常 / 哈希不符 / `http://` 源 / 缺 manifest / 同 id 异源 / 降级版 / 大包（20+ 批量用）。
- 场景表见 §五（24 项），每项给"期望"。

## 三、确认判定仍然只在壳（不变）

策略矩阵（首装恒问 / 同版本拒 / 未放行降级拒 / 来源变更恒问 / 官方看 `silentOfficial` / 第三方看 `silentTrustedSources ∧ 已信任`）**一字不改**，仍在 `src/core/services/plugins/install/policy.ts`。本决策只改**呈现归谁**与**同意怎么表达**，不改"谁该问"。

## 四、落点

```
src/core/services/plugins/install/
  plan-handles.ts      # 新增：planId → {plan, req, expiresAt} 表（⛔ 不跨进程、不落盘）
  confirm-service.ts   # requestInstall = prepare + 默认卡 + commit；新增 prepare/commit/discard
src/core/commands/     # 新增 plugins.* 命令面（addSource/listCatalog/install/uninstall，含 --yes 语义）
electron/…/aiBridge    # 档位接入 policy（线 1 面）
plugins（夹具仓）      # market-fixture + 7 只假包
```

## 五、验收场景（24 项，夹具必须能点到）

见提案 §五 的表格（首装 / 官方开关两态 / 第三方信任两态 / 来源变更 / 降级 / 同版本 / 批量全免问 / 混合 / 24 条 / 取消 / 勾选改设置 / 逐个确认 / 哈希不符 / 无哈希 / http 拒 / prepare 不 commit / planId 过期 / 旧链 no-token / 本地安装放行 / 第三方渲染器 / AI 全权）。

## 六、影响与代价（如实）

- **正面**：UI 真正可替换（市场自绘不再受壳卡形态限制）；零插件可用性有路径；命令行/AI 的同意语义统一且可审计。
- **代价**：`prepare/commit` 两跳让"忘了 commit"成为新的失败模式 ⇒ 以 `planId` TTL + 明确错误码（`expired` / `unknown-plan`）兜；市场作者要多写一步（文档与脚手架模板要给最小示例）。
- **不做**：不做"plan 持久化"（安全语义不应跨重启存活）；不做"默认记住 --yes"（D10′ 铁律）。

- **Superseded by**：（无）
