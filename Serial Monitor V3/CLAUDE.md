# Serial Monitor V3

> Tauri v2 + React 18 + TypeScript — 卡片式串口调试工具。V2（WPF）正常使用中，V3 是重架构。

## 架构：两层容器

```
外层：标签页 + 递归分屏（VS Code 编辑器组模型）
  └── 标签页拖拽/分屏/合并，keep-alive 绝对定位平铺
内层：卡片网格（Phase 5）
  └── react-grid-layout 拖拽重排，workspace.json 平铺数组
硬边界：标签页系统永不 import CardRegistry，唯一接触点 = Tab.workspaceName: string
```

## 当前阶段

Phase 1-3.5 ✅ → **Phase 4 🔜 插件系统（设计完成，代码未写）**

详见 `docs/phase4_插件系统/` + `docs/开发管理/当前状态.md`
分支：`phase4-plugin-system`

## 硬约束（绝对不能违反）

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）
3. **标签页系统不 import CardRegistry**（Phase 3→4 硬边界）
4. **workspace.json 禁止嵌套**，必须是一层平铺数组
5. **Tauri `listen()` 必须用 generation counter 模式**（B11 教训）
6. **`setState` 函数式更新器内部不写副作用**（B25 教训）
7. **组件只实现 OnData(fields) + OnSend**，不改路由/壳/其他组件
8. **ProtocolParser 是独立可替换模块，RingBuffer 接口 `{ cardId, value }` 是硬边界**——开发阶段只用方括号协议，但任何代码不得写死"只有这一种协议"。Phase 4 协议插件系统通车时，只换解析器不改下游。

完整版：`docs/` + memory 系统

## 部件命名

固定名称，不用"三栏中间那个"。详见 `docs/总体设计/V3-部件命名规范.md`

速查：图标栏（最左 42px）→ 侧栏 → 主区（标签页内容）。主区顶部是标签栏。最上面是顶栏。最下面是状态栏。

## 关键设计——不要改

- **keep-alive：所有面板绝对定位平级渲染，CSS display 切换**（不是 `{isActive && <View />}`——改成条件渲染会丢 CM6/Monaco 状态）
- **平铺方案（B22）：面板 key=groupId 永远不变**（不是递归 flex 嵌套——改回嵌套 → 分屏/合屏 unmount 面板）
- **独立 RingBuffer 多消费者**（不是 Pub/Sub——串口数据是流不是事件，每个消费者需要完整历史）
- **drop zone 照抄 VS Code**：SPLIT_THRESHOLD=0.25 + 左右优先（不自创算法）
- **递归分屏 SplitNode 树**：`leaf | branch(direction, [child, child], sizes)`，MAX_TREE_DEPTH=4

## 反模式——不要做

- 不要自创算法，照抄 VS Code
- 不要改 flex 元素拖拽时的 width（用 opacity 留占位）
- 不要嵌套卡片（card in card）
- 不要手写 Tauri listen()——用 `useTauriEvent` hook
- 不要说"架构不支持"——检查六类插件接口。视图/卡片/协议/主题/语言/资源，新功能落在哪一类？每类都是窄接口，不碰架构

## 开发命令

```bash
npm run dev          # 纯前端预览
npx tauri dev        # 完整桌面应用
npx tsc --noEmit     # TypeScript 检查
npx vitest run       # 单元测试（91 个）
```

改 Tauri 配置（tauri.conf.json / Cargo.toml / lib.rs）后 → 先 `cargo check` → 零错误再 `tauri dev`。

## 关键文件

| 你要做什么 | 读这个 |
|------|------|
| 理解架构 | `docs/开发管理/当前状态.md` |
| Phase 3.5 任务 | `docs/标签页设计/V3-Phase3.5-品质打磨.md` |
| 标签页/分屏设计 | `docs/标签页设计/V3-Phase3-标签页分屏设计.md` |
| 部件名称 | `docs/总体设计/V3-部件命名规范.md` |
| 已确认决策 | memory `design-decisions.md` |
| 已知坑 | memory `v3-pitfalls.md` + `phase3-drag-bugs.md` |
| 主题系统 | memory `theme-system.md` |
