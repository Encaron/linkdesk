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

import { protocol, net, app } from 'electron';
import * as path from 'path';
import { existsSync } from 'fs';

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

  protocol.handle('linkdesk', async (request) => {
    // URI: linkdesk://terminal/dist/bundle.js
    // 提取路径部分（去掉 "linkdesk://"）
    const urlPath = request.url.replace(/^linkdesk:\/\//, '');

    // 安全检查：拒绝路径穿越（../ 或 ..\）
    if (urlPath.includes('..')) {
      return new Response('Forbidden', { status: 403 });
    }

    // 转换为本地文件路径
    const fullPath = path.join(pluginsDir, urlPath);

    // 文件不存在 → 404
    if (!existsSync(fullPath)) {
      return new Response('Not Found', { status: 404 });
    }

    // 通过 Electron net.fetch 返回文件内容，附加 CORS 头以支持 dev 模式跨域 fetch
    const fileResponse = await net.fetch(`file:///${fullPath.replace(/\\/g, '/')}`);
    const body = await fileResponse.arrayBuffer();
    const headers = new Headers(fileResponse.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers,
    });
  });
}
