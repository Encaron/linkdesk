/**
 * @linkdesk/ui 公共入口（barrel）——E6#54b
 *
 * 单一源码防漂移（07 设计 §四·关键决策）：此处**不拷源码**，只经 @shared 别名
 * 引用壳 `src/components/shared/` 的原件；packages/linkdesk-ui 的 dist 是编译产物。
 * 改组件只改壳一处，壳与包同源。
 *
 * 导出面 = 插件实际消费集（E6#54c 锚点：4 内置插件 33 处 import 收敛于此）+ 必备类型。
 * 🔴 计数与 scripts/ui-surface.json 的 count 互为对账（E6#121 起机械校验，改导出面必同笔改这里）：
 *   - 35 组件（30 个 default 导出 + InlineInput / PluginIcon / FileIconResolver / SegmentPreviewText / SegmentPreviewSwatch 具名）
 *   - 4 hooks（useClickPreview / useClipboardKeys / useDebouncedInput / useStatusPolling）
 *   - 24 helpers（pickIdentityArt / DEFAULT_PLUGIN_IDENTITY_URI / inferSliderStep / urlSourceKey /
 *       CONFIG_NONE_SENTINEL / MIX_FOLLOW_THEME_SENTINEL / SETTINGS_UI_HINTS / SETTINGS_RENDER_HINTS /
 *       isSettingsUiHint / SETTINGS_HIDDEN_HINTS / isSettingsHiddenHint / formatEffectiveValue / splitStringList /
 *       buildManagerModel / normalizeExt / normalizeExtList / overrideKeyOf / readOverride /
 *       extractDeclaredExtensions / extLabelHead / EXT_LABEL_MAX /
 *       orderRows / filterRows / hitKindOf）
 *   - 29 类型（IconDescriptor / InlineInputHandle / ContextMenuProps / ManifestIconShape / ResolvedIcon / HintTipProps /
 *       RunStatusCommand / BackgroundImagePickerProps / EffectiveBadgeProps / SourceBadgeSource / SourceBadgeKind / SourceBadgeProps /
 *       OpenWithRequest / OpenWithHandler / OpenWithPickerProps /
 *       DeclaredExtension / DeclaredPlugin / HandlerSnapshot / RowState / RowSortMode / RowOption / ExtRowModel / CardModel /
 *       ContestedRowModel / ManagerModel / BuildInput / ManagerViewProps / CardRowProps / ContestedRowProps）
 *   - E6#121 起：导出面**只加不删**（check-ui-surface-additive 常驻判红——L9 集中供给的终身承诺）
 *
 * 🔴 公共导出面的唯一真相源——scripts/build.mjs 据此生成 dist/index.d.ts。
 */
