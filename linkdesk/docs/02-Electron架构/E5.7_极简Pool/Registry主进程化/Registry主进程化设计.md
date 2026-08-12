# Registry 主进程化设计

> 消灭跨进程数据隔离 bug 类。E5.7 极简Pool 下依然必要——主进程和 renderer 仍是两个进程。

---

## 1. 根因

TypeScript 模块在 Electron 多进程中各自独立实例化：

```
壳渲染进程 loader.ts → registerLangDef() → 写入壳渲染进程的 _extMap
主进程 ipcMain.handle → 读主进程的空 _extMap → 查询永远为空
```

**已知实例：** `langDef.get(".py")` 返回空、`protocol.listProtocols()` 返回空——编辑器 LSP 不启动、串口协议下拉框为空。当前用 `plugins:call` 代理打补丁——每加一个 Registry 就加一个 case，治标不治本。

## 2. 方案——主进程 plugin.json 预加载

```
主进程启动 → 扫描 plugins/builtin/ + plugins/user/
           → 读每个 plugin.json
           → 调 registerLangDef() / registerProtocol() / ...
           → 主进程 Registry 有数据 ✅

Pool renderer → langDef.get() → IPC langDef:get → 主进程读自己的 Map → 返回 ✅
```

**🔴 单写入方定死（2026-08-13 审计——原稿双真源：主进程扫盘 + 壳 IPC 同步并写同一张表，违反"壳=唯一真相源"且卸载语义未定义）：** 静态声明三表（LangDef/Protocol/FileAssociation）唯一写入方 = **主进程**：
- 启动扫盘——plugin-manifest-loader
- 运行时装/卸插件 → 主进程重扫对应 plugin.json
- Pool 插件运行时注册 → 直接 IPC 汇入主进程（E5.7#49/#50）

壳渲染进程**不写不读**这三张表——E5.7 壳无消费方（文件树/编辑器/串口全在 Pool），壳侧实例随 #49/#50 删除。"壳=唯一真相源"改为分区适用：tabState/命令执行留在壳；静态声明数据真源在主进程（文件打开路由本就在主进程决策，FileAssociation 迁主进程是功能必需）。

## 3. 迁移范围

| Registry | 是否迁移 | 原因 |
|:--|:--|:--|
| LangDefRegistry | ✅ 迁 | 跨进程查询（Pool renderer → 主进程） |
| ProtocolRegistry | ✅ 迁 | 同上 |
| FileAssociationService | ✅ 迁 | 纯字符串数据，可序列化 |
| FileDecorationRegistry | ❌ 不迁 | provider 是 JS 函数，不可跨进程序列化——真源与消费方同进程（E5.7 中 provider 注册与文件树消费都在 Pool），不进 IPC；机制归 #46 矩阵 + Phase 12（🔴 2026-08-13 审计：原稿"plugins:call 永久正确模式"是 E5.6 残影——代理目标是壳，E5.7 壳内已无 provider） |
| CommandRegistry | ❌ 不迁 | 已有 plugins:call 通路，纯壳内使用 |
| MenuRegistry | ❌ 不迁 | 同上 |
| KeybindingRegistry | ❌ 不迁 | 同上 |
| ConfigurationRegistry | ❌ 不迁 | 同上 |

> 🔴 2026-08-13 审计：本表为已定部分——registry/ 目录共 16 个文件（CardRegistry/ContextKeyService/ThemeRegistry 等未入表），全量以 E5.7#46 摸底矩阵为准。

## 4. 文件清单

| 文件 | 动作 |
|:--|:--|
| `electron/plugin-manifest-loader.ts` | 🆕 新建——主进程扫描器 ~80 行 |
| `electron/main.ts` | `app.whenReady()` 中调 loadAllPluginManifests() |
| `electron/preload-pool.ts` | langDef/protocol/fileAssociation 改直接 IPC |
| `src/core/services/IpcBridgeHandler.ts` | 删 langDef/protocol/fileAssociation 的 plugins:call case |
| `electron/ipc/lang-def-handlers.ts` | 删除（合并到统一的 registry-handlers） |
| `electron/ipc/protocol-handlers.ts` | 删除 |
| `.eslintrc` | no-restricted-imports——electron/ 下禁 import 壳侧 Registry 模块 |

## 5. ESLint 机械防线

```
'no-restricted-imports': [
  'error',
  {
    patterns: [{
      group: ['../src/core/registry/LangDefRegistry', '../src/core/registry/ProtocolRegistry', ...],
      message: '主进程 import 壳侧 Registry 得到空实例——数据在 plugin-manifest-loader 预加载',
    }],
  },
],
```

---

> 📖 执行清单 → [E5.7-执行清单.md](../E5.7-执行清单.md) Phase 11
