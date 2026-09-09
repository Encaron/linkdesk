/**
 * 默认插件身份彩色块「插头的块」（E6#69a）——统一默认资产，单份共享。
 *
 * 消费方：壳 windowLayout（视图标签无图标兜底）+ 市场 list/detail（无图插件兜底）同一 URI——
 * #69f 归一化「禁各写一份」；顶替历史 📄 emoji 兜底 + #66 A 家族 640 场景默认（defaultCoverArt 删）。
 *
 * 本文件 = 纯 SVG 资产数据（同 E6#66 defaultCoverArt 先例）：外部 <img> 渲染 data-URI，CSS 变量在
 * img 内不可达 → 颜色只能字面量内嵌；与各插件 resources 目录内 svg 资产同性质（.svg 不被 css 硬编码
 * 审计扫描，TS 内嵌等价物文档化豁免，见 scripts/check-css-hardcode.mjs EXEMPT_FILES）。零消费逻辑。
 *
 * 资产：48×48 玻璃磁贴语法（同批其他 Type-2）——中性石板灰渐变块 + 白描边电源插头（两脚）。
 * 色彩故意避开已占色系（serial 青绿 / file 青蓝 / settings 板岩 / aurora 紫 / terminal 绿）→ 青灰铜；
 * 插头 = 「插件 = 接入插孔的通用部件」意象（2026-09-09 样张 §⑦ 已点头）。
 */
export const DEFAULT_PLUGIN_IDENTITY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="defBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3F4A5E"/>
      <stop offset="1" stop-color="#1B2434"/>
    </linearGradient>
    <linearGradient id="defGlass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="40" height="40" rx="10" fill="url(#defBg)"/>
  <rect x="4" y="4" width="40" height="40" rx="10" fill="url(#defGlass)"/>
  <rect x="4" y="4" width="40" height="40" rx="10" fill="none" stroke="#E2E8F0" stroke-opacity="0.22" stroke-width="1"/>
  <circle cx="24" cy="13.5" r="4.6" fill="none" stroke="#F1F5F9" stroke-width="2.9"/>
  <path d="M24 18.6 L24 27" fill="none" stroke="#F1F5F9" stroke-width="2.9" stroke-linecap="round"/>
  <path d="M17 30 L23 30" fill="none" stroke="#F1F5F9" stroke-width="2.9" stroke-linecap="round"/>
  <path d="M25 30 L31 30" fill="none" stroke="#F1F5F9" stroke-width="2.9" stroke-linecap="round"/>
</svg>`;

/** data-URI 形态——消费方直接作 <img src> / PluginIcon src */
export const DEFAULT_PLUGIN_IDENTITY_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_PLUGIN_IDENTITY_SVG)}`;
