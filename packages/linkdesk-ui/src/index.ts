/**
 * @linkdesk/ui 公共入口（barrel）——E6#54b
 *
 * 单一源码防漂移（07 设计 §四·关键决策）：此处**不拷源码**，只经 @shared 别名
 * 引用壳 `src/components/shared/` 的原件；packages/linkdesk-ui 的 dist 是编译产物。
 * 改组件只改壳一处，壳与包同源。
 *
 * 导出面 = 插件实际消费集（E6#54c 锚点：4 内置插件 33 处 import 收敛于此）+ 必备类型。
 * 🔴 计数与 scripts/ui-surface.json 的 count 互为对账（E6#121 起机械校验，改导出面必同笔改这里）：
 *   - 30 组件（25 个 default 导出 + InlineInput / PluginIcon / FileIconResolver / SegmentPreviewText / SegmentPreviewSwatch 具名）
 *   - 4 hooks（useClickPreview / useClipboardKeys / useDebouncedInput / useStatusPolling）
 *   - 11 helpers（pickIdentityArt / DEFAULT_PLUGIN_IDENTITY_URI / inferSliderStep / urlSourceKey /
 *       CONFIG_NONE_SENTINEL / MIX_FOLLOW_THEME_SENTINEL / SETTINGS_UI_HINTS / SETTINGS_RENDER_HINTS /
 *       isSettingsUiHint / formatEffectiveValue / splitStringList）
 *   - 12 类型（IconDescriptor / InlineInputHandle / ContextMenuProps / ManifestIconShape / ResolvedIcon / HintTipProps /
 *       RunStatusCommand / BackgroundImagePickerProps / EffectiveBadgeProps / SourceBadgeSource / SourceBadgeKind / SourceBadgeProps）
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
export { CONFIG_NONE_SENTINEL, MIX_FOLLOW_THEME_SENTINEL, SETTINGS_UI_HINTS, SETTINGS_RENDER_HINTS, isSettingsUiHint } from "@shared/settings-hints/settingsHints";
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
