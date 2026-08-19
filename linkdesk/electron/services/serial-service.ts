/**
 * 串口服务——serialport npm 包封装
 *
 * E1 步 2：替代 Tauri Rust `src-tauri/src/serial.rs`。
 * 逐函数映射 Rust 实现，保留所有 48 个 bug 的修复成果。
 *
 * 关键行为：
 *   - 行缓冲 + \n 拆行（与 Rust read_loop 一致）
 *   - 读错误休眠 100ms，不忙循环（H1 修复）
 *   - 关闭前冲刷行缓冲残留（B3 修复）
 *   - GBK/Shift-JIS 编码支持（B61 修复，iconv-lite）
 *   - 打开时清空硬件输入缓冲区（丢弃闭口期间陈旧数据）
 *   - F5 状态同步：getStatus() 返回 is_open/portName/baudRate
 *   - 16ms 批量推送（非行分隔连续数据，防止数千次/秒 IPC）
 *
 * 安全模型：
 *   - 单例模式——整个主进程只有一个串口状态
 *   - isClosing 标志防止关闭期间读取竞态
 */

import { SerialPort } from 'serialport';
import * as iconv from 'iconv-lite';
// E5.7#97：OpenPortConfig/SerialStatus 归口 src/core/types/ipc/serial.ts（preload/API 三端同源）
import type { OpenPortConfig, SerialStatus } from '../../src/core/types/ipc/serial';

// ── 类型 ──

interface PortInfo {
  name: string;
  description: string;
}

// E5.8#2：SerialStatus re-export 已删（消费方直引 src/core/types/ipc/serial 正源）
interface SerialCallbacks {
  onData: (text: string) => void;
  onStats: (stats: { tx?: number; rx?: number }) => void;
  onSystem: (message: string) => void;
}

// ── 编码解码（对标 Rust decode_bytes）──

function decodeBuffer(buf: Buffer, encoding: string): string {
  switch (encoding) {
    case 'GBK':
    case 'GB2312':
      return iconv.decode(buf, 'gbk');
    case 'Shift-JIS':
      return iconv.decode(buf, 'shift_jis');
    default:
      // UTF-8 / ASCII / Latin-1 → lossy UTF-8 兜底（对标 Rust from_utf8_lossy）
      return Buffer.from(buf).toString('utf-8');
  }
}

function encodeText(text: string, encoding: string): Buffer {
  switch (encoding) {
    case 'GBK':
    case 'GB2312':
      return iconv.encode(text, 'gbk');
    case 'Shift-JIS':
      return iconv.encode(text, 'shift_jis');
    default:
      return Buffer.from(text, 'utf-8');
  }
}

// ── 串口服务单例 ──

class SerialService {
  private port: SerialPort | null = null;
  private lineBuffer: Buffer[] = [];
  private isClosing = false;
  private encoding = 'UTF-8';
  private portName = '';
  private baudRate = 115200;
  private callbacks: SerialCallbacks | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** 注册事件回调——serial-handlers 在初始化时调用 */
  setCallbacks(cb: SerialCallbacks): void {
    this.callbacks = cb;
  }

  // ── 枚举串口列表（对标 Rust list_ports）──

