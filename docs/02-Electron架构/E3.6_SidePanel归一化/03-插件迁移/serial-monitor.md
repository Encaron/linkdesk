# serial-monitor 迁移——460 行拆分

> 对应任务：E36#8。三个迁移中最复杂的一个。460 行拆为 2 个 view + 1 个子组件 + 1 个共享 hook。
>
> **原则：逻辑不动，只动结构。** 每条线搬过去的行为和搬之前完全相同。

## 文件清单

```
plugins/user/serial-monitor/src/
├── sidebar.tsx                     460 行  旧文件——所有逻辑在此，待废弃
├── useSerialSessions.ts            已有    共享 hook——SessionListView + SerialSettingsView 共用
├── SerialContext.tsx               已有    共享 context——isOpen/portName 等
├── SessionListItem.tsx             新 ~130  从 sidebar.tsx L36-154 搬出（子组件）
├── views/
│   ├── SessionListView.tsx          新 ~180  会话 CRUD + JSX Section 1（L158-364）
│   └── SerialSettingsView.tsx       新 ~140  收发设置 + JSX Section 2（L248-285 + L366-459）
├── index.tsx                       改 ~15   增加 activate() 命令式注册（动态标题用）
└── plugin.json                     改 ~15   加 viewsContainers + views
```

---

## 拆分步骤

### 第 1 步：搬出 SessionListItem → `SessionListItem.tsx`

**来源：** `sidebar.tsx` L36-154（119 行）
**目标：** 新 `plugins/user/serial-monitor/src/SessionListItem.tsx`

这是最干净的子组件——无副作用、纯 props 驱动。直接剪切粘贴：

```tsx
// SessionListItem.tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SerialSession } from "./useSerialSessions";

interface SessionListItemProps {
  session: SerialSession;
  isActive: boolean;
  connected: boolean;  // Phase 5.5c C4b Bug 3：从 SerialContext 派生
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function SessionListItem({ session, isActive, connected, onSelect, onRename, onDelete }: SessionListItemProps) {
  // ... 原 L36-154 的全部内容，一字不改
}
```

**验证：** 从 `SessionListView.tsx` import → 渲染列表 → 选择/重命名/删除行为与旧 sidebar 一致。

### 第 2 步：创建 SessionListView

**来源：** `sidebar.tsx`：
- L160-168：`useSerialSessions()` 调用
- L171：`useSerialContext()` 调用
- L174：`useTabActions()` 调用
- L177-244：会话 CRUD（create/rename/delete + 内联输入状态）
- L291-303：`handleSelectSession`
- L305-315：`sessionList` 渲染
- L317-364：JSX——`<SidebarSection title="串口监视器会话">` 整个块

**目标：** 新 `plugins/user/serial-monitor/src/views/SessionListView.tsx`

