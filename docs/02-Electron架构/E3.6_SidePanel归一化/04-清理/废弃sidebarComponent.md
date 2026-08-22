# 清理——废弃 sidebarComponent 旧系统

> 对应任务：E36#10。**R4 最后一步——确认新系统稳定后删除旧系统。**

---

## 为什么不能提前删

R2（SidePanel 切到 ViewContainerService）完成后 SidePanel 不再查 `sidebarComponent`——但 loader 仍在解析旧的 `sidebar` 字段（不影响 UI）。如果 R2 就删旧解析 → 插件还没迁移 → `sidebar.tsx` 没人加载 → 侧栏空白。

**严格顺序——不可乱序：**
```
R1: 建 ViewContainerService 桌子
R2: SidePanel 切到新路径（不再查 sidebarComponent）
R3: 逐个迁移三个插件（每个插件加 viewsContainers + views 声明）
R4: 三插件全部在新系统上正常运行 → 删旧系统
```

R2 完成后 SidePanel 永远不查 `sidebarComponent`。loader 仍解析旧 `sidebar` 字段但不影响 UI——死数据。R3 逐个迁移插件后旧字段彻底无用。R4 安全删除。

---

## 删除清单

### 1. types.ts——移除 sidebarComponent 字段

```typescript
// src/core/types.ts —— ViewPluginEntry 接口
// 删这一行：
sidebarComponent?: React.ComponentType;
```

### 2. viewRegistry.ts——移除 sidebarComponent 引用

```typescript
// src/pluginLoader/viewRegistry.ts

// ① registerViewPlugin 参数类型——sidebarComponent 已从 ViewPluginEntry 移除，参数不再包含
// ② getTabCreatableViews——改过滤条件：
//    旧：filter(entry => !entry.sidebarComponent)
//    新：filter(entry => !entry.manifest.contributes?.viewsContainers)
//    语义等价——tabOnly 插件不声明 viewsContainers → 可通过 [+] 菜单创建标签页
```

**🔥 grep 确认——viewRegistry.ts 中 "sidebarComponent" 出现次数 → 0**

### 3. loader.ts——移除旧解析逻辑

```typescript
// src/pluginLoader/loader.ts

// 删：
// - import.meta.glob("/plugins/**/sidebar.tsx") 调用（多条 glob pattern）
// - 运行时动态 import() sidebar.tsx 的逻辑
// - sidebarComponent 赋值到 ViewPluginEntry 的代码
// - parseContributions 中旧 sidebar 字段的处理

// 🔥 grep 确认——loader.ts 中 "sidebar" 出现次数 → 0
// （保留 import.meta.glob index.tsx 等主入口文件——那些不是 sidebar）
```

### 4. 三个 plugin.json——移除 sidebar 字段

```json
// 删这一行（三个文件各一处）：
"sidebar": "src/sidebar.tsx",
```

三个文件：
- `plugins/builtin/file-tree/plugin.json`
- `plugins/builtin/marketplace/plugin.json`
- `plugins/user/serial-monitor/plugin.json`

### 5. 三个旧 sidebar.tsx——删除文件

```bash
rm plugins/builtin/file-tree/src/sidebar.tsx
rm plugins/builtin/marketplace/src/sidebar.tsx
rm plugins/user/serial-monitor/src/sidebar.tsx
```

确认没有其他文件 import 这些文件：
```bash
grep -rn "from.*['\"].*sidebar" plugins/ --include="*.ts" --include="*.tsx"
```
file-tree 的 `index.tsx` 可能 re-export sidebar → 改成 re-export `FoldersView`。

---

## 🔥 grep 验证——不可跳过

```bash
# 验证 1：sidebarComponent 字段完全消失
grep -rn "sidebarComponent" src/ plugins/ --include="*.ts" --include="*.tsx" --include="*.json"
# → 必须返回空（或只在注释中）

# 验证 2：plugin.json 不再有 sidebar 字段
grep -rn '"sidebar"' plugins/ --include="*.json"
# → 必须返回空

# 验证 3：旧 sidebar.tsx 文件已删除
ls plugins/builtin/file-tree/src/sidebar.tsx      # → No such file
ls plugins/builtin/marketplace/src/sidebar.tsx    # → No such file
ls plugins/user/serial-monitor/src/sidebar.tsx    # → No such file

# 验证 4：没有代码仍在 import 这些文件
grep -rn "from.*['\"].*sidebar" plugins/ src/ --include="*.ts" --include="*.tsx"
# → 返回空（或只在注释/@deprecated 中）
```

---

## 删除后回归验证

- [ ] `npm run check` 零错误（tsc + ESRint + vitest）
- [ ] 点 📁 → 侧栏正常工作（走 ViewContainerService 新路径）
- [ ] 点 🪢 → 侧栏正常工作
- [ ] 点 🛒 → 侧栏正常工作
- [ ] 三个 `grep` 全部返回空
- [ ] 没有 console 报错含 "sidebarComponent" 或 "sidebar.tsx"

---

## 文件

- `src/core/types.ts`——−1 行（sidebarComponent 字段）
- `src/pluginLoader/viewRegistry.ts`——−3 行
- `src/pluginLoader/loader.ts`——−10 行
- 3 个 `plugin.json`——−3 行
- 3 个旧 `sidebar.tsx`——删除 3 文件

**改动：** ~17 行改动 + 3 文件删除
