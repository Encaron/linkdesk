# 05-插件更新 · 串口监视器 · 右键菜单与底栏修缮（2026-11-07 五连）

> 🏠 **归还横幅（2026-11-07）**：本档原住壳仓 `docs/05-插件更新/串口监视器-右键菜单与底栏修缮/`，1.0.36 市场验收通过后按 05 总 README §五 归宿规矩整体归还本仓；指向壳仓的相对链接已同笔改 GitHub 绝对链接（electron 分支）。
> 立案：2026-11-07（用户实机五连报：2.1 右键菜单空白 · 2.2 发送历史菜单是不是壳组件 · 2.3 下拉不失焦消失 · 2.4 顶部按钮自绘还是组件 · 2.5 底栏按钮被圆角裁角）。
> 状态：🟢 **已实施＋已发版三刀（1.0.34 修缮 ＋ 1.0.35 收编试验 ＋ 1.0.36 尺寸回调）· ⏳ 待用户市场更新验收**。
> 归属：**05-插件更新**（全纯插件侧，壳零改动；分档判据 → memory `docs-04-05-filing-rule`）。用户授权：修完直接上架市场，用户自行更新验收（插件轴迭代快，不走攒批）。

| 项 | 值 |
|:--|:--|
| 插件 | `serial-monitor`（源码仓 `E:\linkdesk-plugins\official\serial-monitor`，1.0.33 → **1.0.36**：1.0.34 修缮 ＋ 1.0.35 收编试验 ＋ 1.0.36 尺寸回调） |
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

1. ~~实施＋发版~~ ✅ **2026-11-07 完成**（1.0.34 ＋ 追加刀 1.0.35）。
2. 用户市场更新验收 → **收编效果由用户裁决**（药丸形变／打开断开配色／按钮高度都是试验点，不合口味即回退重发）→ 通过后本夹归还插件仓 docs/（一项一子夹），05 索引行改指针。

## 五、追加刀（同日）：按钮全面收编壳共享 Button（v1.0.35）

用户拍板「都收编看看使用壳组件的效果，直接发版」——13 颗自绘钮全部换壳共享 `Button`（`@linkdesk/ui`），删四段自绘按钮 CSS（toolbar-btn 全族／send-btn／connect-btn 全族／quick-send-pill＋add）：

| 原 self-drawn | 收编为 |
|:--|:--|
| 工具栏 暂停／导出日志／清空接收区／搜索 | `Button ghost sm`（data-hint → Button `title` 契约同义；暂停态由图标切换表达，**active 高亮暂缺**） |
| ▼ 发送历史（disabled 联动保留）／清空发送区 | `Button ghost sm` |
| 发送（主操作） | `Button` 缺省＝实心 accent |
| 打开／断开 | `Button size=sm variant=connected ? "danger" : "success"`——语义映射照市场详情页动作层级（打开＝正面主操作实心绿；断开＝破坏性次级红描边） |
| 快捷发送药丸（胶囊 12px → 标准钮形，**等宽字体暂失**）／确认／取消／＋添加 | `Button ghost sm`（title＝悬停显内容；onContextMenu 原样保留） |

- **行为零变更**：所有 onClick／悬停提示／右键菜单／disabled 联动原样；纯视觉＋组件替换。
- CSS 净减：`-161/+57` 行（verify 九段零偏离，test 27 文件/326 例全过）。
- 读数：插件仓 `e5eab51` → **Release v1.0.35** → 官方目录 `2b221aa`（size 实测 157050 B）。

## 六、收编回调刀（v1.0.36，同日第三刀）——尺寸档修正

- **用户裁决**：收编后按钮太小（22px 紧凑档）——「全部」下拉合适、其余太小；且图标＋文字不居中、关键字过滤框矮一截。
- **修**：① 全部按钮 `size="sm"` 撤销 → **缺省档**（≈28px，与 SelectBox 同排同高；sm 档本就是壳标题栏 30px 条专用，收编时选错档）；② 图标＋文字补内层 flex 居中（`serial-monitor-btn-inner`——壳 Button 基类无 display/align-items，根修登记 04 壳工具链小修二连随 0.2.53）；③ 过滤框度量照抄 SelectBox 触发器（font-md×1.6 无固定高，随 ui-scale）。
- **迭代方式（新工种首用）**：未连发版——插件仓 `dev:real` 真机环（`LINKDESK_CDP_PORT=9333` 指作者安装版）改一笔刷一笔，用户看屏裁决后才 bump 发版；期间顺带修出 SDK 端口分叉（见 04 [壳工具链小修二连](https://github.com/Encaron/linkdesk/blob/electron/docs/04-软件更新/待抉择池/壳工具链小修二连/00-README.md)）。
- 读数：插件仓 `cb0b68d` → **Release v1.0.36** → 官方目录 `a863908`（size 实测 157192 B）；dev:real 热更环已停（发版后安装目录归发布件）。