```tsx
// SessionListView.tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../useSerialSessions";
import { useSerialContext } from "../SerialContext";
import { useTabActions } from "@src/core/TabActionsContext";
import { activateSidebarItem } from "@src/core/SidebarTabSync";
import { showConfirm } from "@src/components/shared/ConfirmDialog";
import SidebarSection from "@src/components/shared/SidebarSection";
import { SessionListItem } from "../SessionListItem";
import "../SerialMonitorSidebar.css";  // 样式文件不动

export default function SessionListView() {
  const { t } = useTranslation();
  const {
    sessions, activeSession, activeSessionId,
    createSession, removeSession, updateSession, setActiveSession,
  } = useSerialSessions();
  const { state: { isOpen, sourceName: portName } } = useSerialContext();
  const tabActions = useTabActions();

  // ── 新建会话内联输入（原 L180-215）──
  const sessionCountRef = useRef(sessions.length);
  sessionCountRef.current = sessions.length;
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  const startCreate = useCallback(() => {
    const n = sessionCountRef.current + 1;
    setNewName(`${t("新会话")} ${n}`);
    setIsCreating(true);
  }, [t]);

  const confirmCreate = useCallback(() => {
    const name = newName.trim();
    if (name && tabActions) {
      const session = createSession(name);
      tabActions.createTab("serial-monitor", { label: name, pinned: true, sourceId: session.id });
    }
    setIsCreating(false);
    setNewName("");
  }, [newName, createSession, tabActions]);

  const cancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewName("");
  }, []);

  useEffect(() => {
    if (isCreating) { createInputRef.current?.focus(); createInputRef.current?.select(); }
  }, [isCreating]);

  // ── 重命名/删除（原 L217-244）──
  const handleRename = useCallback(
    (id: string) => (name: string) => {
      updateSession(id, { name });
      tabActions?.updateTabLabelBySourceId(id, name);
    },
    [updateSession, tabActions],
  );

  const handleDelete = useCallback(
    (id: string) => async () => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      const confirmed = await showConfirm(
        t("关闭会话「{{name}}」？", { name: session.name }) ?? `关闭会话「${session.name}」？`,
      );
      if (confirmed) {
        tabActions?.closeTabBySourceId(id);
        removeSession(id);
      }
    },
    [sessions, t, removeSession, tabActions],
  );

  // ── 选择会话（原 L291-303）──
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      const session = sessions.find((s) => s.id === sessionId);
      if (tabActions) {
        activateSidebarItem(tabActions, sessionId, "serial-monitor", {
          label: session?.name, pinned: true,
        });
      }
    },
    [setActiveSession, tabActions, sessions],
  );

  // ── 渲染 ──
  const sessionList = sessions.map((s) => (
    <SessionListItem
      key={s.id} session={s}
      isActive={s.id === activeSessionId}
      connected={isOpen && portName === s.port}
      onSelect={() => handleSelectSession(s.id)}
      onRename={handleRename(s.id)}
      onDelete={handleDelete(s.id)}
    />
  ));

  return (
    <SidebarSection
      title={t("串口监视器会话")}
      badge={sessions.length > 0 ? `(${sessions.length})` : undefined}
      actions={
        <button className="session-create-btn" title={t("新建会话")}
          onClick={(e) => { e.stopPropagation(); startCreate(); }}>
          + {t("新建")}
        </button>
      }
      defaultOpen={true}
    >
      {isCreating && (
        <div className="session-create-inline">
          <input ref={createInputRef} className="session-create-input" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmCreate(); if (e.key === "Escape") cancelCreate(); }}
            placeholder={t("新会话名称：") ?? ""} />
          <button className="session-create-ok" onMouseDown={(e) => { e.preventDefault(); confirmCreate(); }} title={t("确定")}><span className="codicon codicon-check" /></button>
          <button className="session-create-cancel" onMouseDown={(e) => { e.preventDefault(); cancelCreate(); }} title={t("取消")}><span className="codicon codicon-close" /></button>
        </div>
      )}
      {sessions.length === 0 && !isCreating ? (
        <div className="session-empty">
          {t("暂无串口监视器会话。")}
          <button className="session-empty-link" onClick={startCreate}>[+ {t("新建")}]</button>
        </div>
      ) : sessionList}
    </SidebarSection>
  );
}
```

**行数：** ~180 行（比源码紧凑——子组件已提取）
**验证：** 新建会话→列表显示→选择会话→改名→删除→全部与旧 sidebar 一致。

### 第 3 步：创建 SerialSettingsView

**来源：** `sidebar.tsx`：
- L160-168：`useSerialSessions()`（activeSession 读，不写）
- L248-285：`mkSetter` / `mkToggle` / `mkSelect` 三个 helper
- L366-459：JSX——`<SidebarSection title="收发设置">` 整个块

**目标：** 新 `plugins/user/serial-monitor/src/views/SerialSettingsView.tsx`

