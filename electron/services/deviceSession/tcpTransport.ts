/**
 * `tcp` transport（Block 3a 的第二个 transport）——验收用「第二个作者」样本的宿主半边。
 *
 * 只做生命周期：连上/断开/探在不在；不定义帧、不发协议数据（协议归插件——见 03 §8.7 非目标）。
 * deviceKey 形式 `host:port`（例如 `127.0.0.1:9100`）。
 */

import * as net from 'node:net';
import type { DeviceHandle, DeviceTransport } from './transport.js';

function splitEndpoint(deviceKey: string): { host: string; port: number } {
  const idx = deviceKey.lastIndexOf(':');
  if (idx <= 0) throw new Error(`tcp deviceKey 必须是 host:port（收到 "${deviceKey}"）`);
  const host = deviceKey.slice(0, idx);
  const port = Number(deviceKey.slice(idx + 1));
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`tcp deviceKey 的端口非法（收到 "${deviceKey}"）`);
  }
  return { host, port };
}

export interface TcpTransportOptions {
  /** 建连超时（默认 3000ms） */
  connectTimeoutMs?: number;
  /** 探测超时（默认 500ms） */
  probeTimeoutMs?: number;
}

export function createTcpTransport(opts: TcpTransportOptions = {}): DeviceTransport {
  const connectTimeoutMs = opts.connectTimeoutMs ?? 3000;
  const probeTimeoutMs = opts.probeTimeoutMs ?? 500;

  return {
    id: 'tcp',

    async open(deviceKey: string): Promise<DeviceHandle> {
      const { host, port } = splitEndpoint(deviceKey);
      const socket = new net.Socket();
      let open = false;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error(`连接 ${deviceKey} 超时（${connectTimeoutMs}ms）`));
        }, connectTimeoutMs);
        socket.once('error', (e) => {
          clearTimeout(timer);
          reject(new Error(`连接 ${deviceKey} 失败：${e.message}`));
        });
        socket.once('connect', () => {
          clearTimeout(timer);
          open = true;
          resolve();
        });
        socket.connect(port, host);
      });
      // 被动丢失 = 权威态变假（注册表据此判 stale；⛔ 这里不自动重连）
      socket.on('close', () => { open = false; });
      socket.on('error', () => { open = false; });
      return {
        isOpen: () => open && !socket.destroyed,
        close: async () => {
          open = false;
          socket.destroy();
        },
      };
    },

    async probe(deviceKey: string): Promise<boolean | null> {
      let host: string;
      let port: number;
      try {
        const ep = splitEndpoint(deviceKey);
        host = ep.host;
        port = ep.port;
      } catch {
        return null; // 键本身不合法 ⇒ 探不了，⛔ 当 false
      }
      return await new Promise<boolean | null>((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const done = (v: boolean | null) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve(v);
        };
        const timer = setTimeout(() => done(null), probeTimeoutMs);
        socket.once('connect', () => {
          clearTimeout(timer);
          done(true);
        });
        socket.once('error', () => {
          clearTimeout(timer);
          done(false); // 明确拒绝/不可达 ⇒ 不在
        });
        socket.connect(port, host);
      });
    },
  };
}
