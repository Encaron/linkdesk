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

## 2. 方案——主进程 plugin.json 预加载（E5.7#47 方案骨架）

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

### 2.1 启动时序

```
app.whenReady()
  ├─ registerProtocol()            // linkdesk:// 自定义协议（现状保留）
  ├─ loadAllPluginManifests()      // 🆕 #48——必须在 createWindow 之前
  └─ createWindow()                // 内注册 registry-handlers + 创建池 WCV
```

- **唯一调用点 = whenReady**。壳崩溃重建（rebuildShell→createWindow）和 macOS activate 都直接调 createWindow、不经过 whenReady——主进程三表数据天然存活，无需重扫。
- 池 WCV 在 createWindow 内创建（main.ts:109）、IPC 查询只可能晚于 whenReady → 首个查询到达时表已填好，**无竞态窗口**。
- 扫盘路径双态（electron-builder.yml 实证：plugins/ 走 extraResources 进 `<resources>/plugins/`，不进 ASAR）：
  - dev：`<项目根>/plugins/{builtin,user}/*/plugin.json`
  - packaged：`process.resourcesPath/plugins/{builtin,user}/*/plugin.json`
  - 子目录名复用 `src/core/pluginPaths.ts` 的 `PLUGIN_SUBDIRS` 常量（硬约束 12 不复制路径字面量）；glob 工厂是渲染进程产物，主进程用 fs.readdir 直扫。

### 2.2 三表数据流 + builtin 协议特例

| 表 | 数据来源 | 主进程注册方式 |
|:--|:--|:--|
| LangDefRegistry | plugin.json `contributes.langDefs`（纯 JSON，可序列化——LangDefRegistry.ts 实证） | 逐条 `registerLangDef(pluginId, def)` |
| ProtocolRegistry | **特例**：现有唯一注册方是壳 `App.tsx:218 ensureBuiltinProtocols()`（方括号协议，含 parseLine JS 函数）——没有任何插件 plugin.json 注册协议（grep 实证，矩阵原记"loader 写入"有误，见勘误）。`parseLine` 从不跨 IPC（壳代理 IpcBridgeHandler:538-543 返回前剥函数，池只见过 `{id,name,pluginId,mode}`） | plugin-manifest-loader 直接调 `ensureBuiltinProtocols()` 汇入**主进程**实例。实证订正（#48）：无 `contributes.protocols` schema key，top-level `mode` 字段全仓零消费——Phase 11 行为中性，只汇 builtin；插件协议贡献的注册路径留给首个贡献方落地时按 schema 定义 |
| FileAssociationService | plugin.json `contributes.fileAssociations`（纯字符串） | 逐条 `registerFileAssociation(...)` |

- **壳侧对称移除（#49/#50）**：App.tsx:218 `ensureBuiltinProtocols()` 调用删除；loader.ts:594 registerFileAssociation / loader.ts:613 registerLangDef 两块删除 → 壳三表实例变空实例，且壳侧零消费者（代理 case 同任务删除）→ 壳 bundle 中三模块成死代码，随 tree-shake 出包。
- 主进程实例里的 `parseLine` 是惰性数据（主进程永不调用——序列化边界剥掉），结构保留不破坏 ProtocolRegistry 模块（Phase 7 Rust/WASM 解析若落主进程直接可用）。
- `_activeProtocolId` 现状就是内存态（ProtocolRegistry.ts:33 "从 Prefs 读"从未落地）——迁移保持内存态，**不新增持久化**（不在 Phase 11 范围）。

### 2.3 增量同步——装/卸/重装插件

- 安装/卸载/重装的执行方在**壳**（loader.ts:1201/1279/1482，文件操作经 lk.filesystem 落主进程）。
- 成功路径追加一次壳→主进程通知 `plugins:rescanManifests` → 主进程**全清 + 全重扫**：
  - 三表都有 clear API（clearLangDefs / clearProtocols / clearFileAssociations），全清后重扫语义干净，等价"逐插件 unregister 再 register"；
  - `_activeProtocolId` 清空回退 "bracket"——与现状 unregisterProtocol 的卸载回退行为一致，行为中性；
  - 扫描量级小（数十个 plugin.json），全量重扫无性能顾虑，也免去"只重扫单个插件"的边角情况。