```tsx
// SerialSettingsView.tsx
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../useSerialSessions";
import type { SerialSession } from "../useSerialSessions";
import SidebarSection from "@src/components/shared/SidebarSection";
import Toggle from "@src/components/shared/Toggle";
import SelectBox from "@src/components/shared/SelectBox";
import FormRow from "@src/components/shared/FormRow";
import "../SerialMonitorSidebar.css";

const timeFormats = ["HH:mm:ss", "HH:mm:ss:fff", "无"];
const lineEndings = ["\\r\\n", "\\n", "\\r"];

export default function SerialSettingsView() {
  const { t } = useTranslation();
  const { activeSession, activeSessionId, updateSession } = useSerialSessions();

  // ── 设置 helpers（原 L248-285，一字不改）──
  const mkSetter = useCallback(
    <K extends keyof SerialSession>(key: K) =>
      (value: SerialSession[K]) => {
        if (activeSessionId) updateSession(activeSessionId, { [key]: value } as Partial<SerialSession>);
      },
    [activeSessionId, updateSession],
  );

  const mkToggle = useCallback(
    (key: keyof SerialSession) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return <Toggle checked={Boolean(value)} onChange={(v) => setter(v as SerialSession[typeof key])} />;
    },
    [activeSession, mkSetter],
  );

  const mkSelect = useCallback(
    (key: keyof SerialSession, options: string[] | { value: string; label: string }[]) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return <SelectBox value={String(value ?? "")} options={options}
        onChange={(v) => setter(v as SerialSession[typeof key])} />;
    },
    [activeSession, mkSetter],
  );

  // ── 渲染（原 L366-459，一字不改）──
  if (!activeSession) {
    return (
      <SidebarSection title={t("收发设置")} defaultOpen={true}>
        <div className="session-settings-placeholder">
          {t("选择一个会话以编辑收发设置")}
        </div>
      </SidebarSection>
    );
  }

  return (
    <SidebarSection title={`${t("收发设置")} — ${activeSession.name}`} defaultOpen={true}>
      {/* 显示 group */}
      <div className="setting-group">
        <div className="setting-section-label">{t("显示")}</div>
        <FormRow label={t("时间戳")}>{mkSelect("timestampFormat", timeFormats)}</FormRow>
        <FormRow label={t("消息回显")}>{mkToggle("showEcho")}</FormRow>
        <FormRow label={t("行号显示")}>{mkToggle("showLineNumbers")}</FormRow>
        <FormRow label={t("系统消息独立显示")}>{mkToggle("separateSystemLog")}</FormRow>
      </div>
      {/* 发送行为 group */}
      <div className="setting-group">
        <div className="setting-section-label">{t("发送行为")}</div>
        <FormRow label={t("换行符")}>{mkSelect("lineEnding", lineEndings)}</FormRow>
        <FormRow label={t("定时发送")}>{mkToggle("autoRepeat")}</FormRow>
        {activeSession.autoRepeat && (
          <FormRow label={t("间隔(ms)")}>
            <input className="input" type="number" value={activeSession.repeatInterval}
              style={{ width: 80 }}
              onChange={(e) => { const v = parseInt(e.target.value); mkSetter("repeatInterval")(isNaN(v) ? 1000 : v); }} />
          </FormRow>
        )}
        <FormRow label={t("发送后清空")}>{mkToggle("autoClear")}</FormRow>
      </div>
      {/* 编码 group */}
      <div className="setting-group">
        <div className="setting-section-label">{t("编码")}</div>
        <FormRow label={t("接收模式")}>
          <SelectBox value={activeSession.receiveMode}
            options={[{ value: "text", label: t("文本") }, { value: "hex", label: "HEX" }]}
            onChange={(v) => mkSetter("receiveMode")(v)} />
        </FormRow>
        <FormRow label={t("接收编码")}>{mkSelect("receiveCoding", ["UTF-8", "GB2312", "Shift-JIS", "Latin-1"])}</FormRow>
        <FormRow label={t("发送模式")}>
          <SelectBox value={activeSession.sendMode}
            options={[{ value: "text", label: t("文本") }, { value: "hex", label: "HEX" }]}
            onChange={(v) => mkSetter("sendMode")(v)} />
        </FormRow>
        <FormRow label={t("发送编码")}>
          <SelectBox value={activeSession.sendCoding} options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
            onChange={(v) => mkSetter("sendCoding")(v)}
            disabled={activeSession.sendMode === "hex"} />
        </FormRow>
      </div>
    </SidebarSection>
  );
}
```

**行数：** ~140 行
**验证：** 选择会话→设置面板显示→改设置→切会话→设置联动正确。

### 第 4 步：plugin.json 声明

```json
// plugin.json 新增 contributes 部分
{
  "contributes": {
    "viewsContainers": {
      "serial-monitor": {
        "title": "串口监视器",
        "location": "sidebar",
        "hideIfEmpty": false
      }
    },
    "views": {
      "serial-monitor": [
        {
          "id": "sessions",
          "title": "串口监视器会话",
          "render": "src/views/SessionListView.tsx",
          "order": 0
        },
        {
          "id": "settings",
          "title": "收发设置",
          "render": "src/views/SerialSettingsView.tsx",
          "order": 1
        }
      ]
    }
  }
}
```

### 第 5 步：动态标题处理

SerialSettingsView 的标题随 `activeSession.name` 变化。声明式 `plugin.json` 的 `"title": "收发设置"` 是静态的。

**方案：** 在 `index.tsx` 的 `activate()` 中命令式注册——利用 `registerView` 的更新语义：

```typescript
// index.tsx activate() 中
// 不在这里调 registerView——声明式已由 loader 处理
// 但 SettingsView 需要动态标题，所以在 activate 中更新：
import { ViewContainerService } from "@src/core/ViewContainerService";

// 声明式的静态注册先于 activate 执行（loader parseContributions）
// activate 中用命令式更新标题——同一个 pluginId+viewId → 更新
ViewContainerService.registerView("serial-monitor", "serial-monitor", {
  id: "settings",
  title: activeSession ? `收发设置 — ${activeSession.name}` : "收发设置",
  render: SerialSettingsView,
  order: 1,
});
```

⚠️ 但 `activate()` 里拿不到 `activeSession`——那是 React hook 状态。

**正确方案：** SerialSettingsView 自己管理自己的标题。`SidebarSection` 已经支持 `title` prop——组件内部使用 `activeSession.name` 构造标题传给 SidebarSection。plugin.json 的静态 `"title": "收发设置"` 作为 SidebarSection 的外部折叠头标题——但 SerialSettingsView 内部不用 SidebarSection 的外部折叠（它在 SidebarSection 里面）。

