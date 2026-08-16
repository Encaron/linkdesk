# 可逆注册——Phase 2 档案目录

> **对应清单任务：E5.8#7-#12**（[../E5.8-执行清单.md](../E5.8-执行清单.md) Phase 2）。
> 本目录只装**档案**（设计文档 + 摸底矩阵）——任务条目永远在清单里，这里不复制任务。
> 目标：一切注册返回 disposer，卸载逆序回滚——插件重装契约（"可卸载 ⇒ 可重装"）的机械保障。**最大推翻项。**

## 本目录收什么

| 文件 | 何时写 | 内容 |
|:--|:--|:--|
| `注册点矩阵.md` | #7 开工时 | 全仓注册点清单：14 Registry × register/on 面 + PluginLifecycle 订阅 + useIpcEvent + 定时器等非 Registry 注册点，逐项标注现有 dispose 覆盖度（RegistryBase 已覆盖 / 手动清理 / 无退路）——Phase 2 的执行地图 |
| `02-可逆注册设计.md` | #8 开工时 | 细节设计（必备章节见下），写完**用户过目拍板**再动工 |

## 02-可逆注册设计.md 必备章节（#8 写时照此结构）

1. **RegistryBase v2 路线**——register() 返 disposer + effect 登记器（逆序回滚，对标 dsh `ctx.effect`：execute 立即跑、disposer 逆序跑）；markPlugin 机制归并——register 返 disposer 即登记、disposer 跑即注销，两套合一
2. **双轨兼容期决策**——一步到位 vs 过渡期（按 #7 矩阵规模拍板，这是本设计的核心决策点）
3. **loader 生命周期状态机**——PENDING→LOADING→ACTIVE→UNLOADING→DISPOSED + 诊断面（"插件为什么没激活"可查，对标 dsh 诊断面）
4. **卸载链路机械保障**——旧手动 unregister 摘除（lifecycle.ts 手动列举清零）

## 现状速查（2026-08-16，写设计前核对）

- `src/core/registry/RegistryBase.ts`——已有 markPlugin/unregisterAll 登记注销自动对称（E4 Emitter Pattern），v2 在此升级
- 14 Registry register() 返 void——逐项返 disposer（#10 列全名单：Command/Menu/Theme/Protocol/Keybinding/Icon/Configuration/ContextKey/LangDef/Language/StatusBar/QuickPick/ClipboardProvider）
- dsh 对标：`ctx.effect` 逆序回滚 + Fiber 状态机（源码 `E:\deepseek-harness`）

## 完成标准

14 Registry register() 全返 disposer；卸载/重装实测拆净（无残留监听/注册/定时器）；单测钉"注册→dispose→查询为空"；tsc/eslint/vitest 全绿。