export { default as Badge } from "@shared/badge/Badge";
// E6#30.6a：README/markdown 渲染唯一组件（react-markdown 系 + rehype-sanitize）——详情 README/发行说明通用
export { default as MarkdownView } from "@shared/markdown-view/MarkdownView";
export { default as Button } from "@shared/button/Button";
export { default as ColorPicker } from "@shared/color-picker/ColorPicker";
export { default as Combobox } from "@shared/combobox/Combobox";
export { default as ContextMenu } from "@shared/context-menu/ContextMenu";
export { default as DynamicSelect } from "@shared/select-box/DynamicSelect";
export { default as FilePathInput } from "@shared/file-path-input/FilePathInput";
export { default as FontFamilySelect } from "@shared/font-family-select/FontFamilySelect";
export { default as FormRow } from "@shared/form-row/FormRow";
// E6#120：通用悬停说明卡（格 5 市场卡收编为共享件——触发/文案归调用方，卡与定位归壳）
export { default as HintCard } from "@shared/hint-card/HintCard";
// 04「悬停提示系统」件 1：轻提示条（**糖**——把 props 转成 `data-hint*` 属性挂到子元素上，
// DOM 结构零变化；真正渲染由池内单例 HintTipRenderer 做）。与 HintCard 分工：卡 = 多行说明，
// 条 = 一行紧凑。插件**不 import 也能用**——直接写 `data-hint="…"` 属性即可（属性式铁律）。
export { default as HintTip } from "@shared/hint-tip/HintTip";
export type { HintTipProps } from "@shared/hint-tip/HintTip";
export { default as NumberInput } from "@shared/number-input/NumberInput";
// M4 AI#38.12（P-2/P-3 拍板 A）：只读文本展示件 ＋ 分节副标题件——设置页 renderHint "readonly"
// 与 subtitle/groupDescriptions 的渲染原语；通用（任何插件可 import），就是文字、零交互。
export { default as ReadOnlyText } from "@shared/readonly-text/ReadOnlyText";
export { default as SectionSubtitle } from "@shared/section-subtitle/SectionSubtitle";
export { default as SegmentedRadio } from "@shared/segmented-radio/SegmentedRadio";
export { default as SelectBox } from "@shared/select-box/SelectBox";
export { default as Slider } from "@shared/slider/Slider";
export { default as StringListEditor } from "@shared/string-list-editor/StringListEditor";
export { default as ThemePicker } from "@shared/theme-picker/ThemePicker";
export { default as Toggle } from "@shared/toggle/Toggle";
export { InlineInput } from "@shared/inline-input/InlineInput";
export { PluginIcon } from "@shared/plugin-icon/PluginIcon";
// 2026-10-05「文件打开方式与贡献点」案 4A：按插件浏览插件卡（卡头/受控展开/齿轮菜单/停用态；
//   行清单⛔不在共享包——那是设置插件本地的管理器词汇）。图标消费现成 PluginIcon，零新造图标链。
export { default as PluginCard } from "@shared/plugin-card/PluginCard";
// 2026-10-05「文件打开方式与贡献点」**纠正案 4.5**：打开方式选择器**转正归壳**——
//   本件消费的全是宿主声明（插件清单／文件关联声明／覆盖表），按判据 A 必须住共享层：
//   原住 file-tree ⇒ 卸载 file-tree 后设置页入口与编辑器按钮一并消失（本纠正案命门 C1.5）。
//   纯 props in / events out：数据由壳命令 `SHELL_COMMANDS.openWith` 组装后喂入（面板 ⛔ 不查 registry）。
export { default as OpenWithPicker } from "@shared/open-with-picker/OpenWithPicker";
export type { OpenWithHandler, OpenWithRequest, OpenWithPickerProps } from "@shared/open-with-picker/types";
// E6#69f：插件身份彩色图裁决（marketIcon ?? icon ?? 默认彩色块）——壳 windowLayout 标签 + 市场 list/detail 同消费（单一实现防漂移）
export { pickIdentityArt } from "@shared/plugin-icon/iconUtils";
export { DEFAULT_PLUGIN_IDENTITY_URI } from "@shared/plugin-icon/defaultIdentityArt";
export { default as OverlayPortal } from "@shared/overlay-portal/OverlayPortal";
// E6#15h：零件包扩到 UI 交互 hook（08-共享hook归位.md）——源码壳 src/components/shared/hooks/ 单一副本
export { useClickPreview } from "@shared/hooks/useClickPreview";
export { useClipboardKeys } from "@shared/hooks/useClipboardKeys";
export { useDebouncedInput } from "@shared/hooks/useDebouncedInput";
// E6#69g：文件图标解析服务上移共享——file-tree 树行/搜索行 + 壳 windowLayout 文件标签 同消费单一解析器（禁双源/禁跨插件 import）
export { FileIconResolver } from "@shared/file-icon/FileIconResolver";
export type { IconDescriptor } from "@shared/file-icon/FileIconResolver";
export { inferSliderStep } from "@shared/slider/sliderStep";
// E6#30c：URL 源身份（owner/repo、分支无关）——marketplace 加源弹窗 + settings 行内直添共用同一去重键（单一实现）
export { urlSourceKey } from "@shared/string-list-editor/urlSourceKey";

