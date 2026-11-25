/**
 * tcp transport 单测（Block 3a）——真起一个本地回环服务，不起 Electron。
 *
 * 判据：连上 ⇒ isOpen true；服务端断开 ⇒ isOpen false（注册表据此判 stale）；close 幂等；
 * probe：在 ⇒ true、明确不可达 ⇒ false、超时 ⇒ null（⛔ 硬判 false）。
 */

import net from 'node:net';
import { describe, expect, it, afterEach } from 'vitest';
import { createTcpTransport } from './tcpTransport.js';

const servers: net.Server[] = [];
const sockets: net.Socket[] = [];

function startServer(): Promise<{ port: number; close: () => Promise<void>; dropClients: () => void }> {
  const server = net.createServer((socket) => {
    sockets.push(socket);
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
        dropClients: () => { for (const s of sockets.splice(0)) s.destroy(); },
      });
    });
  });
}

afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); })));
});

describe('tcp transport（Block 3a 第二个 transport）', () => {
  it('连上 ⇒ isOpen true；服务端断 ⇒ false；close 后仍 false（幂等）', async () => {
    const srv = await startServer();
    const t = createTcpTransport({ connectTimeoutMs: 1000 });
    const handle = await t.open(`127.0.0.1:${srv.port}`, {});
    expect(handle.isOpen()).toBe(true);

    srv.dropClients();
    // close 事件是异步派发——等一拍
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.isOpen()).toBe(false);

    await handle.close();
    expect(handle.isOpen()).toBe(false);
    await srv.close();
  });

  it('连接失败 ⇒ open 抛错（注册表据此保证「先验证后提交」）', async () => {
    const t = createTcpTransport({ connectTimeoutMs: 500 });
    await expect(t.open('127.0.0.1:1', {})).rejects.toThrow();
  });

  it('probe：在 ⇒ true；不可达 ⇒ false；错误键 ⇒ null（⛔ 当 false）', async () => {
    const srv = await startServer();
    const t = createTcpTransport({ probeTimeoutMs: 500 });
    expect(await t.probe(`127.0.0.1:${srv.port}`)).toBe(true);
    expect(await t.probe('127.0.0.1:1')).toBe(false);
    expect(await t.probe('bad-key')).toBeNull();
    await srv.close();
  });

  it('deviceKey 非法 ⇒ open 抛明确错误', async () => {
    const t = createTcpTransport();
    await expect(t.open('nohost', {})).rejects.toThrow(/host:port/);
    await expect(t.open('127.0.0.1:notaport', {})).rejects.toThrow(/端口非法/);
  });
});
