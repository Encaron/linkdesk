/**
 * `@linkdesk/ui` 导出面账本——**生成物，勿手改**（「插件最低壳版本门禁」G4 · 壳运行期投影）。
 *
 * 生成器：`scripts/gen-ui-surface.mjs`；数据唯一源 = `scripts/ui-surface.json`（同笔第四份投影：
 * 账本 json ×2 ＋ 作者手册 since 表 ＋ 本文件，`--check` 对账抓漂移）。
 * 壳不依赖 `@linkdesk/plugin-sdk` ⇒ 运行期读不到随包那份 ⇒ 照 `host-css.generated.ts` 同族先例
 * 生成编译内的一份。⚠️ 字节稳定（无 generatedAt 之类活戳）；改了账本跑 `npm run ui-surface:regen`
 * 同笔重写四份。
 *
 * 消费方：`src/core/compat/compatibility.ts`（G4 兼容读数腿）——已装产物对 `@linkdesk/ui` 的
 * 静态具名导入名在此查 `since`（四栏一个面），取 max ＝ 实际地板。
 */
export interface UiSurfaceLedger {
  /** 打戳基准（账本信息栏，非判据输入） */
  shellVersion: string;
  components: Readonly<Record<string, { readonly since: string }>>;
  hooks: Readonly<Record<string, { readonly since: string }>>;
  helpers: Readonly<Record<string, { readonly since: string }>>;
  types: Readonly<Record<string, { readonly since: string }>>;
}

export const UI_SURFACE_LEDGER: UiSurfaceLedger = {
  shellVersion: "0.2.52",
  components: {
    "BackgroundImagePicker": { since: "0.2.40" },
    "Badge": { since: "0.2.13" },
    "Button": { since: "0.2.13" },
    "ColorPicker": { since: "0.2.13" },
    "Combobox": { since: "0.2.13" },
    "ContextMenu": { since: "0.2.13" },
    "DynamicSelect": { since: "0.2.13" },
    "EffectiveBadge": { since: "0.2.40" },
    "FileIconResolver": { since: "0.2.13" },
    "FilePathInput": { since: "0.2.13" },
    "FontFamilySelect": { since: "0.2.13" },
    "FormRow": { since: "0.2.13" },
    "HintCard": { since: "0.2.13" },
    "HintTip": { since: "0.2.20" },
    "InlineInput": { since: "0.2.13" },
    "MarkdownView": { since: "0.2.13" },
    "NumberInput": { since: "0.2.13" },
    "OpenWithPicker": { since: "0.2.48" },
    "OverlayPortal": { since: "0.2.13" },
    "PluginCard": { since: "0.2.48" },
    "PluginIcon": { since: "0.2.13" },
    "ReadOnlyText": { since: "0.2.22" },
    "SectionSubtitle": { since: "0.2.22" },
    "SegmentPreviewSwatch": { since: "0.2.40" },
    "SegmentPreviewText": { since: "0.2.40" },
    "SegmentedRadio": { since: "0.2.13" },
    "SelectBox": { since: "0.2.13" },
    "Slider": { since: "0.2.13" },
    "SourceBadge": { since: "0.2.40" },
    "StringListEditor": { since: "0.2.13" },
    "ThemePicker": { since: "0.2.13" },
    "Toggle": { since: "0.2.13" },
  },
  hooks: {
    "useClickPreview": { since: "0.2.13" },
    "useClipboardKeys": { since: "0.2.13" },
    "useDebouncedInput": { since: "0.2.13" },
    "useStatusPolling": { since: "0.2.40" },
  },
  helpers: {
    "CONFIG_NONE_SENTINEL": { since: "0.2.40" },
    "DEFAULT_PLUGIN_IDENTITY_URI": { since: "0.2.13" },
    "MIX_FOLLOW_THEME_SENTINEL": { since: "0.2.40" },
    "SETTINGS_RENDER_HINTS": { since: "0.2.40" },
    "SETTINGS_UI_HINTS": { since: "0.2.40" },
    "formatEffectiveValue": { since: "0.2.40" },
    "inferSliderStep": { since: "0.2.13" },
    "isSettingsUiHint": { since: "0.2.40" },
    "pickIdentityArt": { since: "0.2.13" },
    "splitStringList": { since: "0.2.40" },
    "urlSourceKey": { since: "0.2.13" },
  },
  types: {
    "BackgroundImagePickerProps": { since: "0.2.40" },
    "ContextMenuProps": { since: "0.2.13" },
    "EffectiveBadgeProps": { since: "0.2.40" },
    "HintTipProps": { since: "0.2.20" },
    "IconDescriptor": { since: "0.2.13" },
    "InlineInputHandle": { since: "0.2.13" },
    "ManifestIconShape": { since: "0.2.13" },
    "OpenWithHandler": { since: "0.2.48" },
    "OpenWithPickerProps": { since: "0.2.48" },
    "OpenWithRequest": { since: "0.2.48" },
    "ResolvedIcon": { since: "0.2.13" },
    "RunStatusCommand": { since: "0.2.40" },
    "SourceBadgeKind": { since: "0.2.40" },
    "SourceBadgeProps": { since: "0.2.40" },
    "SourceBadgeSource": { since: "0.2.40" },
  },
};
