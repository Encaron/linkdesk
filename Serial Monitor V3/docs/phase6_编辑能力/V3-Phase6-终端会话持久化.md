# Phase 6 — 终端会话持久化

> 2026-07-21。从 [终端侧栏两次进化](../phase5.5_交互对标/V3-Phase5.5-终端侧栏两次进化.md) §三 提炼。
> 终端侧栏的第二次进化——会话持久化。
> **依赖：** Phase 6a 的 FileService + WorkspaceService 就位后才能做。
> **性质：** Phase 6 文件树的消费者 feature——不是独立 Phase，不是 5.5 的工作。

---

## 一、会话 = 文件

每个终端会话存为一个 `.session.json` 文件：

```json
// .linkdesk/sessions/COM3-PID调试.session.json
{
  "name": "COM3 PID调试",
  "port": "COM3",
  "baudRate": 115200,
  "protocol": "protocol-bracket",
  "lastOpened": "2026-07-21T14:32:00",
  "tabId": "terminal-3"
}
```

---

## 二、侧栏——会话列表

```
┌──────────────────────┐
│                      │
│ ▼ 终端会话 (3)   [+ 新建]│  ← 可折叠的会话列表
│   📟 COM3 PID调试  [✕] │  ← 点击 → openSession() → 打开标签页+连接
│   📟 COM5 CAN监控   [✕] │  ← 右键 → 重命名/删除/复制会话
│   📟 COM7 空闲      [✕] │
│                      │
├──────────────────────┤
│                      │
│ ▶ 控制面板            │  ← 可折叠（Phase 5.5 已建）
│ ▶ 设置               │
│                      │
└──────────────────────┘
```

---

## 三、文件树视角

```
📁 文件树
├── 📂 stm32-project
│   ├── src/
│   ├── .linkdesk/
│   │   ├── settings.json
│   │   ├── sessions/
│   │   │   ├── COM3-PID调试.session.json    ← 双击 → 打开终端并连接 COM3
│   │   │   ├── COM5-CAN监控.session.json
│   │   │   └── COM7-空闲.session.json
│   │   └── workspace.json
│   └── CMakeLists.txt
```

---

## 四、交互流程

```
侧栏点 [+ 新建会话]
  → 弹出 QuickPick: "选择 COM 口" → COM5
  → 弹出 QuickPick: "选择协议" → protocol-json
  → 输入会话名: "COM5 JSON调试"
  → 创建 COM5-JSON调试.session.json
  → 侧栏会话列表出现新条目
  → 主区开新终端标签页 → 自动连接 COM5

侧栏点 [✕] 删除会话
  → 确认: "删除会话 'COM7 空闲'？"
  → 关闭对应标签页（如果打开）
  → 删除 .session.json 文件
  → 侧栏会话列表移除

文件树双击 COM3-PID调试.session.json
  → 侧栏自动切换到 📟
  → 主区开终端标签页
  → 自动连接 COM3 + 选择 protocol-bracket
  → 恢复上次关闭时的连接状态
```

---

## 五、会话迁移/分享

```
导出会话 → 选中 .session.json → 打包为 .zip
导入会话 → 拖入 → 侧栏会话列表出现 → 点击连接
跨 workspace 复制 → 文件树拖拽 session 文件到另一个 workspace
```

---

## 六、依赖

| 能力 | 提供者 | 状态 |
|------|--------|:--:|
| `<SidebarSection>` 可折叠组件 | Phase 5.5 新建 | 📋 |
| 标签页改名（`reduceUpdateTabLabel`） | Phase 3 useTabManager | ✅ |
| 会话文件读写 | Phase 6a FileService | 📋 |
| 文件树双击打开 session | Phase 6a fileAssociations | 📋 |
| 工作区文件夹 | Phase 6a WorkspaceService | 📋 |

---

## 七、改动量

| 文件 | 操作 | 行数 |
|------|------|:--:|
| `plugins/terminal/sidebar.tsx` | 加会话列表 + `[+ 新建]` + `[✕]` | +80 |
| `src/core/SessionService.ts` | 新建——会话文件读写/CRUD | ~60 |
| `.linkdesk/sessions/*.session.json` | 会话持久化文件 | — |
| 文件树 | 双击 `.session.json` → openSession | +10 |
| **净变动** | | **~ +150 行** |

---

## 八、不做的东西

| 不做 | 理由 |
|------|------|
| 会话自动保存连接状态（实时同步） | 关闭标签页时保存即可——对标浏览器 session restore |
| 会话模板（"新建会话时从模板复制设置"） | Phase 7+——卡片工作台做的时候一起看 |
| 远程会话（SSH/串口服务器） | Phase 8+ |

---

## 九、当前已知问题（Phase 6 上线前）

> 2026-07-22。5.5c 提前上线了会话功能，但持久化层依赖 Phase 6a 的 FileService，尚未就位。

### B3 — F5 刷新后标签页恢复但 session 丢失

**现象：** 用户新建终端会话 → F5 刷新 → 标签页仍在（LayoutService 持久化）但 session 消失（纯内存态）→ 标签页显示"会话已失效"。

**根因：** `useTerminalSessions._sessions` 是模块级内存数组，无持久化。标签页系统有 `LayoutService` 持久化，两个系统不同步。

**5.5c 临时方案（stopgap）：** 恢复布局时检测 terminal 标签页 → 为每个 `terminal-{N}` tab 自动 `createSession(tab.label, tab.id)` 重建会话。

**Phase 6 正式方案：** `SessionService.loadAll()` 从 `.linkdesk/sessions/*.session.json` 恢复所有会话 → `restoreLayout` 恢复标签页 → 标签页和 session 自然配对 → stopgap 逻辑移除。

**关联 bug：** `V3-Phase5.5-Bug清单-2026-07-22.md` §B3。

---

## 相关文档

- [Phase 6 设计](./V3-Phase6-设计.md)
- [Phase 6 实施顺序](./V3-Phase6-实施顺序.md)
- [终端侧栏第一次进化（5.5 控制面板）](../phase5.5_交互对标/V3-Phase5.5-终端侧栏两次进化.md)
- [通用交互范式](../phase5.5_交互对标/V3-Phase5.5-通用交互范式.md)