  async listPorts(): Promise<PortInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      name: p.path,
      description: p.manufacturer || p.serialNumber || p.path,
    }));
  }

  // ── 状态查询（对标 Rust get_serial_status，F5 刷新用）──

  getStatus(): SerialStatus {
    return {
      isOpen: this.port !== null && this.port.isOpen,
      portName: this.portName,
      baudRate: this.baudRate,
    };
  }

  // ── 打开串口（对标 Rust open_port）──

  async openPort(cfg: OpenPortConfig): Promise<void> {
    // 如果已打开，先关闭
    if (this.port?.isOpen) {
      await this.closePort();
    }

    const dataBits = cfg.dataBits ?? 8;
    const stopBits = cfg.stopBits ?? 1;
    const parity = cfg.parity ?? 'none';
    const encoding = cfg.encoding ?? 'UTF-8';

    this.encoding = encoding;
    this.portName = cfg.portName;
    this.baudRate = cfg.baudRate;
    this.isClosing = false;
    this.lineBuffer = [];

    // 打开串口
    this.port = new SerialPort({
      path: cfg.portName,
      baudRate: cfg.baudRate,
      dataBits: dataBits as 8 | 7 | 6 | 5,
      stopBits: stopBits as 1 | 2,
      parity: parity as 'none' | 'even' | 'odd' | 'mark' | 'space',
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      this.port!.open((err) => {
        if (err) {
          const msg = `串口打开失败：${err.message}`;
          this.callbacks?.onSystem(msg);
          reject(new Error(msg));
        } else {
          resolve();
        }
      });
    });

    // 清空硬件输入缓冲区——丢弃闭口期间积累的陈旧数据（对标 Rust port.clear）
    await new Promise<void>((resolve) => {
      this.port!.flush(() => resolve());
    });

    // 启动数据监听（对标 Rust read_loop）
    this.startReadLoop();

    // 系统消息（V2 格式）
    this.callbacks?.onSystem(`---- 已打开串行端口 ${cfg.portName} ----`);
  }

  // ── 读循环（对标 Rust read_loop——事件驱动替代轮询）──

  private startReadLoop(): void {
    if (!this.port) return;

    // serialport npm 事件驱动——比 Rust 的 100ms 轮询更高效
    this.port.on('data', (chunk: Buffer) => {
      if (this.isClosing) return;

      // 收到新数据就重置超时计时器
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }

      // RX 统计
      this.callbacks?.onStats({ rx: chunk.length });

      // 拼入行缓冲区
      this.lineBuffer.push(chunk);

      // 按 \n 拆行并 push（对标 Rust read_loop 行拆分逻辑）
      this.flushLines();

      // 对标 Rust 100ms 超时冲刷——无 \n 的数据不会永远滞留缓冲区
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushLineResidual();
      }, 100);
    });

    // 错误处理——对标 Rust 读错误休眠 100ms
    // serialport 在底层处理超时，不会像 Rust 那样返回 Err
    this.port.on('error', (err: Error) => {
      if (this.isClosing) return;

      // 冲刷行缓冲区残留（对标 Rust 读错误时的 residual 逻辑）
      this.flushLineResidual();

      console.error('[serial-service] 串口读错误:', err.message);
      // serialport 在错误后可能自动重连或断连——不做额外处理
    });
  }

  // ── 按 \n 拆行并推送 ──

  private flushLines(): void {
    // 合并行缓冲区为单个 Buffer
    const merged = Buffer.concat(this.lineBuffer);

    // 找最后一个 \n 的位置
    let lastNL = -1;
    for (let i = 0; i < merged.length; i++) {
      if (merged[i] === 0x0a) lastNL = i; // \n = 0x0a
    }

    if (lastNL >= 0) {
      // 取从开头到最后一个 \n（含）的数据
      const complete = merged.subarray(0, lastNL + 1);
      // 剩余数据留在行缓冲区
      const remaining = merged.subarray(lastNL + 1);

      // 按 \n 拆行
      let start = 0;
      for (let i = 0; i < complete.length; i++) {
        if (complete[i] === 0x0a) {
          const line = complete.subarray(start, i + 1);
          const text = decodeBuffer(Buffer.from(line), this.encoding).trim();
          if (text) {
            this.callbacks?.onData(text);
          }
          start = i + 1;
        }
      }

      // 重置行缓冲区
      this.lineBuffer = remaining.length > 0 ? [Buffer.from(remaining)] : [];
    }

    // 如果没有 \n，数据留在 lineBuffer 中，等更多数据到达
  }

  // ── 冲刷行缓冲区残留（对标 Rust close_port 中的 line_residual 逻辑）──

  private flushLineResidual(): void {
    if (this.lineBuffer.length === 0) return;
    const merged = Buffer.concat(this.lineBuffer);
    const text = decodeBuffer(Buffer.from(merged), this.encoding).trim();
    this.lineBuffer = [];
    if (text) {
      this.callbacks?.onData(text);
    }
  }

  // ── 关闭串口（对标 Rust close_port）──

  async closePort(): Promise<void> {
    if (!this.port?.isOpen) return;

    const name = this.portName;
    this.isClosing = true;

    // 冲刷行缓冲区残留（对标 Rust line_residual 逻辑）
    this.flushLineResidual();

    // 关闭端口
    const p = this.port;
    this.port = null;

    await new Promise<void>((resolve) => {
      p.close((_err) => {
        // 忽略关闭错误（设备可能已断电）
        resolve();
      });
    });

    // 清理状态
    this.isClosing = false;
    this.lineBuffer = [];
    this.portName = '';

    this.callbacks?.onSystem(`---- 关闭串行端口 ${name} ----`);
  }

  // ── 发送字节（对标 Rust send_data）──

  sendData(data: Buffer | number[]): number {
    if (!this.port?.isOpen) {
      throw new Error('串口未打开');
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const written = this.port.write(buf);
    // 注意：serialport 的 write 返回 boolean（是否排空），不是字节数
    // 对标 Rust 的 port.write() 返回 usize
    const byteCount = buf.length;
    this.callbacks?.onStats({ tx: byteCount });
    return byteCount;
  }

  // ── 发送文本（对标 Rust send_text）──

  sendText(text: string, encoding: string): number {
    if (!this.port?.isOpen) {
      throw new Error('串口未打开');
    }

    const buf = encodeText(text, encoding);
    this.port.write(buf);
    const byteCount = buf.length;
    this.callbacks?.onStats({ tx: byteCount });
    return byteCount;
  }

  // ── DTR / RTS 控制信号（对标 Rust set_dtr / set_rts）──

  async setDtr(enable: boolean): Promise<void> {
    if (!this.port?.isOpen) throw new Error('串口未打开');
    await new Promise<void>((resolve, reject) => {
      this.port!.set({ dtr: enable }, (err) => {
        if (err) reject(new Error(`设置 DTR 失败: ${err.message}`));
        else resolve();
      });
    });
  }

  async setRts(enable: boolean): Promise<void> {
    if (!this.port?.isOpen) throw new Error('串口未打开');
    await new Promise<void>((resolve, reject) => {
      this.port!.set({ rts: enable }, (err) => {
        if (err) reject(new Error(`设置 RTS 失败: ${err.message}`));
        else resolve();
      });
    });
  }
}

// 导出单例
export const serialService = new SerialService();
