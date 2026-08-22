# Pool 模型 API 设计

> 📖 对应执行清单：[E5.6#43-#52](../E5.6-执行清单.md)
> 📖 变更清单：[05-API变更清单.md](../05-API变更清单.md)

---

## pool.* 命名空间——壳侧

详见 [05-API变更清单.md](../05-API变更清单.md) §1。

## 补全 10 个命名空间

详见 [E5.6-执行清单.md](../E5.6-执行清单.md) Phase 10。

## IPC 通道一览

| 通道 | 方向 | Preload 模块顶层？ |
|:--|:--|:--|
| `pool:layout` | 壳→池 | ✅ 是（池侧 preload-plugin） |
| `pool:ready` | 池→壳 | ✅ 是（壳侧 preload-shell） |
| `pool:ping` | 壳→池 | ✅ 是 |
| `pool:pong` | 池→壳 | ✅ 是 |
| `workspace:*` | 插件→主进程 | ✅ 是 |
| `commands:registerCommand` | 插件→主进程 | ✅ 是 |
| `fileAssociation:getPluginFor` | 插件→主进程 | ✅ 是 |
| `viewContainer:*` | 插件→主进程 | ✅ 是 |
| `fileDecoration:*` | 插件→主进程 | ✅ 是 |
| `protocol:*` | 插件→主进程 | ✅ 是 |
| `quickPick:show/result` | 插件→壳 | ✅ 是 |