- 注册幂等由 register* 函数内建（同 pluginId 去重 / 覆盖不叠加），主进程预加载与重扫双路径天然安全。

### 2.4 preload 直接 IPC——2 跳拉直为 1 跳

通道名**全部不变**（矩阵已证当前通道就是这些名字），preload-pool 只拆掉 `plugins:call` 包装，接收端从壳 IpcBridgeHandler 换成主进程 `electron/ipc/registry-handlers.ts`（🆕）：

| 池侧 API | 现状（2 跳） | 迁移后（1 跳） | 返回形状 |
|:--|:--|:--|:--|
| `lk.langDef.get(ext)` | plugins:call 'getLangDef' → 壳:521 | 直连 `langDef:get` | `{ id, lsp } \| null`（保持现状剥壳形状，preload 类型签名不动） |
| `lk.protocol.listProtocols()` | plugins:call 'protocol:listProtocols' → 壳:537 | 直连 `protocol:listProtocols` | `{id,name,pluginId,mode}[]`（剥 parseLine） |
| `lk.protocol.getActiveProtocolId()` | plugins:call → 壳:545 | 直连同名 | string |
| `lk.protocol.setActiveProtocolId(id)` | plugins:call → 壳:548 | 直连同名 | void |
| `lk.fileAssociation.getPluginFor(ext)` | PROXY_CHANNELS → 壳:187 | 直连 `fileAssociation:getPluginFor` | string \| undefined |

**池侧 API 面（window.linkdesk.*）签名零改动 → 插件零改动**。壳侧 IpcBridgeHandler 五个 case（getLangDef/getAllLangDefs/protocol:×3/fileAssociation:getPluginFor）+ PROXY_CHANNELS 中 `fileAssociation:getPluginFor` 条目同任务删除。

### 2.5 迁移优先级 + 回退方案

**优先级**（每任务独立 commit，可随时停在任一 commit 上）：
1. **#49 LangDef + Protocol**——LSP 依赖最高、数据最纯、直接验证"2 跳→1 跳"；
2. **#50 FileAssociation**——消费面最广（文件树双击/搜索）；
3. **#51 删死 handler 文件**——lang-def-handlers.ts + protocol-handlers.ts（矩阵已证零调用读空实例，删除有实证背书）；
4. **#52 ESLint 防线**——收口后新代码不可能再踩空实例坑。

**回退方案**（三层）：
1. **扫盘失败不 fatal**：插件目录缺失/不可读 → console.error + 空表启动，窗口正常打开——可观测降级 = 编辑器无 LSP + 协议下拉仅剩 bracket 之外的插件协议缺失（bug 立刻可见，不静默）；
2. **插件级错误隔离**：单个 plugin.json 损坏/解析失败 → 跳过该插件 + console.error，不中断整轮扫描；
3. **最坏回退 = git revert 单 commit**——每任务独立提交；**不设双写兼容层**（写入方唯一性定死，双写 = 复活双真源）。

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
| `electron/plugin-manifest-loader.ts` | 🆕 新建——主进程扫描器（扫盘 + builtin 协议 + 全清重扫） |
| `electron/ipc/registry-handlers.ts` | 🆕 新建——主进程三表 IPC 接收端（langDef:get / protocol:×3 / fileAssociation:getPluginFor） |
| `electron/main.ts` | `app.whenReady()` 中调 loadAllPluginManifests()；删 protocol/langDef 死 handler 注册 |
| `electron/preload-pool.ts` | langDef/protocol/fileAssociation 改直接 IPC |
| `src/core/services/IpcBridgeHandler.ts` | 删 langDef/protocol/fileAssociation 的 plugins:call case |
| `src/pluginLoader/loader.ts` | 删 registerLangDef/registerFileAssociation 两块（#49/#50）；装/卸/重装成功路径发 rescan 通知 |
| `src/App.tsx` | 删 ensureBuiltinProtocols() 调用 + import（#49） |
| `electron/ipc/lang-def-handlers.ts` | 删除（#51——合并到统一的 registry-handlers） |
| `electron/ipc/protocol-handlers.ts` | 删除（#51） |
| `.eslintrc` | no-restricted-imports——electron/ 下禁 import 壳侧 Registry 模块（#52） |

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
