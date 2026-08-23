# 06-主题API契约（window.linkdesk.theme）

> **状态：** 提案（2026-08-23 起草）——待 05 schema 拍板后冻结。
> **一句话：** 主题的**列表**走 API（数据），主题的**选中**走配置（持久化）——`linkdesk.theme` 提供配方/配色查询 + 应用；`app.theme`/`app.themeColor` 存用户选择。

## 1. 为什么需要新命名空间

现状 `app.theme` 是静态 enum 的 SelectBox，撑不起三样新东西（[07](07-代码规划.md) D 段「动态 enum 缺口」）：

1. **ThemePicker 卡片**要列配方 + 配色变体（静态 enum 只有几个字符串）
2. **配色下拉**要随活动配方动态换列表（app.theme 一变，app.themeColor 的选项就变）
3. **混搭来源下拉**要列各域的可用来源（[10](10-混搭设计.md)）

**分工铁律：** API 只管「有什么、现在是什么、应用什么」；**持久化仍是配置注册表**（app.* key 写 workspace.json，重启还原走既有配置管线）。API 不写配置——选择通过 `window.linkdesk.configuration.update` 落到配置。

## 2. 命名空间速查

| 方法 | 返回 | 用途 | 消费方 |
|:--|:--|:--|:--|
| `listRecipes()` | `Promise<RecipeMeta[]>` | 全部可用配方（含各配方配色变体 + 预览色） | ThemePicker、配色/混搭动态 SelectBox、命令面 |
| `getActive()` | `Promise<{ recipeId, colorwayId }>` | 当前活动配方/配色（合并配置计算） | 设置页回显 |
| `getEffectiveTokens()` | `Promise<Record<string,string>>` | 当前生效 token 集（合并后） | appearanceMode→custom 播种、混搭预览 |
| `setRecipe(recipeId)` | `Promise<void>` | 应用配方（落到 app.theme，配色回跟随） | ThemePicker 点卡片 |
| `setColorway(colorwayId)` | `Promise<void>` | 应用配色变体（落到 app.themeColor） | 配色下拉 |
| `resetAppearance()` | `Promise<void>` | 清设置层外观覆盖（app.appearanceMode→followTheme） | 「复位」按钮、命令 |

```ts
// 类型形状（@linkdesk/contracts 同步扩展，见 [07](07-代码规划.md) A 段）
interface ColorwayMeta { id: string; name: string; preview: { accent: string; bgWindow: string } }
interface RecipeMeta {
  id: string; name: string; type: "light" | "dark";
  colorways: ColorwayMeta[];              // 单配色配方 = 1 项
  domains: Array<"colors"|"font"|"radius"|"glass"|"background"|"surface">; // 该配方贡献哪些域（混搭来源过滤用）
}
```

## 3. 事件

| 事件 | payload | 触发 | 消费方 |
|:--|:--|:--|:--|
| `theme:changed` | `{ recipeId, colorwayId, tokens }` | 配方/配色/设置层覆盖任一变化 | 全 UI 实时刷新（已有事件，扩展 payload） |

事件走既有 `events.onDidChangeTheme`（或 `on(theme:changed)`），**跨窗口一致**（主进程广播，对标 #54 计数权威上移的教训——生效 token 的权威在 ThemeEngine，不在某个窗口的 DOM）。

## 4. 资产解析

主题 json 里的资产相对路径（`assets/bg.png`、`assets/NotoSansSC.woff2`）一律走 **`getAssetPath(pluginId, path)`**（硬约束 12）——主题即插件，资产挂在插件目录。ThemeEngine 读取时解析成 `file://`/dev URL 再写 token，渲染层不碰裸路径。

## 5. 渲染器（preload） vs 主进程

- **查询（listRecipes/getActive/getEffectiveTokens）**：preload 桥 → 主进程 ThemeRegistry 查询（数据权威在主进程，多窗一致）
- **应用（setRecipe/setColorway/resetAppearance）**：preload 桥 → 主进程 → 写配置 → 配置变更 → 全窗重推 theme:changed
- 遵守**插件通信唯一铁律**（memory）：设置插件只 `window.linkdesk.*`，不 `import @src/core`

## 6. 待拍板点

1. `getActive` 是否合并进 `getEffectiveTokens`（一个调用拿全）——提案拆两，语义清晰。
2. `theme:changed` 是否拆 `theme:recipe-changed` / `theme:appearance-changed` 两个事件（混搭时域级刷新粒度）——提案暂不拆，payload 带 `domains` 数组供细粒度消费，事件少好守。
3. 第三方插件能否订阅/调用本命名空间：**可以**（通用 API 优先复用铁律 [[api-preference-existing-first]]）——文档写明即契约。
