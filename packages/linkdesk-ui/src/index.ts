/**
 * @linkdesk/ui 公共入口（barrel）——E6#54b
 *
 * 单一源码防漂移（07 设计 §四·关键决策）：此处**不拷源码**，只经 @shared 别名
 * 引用壳 `src/components/shared/` 的原件；packages/linkdesk-ui 的 dist 是编译产物。
 * 改组件只改壳一处，壳与包同源。
 *
 * 导出面 = 插件实际消费集（E6#54c 锚点：4 内置插件 33 处 import 收敛于此）+ 必备类型：
 *   - 16 直接消费组件（07 §三 实盘清单）
 *   - inferSliderStep（settings renderControl 直引）
 *   - InlineInputHandle / ContextMenuProps / ManifestIconShape / ResolvedIcon
 *
 * 🔴 公共导出面的唯一真相源——scripts/build.mjs 据此生成 dist/index.d.ts。
 */
export { default as Badge } from "@shared/badge/Badge";
export { default as Button } from "@shared/button/Button";
export { default as ColorPicker } from "@shared/color-picker/ColorPicker";
export { default as Combobox } from "@shared/combobox/Combobox";
export { default as ContextMenu } from "@shared/context-menu/ContextMenu";
export { default as DynamicSelect } from "@shared/select-box/DynamicSelect";
export { default as FilePathInput } from "@shared/file-path-input/FilePathInput";
export { default as FontFamilySelect } from "@shared/font-family-select/FontFamilySelect";
export { default as FormRow } from "@shared/form-row/FormRow";
export { default as NumberInput } from "@shared/number-input/NumberInput";
export { default as SegmentedRadio } from "@shared/segmented-radio/SegmentedRadio";
export { default as SelectBox } from "@shared/select-box/SelectBox";
export { default as Slider } from "@shared/slider/Slider";
export { default as StringListEditor } from "@shared/string-list-editor/StringListEditor";
export { default as ThemePicker } from "@shared/theme-picker/ThemePicker";
export { default as Toggle } from "@shared/toggle/Toggle";
export { InlineInput } from "@shared/inline-input/InlineInput";
export { PluginIcon } from "@shared/plugin-icon/PluginIcon";
export { default as OverlayPortal } from "@shared/overlay-portal/OverlayPortal";
// E6#15h：零件包扩到 UI 交互 hook（08-共享hook归位.md）——源码壳 src/components/shared/hooks/ 单一副本
export { useClickPreview } from "@shared/hooks/useClickPreview";
export { useClipboardKeys } from "@shared/hooks/useClipboardKeys";
export { useDebouncedInput } from "@shared/hooks/useDebouncedInput";
export { inferSliderStep } from "@shared/slider/sliderStep";
// E6#30c：URL 源身份（owner/repo、分支无关）——marketplace 加源弹窗 + settings 行内直添共用同一去重键（单一实现）
export { urlSourceKey } from "@shared/string-list-editor/urlSourceKey";
export type { InlineInputHandle } from "@shared/inline-input/InlineInput";
export type { ContextMenuProps } from "@shared/context-menu/ContextMenu";
export type { ManifestIconShape, ResolvedIcon } from "@shared/plugin-icon/iconUtils";
