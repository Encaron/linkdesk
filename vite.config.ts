import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { DEV_SERVER_PORT } from "./electron/constants"; // E5.7#45.5：shared/ 并入 electron/constants.ts

const __dirname = dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

/**
 * E6#7（1.2-4）：dev 用户安装家——Electron userData = <appData>/linkdesk（package.json name，
 * dev 未 setName/productName）。Vite 允许经 /@fs 服务该目录下的解压包（SDK bundle 物理在项目根外）。
 * Windows appData = %APPDATA%；非 Windows（无 APPDATA）不匹配任何 importer → 插件零效果。
 */
const userPluginsHome = process.env.APPDATA ? join(process.env.APPDATA, "linkdesk", "plugins") : "";

/**
 * E6#7（1.2-4）：dev-only 解析兜底——SDK 预构建的 index.bundle.js 把 react 系 externalize 成裸 import；
 * 该 bundle 物理在 {userData}/plugins（项目根外），node resolution 从它向上走不到项目 node_modules，
 * 裸 import 必然 "Failed to resolve import react"。此处**只对 userData 插件 importer** 把裸 specifier
 * 指回项目根 node_modules 的真实文件（react/react-dom 是 CJS——Vite 按需 optimize 自动 ESM 化，
 * 与壳自身 import 到同一物理实例 = 零双实例风险）。范围锁死该目录：壳/build 的 import 永不命中 → 零回归。
 * prod（file:// 无 Vite）走 #15 打包轮的 import-map，不经此路径。
 */
function resolveUserDataBundles(): Plugin {
  const require = createRequire(join(__dirname, "package.json"));
  const external = new Map([
    ["react", null],
    ["react-dom", null],
    ["react-dom/client", null],
    ["react/jsx-runtime", null],
    ["react/jsx-dev-runtime", null],
    ["react-i18next", null],
    ["i18next", null],
    // E6#123（L9）：ui 入 DEFAULT_EXTERNAL 后插件 bundle 是裸 import——dev 同款解析到 workspace 包
    //（dist/index.js 自带 `import "./index.css"` ⇒ dev 的组件 css 也随此解析进图，见下方 pool css 兜底）。
    ["@linkdesk/ui", null],
  ]);
  return {
    name: "linkdesk-userdata-bundle-externals",
    resolveId(source, importer) {
      if (!userPluginsHome || !importer?.includes(userPluginsHome)) return null;
      if (!external.has(source)) return null;
      // createRequire.resolve 尊重包的 exports map（react/jsx-runtime 等 subpath）
      return require.resolve(source);
    },
  };
}

/**
 * E6#123（L9 集中供给）dev 兜底：组件 css 由壳池 vendor link 供给（打包轨道）——dev 轨道 vite dev
 * 服务 pool.html 时没有 vendor 注入，给 **pool.html**（⛔ 不碰壳窗口 index.html）注一条指向
 * workspace `@linkdesk/ui/dist/index.css` 的 link，保证 dev 预览不丢组件样式。
 * 仅 dev 轨道（apply: "serve"）；打包轨道由 build-pool-vendor.mjs 注入的 vendor link 承担。
 */
function injectPoolUiCss(): Plugin {
  const require = createRequire(join(__dirname, "package.json"));
  const cssAbs = resolve(require.resolve("@linkdesk/ui"), "..", "index.css").replace(/\\/g, "/");
  return {
    name: "linkdesk-dev-pool-ui-css",
    apply: "serve",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html, ctx) {
        if (!ctx.filename.replace(/\\/g, "/").endsWith("/pool.html")) return html;
        return html.replace("</head>", `    <link rel="stylesheet" href="/@fs/${cssAbs}">\n  </head>`);
      },
    },
  };
}

export default defineConfig(async ({ command }) => {
  // E5.7#31.7：池开发预览入口——仅 vite dev（浏览器 mock 模式，Codex UI 设计通道）。
  // 生产构建（npm run build）零污染：preview.html + mock fixture 不进 dist。
  const devEntries = command === "serve"
    ? { preview: resolve(__dirname, "preview.html") }
    : {};

  return {
    plugins: [react(), resolveUserDataBundles(), injectPoolUiCss()],
    // Electron loadFile 需要相对路径——绝对路径 /assets/ 会解析到文件系统根
    base: './',
    clearScreen: false,
    server: {
      port: DEV_SERVER_PORT,
      strictPort: true,
      // E6#7（1.2-4）：默认只放行 workspace 根——userData 解压包在项目根外，需显式 allow
      // 才能经 /@fs/ 服务 SDK 预构建 bundle（dev 验证用；prod 走 linkdesk:// 不依赖 fs.allow）
      fs: {
        allow: [__dirname, ...(userPluginsHome ? [userPluginsHome] : [])],
      },
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 🔥 E5.8#116 根因修复（2026-08-27）：Tauri 时代遗留的 plugins/ 忽略已删除——
        //   当时 Rust 命令操作插件文件，忽略避免全量 reload；Electron 时代（src-tauri/ 已删）
        //   插件源码 = 壳源码同级 dev 资产，改 CSS/TS 必须被 Vite watcher 检测后失效模块图缓存。
        //   实证：忽略 plugins/ 时模块图缓存永不失效，改 SettingsView.css 经 Page.reload 不生效
        //   （同一物理文件 /@fs/E: 大写缓存旧版、/@fs/e: 小写新 URL 读盘新版 = 双 key 分歧）。
        //   移除后插件热更与壳 src/ 一致；src-tauri/ 目录已不存在，一并清空。
        ignored: [],
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          // E6#15d 消费切换相 G2：池窗走独立构建 pass（vite.pool.config.ts，external react 系 + import-map）。
          // 不在主 build 内 —— 一个 rollup pass 无法只对池 external（壳与池共享组件图）。
          // dev 无碍：pool.html 由 vite dev server 按需服务，不是 build input。
          // E6#15f：插件 entries 不再作为 rollup input——壳 build 不再产出 dist/plugins/*.js 死产物
          //   （E5.7 起 loader 走 import.meta.glob 异步 chunk，消费切换相 #15d 后 prod 全走 userData 物化
          //   dist + linkdesk://，壳 dist/plugins 无消费者）；output 无插件命名 chunk 特例，恢复默认 hashed。
          ...devEntries,
        },
      },
    },
    worker: {
      format: "es",
    },
    resolve: {
      alias: {
        // 插件统一用 @src/ 引用 src/，替代手工数 ../ 的相对路径
        "@src": resolve(__dirname, "src"),
        "@": resolve(__dirname, "src"),
      },
    },
  };
});