等等——ViewContainer 外层的 SidebarSection 是 SidePanel 渲染的，它的 title 来自 `ViewDescriptor.title`。SerialSettingsView 内部也有自己的 `<SidebarSection title={...}>` ——这是两层 SidebarSection？不对——ViewContainer 就是用 SidebarSection 包每个 view 的。所以 view 内部不应该再包一层 SidebarSection。

**修正：** SessionListView 和 SerialSettingsView 不包 `<SidebarSection>`——SidePanel 的渲染循环已经包了。view 组件只渲染内容：

```tsx
// SerialSettingsView —— 去掉外层 <SidebarSection>
export default function SerialSettingsView() {
  // ... helpers 不变 ...
  
  if (!activeSession) {
    return <div className="session-settings-placeholder">{t("选择一个会话以编辑收发设置")}</div>;
  }

  return (
    <>
      <div className="setting-group">
        <div className="setting-section-label">{t("显示")}</div>
        {/* ... FormRow 们 ... */}
      </div>
      <div className="setting-group">
        <div className="setting-section-label">{t("发送行为")}</div>
        {/* ... */}
      </div>
      <div className="setting-group">
        <div className="setting-section-label">{t("编码")}</div>
        {/* ... */}
      </div>
    </>
  );
}
```

动态标题由 `ViewContainerService.registerView` 命令式更新。`activate()` 中订阅 `onDidChangeActiveSession` → 调 `registerView({ title: 新标题 })`。

但 `activate()` 在插件加载时执行一次，不在 React 渲染循环里。需要 module 级桥接：

```typescript
// index.tsx
import { ViewContainerService } from "@src/core/ViewContainerService";

let _updateTitle: ((name: string | null) => void) | null = null;

export function activate() {
  // 给 SerialSettingsView 提供标题更新回调
  // SerialSettingsView 在 useEffect 中调用此回调
}

// 暴露给 SerialSettingsView
export function updateSettingsViewTitle(name: string | null) {
  ViewContainerService.registerView("serial-monitor", "serial-monitor", {
    id: "settings",
    title: name ? `收发设置 — ${name}` : "收发设置",
    // render 不变——只更新 title
  });
}
```

然后在 SerialSettingsView 中：
```tsx
useEffect(() => {
  updateSettingsViewTitle(activeSession?.name ?? null);
}, [activeSession?.name]);
```

**行数：** ~15 行（index.tsx + SerialSettingsView 各加几行）
**验证：** 选 COM3 会话→侧栏 header 显示"收发设置 — COM3"。切到 COM4→标题更新。

### 第 6 步：SessionListView 同样去掉外层 SidebarSection

```tsx
// SessionListView —— 内容部分去掉 <SidebarSection> 包裹
export default function SessionListView() {
  // ... 所有 state + handlers 不变 ...
  
  return (
    <>
      {isCreating && (/* 内联输入 */)}
      {sessions.length === 0 && !isCreating ? (
        <div className="session-empty">...</div>
      ) : sessionList}
    </>
  );
}
```

外层 SidebarSection 由 SidePanel 渲染循环提供。`badge` 和 `actions`（新建按钮）怎么办？

**解决：** `ViewDescriptor` 增加 `badge` 和 `actions` 字段——或者让 view 自己在内容顶部渲染工具栏。对标 VS Code：view pane 的内容区域是自由的，view 可以在自己内部渲染任何东西，包括自己的工具栏。

**决定：** view 内容的第一行放工具栏按钮。`badge` 在 SessionListView 内部直接渲染在内容顶部。

### 第 7 步：旧 sidebar.tsx → 标记废弃

```typescript
/**
 * @deprecated 自 E3.6——拆为 SessionListView + SerialSettingsView。
 * 保留此文件直到 R4 清理，确保两套系统共存期间旧路径不崩。
 */
export { default } from "./views/SessionListView";
```

退出重进后确认旧路径不再被引用（grep `sidebarComponent`）。

---

## 验证清单

- [ ] 点 🪢 → 侧栏显示"串口监视器"+ 会话列表 + 收发设置两个 section
- [ ] 新建会话→列表中新增→创建对应标签页
- [ ] 选择会话→标签页聚焦 + 收发设置联动
- [ ] 重命名会话→标签栏标题同步更新
- [ ] 删除会话→会话从列表消失 + 标签页关闭
- [ ] 切换 activeSession → 收发设置标题更新为"— COM3"格式
- [ ] 无 activeSession → 收发设置显示"选择一个会话以编辑收发设置"
- [ ] `npm run check` 零错误
