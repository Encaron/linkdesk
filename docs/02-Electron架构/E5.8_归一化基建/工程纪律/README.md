# 工程纪律——Phase 1 档案目录

> **对应清单任务：E5.8#1-#6**（[../E5.8-执行清单.md](../E5.8-执行清单.md) Phase 1）。
> 本目录只装**档案**（落盘物 + 开工说明）——任务条目永远在清单里，这里不复制任务。
> 目标：机械哨兵先行——重复/死代码/供应链风险不靠人眼。零架构风险，保护 Phase 2/3 重写期。

## 本目录收什么

| 文件 | 何时写 | 内容 |
|:--|:--|:--|
| `jscpd-存量处置.md` | #1 收口时 | jscpd 存量重复处置账本——修复合并 9 处 + 豁免 20 处结构性克隆（按文件分组索引，豁免理由在代码注释里） |
| `原生模块清单.md` | #4 开工时 | serialport / electron 的 install scripts 逐一记录（干什么、为什么需要）——#4 验收落盘物 |

**不在本目录的（指路）：**

| 落点 | 去哪 |
|:--|:--|
| jscpd 豁免注释 | 写在代码里（`jscpd:ignore-start~end` 注释块），不落文档——#1 |
| knip ignore 带理由 | 写在 `knip.json` 注释里——#2 |
| pushLayout 两条规则 | 代码落点：`poolLayout.ts` 头注释 + `preload-pool.ts` + E5.7 设计文档 §7.2 补注——#5（规则全文见 [01-归一化基建设计.md §支柱4](../01-归一化基建设计.md)） |
| 决策记录 | `docs/decisions/`（全工程共用目录，不在本目录）——#6 |

## dsh 对标参数（开工时照抄，源码 `E:\deepseek-harness`）

| 项 | dsh 做法 | E5.8 落地 |
|:--|:--|:--|
| jscpd | minTokens 60 / minLines 6 / mode mild | `.jscpd.json` + `npm run duplication` 入 check 链 |
| knip | 双工程 entry | `knip.json` src/ + electron/ 双工程（预计 30 行内） |
| lefthook | postinstall 自动装 + "local checkpoints fast; CI owns the full matrix" | postinstall 自动 install；pre-commit staged lint --fix + whitespace；pre-push typecheck（无 CI，最后防线） |
| allowBuilds | pnpm 10+ 专属 | **不切包管理器**——npm 等价物：`engines` + `.npmrc` `engine-strict=true` + package-lock 钉死 |

## 完成标准

`npm run check` 全绿且含新门禁；存量问题清零或显式豁免（豁免必须带理由，不靠基线放过）；hook 生效实测；engine-strict 实测拒错版本。
