# 视图插件开发指南

> 创建新视图插件——从零到能在标签页中渲染的最短路径。
> **🔥 写代码前先读：[插件 UI 写法规约](插件UI写法规约.md)——右键菜单/浮层/持久化/快捷键/颜色/文字必须走核心设施，禁止手写轮子。**

---

## 视图插件能做什么

**没有 API 白名单。** 视图插件代码和核心代码在同一个 WebView 里跑。任何 JS 库、任何 Web API、任何 Tauri 命令，核心能用的插件全能用。

视图插件的契约只有一条：**导出默认 React 组件，接受 `{ isActive: boolean }` props。**

除此之外全是标准 React 自由发挥。以下全部能做：

| 你想做的 | 怎么做 | 示例代码量 |
|---|---|---|
| GPS 地图 | `import L from 'leaflet'` → `<div id="map">` | ~50 行 |
| 3D 模型查看 | `import * as THREE from 'three'` → Canvas | ~80 行 |
| 文档/HTML 阅读器 | `<iframe>` + HTML 文件放插件目录 | ~20 行 |
| Markdown 预览 | `import { marked } from 'marked'` | ~30 行 |
| 摄像头画面 | `<video>` + `navigator.mediaDevices` | ~40 行 |
| 高帧率波形 | Canvas 2D + requestAnimationFrame | ~100 行 |
| 数据表格 | 任何 React 表格库 | ~60 行 |
| 终端模拟 | xterm.js | ~50 行 |

---

## 起步：最小视图插件

### 目录结构

```
plugins/my-view/
├── plugin.json
├── index.tsx
└── index.css        ← 可选
```

### plugin.json

```json
{
  "$schema": "../../docs/插件开发/plugin.schema.json",
  "type": "view",
  "name": "我的视图",
  "version": "1.0.0",
  "icon": "window",
  "iconSource": "codicon",
  "description": "一个示例视图插件",
  "author": "开发者",
  "entry": "index.tsx"
}
```

### index.tsx

```tsx
import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useTranslation } from "react-i18next"

interface Props {
  isActive: boolean
}

export default function MyView({ isActive }: Props) {
  const { t } = useTranslation()
  const [count, setCount] = useState(0)

  // 激活态修复布局（如果有 Canvas/CM6/Monaco 等需要 resize 的组件）
  useEffect(() => {
    if (!isActive) return
    // 插件被切换到前台时执行恢复逻辑
  }, [isActive])

  return (
    <div className="my-view">
      <h1>{t("我的视图")}</h1>
      <p>计数: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  )
}
```

---

## Props 契约

视图插件接收的唯一 props：

```typescript
interface ViewPluginProps {
  isActive: boolean  // 当前标签页是否处于前台且所在面板处于活跃状态
}
```

| 场景 | `isActive` 值 |
|---|---|
| 用户正在这个标签页上，标签页所在面板是活跃面板 | `true` |
| 标签页被另一个标签页遮住了 | `false` |
| 标签页所在面板不是活跃面板（分屏时另一个面板活跃） | `false` |
| 应用首次加载，这是默认标签页 | `true` |

---

## Keep-Alive 机制

**不要在组件里用条件渲染隐藏内容。** 视图插件被 keep-alive 机制保活——所有标签页的内容面板始终挂载，用 CSS `display` 切换可见性。这和 VS Code 编辑器组的行为一致。

```tsx
// ✅ 正确：组件始终挂载，依赖 isActive 做轻量恢复
useEffect(() => {
  if (!isActive) return
  editorRef.current?.layout()  // Monaco 重新布局
}, [isActive])

// ❌ 错误：条件渲染会销毁组件状态
if (!isActive) return null
```

如果你用了 Canvas/CM6/Monaco 等需要手动 resize 的组件，在 `isActive` 变为 `true` 时调它们的 `layout()` / `requestMeasure()` 方法。

---

## 可用资源

### 主题变量

所有颜色走 CSS 变量 `var(--xxx)`，切主题自动响应。禁止硬编码 hex。

```css
.my-view {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--separator);
}

.my-view button {
  background: var(--accent);
  color: white;
}
```

### 国际化

所有 UI 文字走 `t()`，和核心共用 i18next 实例。

```tsx
import { useTranslation } from "react-i18next"
const { t } = useTranslation()
<p>{t("GPS 坐标")}</p>
```

### Tauri 命令

任何 Tauri 命令都能 invoke，和核心代码一样：

```tsx
import { invoke } from "@tauri-apps/api/core"
const ports = await invoke<string[]>("list_ports")
await invoke("send_data", { data: [0x01, 0x02] })
```

### JS/TS 库

任何 npm 包都能 import。构建时打包进插件 JS。

```bash
npm install leaflet
```

```tsx
import L from "leaflet"
```

### HTML/CSS/图片资源

资源文件放插件目录下，import 时用相对路径：

```tsx
import manualHtml from "./manual.html?raw"
<iframe srcDoc={manualHtml} />

import iconUrl from "./logo.png"
<img src={iconUrl} />
```

---

## 侧栏

视图插件可以声明侧栏组件——在 `plugin.json` 中指定：

```json
{ "sidebar": "sidebar.tsx" }
```

侧栏组件和主视图组件共享同一个插件上下文（i18n/Tauri invoke/theme），但独立渲染。侧栏只在当前插件活跃时显示。

---

## 状态栏贡献

```json
{
  "statusBar": [
    { "id": "coords", "label": "39.9, 116.4", "align": "left" }
  ]
}
```

条目动态更新：通过 `useStatusBar()` hook（Phase 4 提供）。

---

## 调试

开发阶段（`npm run dev`）：Vite HMR 即时热更新。改 `index.tsx` → 保存 → 页面自动刷新。

生产构建（`npm run build`）：插件独立打包为 `dist/plugins/<插件文件夹名>.js`。

---

## 打包分发

制作 `.v3p` 包：

1. 将插件文件夹下的 `plugin.json` + 编译产物 + 资源文件打包为 `.zip`
2. 改后缀为 `.v3p`
3. 用户拖 `.v3p` 到窗口 → 解压到 `plugins/` → 即时生效（JSON 类型）或重启生效（`.tsx` 类型）

`.v3p` 包结构：

```
my-view.v3p (zip)
├── plugin.json
├── plugin.js          ← 编译后的 JS（不是 .tsx 源码）
└── assets/
    └── logo.png
```

---

## 开发检查清单

```
☐ plugin.json 放在插件目录根下
☐ type 字段正确（view）
☐ entry 指向默认导出的 React 组件
☐ 组件接受 { isActive } props
☐ 所有颜色走 var(--xxx)，零硬编码 hex
☐ 所有 UI 文字走 t()，零硬编码中文
☐ 不用条件渲染隐藏内容（不写 {isActive && <View/>}）
☐ isActive 变为 true 时恢复 Canvas/Monaco 布局
```

---

## 相关

- `docs/插件开发/plugin.json规范.md` — plugin.json 完整字段参考
- `docs/插件开发/协议插件开发.md` — 协议插件开发指南
- memory `plugin-system.md` — 插件系统完整设计
