# 01 — ExplorerItem 与 FileTreeModel

> 对标 VS Code `explorerModel.ts`（526 行）。数据模型——ExplorerItem 结构 + FileTreeModel 操作。
> 对应执行清单：**#1-#3（已完成——FileTreeModel + pathUtils + 归一化）+ #4-#5（CompactController 待修）**。

---

## 一、VS Code 对标

```typescript
// VS Code: src/vs/workbench/contrib/files/common/explorerModel.ts
class ExplorerItem {
    resource: URI;          // ← URI 对象，内部永远是 /
    name: string;
    isDirectory: boolean;
    parent: ExplorerItem;
    children: Map<string, ExplorerItem>;  // ← Map，不是数组
    // ... nested children, hasChildren, root, etc.
}

class ExplorerModel {
    roots: ExplorerItem[];
    findAll(resource: URI): ExplorerItem[];
    findClosest(resource: URI): ExplorerItem | null;  // ← URI 比较，非字符串
}
```

## 二、当前实现 ✅

| 组件 | 文件 | 行数 | commit |
|:--|:--|:--:|------|
| `ExplorerItem` 接口 | `FileTreeModel.ts` | ~15 | `18c7287` |
| `FileTreeModel` 类 | `FileTreeModel.ts` | ~155 | `18c7287` |
| URI 归一化 | `pathUtils.ts` `normalizePath()` | ~5 | `a4a8aa6` |

**关键设计决策：**

- `children: null` = 未加载（触发懒加载），`[]` = 空目录（不触发）。对标 VS Code `hasChildren()` 懒加载模式。
- `ExplorerItem.uri` 统一 `/` 分隔符（`normalizePath` 入口归一化）。对标 VS Code `URI` 对象"内部永远是 /"。
- `parent` 反向引用——`findClosest` 沿链遍历、`dirname` 取父路径均依赖。

## 三、当前代码位置

```
plugins/builtin/file-tree/src/
├── FileTreeModel.ts    ← ExplorerItem 接口 + FileTreeModel 类
├── pathUtils.ts        ← normalizePath / basename / splitPath / dirname / joinPath / extension
└── layoutTokens.ts     ← TREE_ITEM_HEIGHT / TREE_INDENT / OVERSCAN
```

## 四、待建 ⬜

| # | 内容 | 说明 |
|:--:|------|------|
| #7 | 🔴 压缩控制器——从视图层提取到模型层 | Bug A/B/C 根因 |
| #8 | FileSorter 扩展——6 种排序对标 | 当前只 `foldersFirst` |
| #9 | FileExcludeFilter 扩展——`.gitignore` + `fileNesting` | 当前只 glob |

## 五、已知风险

| 风险 | 说明 |
|:--|------|
| 🔴 `refresh(path)` 设 `children=null` 不重载 | `_expanded` 和 `children` 状态不同步→twistie 箭头与内容不一致。#14 加了 `refreshDir` 临时补丁 |
| `findClosest` 路径链未加载时返回 null | 已有 JSDoc 警告 + TODO #29 #29b `findAndExpandToBypassExclude` |
| `_sort` 只有 `foldersFirst` | #8 补全 6 种排序时需保留现有效果 |

## 六、AI 进场须知 🛡️

- **所有路径字符串走 `normalizePath()`**——禁止假设格式
- **`children === null` vs `[]`**——懒加载的信号。别把 null 当空目录
- **`parent` 反向引用**——`FileEntry` 转 `ExplorerItem` 时必须设 `parent`
- **扩展名用 `extension(name)` from pathUtils**——禁止 `substring(lastIndexOf)`
