# 右键菜单美化 — E3.5 生态美化

> 2026-07-29。E3.5 并行轨道第四个专题。

## 涉及文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/components/shared/ContextMenu.tsx` | 242 | **归一化右键菜单组件**——四种失焦 + ↑↓Enter + 自动定位 |
| `src/components/shared/ContextMenu.css` | 99 | 全部菜单样式——分离符/快捷键/danger/backdrop |
| `src/core/MenuRegistry.ts` | ~200 | 菜单注册表——MenuItem 类型 + registerMenuItems |
| `src/core/KeybindingRegistry.ts` | ~500 | 快捷键注册表——`findKeybindingForCommand()` 已就绪 |
| `src/core/coreCommands.ts` | ~420 | 核心命令 + 壳级菜单项注册 |

## 架构

```
┌─ ContextMenu (点击右键弹出) ──────────────────────────────┐
│                                                            │
│  ┌─ .ctx-menu (fixed 定位，自动防溢出) ─────────────────┐  │
│  │  ┌─ item ──────────────────────────────────────────┐  │  │
│  │  │ [icon?] 关闭标签页                     Ctrl+W   │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─ item ──────────────────────────────────────────┐  │  │
│  │  │ [icon?] 关闭其他标签页                           │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ─── separator ────────────────────────────────────   │  │
│  │  ┌─ item danger ───────────────────────────────────┐  │  │
│  │  │ [icon?] 删除会话                   Ctrl+Delete  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## 消费方——十个菜单注册点

| MenuId | 触发 | 使用位置 |
|--------|------|---------|
| `EditorContext` | 编辑器区右键 | MainContent? |
| `TabContext` | 标签页右键 | TabBar |
| `IconBar` | 图标栏右键 | IconBar |
| `ExtensionGear` | 图标栏底部齿轮 | IconBar gear menu |
| `MarketplaceItemGear` | 市场插件齿轮 | marketplace sidebar |
| `SettingItemGear` | 设置项齿轮 | SettingsView |
| `MenuBar` | 顶栏菜单 | MenuRenderer（走 MenuRenderer 非 ContextMenu） |
| `HamburgerMenu` | ☰ 汉堡菜单 | HamburgerMenu（走 MenuRenderer） |
| 插件自定义 | plugin.json `contributes.menus` | loader.ts → registerMenuItems |

## 整改方向

参见：
- [01-全量审计.md](./01-全量审计.md) — 当前现状 + VS Code 对标差距
- [02-设计方向.md](./02-设计方向.md) — 改进方案 + 执行顺序

## 整体预览

👉 **[preview-整改效果.html](./preview-整改效果.html)** — 浏览器打开。右键不同区域触发不同菜单（标签页 / 编辑器 / 齿轮 / 会话）。左上角切换整改前/整改后，右上角切换暗色/浅色。

> 🔥 **AI 进场必读——动手改 ContextMenu CSS/TSX 前，必须先用浏览器打开 `preview-整改效果.html`，右键四个区域分别看完整效果。** 不看预览直接写代码 = 违反制作规矩。
