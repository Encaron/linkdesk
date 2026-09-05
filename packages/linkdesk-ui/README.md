# @linkdesk/ui

LinkDesk 共享 UI 组件库——右键菜单 / 下拉 / 组合框 / 开关 / 滑杆 / 取色器 / 表单行 / 文件路径输入 / 主题选择等。

组件源码单一宿主于 LinkDesk 壳的 `src/components/shared/`，本包是其编译分发面：**插件作者 `npm i @linkdesk/ui` 后拿到的组件与内置插件同款、自动跟随宿主主题与玻璃态**，无需关心实现细节。

## 安装

```bash
npm i @linkdesk/ui react react-dom
```

## 用法

```tsx
import { SelectBox, Toggle } from "@linkdesk/ui";
import "@linkdesk/ui/index.css"; // 绝大多数组件 CSS 由入口 JS 自动带入；需显式引入时用此路径

export function MyView() {
  return (
    <Toggle
      checked={checked}
      onChange={setChecked}
      label={{ title: "启用", description: "打开后生效" }}
    />
  );
}
```

> 🔥 样式走宿主 CSS 变量——无需（也不应）在插件里覆盖主题 hex。i18n 文案经宿主语言系统，组件内部文案由宿主翻译。

## 设计约束

- **单一源码，禁止拷贝**：本包 `dist/` 是构建产物（源码只在 LinkDesk 壳仓库），插件侧直接依赖 npm 分发；不要 fork 组件到插件内自维护。
- **跟随主题**：所有组件消费宿主 CSS 变量，插件换主题自动变色。
- 详见 LinkDesk 壳仓库 `docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/07-共享组件独立分发设计.md`。

## 开发（LinkDesk 壳仓库内）

```bash
cd packages/linkdesk-ui
npm run build   # dist 构建：esm + 聚合 css + 声明文件
```

## License

MIT
