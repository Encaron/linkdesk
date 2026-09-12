/**
 * linkdesk-api update 域——主软件更新**只读**面（E6#57.8，06-主软件更新）。
 * 自 linkdesk-api.ts 拆出（E6#57.8）——第 15 个命名空间域接口。
 * 依赖方向：update → src/core/types/ipc/update（跨堆 wire 载荷类型，决策点 1）；被聚合器交叉组装。
 *
 * 暴露边界（07-数据流通格式 §一/§六，2026-09-11 定案）——**只读一法，写命令不在此面**：
 * 检查 / 下载 / 重启安装是**壳私事**，第三方插件不得触发（重启安装会关掉用户正在用的软件，
 * 不是插件能替用户决定的事）；发行说明取数（`getReleaseNotes`）同样不开放。
 *
 * 🔴 **为什么契约面只写 `getState` 是设计而非疏漏**：「第三方只读」这条约束的落点是**类型**，
 * 不是文档——池 preload 只注入本面 ⇒ 插件侧**根本没有写命令的入口**（`satisfies PoolExposed`
 * 编译期即门禁）。壳侧那半（写命令）由 preload-shell 用工厂函数**超额暴露**，对标
 * `buildShellApp()` 暴露 `getProductInfo` 的既有先例，不进本契约。
 */
import type { UpdateState } from "../../types/ipc/update";

export interface UpdateAPI {
  /** update 命名空间——只读更新状态（供「关于」类插件读宿主版本/更新态）。 */
  update: {
    /** 读当前状态机全量态（07 §4.1：永不抛——服务必然有态）。 */
    getState(): Promise<UpdateState>;
  };
}
