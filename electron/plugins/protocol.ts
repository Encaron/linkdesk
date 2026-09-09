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
import { envService } from '../services/env-service.js';
// E6#7（1.2-4）：多根解析——resolveLinkdeskPath 单根版保留（7 单测不动），protocol 走 multi
import { resolveLinkdeskPathMulti } from '../../src/core/utils/path/linkdeskProtocolPath.js';
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
  // E6#62f：linkdesk:// 收单 userData 根（承接 #20 取消残余——app 只读根在 prod 已空 per #17a：
  // 随包内置插件首启经账本种子/安装流物化进 userData，resources/plugins 不再被消费）。
  //   prod（app.isPackaged）：单一 userData 用户安装家——linkdesk://<id>/… 全部落 userData 目录。
  //   dev：双根有序——[<project>/plugins 源码, userData]（app 在前同名遮蔽；dev 内置插件经 /@fs
  //   resolvePath IPC 直读源码目录，本协议双根只服务 dev 侧 linkdesk:// 兜底 + i18n/资产同源读取）。
  const roots = app.isPackaged
    ? [envService.userPluginsDir()]
    : [envService.appPluginsDir(), envService.userPluginsDir()];

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

  diag(`PROTOCOL REGISTERED — roots=${roots.join(' | ')}  userData=${app.getPath('userData')}`);

  protocol.handle(APP_SCHEME, async (request) => {
    // OPTIONS preflight——CORS 预检直接返回 204
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // E6#70d：解析单段 Range（bytes=a-b / bytes=a- / bytes=-n）——媒体加载器（<video>）先以
    // `Range: bytes=0-` 探测并要求 206 + Content-Range + Content-Length，忽略则 MEDIA_ERR_SRC_NOT_SUPPORTED。
    // 返回 null = 无/不可满足 → 走 200 全长（图片/脚本等不带 Range 的加载不受影响）。
    function bytesRangeFrom(header: string | null, size: number): { start: number; end: number } | null {
      if (!header || size <= 0) return null;
      const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
      if (!m) return null;
      const [, s, e] = m;
      if (s === "") {
        // 后缀式 bytes=-N：末尾 N 字节
        if (e === "") return null;
        const suffix = Number(e);
        if (!Number.isFinite(suffix) || suffix <= 0) return null;
        const start = Math.max(size - suffix, 0);
        return { start, end: size - 1 };
      }
      const start = Number(s);
      const end = e === "" ? size - 1 : Number(e);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
      return { start, end: Math.min(end, size - 1) };
    }

    // URI: linkdesk://terminal/dist/bundle.js
    // 提取路径部分（去掉 "linkdesk://"）
    const urlPath = request.url.replace(new RegExp(`^${APP_SCHEME}://`), "");

    // 路径解析——E5.7#82：抽到 src/core/utils/path/linkdeskProtocolPath.ts 纯函数
    // （穿越检查 + 存在检查，vitest 实证）
    // 2026-09-05 塌平单根：根直接含插件目录（root-direct——subdirs 层已随 builtin/user 双目录废除）
    // E6#7：双根有序扫描（app 在前）——userData 包的贡献数据/资产 URL 恒 linkdesk://<id>/... 即可达
    const rootsForProtocol = roots.map((root) => ({ root }));
    const resolved = resolveLinkdeskPathMulti(rootsForProtocol, urlPath);
    if (!resolved.ok) {
      if (resolved.status === 403) {
        diag(`403 FORBIDDEN — ${urlPath}`);
        return new Response('Forbidden', { status: 403 });
      }
      diag(`404 NOT FOUND — ${urlPath}`);
      return new Response('Not Found', { status: 404, headers: corsHeaders() });
    }
    const fullPath = resolved.fullPath;

    // 通过 fs 读文件——避免 net.fetch file:// URL 在生产环境可能的权限问题。
    // E6#70d：Range-aware 服务——<video> 等媒体加载器带 Range 探测 → 只读请求区间回 206 + Content-Range
    //   （Chromium 媒体管线据此建 seekable 数据源，缺失则 MEDIA_ERR_SRC_NOT_SUPPORTED）；
    //   图片/脚本等不带 Range → 200 全长 + Content-Length/Accept-Ranges（行为不变，仅补齐头部）。
    try {
      const rangeHeader = request.headers.get('Range');
      const stat = fs.statSync(fullPath);
      const mimeType = getMimeType(fullPath);
      const headers = corsHeaders();
      headers.set('Content-Type', mimeType);
      headers.set('Accept-Ranges', 'bytes');
      const range = bytesRangeFrom(rangeHeader, stat.size);
      if (range) {
        const len = range.end - range.start + 1;
        const fd = fs.openSync(fullPath, 'r');
        let slice: Buffer;
        try {
          slice = Buffer.alloc(len);
          fs.readSync(fd, slice, 0, len, range.start);
        } finally {
          fs.closeSync(fd);
        }
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
        headers.set('Content-Length', String(len));
        diag(`206 RANGE — ${urlPath} bytes=${range.start}-${range.end}/${stat.size} → ${mimeType}`);
        // new Uint8Array(slice) 重新装箱成 ArrayBuffer-backed（Buffer<ArrayBufferLike> 不满足 BodyInit 类型）
        return new Response(new Uint8Array(slice), { status: 206, headers });
      }
      const buf = fs.readFileSync(fullPath);
      headers.set('Content-Length', String(stat.size));
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
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.woff': 'application/font-woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}
