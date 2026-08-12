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

**壳渲染进程 Registry 保留**——壳代码（tabState/命令执行/loader.ts）仍直接 import。两个实例并存但数据一致——壳注册时同时 IPC 同步到主进程。

> **E5.7 变化：** "壳内插件"已不存在——插件全部在 Pool 渲染、走 `window.linkdesk.*`，不直接 import @src/core。壳渲染进程里直接 import Registry 的只剩壳自己的代码。同步方向不变：壳注册 → IPC → 主进程镜像。

**主进程 Registry 是"服务端缓存"——不替换壳侧 Registry，而是镜像一份供跨进程查询。**

## 3. 迁移范围

| Registry | 是否迁移 | 原因 |
|:--|:--|:--|
| LangDefRegistry | ✅ 迁 | 跨进程查询（Pool renderer → 主进程） |
| ProtocolRegistry | ✅ 迁 | 同上 |
| FileAssociationService | ✅ 迁 | 纯字符串数据，可序列化 |
| FileDecorationRegistry | ❌ 不迁 | provider 是 JS 函数，不可跨进程序列化——`plugins:call` 对它是永久正确模式 |
| CommandRegistry | ❌ 不迁 | 已有 plugins:call 通路，纯壳内使用 |
| MenuRegistry | ❌ 不迁 | 同上 |
| KeybindingRegistry | ❌ 不迁 | 同上 |
| ConfigurationRegistry | ❌ 不迁 | 同上 |

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
