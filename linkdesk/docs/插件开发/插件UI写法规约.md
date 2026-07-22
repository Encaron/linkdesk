# 插件 UI 写法规约

> **一句话：核心已提供标准组件和注册表——不要手写轮子。手写 = 风格不一致 + 以后归一化时要拆。**
> 写插件前扫一眼，避免 B62 式返工。

---

## 1. 右键菜单 → `<ContextMenu>` + MenuRegistry

**❌ 禁止：** 手写 `<div className="my-menu">` + `useState` + click-outside listener。

**✅ 正确：** 
```tsx
// ① 注册菜单项（plugin.json contributes.menus 或代码注册）
registerMenuItems(MenuId.EditorContext, "myPlugin", [
  { command: "myPlugin.copy", group: "navigation" },
  { command: "myPlugin.clear", group: "edit" },
]);

// ② 使用统一组件
<ContextMenu menuId={MenuId.EditorContext} />
```

**理由：** `<ContextMenu>` 自带 backdrop + 四种失焦（Escape / click backdrop / window blur / 选项 click）+ 键盘导航 + when 条件过滤。手写做不到这四种失焦——B62 教训。

**可用 MenuId：**
| MenuId | 场景 |
|---|---|
| `EditorContext` | 视图主区域右键 |
| `TabContext` | 标签栏标签右键 |
| `IconBar` | 图标栏右键 |
| `QuickSendContext` | 快捷发送药丸右键 |
| `ExtensionGear` | 扩展齿轮菜单 |

新增右键场景 → 先看现有 MenuId 够不够；不够 → 在 `MenuRegistry.ts` 加一个，再注册菜单项。

---

## 2. 浮层 / 弹窗 → `createPortal`

**❌ 禁止：** 弹窗嵌在组件树的深层 div 里。

**✅ 正确：**
```tsx
import { createPortal } from "react-dom";

return createPortal(
  <div className="my-dialog">{/* ... */}</div>,
  document.body  // ← 关键：渲染到 body
);
```

**理由：** keep-alive 架构下非活跃标签页 `display: none`，子元素用 `position: fixed` 也看不见（B54 教训）。render 到 `document.body` 才能突破组件树限制。

---

## 3. 持久化 → plugin.json configuration + `useConfiguration()` / `registerOnApply()`

**❌ 禁止：** `localStorage.setItem()` / `PreferenceService.loadPrefs()` / 手写文件读写。

**✅ 正确——普通 React 响应：**
```tsx
import { useConfiguration } from "../src/core/ConfigurationService";

function MyView() {
  const showLineNumbers = useConfiguration("myPlugin.showLineNumbers");
  return showLineNumbers ? <LineNumbers /> : null;  // 值变 → 自动重渲染
}
```

**✅ 正确——非 React 副作用（通知后端、写文件等）：**
```tsx
import { registerOnApply } from "../src/core/ConfigurationApplier";

useEffect(() => {
  const dispose = registerOnApply("myPlugin.baudRate", (v) => {
    invoke("set_baud_rate", { rate: v });
  });
  return dispose;  // unmount 自动注销
}, []);
```

**plugin.json 声明配置项：**
```json
{
  "configuration": {
    "myPlugin.showLineNumbers": {
      "type": "boolean",
      "default": true,
      "description": "显示行号"
    }
  }
}
```

**理由：** Framework 自动持久化 + F5 恢复 + Settings Editor 自动渲染。手写 localStorage → 丢掉 Settings Editor 集成 + 下一个持久化 bug。

---

## 4. 快捷键 → plugin.json `contributes.keybindings`

**❌ 禁止：** 组件里 `window.addEventListener("keydown", ...)`。

**✅ 正确：**
```json
{
  "contributes": {
    "keybindings": [
      {
        "key": "ctrl+k",
        "command": "myPlugin.clear",
        "when": "activeEditor == 'myPlugin'"
      }
    ]
  }
}
```

**理由：** 组件内 keydown 会被编辑器（CM6/Monaco）吞掉；重复 mount → 多份 listener（B11 同族 bug）。全局快捷键走 App.tsx capture handler，插件快捷键走 KeybindingRegistry。

---

## 5. 颜色 → CSS 变量 `var(--xxx)`

**❌ 禁止：** 硬编码 `#0078d4` / `#1e1e1e` / `#ffffff`。

**✅ 正确：**
```css
.my-element {
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border);
}
```

**理由：** 换主题后硬编码颜色不变 → 暗色主题下白字白底不可见。见 `src/index.css` 查看所有可用 CSS 变量。

---

## 6. 文字 → `t()` 国际化

**❌ 禁止：** 硬编码中文 `"发送"` / `"清除"`。

**✅ 正确：**
```tsx
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
<button>{t("发送")}</button>  // i18n key = 中文原文
```

---

## 7. 侧栏列表选中条目 → `onMouseDown`（不是 `onClick`）

**❌ 禁止：** 侧栏垂直列表中选中条目用 `onClick`。

**✅ 正确：**
```tsx
<div
  className={`my-list-item${isActive ? " active" : ""}`}
  onMouseDown={() => onSelect(item.id)}
>
  <span>{item.label}</span>
</div>
```

**理由：** 侧栏条目垂直紧邻——快速点击时 mousedown 在条目 A、mouseup 滑到条目 B。浏览器 `click` 事件规范：mousedown 和 mouseup 落在不同元素 → click 投递到两者的共同祖先 → React 在祖先上找不到 handler → 静默丢失。`onMouseDown` 只关注按下位置，不要求释放在同一元素——消除快速点击丢事件。

**对标 VS Code：** Explorer 文件树选文件用 `onMouseDown`，不是 `onClick`。这是经过千万用户验证的模式，不要自己设计。

**适用场景：** 侧栏中任何垂直排列、条目间距小的可点击列表——会话列表、文件树、数据库连接、MQTT 主题、设备列表等。

**子元素的处理：** 条目内的操作按钮/输入框需要加 `onMouseDown={(e) => e.stopPropagation()}` 防止误触父条目的选中：
```tsx
<button
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
>
  ✕
</button>
```

---

## 速查

| 你要做的 | 核心设施 | 引入方式 |
|---|---|---|
| 右键菜单 | `<ContextMenu>` + `MenuRegistry` | `src/components/shared/ContextMenu` + `src/core/MenuRegistry` |
| 浮层/弹窗 | `createPortal` | `react-dom` |
| 持久化 | `useConfiguration()` / `registerOnApply()` | `src/core/ConfigurationService` / `src/core/ConfigurationApplier` |
| 快捷键 | `plugin.json contributes.keybindings` | — |
| 颜色 | CSS 变量 | `var(--xxx)`，列表见 `src/index.css` |
| 文字 | `t()` | `useTranslation()` from `react-i18next` |
| 侧栏列表选中 | `onMouseDown`（非 `onClick`） | 对标 VS Code Explorer——防止快速点击跨元素丢事件 |

**写插件时用这些设施，别手写。写了以后也得拆——不如从第一天就归一。**
