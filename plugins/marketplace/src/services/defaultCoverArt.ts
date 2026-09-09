/**
 * 默认展示封面资产（E6#66）——纯 SVG 字符串 + data-URI 常量，零消费逻辑。
 *
 * 为什么独立成文件：硬编码颜色审计（scripts/check-css-hardcode.mjs E5.8#130）扫描 .ts/.tsx/.css
 * 的消费面颜色——本文件是**资产数据**（外部 <img> 渲染 data-URI SVG，CSS 变量在 img 内不可达，
 * 颜色只能字面量内嵌），与各插件 resources 目录下画好的 *.svg 封面资产同性质（.svg 不被扫描，
 * 本文件 TS 内嵌等价物按「资产」豁免，见审计 EXEMPT_FILES 白名单本文件条目）。裁决逻辑在
 * sibling display.ts（不含任何 hex，照常受审）。本文件再放任何 UI token 消费颜色即违规。
 */

/**
 * 640×640 自含色 SVG。A 家族延续：暗色工程台面 + 靛/青双环境光 + 极淡 44px 网格 + 居中的
 * 「工作窗口」（mac 三色灯）+ 通用意象 = 一行正在被装入的 dock（3 枚暗色位 + 1 枚亮靛加号位，
 * 青色 "+"）——不点任何具体插件功能（默认封面服务所有无配图第三方插件）。须在 96px 展示位与
 * 28px 行内位都有可辨剪影：画面中央亮 tile 强对比即小尺寸仍读得出。mono 字体仅 watermark。
 */
export const DEFAULT_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" fill="none">
  <!-- ============================================================
       LinkDesk 市场默认展示封面（E6#66）  [skill: ui-ux-pro-max · A 家族]
       理念：任何无配图插件的市场门面——不绑具体功能。一只正在被
       装入 dock 的通用「插件」：一行应用位 + 亮靛加号位 = 万物皆可装。
       ============================================================ -->
  <defs>
    <radialGradient id="dc_bg" cx="0.5" cy="0.4" r="0.95">
      <stop offset="0" stop-color="#1b2036"/>
      <stop offset="0.55" stop-color="#0f1222"/>
      <stop offset="1" stop-color="#070910"/>
    </radialGradient>
    <radialGradient id="dc_glowTL" cx="0.1" cy="0.06" r="0.75">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="dc_glowBR" cx="0.97" cy="0.98" r="0.8">
      <stop offset="0" stop-color="#7c8cff" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#7c8cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="dc_halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.32"/>
      <stop offset="0.6" stop-color="#7c8cff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#7c8cff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dc_win" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f1326"/>
      <stop offset="1" stop-color="#0a0d1b"/>
    </linearGradient>
    <linearGradient id="dc_tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#181d34"/>
      <stop offset="1" stop-color="#10152a"/>
    </linearGradient>
    <linearGradient id="dc_plusTile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7c8cff"/>
      <stop offset="1" stop-color="#5b6bff"/>
    </linearGradient>
    <filter id="dc_shadow" x="-30%" y="-40%" width="160%" height="200%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <pattern id="dc_grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M 44 0 H 0 V 44" stroke="#ffffff" stroke-opacity="0.03"/>
    </pattern>
  </defs>

  <!-- 底：暗色工程台面（靛→青双环境光 + 极淡网格） -->
  <rect width="640" height="640" fill="url(#dc_bg)"/>
  <rect width="640" height="640" fill="url(#dc_glowTL)"/>
  <rect width="640" height="640" fill="url(#dc_glowBR)"/>
  <rect width="640" height="640" fill="url(#dc_grid)"/>

  <!-- 工作窗口 -->
  <rect x="48" y="116" width="544" height="412" rx="20" fill="#000" opacity="0.5" filter="url(#dc_shadow)"/>
  <rect x="48" y="116" width="544" height="412" rx="20" fill="url(#dc_win)"/>
  <rect x="48" y="116" width="544" height="412" rx="20" stroke="#ffffff" stroke-opacity="0.12"/>

  <!-- 标题条：mac 三色灯 + 右上极淡码条 -->
  <circle cx="76" cy="142" r="6" fill="#ef6961"/>
  <circle cx="98" cy="142" r="6" fill="#eab34b"/>
  <circle cx="120" cy="142" r="6" fill="#45c98a"/>
  <rect x="516" y="136" width="34" height="4" rx="2" fill="#ffffff" fill-opacity="0.10"/>
  <rect x="548" y="144" width="18" height="4" rx="2" fill="#ffffff" fill-opacity="0.07"/>
  <line x1="48" y1="166" x2="592" y2="166" stroke="#ffffff" stroke-opacity="0.06"/>

  <!-- 亮 tile 身后的环境光晕 -->
  <circle cx="491" cy="343" r="130" fill="url(#dc_halo)"/>

  <!-- dock 行：3 枚暗色应用位 + 1 枚亮靛「正被装入」位 -->
  <g>
    <rect x="101" y="295" width="96" height="96" rx="18" fill="url(#dc_tile)" stroke="#ffffff" stroke-opacity="0.12"/>
    <rect x="215" y="295" width="96" height="96" rx="18" fill="url(#dc_tile)" stroke="#ffffff" stroke-opacity="0.12"/>
    <rect x="329" y="295" width="96" height="96" rx="18" fill="url(#dc_tile)" stroke="#ffffff" stroke-opacity="0.12"/>
    <rect x="443" y="295" width="96" height="96" rx="18" fill="url(#dc_plusTile)"/>
  </g>

  <!-- 暗色位内的极淡占位描边（暗示「可再装一枚」的通用位，非具体图标） -->
  <g stroke="#ffffff" stroke-opacity="0.10" fill="none">
    <rect x="138" y="332" width="22" height="22" rx="6"/>
    <rect x="252" y="332" width="22" height="22" rx="6"/>
    <rect x="366" y="332" width="22" height="22" rx="6"/>
  </g>

  <!-- 亮位上的青色 +（安装/加装意象） -->
  <g fill="#eef4ff">
    <rect x="474" y="339.5" width="34" height="7" rx="3.5"/>
    <rect x="487.5" y="326" width="7" height="34" rx="3.5"/>
  </g>

  <!-- 左下角 watermark（品牌锚，与封面家族同惯例） -->
  <text x="56" y="600" font-family="Consolas,'JetBrains Mono',monospace" font-size="14"
    letter-spacing="3" fill="#ffffff" fill-opacity="0.16">LINKDESK</text>
</svg>`;

/** 默认封面 data-URI（url descriptor 直载 img——零构建耦合：market 无独立 vite.config，走 SDK 默认；
 *  资源不落盘不打包，模块内自足，消费方可单测断言前缀） */
export const DEFAULT_COVER_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_COVER_SVG)}`;
