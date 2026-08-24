/**
 * linkdesk:// 自定义协议处理器
 *
 * E1 步 5：对标 VS Code 的 vscode-file:// 协议。
 * 归一化插件资源入口——今天映射到文件系统，明天可映射到网络/数据库/加密包。
 *
 * URI 格式：linkdesk://terminal/dist/bundle.js
 *         → 映射到 <pluginsDir>/terminal/dist/bundle.js
 *
 * 安全：路径穿越检查（.. 拒绝）+ 文件存在检查
 */

import { protocol, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { APP_SCHEME, APPEARANCE_SCHEME } from '../constants';
import { scanPluginSubdirs } from '../services/plugin-file-service.js';
import { resolveLinkdeskPath } from '../../src/core/utils/path/linkdeskProtocolPath.js';
import { APPEARANCE_SUBDIR } from '../../src/core/utils/path/userDataImagePath.js';

/** E5#114d 诊断：写入文件而非 console.log（生产环境 stdout 不可见） */
function diag(msg: string): void {
  try {
    const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] ${msg}\n`);
  } catch { /* 诊断日志写失败不致命 */ }
}

/**
 * 注册 linkdesk:// 协议。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerProtocol(): void {
  // 插件目录基准路径
  // dev 模式：<project>/plugins/
  // prod 模式：<resources>/plugins/（不打进 ASAR）
  const pluginsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'plugins')
    : path.join(app.getAppPath(), 'plugins');

  // 🔥 E5#114d：CORS 安全网——file:// 页面 fetch linkdesk:// 是跨域，
  // Origin 为 null，部分 Chromium 版本 Access-Control-Allow-Origin: * 不匹配 null。
  function corsHeaders(): Headers {
    const h = new Headers();
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    h.set('Access-Control-Allow-Headers', '*');
    h.set('Timing-Allow-Origin', '*');
    return h;
  }

  diag(`PROTOCOL REGISTERED — pluginsDir=${pluginsDir}  userData=${app.getPath('userData')}`);

  protocol.handle(APP_SCHEME, async (request) => {
    // OPTIONS preflight——CORS 预检直接返回 204
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // URI: linkdesk://terminal/dist/bundle.js
    // 提取路径部分（去掉 "linkdesk://"）
    const urlPath = request.url.replace(new RegExp(`^${APP_SCHEME}://`), "");

    // 路径解析——E5.7#82：抽到 src/core/utils/path/linkdeskProtocolPath.ts 纯函数
    // （穿越检查 + 子目录扫描 + 存在检查，vitest 实证 E6 打包格式的 chunk 命中）
    const resolved = resolveLinkdeskPath(pluginsDir, scanPluginSubdirs(pluginsDir), urlPath);
    if (!resolved.ok) {
      if (resolved.status === 403) {
        diag(`403 FORBIDDEN — ${urlPath}`);
        return new Response('Forbidden', { status: 403 });
      }
      diag(`404 NOT FOUND — ${urlPath}`);
      return new Response('Not Found', { status: 404, headers: corsHeaders() });
    }
    const fullPath = resolved.fullPath;

    // 通过 fs 直接读文件——避免 net.fetch file:// URL 在生产环境可能的权限问题
    try {
      const buf = fs.readFileSync(fullPath);
      const mimeType = getMimeType(fullPath);
      const headers = corsHeaders();
      headers.set('Content-Type', mimeType);
      diag(`200 OK — ${urlPath} → ${mimeType} (${buf.length} bytes)`);
      return new Response(buf, { status: 200, headers });
    } catch (err) {
      diag(`500 ERROR — ${urlPath}: ${String(err)}`);
      return new Response('Not Found', { status: 404, headers: corsHeaders() });
    }
  });

  // E5.8#64：受控外观图片协议——linkdesk-userdata://appearance/<编码文件名> → <userData>/appearance/<文件名>。
  // importImage 把用户选图拷贝进该目录，值存协议 URL；sandboxed pool 经此加载（file:// 绝对路径被拦截——bug 13）。
  // 安全：只读映射 + 白名单目录（必须解析在 userData/appearance 内，防穿越）。
  protocol.handle(APPEARANCE_SCHEME, async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    // URI: linkdesk-userdata://appearance/<编码文件名>——去 scheme + query，解 % 编码
    const raw = request.url.replace(new RegExp(`^${APPEARANCE_SCHEME}://`), "").split("?")[0];
    let filePath: string;
    try {
      filePath = decodeURIComponent(raw);
    } catch {
      return new Response('Bad Request', { status: 400, headers: corsHeaders() });
    }
    const userData = app.getPath('userData');
    const fullPath = path.resolve(userData, filePath);
    const base = path.join(userData, APPEARANCE_SUBDIR);
    // 白名单：只允许 userData/appearance/ 内的文件（path.resolve 已兜穿越）
    if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
      diag(`403 FORBIDDEN (appearance) — ${filePath}`);
      return new Response('Forbidden', { status: 403, headers: corsHeaders() });
    }
    try {
      const buf = fs.readFileSync(fullPath);
      const mimeType = getMimeType(fullPath);
      const headers = corsHeaders();
      headers.set('Content-Type', mimeType);
      return new Response(buf, { status: 200, headers });
    } catch {
      return new Response('Not Found', { status: 404, headers: corsHeaders() });
    }
  });
}

// E5#114d: 根据文件扩展名返回 MIME 类型——确保 .js/.json/.wasm 等文件正确加载
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.woff': 'application/font-woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}
