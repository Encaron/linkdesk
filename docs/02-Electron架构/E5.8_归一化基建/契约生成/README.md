# 契约生成——Phase 4 档案目录

> **对应清单任务：E5.8#17-#22**（[../E5.8-执行清单.md](../E5.8-执行清单.md) Phase 4）。
> 本目录只装**档案**（设计文档 + 摸底矩阵）——任务条目永远在清单里，这里不复制任务。
> 目标：`window.linkdesk.*` 从"双面手写 + ambient any"收敛为单一生成契约——漂移编译期死。第三方作者拿 d.ts 获得编译期安全（VS Code `vscode.d.ts` 同款）。
> 前置：Phase 2 后即可（与 Phase 3 可并行）。**最大新建项。**

## 本目录收什么

| 文件 | 何时写 | 内容 |
|:--|:--|:--|
| `命名空间矩阵.md` | #17 开工时 | linkdesk.* 全量摸底：preload-pool.ts / preload-shell.ts 的 exposeInMainWorld 面 + linkdesk-api.ts 文档面 + IPC channel 双端表（20 命名空间量级）。漂移点登记（E5.7#97 已知 ambient `Record<string, any>` 欠账在此盘点） |
| `03-契约生成设计.md` | #18 开工时 | 细节设计（必备章节见下），写完**用户过目拍板**再动工 |

## 03-契约生成设计.md 必备章节（#18 写时照此结构）

1. **标注语法选型**——TS 装饰器在 preload 上下文受限不可行 → 标记注释 vs 显式注册表（本设计的核心决策点，权衡后拍板）
2. **生成物形态**——`linkdesk.d.ts` + 双面签名校验件；生成物可独立跑通；改动标注 → 生成物 diff 可见
3. **门禁接线**——生成物纳入 tsc 链路（双工程 + 壳/池/electron 三侧），contracts-ready：契约未生成编译不过（#21）
4. **文档面收敛**——docs/03-插件制造 契约文档改为生成 d.ts 指针（#22，不再手写第二份真相源）

## 现状速查（2026-08-16，写设计前核对）

- `preload-pool.ts` / `preload-shell.ts`——window.linkdesk.* 双面 + ambient 类型 `Record<string, any>`（E5.7#97 欠账）
- `src/core/api/linkdesk-api.ts`——文档面（与 preload 实现面 = 两份真相源，漂移靠文档约定抓）
- dsh 对标：Typert 生成器（host 侧 `@Remote` 标注 → 生成 client 声明 → contracts-ready 门禁）。**不做**：双 ts.Program 完全照搬（我们是三进程）、Typert 运行期 codec 校验（E5.8 只做编译期契约）

## 完成标准

生成器产出 linkdesk.d.ts；双工程接入；故意制造漂移 → 编译失败（实测一次）；删生成物 → check 红（实测一次）；文档与生成物一致。