// ── 设置控件词表正典与共享化（2026-10-03）——判据 A/B/C：宿主声明的消费方控件与语义原子进共享层 ──
// 正典运行时值（哨兵/名单/类型守卫；类型在 @linkdesk/contracts，此处只管值）——任何声明者与渲染者都取得到
export { CONFIG_NONE_SENTINEL, MIX_FOLLOW_THEME_SENTINEL, SETTINGS_UI_HINTS, SETTINGS_RENDER_HINTS, isSettingsUiHint, SETTINGS_HIDDEN_HINTS, isSettingsHiddenHint } from "@shared/settings-hints/settingsHints";
// 生效值展示格式化（判定住宿主，格式化住这里——设置插件/第三方面板/命令面板同一个答案）
export { formatEffectiveValue } from "@shared/effective-badge/formatEffectiveValue";
// stringList 前置计算（locked/editable 切分）
export { splitStringList } from "@shared/string-list-editor/splitStringList";
// ReadOnlyText 升级带来的轮询能力（可独立导出复用）
export { useStatusPolling } from "@shared/readonly-text/useStatusPolling";
export { default as BackgroundImagePicker } from "@shared/image-picker/BackgroundImagePicker";
export { default as EffectiveBadge } from "@shared/effective-badge/EffectiveBadge";
export { default as SourceBadge } from "@shared/source-badge/SourceBadge";
export { SegmentPreviewText, SegmentPreviewSwatch } from "@shared/segment-preview/SegmentPreview";

export type { RunStatusCommand } from "@shared/readonly-text/useStatusPolling";
export type { BackgroundImagePickerProps } from "@shared/image-picker/BackgroundImagePicker";
export type { EffectiveBadgeProps } from "@shared/effective-badge/EffectiveBadge";
export type { SourceBadgeSource, SourceBadgeKind, SourceBadgeProps } from "@shared/source-badge/SourceBadge";
export type { InlineInputHandle } from "@shared/inline-input/InlineInput";
export type { ContextMenuProps } from "@shared/context-menu/ContextMenu";
export type { ManifestIconShape, ResolvedIcon } from "@shared/plugin-icon/iconUtils";

// ── 04「默认打开方式管理器共享化」（2026-10-06）——判据 A 收官件：管理器消费的全是宿主声明
//   （插件清单里的文件关联声明 × 系统覆盖表），按硬约束 28 必须住共享层。
//   交付 = 聚合纯函数 ＋ 呈现件套件 ＋ 类型（C1 定案）：
//     · 官方设置插件薄壳取数组装 —— 现布局＝默认皮，视觉零变化（C3 文案／C5 工具条两处拍板面除外）；
//     · 第三方渲染方两路任选：共享聚合 ＋ 共享件自组（零重推导）／只拿数据全画。
//   🔴 聚合与件套件**不认识任何命令 id**：齿轮菜单项由消费方注入（`*GearItems`）——数据入、事件出。
export { default as ManagerView } from "@shared/file-associations-manager/ManagerView";
export { default as CardRow } from "@shared/file-associations-manager/pieces/CardRow";
export { default as ContestedRow } from "@shared/file-associations-manager/pieces/ContestedRow";
// 聚合口径的**一处实现**（归一存储键 / 六态 / 聚格 / 失效判定）——⛔ 任何渲染方自推导 = 第二份实现（R4）
export { buildManagerModel, normalizeExt, normalizeExtList, overrideKeyOf, readOverride, extractDeclaredExtensions, extLabelHead, EXT_LABEL_MAX } from "@shared/file-associations-manager/deriveModel";
// C5 卡内工具条的行序／过滤口径（同性质：由聚合层一处实现，渲染方零重推导）——保序纪律见 orderRows 注释
export { orderRows, filterRows, hitKindOf } from "@shared/file-associations-manager/deriveModel";
export type { DeclaredExtension, DeclaredPlugin, HandlerSnapshot, RowState, RowSortMode, RowOption, ExtRowModel, CardModel, ContestedRowModel, ManagerModel, BuildInput } from "@shared/file-associations-manager/types";
export type { ManagerViewProps } from "@shared/file-associations-manager/ManagerView";
export type { CardRowProps } from "@shared/file-associations-manager/pieces/CardRow";
export type { ContestedRowProps } from "@shared/file-associations-manager/pieces/ContestedRow";
