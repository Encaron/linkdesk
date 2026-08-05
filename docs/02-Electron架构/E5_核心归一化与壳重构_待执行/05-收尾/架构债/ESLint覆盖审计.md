# ESLint 覆盖审计

> 2026-08-06。盲审后审计——确保 ESLint 覆盖足够广。
> 位于 E5 收尾 → `05-收尾/架构债/`

---

## 一、当前覆盖状态

### 文件范围

```
src/**/*.{ts,tsx}   ✅
plugins/**/*.{ts,tsx} ✅
electron/**/*.ts    ✅
shared/**/*.ts      ✅ (本轮加)
```

### 自定义规则（9 条）

| 规则 | 级别 | 对应硬约束 | 说明 |
|:--|:--|:--|:--|
| `no-async-init-guard-only` | error | #13 | async init 配 `_loadingPromise` |
| `no-effect-callback-without-active-guard` | warn | #14 | useEffect 回调 prop 缺守卫 |
| `no-dynamic-import-in-effect-cleanup` | error | — | cleanup 禁止动态 import |
| `no-ref-current-in-jsx` | error | #17 | JSX 中禁止 ref.current |
| `no-module-level-ipc-listener` | error | #19 | 模块级 IPC 监听器 |
| `no-ipc-listener-in-effect` | error | #20 | useEffect 内 IPC 监听器 |
| `no-quickpick-render-item` | error | — | QuickPick renderItem 废弃 |
| `no-raw-configuration-read` | error | — | 组件内禁裸调 getConfigurationValue |
| `no-raw-path-replace` | error | — | 禁手写 replace(/\//g, "/") |

### 插件规则

| 规则 | 级别 | 说明 |
|:--|:--|:--|
| `react-hooks/rules-of-hooks` | error | React hook 规则 |
| `react-hooks/exhaustive-deps` | warn | hook 依赖完整性 |
| `import-x/no-unresolved` | error | 模块路径拼写 |
| `@typescript-eslint/no-explicit-any` | warn | 禁 any |
| `no-restricted-imports` (CardRegistry) | error | 标签页系统不持卡片 |
| `no-restricted-imports` (plugins→core) | error | 插件禁 import ConfigurationService/pathUtils |
| `no-restricted-syntax` (v3- 前缀) | **warn** ⚠️ | 禁新 v3_ 标识符——存量未清 |

---

## 二、已修复

### `shared/**/*.ts` 加入文件范围

`shared/types.ts`（FileEntry 唯一定义）之前不在 ESLint 覆盖中。已加——零违规。

---

## 三、缺口——需要后续处理

### 1. `v3-` 前缀规则仍为 `warn` ⚠️

**原因：** `StorageService.ts` 中有 6 个 `v3_` localStorage key（`v3_settings`、`v3_layout`、`v3_pluginStates`、`v3_prefs`）、`v3Api.ts` 中有 `__v3_core__`——存量代码触发此规则。升 `error` 前需先清理存量。

**修复时机：** `架构债/v3遗留与硬编码残余.md` 完成后升 `error`。

### 2. 无 i18n 硬编码中文检测

**问题：** 硬约束 #2（"所有 UI 文字走 t()"）没有机械规则防回归。E5#36 手动清理了 42 处，但新代码可能再次硬编码中文。

**建议新规则 `linkdesk/no-hardcoded-chinese`（warn 级）：**

```typescript
// eslint-local-rules.js 新增
// 检测 JSX 文本和 JS 字符串中的中文字符——提示包 t()
const noHardcodedChinese = {
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (/[一-鿿]/.test(node.value)) {
          // 排除 import 路径、注释、console、t() 调用参数
          if (node.parent?.type === "CallExpression" && 
              node.parent.callee?.name === "t") return;
          context.report({ node, message: "中文硬编码——请包 t('...')" });
        }
      },
      JSXText(node) {
        if (/[一-鿿]/.test(node.value)) {
          context.report({ node, message: "JSX 中文文本——请包 t('...')" });
        }
      },
    };
  },
};
```

### 3. 无 CSS hex 检测（非 ESLint 范畴）

**问题：** 硬约束 #1（"所有颜色走 CSS 变量"）ESLint 无法检测——CSS 文件不在 TypeScript 解析范围。

**工具：** stylelint + `stylelint-color-no-hex` 插件。不在本轮范围。

### 4. `no-explicit-any` warnings 406 个

**问题：** 406 个 `@typescript-eslint/no-explicit-any` warning——绝大多数来自 `(window as any).linkdesk`。

**修复路径：** `架构债/window.linkdesk类型安全.md` 完成后——`window.linkdesk` 有类型定义 → 删 `as any` → `no-explicit-any` 从 406 降到 ~10。

### 5. `no-effect-callback-without-active-guard` 仍为 `warn`

**原因：** 规则用正则 `/if\s*\(\s*!\s*(?:open|isActive|active|visible|enabled)\s*\)/` 检测活跃守卫——可能漏掉变量名不同的守卫（如 `if (!expanded)`）。`warn` 是谨慎的——减少误报。

**修复时机：** 手动审计所有 warn 触发点、确认守卫模式 → 升 `error`。

---

## 四、当前 `npm run check` 状态

```
✖ 407 problems (1 error, 406 warnings)
  1 error:  pre-existing (loader.ts, not this audit)
  406 warnings: mostly no-explicit-any from (window as any).linkdesk
```

**目标状态（E5 收尾后）：**
```
✖ < 50 problems (0 errors, < 50 warnings)
```
- `global.d.ts` 消掉 390+ any warnings
- `v3-` 升 error + 存量清完无违规
- 可选 `no-hardcoded-chinese` warn 级，只拦新代码

---

## 五、涉及文件

| 文件 | 本轮改动 | 待做 |
|:--|:--|:--|
| `eslint.config.js` L9 | + `"shared/**/*.ts"` | — |
| `eslint.config.js` L39-50 | 注释标注存量原因 | v3 清理后改 error |
| `eslint-local-rules.js` | — | 可选加 `no-hardcoded-chinese` |

---
