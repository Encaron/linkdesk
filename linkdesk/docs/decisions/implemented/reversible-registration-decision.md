# 可逆注册 Phase 2 三项拍板（E5.8#8）

- **日期**：2026-08-19
- **状态**：implemented（E5.8#8 收官 commit）
- **背景**：E5.8 Phase 2 目标 = 一切注册返回 disposer，卸载逆序回滚——插件重装契约（"可卸载 ⇒ 可重装"）的机械保障。摸底矩阵（#7）实证：11 核心注册表中仅 4 个 extends RegistryBase（类注册表自动对称），其余 7 个 + services 靠 lifecycle.ts 消费端 2b 手动列举 9 处 unregister\*（词典式列举，人记不住）。设计文档 `docs/02-Electron架构/E5.8_归一化基建/可逆注册/02-可逆注册设计.md` 完成后，三个决策点提交用户拍板（2026-08-19，全部按推荐通过）。
- **决策**：
  1. **兼容期策略 = 一步到位**（非双轨过渡）。判据：旧 unregister\* 函数全仓唯一生产消费方 = lifecycle.ts 消费端 2b（grep 实锤，插件/linkdesk.\* API 零消费）——删旧 API 无外部影响，双轨 = 给零消费方死 API 续命 + 每个注册表双份清理路径（重开"哪个清单权威"问题）。
  2. **主进程侧三表机制 = 保持全清全重扫**（LangDef/Protocol/FileAssociation，registry-handlers.ts，数据源 = plugin-manifest-loader 预加载 → `plugins:rescanManifests` 全量重建）。边界规则成文：**命令式运行时注册 → 可逆注册 disposer 逆序回滚；声明式 manifest 派生表 → 全量重建**。声明式重建天然无残留、无增量状态，不给它装 disposer 基建。
  3. **ContextKeyService.registerExternalGetter = 返 disposer 但不进插件回滚**（全局值源 hook，非插件作用域）。保持"一切注册返 disposer"不变量统一，同时不 trackRegistration（无插件作用域，卸载回滚不适用）。
- **影响**：#9（RegistryBase v2 + 新建模块级 `registrationTracker.ts`——类/函数注册表共用逆序回滚）→ #10（13 Registry 逐项 register 返 disposer）→ #12（删 9 处旧 unregister\* + 消费端 2b 整段，grep `unregisterPlugin*` 清零）。执行序列见设计文档 §7。
- **Superseded by**：（无）
