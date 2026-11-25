# 最小第三方设置 UI（可替换性契约夹具）

> **不发布、不进市场。** 它是「第二个作者」的化身：不看官方设置插件源码、**零 `@linkdesk/ui`**，
> 只用公开 API 把设置页做出来。判据见 `03-门禁与验收/02-可替换性契约测试.md`。

## 它证明了什么

- 分组/依赖/条件说明：读 `configuration.getConfigurationContributions()` 的 `group/dependsOn/descriptionWhen`；
- 12 种 `uiHint` 的通用渲染：原生元素 + 自有 CSS（`msu-` 命名空间），⛔ 不调用壳 UI 库；
- 选图：`appearance.pickImage({ domain: assetDomain, target: pickTarget })`；
- 只读状态：`commands.executeCommand(statusCommand)`；动作行：`actionCommand`；
- 主题：`theme.listRecipes()` / `theme.setRecipe()`；
- 文件关联管理器：`pluginManager.list()` + `fileAssociation.listHandlersFor()` + **A6 的 `getOverrides()` / `onDidChangeOverrides()`** + `setDefault()`；
- 快捷键页：`keybindings.*` 查询/清除/重置/录制——录制用**本地 keydown ＋ `setKeybindingCaptureActive(true)`**（宿主放行按键）；⛔ 不用 `onForwardedEvent`（壳侧专属，池内不存在）；
- 写配置：`configuration.set(key, value)`。

## 怎么验

```bash
npm run test:replaceability        # 结构自检：manifest / entry / 零宿主字面量 / 零 @linkdesk/ui / 不依赖壳侧专属 API
npm run test:replaceability -- --json
```

真机半自动（D3-a）：把本夹作为 `factoryRole:"settings"` 插件装进 dev 隔离实例，跑 R1–R8
（选背景图 app/zone、主题、分组门控、AI 权限档、只读状态、旧壳降级、覆盖表）。首版不进 `npm run check`。

## 不在射程

- 富内容确认弹窗（安装确认已由壳托管，见 `已落地/插件安装更新确认-壳托管与批量更新/`）；
- 图标主题/字体预览等「长相」细节——本夹具故意长得与官方设置页不同，这正是要证明的。
