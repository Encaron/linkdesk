/**
 * `linkdesk-plugin-sdk dev`——E6#23.5/#24：SDK 自带独立宿主页，在作者自己的 Vite dev server 下
 * 加载正在开发的插件源码 + HMR。纯浏览器预览，无 Electron、无 IPC。
 *
 * 形态（第 2.2 轮审视拍板，见 02-本地预览环境.md §九/§十；本模块 = 实装决策记录）：
 *   - **宿主 = SDK 自带 dev-host/**（index.html + dev-main.tsx + mock.ts），随包 raw 资产，
 *     vite dev 现役转换 tsx——不预编译（precompile 到 js 会杀掉 HMR 所需的源码模块态）。
 *   - **root = dev-host 目录**；插件入口经 `resolve.alias` 把虚拟 id `__linkdesk_dev_entry__`
 *     映射到插件根 plugin.json 声明的 entry **绝对路径** → 入口成为模块图常规成员 + 静态 import
 *     → HMR 走 vite 标准全链。比「浏览器端运行时 import('/@fs/…')」更稳——计算型动态 import 不在
 *     静态图，HMR 会退化成整页刷新（`/@fs/` 语义由 alias 到绝对路径达成：vite 对 alias 解析出的
 *     绝对路径文件同样按需转换 + 注入 HMR，等效于 /@fs/ 加载）。
 *   - **fs.allow 放行插件根**——root 在 node_modules 内（SDK 随装），vite 默认 allow 不含作者工程。
 *   - **react/react-dom/react-i18next/i18next = SDK dependencies**（非 devDep）：dev 宿主渲染插件
 *     需要它们；构建面仍 external 不打进 .linkdesk-plugin。作者零配置（npm i SDK 即达）。
 *   - **mock**：#23.5c 锚点 = dev-host/mock.ts 的 throw-on-call Proxy（未 mock 的 API 调用抛
 *     「仅生产可用」而非静默 undefined，防 dev 正常/装机炸的反向落差）。真方法默认值表归 E6#27
 *     （generate-contract 第二输出目标，2.3 轮）——届时替换 mock.ts 注入体，锚点（injectDevMockApi）
 *     不变。
 *
 * 端口 1421（对齐设计稿，避开壳 dev 1420）。`LINKDESK_DEV_PORT` 环境变量可覆盖（CI/占用冲突逃生门）。
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { collectI18nDecls, derivePluginId, readPluginManifest } from "./validate.js";

const DEV_HOST_DIR = join(dirname(fileURLToPath(import.meta.url)), "../dev-host");

export const DEV_PORT = Number(process.env.LINKDESK_DEV_PORT ?? 1421);

/** dev 宿主目录（SDK 包根 dev-host/，与 dist 平级）——供 bin/测试定位 */
export function devHostDir(): string {
  return DEV_HOST_DIR;
}

interface DevContext {
  pluginId: string;
  entryAbs: string;
  /** i18n resources：{ 语言码: { translation: {...} } }——由 plugin.json contributes.i18n 声明的各语言 JSON 现读 */
  resources: Record<string, { translation: Record<string, unknown> }>;
}

/** 从插件根读 plugin.json → 定位 dev 目标（entry 必须存在——dev 宿主当前支持「entry 视图插件」形态） */
function loadPluginContext(root: string): DevContext {
  const manifestPath = join(root, "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`当前目录不是插件工程——找不到 ${manifestPath}。请 cd 进插件项目根再跑 linkdesk-plugin-sdk dev`);
  }
  const manifest = readPluginManifest(manifestPath) as Record<string, unknown> | null | undefined;
  const pluginId = derivePluginId(manifest, basename(root));
  const entry = manifest?.entry;
  if (typeof entry !== "string" || !entry.trim()) {
    throw new Error(
      `「${pluginId}」plugin.json 缺 entry——dev 宿主当前支持带 entry 的视图插件（脚手架 tab 形态：` +
        `src/index.tsx default 导出组件）。纯 contributes 分区视图插件的壳侧 dev 见 E6#28（02-本地预览环境.md §10.3）`,
    );
  }
  const entryAbs = resolve(root, entry);
  if (!existsSync(entryAbs)) {
    throw new Error(`「${pluginId}」entry "${entry}" 不存在：${entryAbs}`);
  }
  // i18n resources——与 validate 同一读取面（collectI18nDecls），语言码 = 文件名去 .json
  const resources: Record<string, { translation: Record<string, unknown> }> = {};
  for (const decl of collectI18nDecls(manifest)) {
    const p = resolve(root, decl.rel);
    if (!existsSync(p)) continue;
    const lang = basename(decl.rel, ".json");
    try {
      resources[lang] = { translation: JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown> };
    } catch {
      // 单语言文件坏 → 跳过该语言（宿主仍起，validate 会报真错）——dev 不阻断
    }
  }
  return { pluginId, entryAbs, resources };
}

/** 平台开浏览器（Vite 默认依赖 open 包，SDK 不想为此加 dep——3 行 spawn 足矣） */
function openBrowser(url: string): void {
  let cmd: string;
  let args: string[];
  if (process.platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    cmd = "open";
    args = [url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // 开不了（无 GUI/沙箱）→ 用户手抄 URL，不阻断
  }
}

/**
 * 起 dev 宿主并挂起进程（Ctrl+C → server.close）。
 * 设计要点：define 把 i18n resources + pluginId 作为「字面量表达式」注入宿主——
 * 宿主 import 一个对象不是 URL，避免每插件一条虚拟模块路径维护。
 */
export async function runPluginDev(root: string): Promise<void> {
  const { pluginId, entryAbs, resources } = loadPluginContext(root);

  const hostHtml = join(DEV_HOST_DIR, "index.html");
  if (!existsSync(hostHtml)) {
    throw new Error(`dev 宿主缺失：${hostHtml}——SDK 包损坏或安装不全？`);
  }

  const server = await createServer({
    root: DEV_HOST_DIR,
    server: {
      port: DEV_PORT,
      strictPort: true,
      fs: { allow: [DEV_HOST_DIR, root] },
    },
    resolve: {
      alias: [{ find: /^__linkdesk_dev_entry__$/, replacement: entryAbs }],
    },
    define: {
      __LINKDESK_DEV_I18N__: JSON.stringify(resources),
      __LINKDESK_DEV_PLUGIN_ID__: JSON.stringify(pluginId),
    },
    plugins: [react()],
  });

  await server.listen();
  const url = `http://localhost:${DEV_PORT}/?pluginId=${encodeURIComponent(pluginId)}`;

  // 宿主已起：URL 打印（Git Bash / CI 也看得到）+ 尽力开浏览器（开不了不阻断）
  console.log("");
  console.log(`  LinkDesk dev 宿主 → ${url}`);
  console.log(`  预览插件「${pluginId}」——改 src/ 下源码即 HMR；Ctrl+C 停止`);
  console.log("");
  openBrowser(url);

  // 挂起直到 Ctrl+C——main() 的 process.exit 在 runPluginDev resolve 后才跑
  await new Promise<void>((stop) => {
    const shutdown = (): void => {
      server.close().then(stop).catch(stop);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
