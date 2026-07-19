# Phase 4 测试策略

> 2026-07-19。插件系统引入后，旧测试不能坏，新功能必须有覆盖。
> 关联：[V3-Phase4-终端插件化设计.md](V3-Phase4-终端插件化设计.md) / [V3-Phase4-数据迁移.md](V3-Phase4-数据迁移.md)

---

## 1. 旧测试保护——现有 91 个测试不能退化

### 1.1 useTabManager 测试（~70 个用例）

| 旧测试 | 改动 |
|---|---|
| "默认：1 组 1 终端标签页" | → "默认：1 组 1 欢迎页" |
| "终端保底：全局唯一终端不能关" | → "欢迎页保底：全局唯一欢迎页不能关" |
| "创建终端标签页" | 保留——`reduceCreateTab(prev, "terminal")` 仍然合法 |
| "workspace 去重" | 保留——逻辑不变 |
| "settings 单例去重" | 保留——逻辑不变 |
| 所有分屏/拖拽/右键测试 | **零改动**——这些不碰 `type` |

### 1.2 splitTree 测试（~10 个用例）

零改动。SplitNode 树和标签页 type 无关。

### 1.3 串口处理器 / 拖拽 hook 测试（~20 个用例）

零改动。这些测试不依赖 TerminalView 组件——测的是纯逻辑。

### 1.4 目标

`npx vitest run` → 91 个测试 → 91 通过。**Phase 4 不允许旧测试退化。**

---

## 2. 新测试——插件系统

### 2.1 插件加载器测试（新文件：`src/pluginLoader/__tests__/loader.test.ts`）

| # | 测试 | 预期 |
|---|---|---|
| L1 | 空 `plugins/` 目录 → 加载器返回空 viewRegistry | `viewRegistry.size === 0` |
| L2 | 有效视图插件 → 注册到 viewRegistry | `viewRegistry.has("terminal") === true` |
| L3 | `plugin.json` 缺少 `type` 字段 → 跳过，不崩 | 其他插件正常加载 |
| L4 | `plugin.json` JSON 格式错误 → 跳过，不崩 | 返回空 map（或只有有效插件的 map） |
| L5 | 两个插件同 pluginId → 高版本优先 | `viewRegistry.get("terminal").version === "2.0.0"` |
| L6 | `plugin.json` 声明 `core: true` → 标记 | `viewRegistry.get("settings").core === true` |

### 2.2 插件状态测试（新文件：`src/pluginLoader/__tests__/lifecycle.test.ts`）

| # | 测试 | 预期 |
|---|---|---|
| S1 | 启用 → 禁用 → 启用 | 状态切换正确，文件位置不变 |
| S2 | 启用 → 卸载 → `.disabled/` | 文件移到 `.disabled/` |
| S3 | 卸载 → 安装 → `plugins/` | 文件移回 `plugins/` |
| S4 | core 插件不可卸载 | `canUninstall("settings") === false` |

### 2.3 欢迎页保底测试（更新 useTabManager.test.ts）

| # | 测试 | 预期 |
|---|---|---|
| W1 | 初始状态 = 1 个欢迎页 | `allTabs(state)[0].type === "welcome"` |
| W2 | 全局唯一欢迎页不能关 | `reduceCloseTab(state, welcomeId).closed === false` |
| W3 | 创建 terminal 后，welcome 可被关闭 | 另一个 tab 存在时 welcome 可关 |
| W4 | 关闭所有非 welcome → 拒关 welcome | 同 W2 |

---

## 3. 手动验证清单（不能用自动化测试覆盖的）

| # | 验证 | 方法 |
|---|---|---|
| M1 | 终端插件迁移后 CM6 正常渲染 | 打开终端 → 看接收区有行号、等宽字体 |
| M2 | Monaco 发送栏正常 | 输入文字 → Enter → 蓝色回显 |
| M3 | 串口数据收发正常 | 接 STM32 → 收发 → 三色行正确 |
| M4 | 卸载终端 → 软件不崩 | 点卸载 → 图标栏 📟 消失 → 欢迎页正常 |
| M5 | 重新安装终端 → 恢复 | 点安装 → 📟 回来 → 终端标签页正常 |
| M6 | 删除 `plugins/terminal/` 文件夹 → 软件不崩 | 手动删 → 启动 → 占位 UI + 欢迎页正常 |
| M7 | 主题切换 → 终端跟随 | 暗/亮切换 → 终端背景/文字/侧栏全部跟随 |
| M8 | 语言切换 → 终端跟随 | 中/EN 切换 → 终端侧栏标签/按钮文字切换 |
| M9 | 分屏时终端不受影响 | 开 2 个终端 → 分屏 → 两个都正常收发（各自独立 RingBuffer） |

---

## 4. CI 策略

```
npx vitest run           ← 91 旧 + ~15 新 = ~106 个测试
npx tsc --noEmit         ← 零类型错误
cargo check              ← Rust 端不改，但要确保串口命令注册不变
```

**Phase 4 不引入 E2E 测试。** 串口收发 / CM6 渲染 / Monaco 交互 → 手动验证（M1-M9）。等 Phase 5 卡片系统稳定后补 E2E。

---

## 5. 测试数据——mock 插件

```typescript
// __fixtures__/mock-terminal/plugin.json
{
  "type": "view",
  "name": "Mock Terminal",
  "version": "1.0.0",
  "icon": "terminal",
  "iconSource": "codicon",
  "entry": "index.tsx"
}

// __fixtures__/mock-terminal/index.tsx
export default function MockTerminal({ isActive }: { isActive: boolean }) {
  return <div data-testid="mock-terminal">Mock Terminal {isActive ? "active" : "inactive"}</div>
}
```

测试时把 `__fixtures__/mock-terminal/` 临时复制到 `plugins/` 下，加载器扫描 → 注册 → 验证 viewRegistry。
