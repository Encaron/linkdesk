# FileService API 命名归一化

> 2026-08-02。**E5 第 2 层第 9 轮。** 统一动词+名词命名——AI 和人都能一看就懂。
> 执行清单任务：E5#20

---

## 一、前因——命名不一致

### 1.1 当前 API（`src/core/FileService.ts`）

| 方法 | 行号 | 问题 |
|------|:--:|------|
| `mkdir(dirPath)` | L151 | Unix 缩写——`writeFile`/`readFile` 动词+名词，它不协调 |
| `listDir(dirPath)` | L91 | Dir 缩写 vs File 全称——不统一 |
| `deleteEntry(filePath)` | L128 | Entry 是什么？preload 里叫 `remove`——两个名字 |
| `watchFile(dirPath, ...)` | L169 | File 后缀暗示只支持文件——实际目录也能 watch |
| `exists(filePath)` | L136 | 命名 ok |
| `readFile(filePath)` | L101 | 命名 ok |
| `writeFile(filePath, content)` | L120 | 命名 ok |
| `copy(src, dest)` | L143 | 命名 ok（无 File 后缀——语义清晰） |
| `readBinaryFile(filePath)` | L111 | 命名 ok |

### 1.2 后端 API（`electron/services/file-service.ts`）

| 方法 | 行号 | 对应前端 | 命名一致？ |
|------|:--:|------|:--:|
| `mkdir(dirPath)` | L63 | `mkdir` | ✅ 一致（但都不好） |
| `listDir(dirPath)` | L112 | `listDir` | ✅ |
| `remove(dirPath)` | L96 | `deleteEntry` | ❌ **两个名字** |
| `readTextFile(filePath)` | L48 | `readFile` | ❌ |
| `writeTextFile(filePath, data)` | L52 | `writeFile` | ❌ |
| `watchFile(dirPath, ...)` | L144 | `watchFile` | ✅ |
| `exists(filePath)` | L59 | `exists` | ✅ |
| `copy(src, dest)` | L87 | `copy` | ✅ |

### 1.3 目标——统一命名规则

```
动词+名词，名词统一用 File/Dir（不混合缩写）

readFile / writeFile / copy / remove / exists
createDir / listDir / watch
```

---

## 二、重命名方案

| 旧名 | 新名 | 原因 | 影响面 |
|------|------|------|:--:|
| `mkdir` | `createDir` | 与 `writeFile`/`readFile` 动词+名词一致、与 `listDir` 的 Dir 一致 | ~15 处 |
| `deleteEntry` | `remove` | 与后端 `remove` 一致、语义清晰 | ~10 处 |
| `watchFile` | `watch` | 去掉误导性 File 后缀——目录也能 watch | ~5 处 |
| `listDir` | **保留** | Dir 与 createDir 一致 | 0 |
| `exists` | **保留** | 语义准确 | 0 |

### 2.1 具体改动（精确到函数签名）

**`src/core/FileService.ts`：**

```typescript
// L151
- export async function mkdir(dirPath: string): Promise<void> {
+ export async function createDir(dirPath: string): Promise<void> {

// L128
- export async function deleteEntry(filePath: string): Promise<void> {
+ export async function remove(filePath: string): Promise<void> {

// L169
- export async function watchFile(dirPath: string, onEvent: ...): Promise<...> {
+ export async function watch(dirPath: string, onEvent: ...): Promise<...> {
```

**`electron/services/file-service.ts`：**

```typescript
// L63
- async mkdir(dirPath: string): Promise<void> {
+ async createDir(dirPath: string): Promise<void> {
```

**`electron/main.ts` IPC handler：**

```typescript
// grep 所有 'filesystem:mkdir' / 'filesystem:deleteEntry' / 'filesystem:watchFile'
// → 改为 'filesystem:createDir' / 'filesystem:remove' / 'filesystem:watch'
```

**全项目调用点：** 所有 `import { mkdir }` → `import { createDir }` 等。

---

## 三、实现步骤

### E5#20a mkdir → createDir（~15 处）

**文件：** `src/core/FileService.ts` L151 + `electron/services/file-service.ts` L63 + `electron/main.ts` IPC handler + 所有调用点。

**搜索：** `grep -rn "mkdir\|'filesystem:mkdir'" src/ electron/ plugins/` → 逐处替换。

### E5#20b deleteEntry → remove（~10 处）

**文件：** `src/core/FileService.ts` L128 + `electron/main.ts` IPC handler + 所有调用点。

**搜索：** `grep -rn "deleteEntry\|'filesystem:deleteEntry'" src/ electron/ plugins/` → 逐处替换。

### E5#20c watchFile → watch（~5 处）

**文件：** `src/core/FileService.ts` L169 + `electron/services/file-service.ts` L144 + 所有调用点。

**搜索：** `grep -rn "watchFile\|'filesystem:watchFile'" src/ electron/ plugins/` → 逐处替换。

### E5#20d 保留 listDir + exists（零行）

### E5#20e 验证——grep 残留

```bash
grep -rn "mkdir\|deleteEntry\|watchFile" src/ electron/ plugins/
# 必须只返回注释/文档中的提及——源代码中全部替换完毕
```

---

## 🔴 预测 Bug

### Bug E5-20a 🔴 IPC handler 名不同步——前后端名不一样

**触发条件：** 前端 `remove()` 发 IPC `'filesystem:remove'` → 后端 handler 还在监听 `'filesystem:deleteEntry'` → IPC 调用静默失败 → 功能不可用。

**🔥 防线——grep IPC handler 注册名：**
```bash
grep -rn "filesystem:mkdir\|filesystem:deleteEntry\|filesystem:watchFile" electron/
# 每个都改为新名——和前端 FileService 方法名一致
```

---

### Bug E5-20b 🔴 preload 暴露的 API 名不同步

**触发条件：** `preload-shell.ts` 中 `window.linkdesk.filesystem` 暴露的 API 名 → 改了 `FileService.ts` 漏改 preload → 插件调新名 → undefined。

**🔥 防线——preload 中的 window.linkdesk.filesystem 暴露的 key 和 FileService 方法名必须 grep 检查一致。**

---

## 四、完工标准

- [ ] `grep "mkdir" src/ electron/ plugins/` → 仅注释/文档
- [ ] `grep "deleteEntry" src/ electron/ plugins/` → 仅注释/文档
- [ ] `grep "watchFile" src/ electron/ plugins/` → 仅注释/文档
- [ ] 文件树 / 编辑器 / 串口——所有文件操作功能正常
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#20
