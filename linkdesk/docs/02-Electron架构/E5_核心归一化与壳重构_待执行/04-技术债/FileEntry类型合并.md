# FileEntry 类型合并——shared/types.ts

> 2026-08-02。**E5 第 4 层第 12 轮。** 前后端 FileEntry 合并为一个共享类型。
> 执行清单任务：E5#23

---

## 一、前因——双定义

### 1.1 当前两处定义

**`src/core/FileService.ts` L21-28：**

```typescript
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: number;
  isReadonly?: boolean;  // E4V#10 加的——漏了后端
}
```

**`electron/services/file-service.ts` L15-22：**

```typescript
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: number;
  isReadonly?: boolean;  // 已同步（commit a054d92）
}
```

**完全相同——但无共享来源。** 改一端漏另一端 = 编译失败。

---

## 二、解决方案

### 2.1 提取到 shared/types.ts

```typescript
// shared/types.ts —— 前后端共享类型

/** 文件/目录条目——前后端共用 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;         // 字节
  modifiedAt?: number;    // Unix 时间戳 ms
  isReadonly?: boolean;  // E4V#10: 文件只读标记
}
```

### 2.2 两端 import 同一来源

```typescript
// src/core/FileService.ts
import type { FileEntry } from "../../shared/types";
// 删除本地 FileEntry 定义

// electron/services/file-service.ts
import type { FileEntry } from "../../shared/types";
// 删除本地 FileEntry 定义
```

---

## 三、实现步骤

### E5#23a 新建 shared/types.ts（~15 行）

**内容：** `FileEntry` 接口唯一定义。后续可加更多共享类型（`FileChangeEvent` 等）。

### E5#23b 前端 import（~5 行）

**文件：** `src/core/FileService.ts`

```diff
- export interface FileEntry { ... }
+ import type { FileEntry } from "../../shared/types";
+ export type { FileEntry };
```

### E5#23c 后端 import（~5 行）

**文件：** `electron/services/file-service.ts`

```diff
- export interface FileEntry { ... }
+ import type { FileEntry } from "../../shared/types";
+ export type { FileEntry };
```

### E5#23d 🛡️ 验证——tsc 双重检查

改 `FileEntry` 加一个字段 → tsc 同时检查前端和后端 → 两端都编译通过才放行。

**验证：**
```bash
grep "interface FileEntry" src/ electron/ shared/
# 只返回 shared/types.ts
npm run check  # 零错误
```

---

## 🔴 预测 Bug

### Bug E5-23a 🔴 TypeScript path alias 不支持 shared/ 目录

**触发条件：** `tsconfig.json` 的 `paths` 配置不含 `shared/` → `import ... from "../../shared/types"` 解析失败。

**🔥 防线——验证：** `npm run check` 零错误即通过。如果失败 → 加 `tsconfig.json` paths。

---

## 四、完工标准

- [ ] `grep "interface FileEntry" src/ electron/` → 仅 `shared/types.ts`
- [ ] 前后端都从 `shared/types.ts` import
- [ ] `npm run check` 零错误
- [ ] 改 FileEntry 加字段 → 两端 tsc 同时检查

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#23
