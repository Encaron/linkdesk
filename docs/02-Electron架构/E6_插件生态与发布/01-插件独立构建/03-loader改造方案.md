# loader.ts 改造——支持加载 .linkdesk-plugin 打包格式

> 对应任务：E6#6、#9（#8 已折叠进 #9，2026-08-30 第三批审视）。loader.ts 的 `loadPlugin()` 是插件加载唯一入口——改造需高度谨慎。
> 改动性质：增量添加，不改现有路径。

---

## 一、当前状态

`loadPlugin()` 当前有两种路径：

```
路径 A：Vite glob 命中（builtin/user 源码目录）
  → import.meta.glob → import() → loadPluginLifecycle

路径 B：glob 未命中（运行时安装/热加载）
  → IPC resolvePath → linkdesk:// 或 /@fs/ → import() → loadPluginLifecycle
```

两种路径最终都走 `loadPluginLifecycle`——统一的生命周期注册。

---

## 二、新增路径 C：打包格式

```
路径 C：打包格式（{userData}/plugins/<id>/）
  → 读 {userData}/plugins/<id>/plugin.json
  → 读 {userData}/plugins/<id>/index.bundle.js → import()
  → loadPluginLifecycle（和 A/B 同一条后续管道）
```

### 2.1 判断逻辑

```typescript
// loadPlugin() 入口
async function loadPlugin(pluginId: string, opts?: {
  source?: "source" | "bundled";
  pluginRoot?: string;
}) {
  const source = opts?.source ?? detectSource(pluginId);

  if (source === "bundled") {
    return loadPluginFromBundle(pluginId, opts?.pluginRoot);
  }
  // 现有逻辑不变——走 glob 或 IPC 解析
  return loadPluginFromSource(pluginId);
}

function detectSource(pluginId: string): "source" | "bundled" {
  // 1. glob 命中 → source
  // 2. {userData}/plugins/<id>/plugin.json 存在 → bundle
  // 3. 都不存在 → source（走 IPC resolvePath 兜底）
}
```

### 2.2 loadPluginFromBundle 实现

```typescript
async function loadPluginFromBundle(pluginId: string, pluginRoot?: string) {
  const root = pluginRoot ?? resolveBundleRoot(pluginId);
  // root = {userData}/plugins/<pluginId>/

  // 1. 读 plugin.json
  const manifest = await readBundleManifest(root);
  // pathUtils.join(root, "plugin.json") → fetch/fs.readFile

  // 2. 走 normalizeManifest + parseContributions（和 A/B 完全一样）
  const normalized = normalizeManifest(manifest, pluginId);

  // 3. 动态 import index.bundle.js
  const bundlePath = toBundleUrl(root); // file:// 或 path
  const module = await import(/* @vite-ignore */ bundlePath);
  const Component = module.default;

  // 4. 走 loadPluginLifecycle——和 A/B 共用
  return loadPluginLifecycle(pluginId, normalized, Component);
}
```

---

## 三、关键决策

### 3.1 源码路径保持完全不变

```
路径 A（glob 命中）→ 一行不改
路径 B（IPC 解析）→ 一行不改
路径 C（bundle）  → 新增独立分支

验证：npm run dev → 所有现有插件正常加载 ＝ 路径 A/B 没被破坏
```

### 3.2 打包格式的 plugin.json 和现有格式完全一样

不需要新字段、不需要新 schema。`.linkdesk-plugin` 里的 `plugin.json` 和源码目录里的 `plugin.json` 是同一份——打包时原样复制。

### 3.3 index.bundle.js 加载方式

```
生产环境：file:// 协议加载本地文件
开发环境：Vite dev server 提供

⚠️ 在单 WebView 下，import() 动态加载是同步 JS 堆内的——和 import.meta.glob 一样。
多 WebView 恢复后，bundle 加载走 WebView 的 <script> 标签——不影响现在。
```

---

## 四、installed-plugins.json 读写

### 4.1 格式

```json
{
  "hello-world": {
    "version": "1.0.0",
    "installedAt": "2026-08-07T12:00:00Z",
    "source": "marketplace",
    "bundlePath": "{userData}/plugins/hello-world/"
  }
}
```

### 4.2 实现

```typescript
// 读
const installed = storageService.get("installed-plugins") ?? {};

// 写（安装时）
installed[pluginId] = { version, installedAt: new Date().toISOString(), source: "marketplace" };
storageService.set("installed-plugins", installed);

// 删（卸载时）
delete installed[pluginId];
storageService.set("installed-plugins", installed);
```

**存放位置：** 壳的本地配置目录（`{userData}/installed-plugins.json`），和 `settings.json` 同级。

---

## 五、安装/卸载流程

