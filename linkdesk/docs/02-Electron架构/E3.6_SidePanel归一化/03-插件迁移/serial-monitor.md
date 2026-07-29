# serial-monitor 迁移

> 对应任务：E36#8

## 当前状态

460 行 `sidebar.tsx`——三个迁移中最大的文件。内部两个 `<SidebarSection>`：

- "串口监视器会话"（L36-364）：SessionListItem + 会话 CRUD + 新建内联输入
- "收发设置"（L366-459）：显示/发送/编码三个 setting-group

两个 section 共享 `useSerialSessions()` hook 和 `useSerialContext()`。

## 迁移后

拆为两个独立 view 组件。

**plugin.json 新增：**
```json
{
  "contributes": {
    "viewsContainers": {
      "serial-monitor": { "title": "串口监视器" }
    },
    "views": {
      "serial-monitor": [
        { "id": "sessions", "title": "串口监视器会话", "render": "src/views/SessionListView.tsx" },
        { "id": "settings", "title": "收发设置",       "render": "src/views/SerialSettingsView.tsx" }
      ]
    }
  }
}
```

**SessionListView.tsx：** 从 sidebar.tsx 提取 L36-364。包含 SessionListItem 组件、创建/重命名/删除逻辑。export default。

**SerialSettingsView.tsx：** 从 sidebar.tsx 提取 L366-459。包含三个 setting-group（显示/发送/编码）。依赖 `activeSession`——从 `useSerialSessions()` hook 获取。因为和 SessionListView 在同一个渲染树里，hook 状态天然一致，不需要额外传 props。

**动态标题：** SettingsView 的 title 需要随 session 变化（"收发设置 — COM3"）。plugin.json 声明式写的是静态标题 `"收发设置"`。如需动态标题，在 `activate()` 中用命令式：
```typescript
// 当 activeSession 变化时更新标题
ViewContainerService.registerView("serial-monitor", {
  id: "settings",
  title: activeSession ? `收发设置 — ${activeSession.name}` : "收发设置",
  render: SerialSettingsView,
});
```

## 难度评估

中等偏难（三个迁移中最难的，但本质只是拆分）。460 行拆成两个 100+ 行组件，逻辑不动，只动结构。`useSerialSessions()` hook 天然解决两个组件间的状态共享。

**文件：** serial-monitor `plugin.json` + 2 个新 view 组件  
**行数：** ~50 行
