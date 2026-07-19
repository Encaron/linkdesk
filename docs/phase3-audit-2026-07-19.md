# Phase 3 审计报告 2026-07-19

> 四维评估：AI友好度 / 归一化 / 未来铺路 / 完成度

---

## 总评

| 维度 | 评分 | 一句话 |
|------|:--:|--------|
| 功能完成度 | 85-90% | 核心功能齐全，15 个已知 bug 全部修了 |
| 架构质量 | 90-95% | reducer 模式 + TabGroup 模型选得好 |
| AI 友好度 | 良好 | 数据层友好，UI 文本层有缺口 |
| 归一化 | 65-70% | CSS 变量层漂亮，i18n 层欠账明显 |
| 未来铺路 | 良好 | Tab↔Card 边界完美，拖拽 hook 需提取 |

---

## 一、违反硬约束（需立即修）

### 1. 硬编码中文未走 `t()` —— TabBar.tsx（~12 处）

| 位置 | 内容 |
|------|------|
| 加号菜单 | "新建终端"、"新建工作台" |
| 右键菜单 | "关闭"、"关闭其他"、"关闭右侧"、"向下分屏"、"向右分屏" |
| title 属性 | "清空接收区"、"关闭"、"新建标签页" |

### 2. 硬编码中文未走 `t()` —— useTabManager.ts

`getDefaultLabel()` L98-102 返回硬编码 "终端"、"工作台"、"设置"、"编辑器"、"OLED"

### 3. 硬编码中文 —— App.tsx

L274 `window.confirm()` 对话框：`` `「${tab.label}」有未保存的修改，确定关闭？` ``

### 4. IconBar `t()` key 错配

`t("terminal")` / `t("workspace")` / `t("settings")` 用的是英文 enum 值，但 zh.json/en.json 存的是中文 key，永远返回裸 key。

### 5. TerminalView.tsx CM6 darkTheme 硬编码 17 个 hex

Phase 2 遗留，不属于 Phase 3 scope，但早晚要修。

### 6. `zh.json` 是空的 `{}`

i18next 回退到 key-as-value 勉强能用，但没有建立真正的翻译表。

---

## 二、架构债务（Phase 4 前建议修）

### A. 拖拽 hook 未提取（NEEDS_ATTENTION）

TabBar.tsx 里有 ~155 行 inline `useEffect` 做 window-level mousemove/mouseup 事件处理。
Phase 4 卡片拖拽需要同样的逻辑。应提取为 `useDragReorder` hook。
`tabDragTypes.ts` 的几何层已分离好，reducer 层也已分离好——事件层是缺口。

### B. `(prefs as any).layout` 类型缺口

设计文档 Step 8 标注了要做但没做。运行时正确，类型不安全。

### C. 5 个主题 token 定义了但无消费者

`--bg-status`, `--icon-active`, `--icon-inactive`, `--sent-echo`, `--received`——预埋了但没用到。不是 bug，但要么删要么在对应 Phase 消费。

### D. TabBar.css `rgba(0,0,0,0.35)` 硬编码

`.tab-drag-preview` 的 box-shadow 用了硬编码 rgba，应改为 CSS 变量。

---

## 三、做对了的事（值得保留）

1. **reducer 模式**——所有状态转换是纯函数，可独立测试，AI 友好
2. **TabGroup 模型（v4 重构）**——对标 VS Code editor group，语义正确
3. **`elementFromPoint` + `closest` 检测**——避免手动 rect 计算的 z-index 盲区
4. **CSS `opacity:0.45` 留灰影，不改 width**——避免 flex 布局跳变
5. **拖拽状态机双向可逆**——reorder ↔ split 来回切
6. **Phase 3 新增组件 100% CSS 变量**——主题切换零改动
7. **Tab↔Card 边界完美隔离**——零 CardRegistry import，唯一接触点 `workspaceName: string`
8. **15 个 bug 修复记录质量高**——根因+修法+可迁移经验，新 AI 不会重犯

---

## 四、修理计划

| 优先级 | 条目 | 预计改动 |
|:--:|------|------|
| P0 | 填 `zh.json` + 补 `en.json` 缺失 key | zh.json + en.json |
| P0 | TabBar 右键菜单/加号菜单走 `t()` | TabBar.tsx |
| P0 | `getDefaultLabel()` 走 `t()` | useTabManager.ts |
| P0 | IconBar `t("terminal")` → `t("终端")` | IconBar.tsx |
| P0 | App.tsx confirm 对话框走 `t()` | App.tsx |
| P1 | 提取 `useDragReorder` hook | 新建 hooks/useDragReorder.ts |
| P1 | `(prefs as any).layout` → 类型化 | PreferenceService.ts + App.tsx |
| P2 | TabBar.css `rgba(0,0,0,0.35)` → CSS 变量 | TabBar.css + themes/*.json |
| P2 | TerminalView CM6 硬编码颜色 → CSS 变量 | TerminalView.tsx（Phase 2 遗留） |

---

## 后续更新（2026-07-19 同日实施）

### 递归分屏（Phase 3.x）

原审计指出的 2-pane 限制已突破：
- **数据模型**：`SplitNode = leaf | branch(direction, children, sizes)`，替代扁平 `SplitLayout`
- **渲染**：`SplitPane` 递归化——leaf→renderGroup，branch→两个递归子 SplitPane+分割条
- **drop zone**：照抄 VS Code——`SPLIT_THRESHOLD=0.25`+左右优先顺序+rect-based 面板命中
- **中央放手=合并**：对标 VS Code center zone→moveTab
- **毛玻璃**：面板内 `absolute` 定位，CSS 50%半边/100%满面板，不越界

### 实施中发现的 bug（8 个）

| # | 现象 | 根本原因 |
|:--:|------|------|
| B13 | 单 tab 组分屏变空面板 | solo-tab split 未阻止 |
| B14 | 3-pane 不渲染 | SplitPane 只展开 2-pane |
| B15 | 毛玻璃越界/不区分中心 | elementFromPoint 不可靠+center 无操作 |
| B16 | zone 检测与 VS Code 不同 | 自创 closest-edge 算法 |
| B17 | 面板内容坍缩 | child div 漏 flex 声明 |
| B18 | 跨标签栏移动回归 | 接口捏造了不存在的 data-group-id |
| B19 | inline style 覆盖 CSS 定位 | top:0 等覆盖了 50% 规则 |
| B20 | 分裂源组而非目标面板 | reduceSplitTab 始终用 source group |

**核心教训：VS Code 的代码是正确答案，不要自创算法。** 自创的 closest-edge+50% 阈值→bug，照抄 SPLIT_THRESHOLD=0.25+左右优先→零问题。rect 遍历找面板→可靠，elementFromPoint→不可靠。

### 修理计划更新

| 优先级 | 条目 | 状态 |
|:--:|------|:--:|
| P0 | i18n：zh.json + en.json + TabBar/App 走 t() | ✅ 完成 |
| P1 | useDragReorder hook 提取 | ✅ 完成 |
| P1 | layout 字段类型化 | ✅ 完成 |
| P1 | 递归 SplitNode 数据模型 | ✅ 完成 |
| P1 | 递归 SplitPane 渲染 | ✅ 完成 |
| P1 | VS Code 风格 drop zone + 毛玻璃 | ✅ 完成 |
| P2 | TabBar.css rgba → CSS 变量 | ✅ 完成 |
| P3 | TerminalView CM6 硬编码颜色 | 待 Phase 6 |