### 5.1 安装

```
1. 下载 .linkdesk-plugin 文件（marketplace 插件负责）
2. 解压到 {userData}/plugins/<pluginId>/
3. 写 installed-plugins.json
4. 调 loadPlugin(pluginId, { source: "bundled" })
5. 通知 UI 刷新：
   - IconBar 重读 viewRegistry
   - SidePanel 重读 viewsContainers
   - marketplace 页面刷新安装状态
```

### 5.2 卸载

```
1. 弹确认框 "确定卸载 <pluginName>？"
   → 取消：什么都不做
   → 确定：
2. 关掉所有该插件的标签页（tabs.closeByPluginId）
3. 调 unloadPlugin(pluginId)——清理注册表
4. 删 {userData}/plugins/<pluginId>/ 目录
5. 删 installed-plugins.json 对应条目
6. 通知 UI 刷新
```

### 5.3 更新

```
= 卸载旧版 + 安装新版
额外检查：如果插件正在使用（有打开的标签页）→ 提示"需要关闭标签页"
```

---

## 六、涉及文件

| 文件 | 改动性质 |
|:--|:--|
| `src/pluginLoader/loader.ts` | 改——加 loadPluginFromBundle() 分支 |
| `src/core/services/StorageService.ts` | 已有——读写 installed-plugins 走现有接口 |
| `electron/protocol.ts` | 可能改——如 .linkdesk-plugin 需要 protocol 解析 |

---

## 七、审视实锤（2026-08-30 第三批——glob 替换 + pluginLoader 拆分的现状依据）

> 2026-08-30 第三批审视（E6#9、#9.1）落笔的现状摸底，沉档供实现时对照——清单只留指针。

### 7.1 glob 真身（不是 pool-main.tsx）

| 文件 | glob 组 | 数量 |
|:--|:--|:--|
| `src/pluginLoader/state.ts` | `pluginModules` / `pluginStatusBarModules` / `viewRenderModules` / `pluginManifests`（eager） | 14 |
| `src/pool/shared/plugin-component/PluginComponent.tsx` | `pluginModules` / `viewModules` | 4 |

`src/pool/pool-main.tsx` **零 glob**——纯 layout 接收入口，头注释「极简Pool 无 ?zone= 路由」。清单早期写「pool-main.tsx 去 glob」是 E5.6 时代误标，第三批已修正。

### 7.2 为何 E6#8 折叠进 E6#9

原 #8 方案（`?entry=` URL 参数 + plugin-view:create）是 **E5.6 多 WebView 时代话术**，极简 Pool 下全部失效：
- `?entry=` URL 参数靠「loader/WindowManager 创建 WebView 时附加」——极简 Pool 只有 1 BW + 1 WCV，**不按插件创建 WebView，无消费点**
- `plugin-view:create` handler 已随 PluginViewRegistry 消亡（`electron/ipc/handlers/plugin-view-handlers.ts` 头自述 14 通道消亡）
- glob 真身不在 pool-main.tsx（见 7.1）——任务文件指向错

**折叠结论：** #8 的「替代 glob 动态加载」意图 = #9a-d 全部覆盖 + #9f 验证含 Pool 渲染，折叠不双份 churn（第一批 preload-shell 折叠先例）。

### 7.3 #9 完成路径可行性（已坐实，非纸面完美）

- ✅ `linkdesk://` 协议已注册（`electron/plugins/protocol.ts` `protocol.handle` + `main.ts:385` privileged）——prod 动态 import 路径真实存在
- ✅ `PluginComponent.tsx` 已有 `import(/* @vite-ignore */ url)` 兜底（`/@fs/` dev + `linkdesk://` prod 分支 + `resolvePath` 桥）——**#9d 是升级现有兜底非从零写**
- 🔧 `plugins:listAll` / `plugins:readAllManifests` IPC 不存在——新建，走 audit-api-contracts 四齐全（contracts 类型 + preload + handler + 03-插件制造 文档）

### 7.4 #9.1 拆分执行序（避免同一文件改两遍）

先 #9 改写 glob（loader/state 的 glob→IPC 发现逻辑直接落到 `discovery/` 目标夹新文件），再 #9.1 `git mv` 建夹保历史——**先改写、后搬家**，同一文件只改一遍。

### 7.5 执行序段引用同步

- 第 1.2 轮批次名：`E6#9、#9.1（#8 折叠）`
- `#7` 依赖：`← 依赖 E6#9（#8 折叠）`
- `#15f` 注记：`E6#9 只覆盖 loader/PluginComponent/state glob`

---

> **← 上一文档：** `02-linkdesk-plugin格式规范.md`
> **→ 下一文档：** `04-安装卸载生命周期.md`
