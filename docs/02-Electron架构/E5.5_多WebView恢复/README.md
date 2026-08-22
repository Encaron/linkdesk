# E5.5 多 WebView 恢复——专题文档索引

> 2026-08-07。**取消两行注释恢复多 WebView → 修剩余 bug → API 补全 → OverlayWindow 叠加方案 → E6 前置。**
> 58 任务，4 层 + 启动前审计 + API 补全 + 缩放联动 + 消灭硬编码 + 单/多 WebView 切换，~1,490 行净增，15-25.5 天。

## 文档导航

| 你要做什么 | 读这个 |
|:--|:--|
| 🔥 了解 E5.5 全局 | [`E5.5-执行清单.md`](E5.5-执行清单.md) — 56 任务，依赖图，估时 |
| 🔥 取消注释前必读 | [`启动前审计/`](启动前审计/) — E3a 教训：基础设施存在 ≠ 真在工作 |
| 🔥 修已知多 WebView bug | [`Bug修复/`](Bug修复/) — 5 个剩余 bug + 9 条根因模式 |
| 🔥 linkdesk.* API 缺口 | [`API补全/linkdesk-API缺口补全.md`](API补全/linkdesk-API缺口补全.md) — 14 命名空间/方法 + 27 处 import |
| 🔥 OverlayWindow 技术方案 | [`OverlayWindow/OverlayWindow设计.md`](OverlayWindow/OverlayWindow设计.md) |
| 插件悬浮层 IPC 化 | [`IPC化/插件悬浮层IPC方案.md`](IPC化/插件悬浮层IPC方案.md) |
| E6 服务 IPC 前置 | [`E6前置/E6服务IPC就绪.md`](E6前置/E6服务IPC就绪.md) |
| 回归验证 | [`回归验证/`](回归验证/) — 七场景 + overlay 矩阵 + 七大陷阱 |

## 目录结构

```
E5.5_多WebView恢复/
├── README.md                           ← 本文件
├── E5.5-执行清单.md                    ← 进度唯一真相源，勾一个做一个
├── 启动前审计/
│   ├── 通信合规审计.md                 ← E5.5#0a——plugin→@src/core import 全量扫描
│   ├── 模块级状态审计.md               ← E5.5#0b——独立 JS 堆副本检测
│   ├── IPC监听器生命周期.md            ← E5.5#0c——preload 监听器竞态防御
│   └── E3a教训-静默失效.md             ← E5.5#0d——registerPlugin 从未被调用
├── Bug修复/
│   ├── Z-order弹窗与毛玻璃.md          ← E5.5#5-#6——临时方案 + OverlayWindow 根治
│   ├── 侧栏主区状态同步.md             ← E5.5#7——E5#85 修复后重新验证
│   ├── localStorage双份.md             ← E5.5#8——迁移到 pluginState
│   ├── 串口多标签页sourceId覆盖.md     ← E5.5#9——重新验证
│   ├── MainContent硬编码pluginId.md    ← E5.5#10——plugin.json 声明式替代 if (pluginId === "...")
│   └── 多WebView根因9条模式.md         ← E5.5#7e——逐条验收
├── IPC化/
│   └── 插件悬浮层IPC方案.md            ← E5.5#11-#15——ContextMenu/Dialog/Toast/SelectBox
├── API补全/
│   └── linkdesk-API缺口补全.md         ← E5.5#16-#24——9 命名空间/方法 + 27 处 import 迁移
├── OverlayWindow/
│   └── OverlayWindow设计.md            ← E5.5#26-#40——对标 VS Code 三层窗口模型
├── E6前置/
│   └── E6服务IPC就绪.md               ← E5.5#46-#48——PluginInstallService 等
└── 回归验证/
    ├── 多WebView回归矩阵.md            ← E5.5#41-#44——七场景 + overlay + 崩溃
    └── 七大陷阱验证.md                 ← E5.5#45——CSS/IPC/内存/调试/体验/接缝/安全
```

## 关键数据

**现有资产（零删除）：** ~1,000 行多 WebView 代码
- `electron/window-manager.ts` ~350 行
- `electron/ipc-bridge.ts` ~410 行
- `electron/plugin-view-registry.ts` ~100 行
- `electron/ipc/plugin-view-handlers.ts` ~60 行
- `electron/preload-plugin.ts` ~350 行
- `src/hooks/useWebViewSync.ts` ~195 行
- `src/plugin-shell-main.tsx` + `plugin-view.html` ~120 行

**唯一阻止多 WebView 的代码：** [loader.ts:906-907](linkdesk/src/pluginLoader/loader.ts#L906-L907) 两行注释。

**E5#85 已解决的 bug：** Bug 6（设置空）、Bug 8（状态灯）、Bug 3/4 部分解决。剩余 5 个。

**E5.5 净增：** ~1,405 行（OverlayWindow ~400 + API 补全 ~420 + 缩放联动 ~55 + 硬编码消灭 ~25 + 持久化一致性 ~15 + 其余 ~490）。

---

> **← 上一 Phase：** `../E5_核心归一化与壳重构_待执行/`
> **→ 下一 Phase：** `../E6_插件生态与发布/`
