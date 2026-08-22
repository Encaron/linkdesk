# 依赖编排——Phase 3 档案目录

> **对应清单任务：E5.8#13-#16**（[../E5.8-执行清单.md](../E5.8-执行清单.md) Phase 3）。
> 本目录只装**档案**——任务条目永远在清单里，这里不复制任务。
> 目标：plugin.json `requires` 声明依赖——顺序框架算，不靠约定。第三方插件互相依赖不惊动壳作者。
> 前置：Phase 2 状态机（#11）。

## 本目录收什么

Phase 3 **无独立设计文档**——设计见 [01-归一化基建设计.md §支柱3](../01-归一化基建设计.md)。开工时若出现设计文档装不下的决策点 → 落 `docs/decisions/` 决策记录（#6 义务），在本目录 README 追加一行指路。

## requires 语义定义（#13 落地口径，开工时照此对齐 schema + 文档）

- **按名声明依赖**（`"requires": ["tools"]` 引用对方 pluginId）——不 import 具体实现（低耦合）
- 无 requires = 无依赖，行为不变——现有插件零改动兼容（#16）
- 全链路同步三处：#13 列明的 `plugin.schema.json` + `PluginManifest` 类型 + docs/03-插件制造/06-plugin.json规范
- 依赖未就绪 → PENDING 挂起（复用 #11 状态机）；循环依赖 fail-loud（#14）
- 依赖消失 → 消费插件 PENDING（连带卸载）；依赖回来 → 自动 ACTIVE（#15）

## dsh 对标

`inject: ['tools']` 依赖编排启动——PENDING 直到可用、依赖消失连带卸载自动重载、坏配置 fail-loud。我们只抄声明式依赖语义，**不抄**运行时服务注入（LinkDesk 是声明式贡献 + Registry 查询）。

## 完成标准

requires 声明可用；循环依赖 fail-loud；依赖消失连带卸载、回来自动重载；loader 五态测试（无依赖/有依赖/缺依赖/循环/重载）；现有插件实机装卸无回归。
