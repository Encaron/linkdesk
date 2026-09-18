/**
 * @linkdesk/ui 公共入口（barrel）——E6#54b
 *
 * 单一源码防漂移（07 设计 §四·关键决策）：此处**不拷源码**，只经 @shared 别名
 * 引用壳 `src/components/shared/` 的原件；packages/linkdesk-ui 的 dist 是编译产物。
 * 改组件只改壳一处，壳与包同源。
 *
 * 导出面 = 插件实际消费集（E6#54c 锚点：4 内置插件 33 处 import 收敛于此）+ 必备类型。
 * 🔴 计数与 scripts/ui-surface.json 的 count 互为对账（E6#121 起机械校验，改导出面必同笔改这里）：
 *   - 22 组件（19 个 default 导出 + InlineInput / PluginIcon / FileIconResolver 具名）
 *   - 3 hooks（useClickPreview / useClipboardKeys / useDebouncedInput，E6#15h）
 *   - 4 helpers（pickIdentityArt / DEFAULT_PLUGIN_IDENTITY_URI / inferSliderStep / urlSourceKey）
 *   - 5 类型（IconDescriptor / InlineInputHandle / ContextMenuProps / ManifestIconShape / ResolvedIcon）
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
export { default as NumberInput } from "@shared/number-input/NumberInput";
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
export type { InlineInputHandle } from "@shared/inline-input/InlineInput";
export type { ContextMenuProps } from "@shared/context-menu/ContextMenu";
export type { ManifestIconShape, ResolvedIcon } from "@shared/plugin-icon/iconUtils";
