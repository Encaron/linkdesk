# 05-插件更新 · 串口监视器 · 右键菜单与底栏修缮（2026-11-07 五连）

> 立案：2026-11-07（用户实机五连报：2.1 右键菜单空白 · 2.2 发送历史菜单是不是壳组件 · 2.3 下拉不失焦消失 · 2.4 顶部按钮自绘还是组件 · 2.5 底栏按钮被圆角裁角）。
> 状态：🟢 **已实施＋已发版（serial-monitor 1.0.34）· ⏳ 待用户市场更新验收**。
> 归属：**05-插件更新**（全纯插件侧，壳零改动；分档判据 → memory `docs-04-05-filing-rule`）。用户授权：修完直接上架市场，用户自行更新验收（插件轴迭代快，不走攒批）。

| 项 | 值 |
|:--|:--|
| 插件 | `serial-monitor`（源码仓 `E:\linkdesk-plugins\official\serial-monitor`，1.0.33 → **1.0.34**） |
| 壳改动 | **无** |
| 状态 | 已发版待验收；验收通过后归还插件仓 docs/（一项一子夹） |

## 一、五连：现象 → 原因 → 修法 → 效果

### 2.1 快捷发送药丸右键菜单空白

- **现象**：右键快捷发送药丸想删除，弹出空盒。
- **原因**（调查结论，含一段未竟）：壳 `menu:getItems` 对每条菜单项取 `item.when ?? cmd?.when` 过滤（`IpcBridgeHandler/ui.ts:121-123`）——「编辑／删除」命令被 `serialCommands.ts:518/540` 以 **`when: "activeEditor == 'serial-monitor'"` 抢先注册**（CommandRegistry `:148-151` 重注册只更新 handler＋title，**首注册的 when 存活**），而 QuickSendBar 的 ContextMenu 只传 `{quickSendName}` 不带 `activeEditor` 键——右键时刻该全局键不成立 ⇒ 编辑／删除被滤。快捷发送菜单是全仓唯一「命令带 when 而菜单 context 不带键」的组合（接收区菜单同键但走全局状态成立）。
- **修法**：`QuickSendBar.tsx` 的 ContextMenu context 补 `activeEditor: "serial-monitor"`——ContextKeyService 的 overrides 优先于全局键（`_readKey`），右键药丸必然在视图内 ⇒ 语义成立 ⇒ 无论哪份注册的 when 生效都放行。
- **效果**：右键药丸稳定出「回填到发送区／编辑／删除」三条，删除可用。

### 2.2 发送历史菜单是壳组件吗

- **答**：不是。自绘下拉（`serial-monitor-history-dropdown`，`showHistory` state 切换），不经壳 ContextMenu／OverlayPortal。

### 2.3 发送历史下拉不失焦消失

- **原因**：从未实现外点／Esc 关闭——`showHistory` 只在按钮 onClick 里 toggle，点外面永远不收。
- **修法**：`SenderArea.tsx` 在 showHistory 时挂 window `pointerdown`（capture）外点关 ＋ `keydown` Esc 关（▼ 按钮在 wrapper 内不受影响，toggle 语义不破）；**选中一条历史即收**。
- **效果**：点面板外任意处／Esc 即收；回填后自动收起。

### 2.4 顶部按钮自绘还是 UI 组件

- **答**：按钮全部自绘（`serial-monitor-toolbar-btn`／`send-btn`，radius 硬编码 4px）；「全部」会话下拉＝共享 `SelectBox`；「关键字过滤」输入框＝`ldk-input` **共享基类**（radius 走 `var(--radius-sm)`，已随主题圆角）；会话重命名框＝共享 `InlineInput`（用户记得的那个圆角修复的受益者）。
- **本刀顺带**：toolbar-btn／send-btn 的 radius `4px` 硬编码 → `var(--radius-sm)`（默认主题下同为 4px 零视觉变；拉大圆角时按钮跟随——「全盘适配」同款口径）。

### 2.5 底栏「▼／清空发送区／发送」被圆角裁角

- **原因**：`.serial-monitor-sender-actions { padding: 4px 8px }`——发送按钮距容器右下角 dx=8/dy=4；surfaceRadius 拉大（0–32）后按钮右下角落进容器圆角切割区（几何：R=32 时 dx=8 必裁；R=16 时已临界）。
- **修法**：右缘留白随圆角 token 走——`padding-right: calc(var(--radius-lg) + 8px)`（dx ≥ R 即离开切割区；R=0 时退化为原 8px 零变化）。
- **效果**：任意圆角档位发送按钮右下角不再被裁。

## 二、发版链（2026-11-07）

- 插件仓 commit → **Release v1.0.34** → 官方目录外科式收录 →（串口监视器**不随包**，无种子腿）。

## 三、未竟与分流测试

- 2.1 的「回填无 when 理应幸存」与「全空」矛盾未闭——若 1.0.34 更新后菜单**仍空**：① 先问接收区右键菜单是否也空（分流＝注册态全局问题 vs 本槽特异）② 壳侧 CDP 打 `menu:getItems("quickSendContext")` 读返回；若坐实壳侧过滤语义缺陷 ⇒ 按分档翻 **04**。
- **用户验收清单**（市场更新 1.0.34 → 重启）：① 右键药丸出三条菜单、删除可用 ② 发送历史点外／Esc 收、选中即收 ③ 设置→外观把圆角拉到最大，底栏发送按钮不裁角 ④ 亮／暗主题回归。

## 四、待办

1. ~~实施＋发版~~ ✅ **2026-11-07 完成**。
2. 用户市场更新验收 → 通过后本夹归还插件仓 docs/（一项一子夹），05 索引行改指针。
