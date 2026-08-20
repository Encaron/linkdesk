/**
 * 串口服务——serialport npm 包封装（E5.8#26：单口 → 多口通道 Map 化）
 *
 * E1 步 2：替代 Tauri Rust `src-tauri/src/serial.rs`。
 * 逐函数映射 Rust 实现，保留所有 48 个 bug 的修复成果。
 *
 * E5.8#26（Phase 6 多串口，设计 → ../../docs/02-Electron架构/E5.8_归一化基建/多串口/01-多串口设计.md）：
 *   - 单口模型（七字段）→ `Map<portName, PortState>` 多口模型——端口共存（D1）
 *   - 删「openPort 先关旧口」顶替语义（S2——单口监视器专属假设，长在壳里的历史债务）
 *   - 同口二开拒绝（D8——不自动关先开者，OS 驱动层排他，服务层显式仲裁）
 *   - 请求面加可选 portName（D2——缺省 = 唯一打开口：0 口抛「串口未打开」/ ≥2 口抛歧义，失败可见性）
 *   - getStatus 双形态（D5——无参 SerialStatus[] 全口 / 有参单口快照，F5 遍历恢复）
 *   - ownerPluginId 资源归属 + closePortsByOwner 卸载连坐（D8——S16 补洞）
 *
 * 关键行为（保留既有修复成果，全部不变）：
 *   - 行缓冲 + \n 拆行（与 Rust read_loop 一致）
 *   - 读错误休眠 100ms，不忙循环（H1 修复）
 *   - 关闭前冲刷行缓冲残留（B3 修复）
 *   - GBK/Shift-JIS 编码支持（B61 修复，iconv-lite）
 *   - 打开时清空硬件输入缓冲区（丢弃闭口期间陈旧数据）
 *   - 16ms 批量推送（非行分隔连续数据，防止数千次/秒 IPC）
 *   - isClosing 标志防止关闭期间读取竞态（E5.8#26：每口独立——防 A 口关闭期间 B 口数据被 isClosing 丢弃）
 *
 * 安全模型：
 *   - 硬件所有权在主进程 = 物理必然（preload 沙箱无 Node 权限——插件无串口代码路径）
 *   - callbacks 单例广播（所有口共用），载荷 portName 区分（E5.8#28）
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

/** E5.8#26 D4——每个打开端口的独立状态。六字段内聚（isClosing/flushTimer 各口独立，
 *  防 A 口关闭期间 B 口数据被 isClosing 丢弃）+ ownerPluginId（D8 资源归属，卸载连坐）。
 *  portName 冗余存于状态内——Map key 与状态自含一致，防改 key 时丢（设计 D4 六字段含 portName）。 */
interface PortState {
  port: SerialPort;
  lineBuffer: Buffer[];
  isClosing: boolean;
  encoding: string;
  portName: string;
  baudRate: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  ownerPluginId?: string;
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

// ── 串口服务单例（通道范式：串口 = 第一条通用资源通道，设备协议永远在插件）──

class SerialService {
  /** E5.8#26 D4——多口状态：portName → PortState。端口共存（D1），硬件所有权在主进程。 */
  private ports = new Map<string, PortState>();
  private callbacks: SerialCallbacks | null = null;

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

  // ── E5.8#26 D2——唯一口语义解析 ──

  /** 解析操作目标口：有 portName → 精确取（不存在抛「串口未打开」）；缺省 → 唯一打开口
   *  （0 口抛「串口未打开」/ ≥2 口抛「多串口已打开，请指定 portName」）。
   *  静默选错口比报错更糟——失败可见性（uninstall-bug-recurring 教训）。 */
  private getPort(portName?: string): PortState {
    if (portName) {
      const state = this.ports.get(portName);
      if (!state) throw new Error('串口未打开');
      return state;
    }
    if (this.ports.size === 0) throw new Error('串口未打开');
    if (this.ports.size > 1) throw new Error('多串口已打开，请指定 portName');
    return this.ports.values().next().value!;
  }

  // ── 状态查询（对标 Rust get_serial_status，F5 刷新用）──

  /** E5.8#26 D5 双形态：无参 → SerialStatus[]（全部打开口，空数组 = 全关）；有参 → 单口快照。
   *  F5 Hot Exit 按会话创建序遍历恢复（E5.8#27 消费）。 */
  getStatus(): SerialStatus[];
  getStatus(portName: string): SerialStatus;
  getStatus(portName?: string): SerialStatus[] | SerialStatus {
    if (portName) {
      const s = this.getPort(portName);
      return { isOpen: s.port.isOpen, portName: s.portName, baudRate: s.baudRate };
    }
    return [...this.ports.values()].map((s) => ({
      isOpen: s.port.isOpen,
      portName: s.portName,
      baudRate: s.baudRate,
    }));
  }

  // ── 打开串口（对标 Rust open_port）──

  /** E5.8#26 D1/D8——端口共存（不再先关旧口）；同口已开 → 拒绝 + 错误提示
   *  （自动关先开者 = 别的标签页数据丢失；Windows 驱动层本来也排他）。
   *  ownerPluginId 由插件 openPort 时自声明（壳不猜——pool WCV 多插件同 JS 上下文，
   *  主进程无法从 sender 识别插件，字段是唯一可靠归属声明）。 */
  async openPort(cfg: OpenPortConfig): Promise<void> {
    if (this.ports.has(cfg.portName)) {
      const msg = `串口 ${cfg.portName} 已被打开`;
      this.callbacks?.onSystem(msg);
      throw new Error(msg);
    }

    const dataBits = cfg.dataBits ?? 8;
    const stopBits = cfg.stopBits ?? 1;
    const parity = cfg.parity ?? 'none';
    const encoding = cfg.encoding ?? 'UTF-8';

    const state: PortState = {
      port: new SerialPort({
        path: cfg.portName,
        baudRate: cfg.baudRate,
        dataBits: dataBits as 8 | 7 | 6 | 5,
        stopBits: stopBits as 1 | 2,
        parity: parity as 'none' | 'even' | 'odd' | 'mark' | 'space',
        autoOpen: false,
      }),
      lineBuffer: [],
      isClosing: false,
      encoding,
      portName: cfg.portName,
      baudRate: cfg.baudRate,
      flushTimer: null,
      ownerPluginId: cfg.ownerPluginId,
    };

    await new Promise<void>((resolve, reject) => {
      state.port.open((err) => {
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
      state.port.flush(() => resolve());
    });

    this.ports.set(cfg.portName, state);
    this.startReadLoop(state);

    // 系统消息（V2 格式）
    this.callbacks?.onSystem(`---- 已打开串行端口 ${cfg.portName} ----`);
  }

  // ── 读循环（对标 Rust read_loop——事件驱动替代轮询）──

  /** E5.8#26——闭包捕获 PortState（现网 this.port 读 this 字段改参传 state）：
   *  每口独立 isClosing/flushTimer/lineBuffer，防跨口串扰。 */
  private startReadLoop(state: PortState): void {
    // serialport npm 事件驱动——比 Rust 的 100ms 轮询更高效
    state.port.on('data', (chunk: Buffer) => {
      if (state.isClosing) return;

      // 收到新数据就重置超时计时器
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }

      // RX 统计
      this.callbacks?.onStats({ rx: chunk.length });

      // 拼入行缓冲区
      state.lineBuffer.push(chunk);

      // 按 \n 拆行并 push（对标 Rust read_loop 行拆分逻辑）
      this.flushLines(state);

      // 对标 Rust 100ms 超时冲刷——无 \n 的数据不会永远滞留缓冲区
      state.flushTimer = setTimeout(() => {
        state.flushTimer = null;
        this.flushLineResidual(state);
      }, 100);
    });

    // 错误处理——对标 Rust 读错误休眠 100ms
    // serialport 在底层处理超时，不会像 Rust 那样返回 Err
    state.port.on('error', (err: Error) => {
      if (state.isClosing) return;

      // 冲刷行缓冲区残留（对标 Rust 读错误时的 residual 逻辑）
      this.flushLineResidual(state);

      console.error('[serial-service] 串口读错误:', err.message);
      // serialport 在错误后可能自动重连或断连——不做额外处理
    });
  }

  // ── 按 \n 拆行并推送 ──

  private flushLines(state: PortState): void {
    // 合并行缓冲区为单个 Buffer
    const merged = Buffer.concat(state.lineBuffer);

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
          const text = decodeBuffer(Buffer.from(line), state.encoding).trim();
          if (text) {
            this.callbacks?.onData(text);
          }
          start = i + 1;
        }
      }

      // 重置行缓冲区
      state.lineBuffer = remaining.length > 0 ? [Buffer.from(remaining)] : [];
    }

    // 如果没有 \n，数据留在 lineBuffer 中，等更多数据到达
  }

  // ── 冲刷行缓冲区残留（对标 Rust close_port 中的 line_residual 逻辑）──

  private flushLineResidual(state: PortState): void {
    if (state.lineBuffer.length === 0) return;
    const merged = Buffer.concat(state.lineBuffer);
    const text = decodeBuffer(Buffer.from(merged), state.encoding).trim();
    state.lineBuffer = [];
    if (text) {
      this.callbacks?.onData(text);
    }
  }

  // ── 关闭串口（对标 Rust close_port）──

  /** E5.8#26——可选 portName 经 getPort 解析（D2）；缺省唯一口语义：0 口抛「串口未打开」/ ≥2 口抛歧义。 */
  async closePort(portName?: string): Promise<void> {
    const state = this.getPort(portName);
    if (!state.port.isOpen) return;

    const name = state.portName;
    state.isClosing = true;

    // 冲刷行缓冲区残留（对标 Rust line_residual 逻辑）
    this.flushLineResidual(state);

    // 关闭端口
    const p = state.port;
    this.ports.delete(state.portName);

    await new Promise<void>((resolve) => {
      p.close((_err) => {
        // 忽略关闭错误（设备可能已断电）
        resolve();
      });
    });

    // 清理状态
    state.isClosing = false;
    state.lineBuffer = [];

    this.callbacks?.onSystem(`---- 关闭串行端口 ${name} ----`);
  }

  // ── E5.8#26 D8——卸载连坐（主进程内部，非公开 API）──

  /** 当前端口 owner 去重集合——rescan 连坐回收判定用（loader 对比插件集合）。
   *  ownerPluginId 未声明的口（壳/无归属打开）不进集合——绝不因任何插件卸载被误关。 */
  getPortOwners(): string[] {
    return [...this.ports.values()]
      .map((s) => s.ownerPluginId)
      .filter((id): id is string => Boolean(id));
  }

  /** 关闭指定插件打开的全部端口——卸载插件时回收其硬件资源（S16 补洞）。
   *  挂钩走 Phase 2 可逆注册主进程侧机制（#8 定案面），本方法只做资源回收。
   *  幂等：重复调用（插件主动关 + 连坐）对已删条目 no-op。 */
  async closePortsByOwner(pluginId: string): Promise<void> {
    const owned = [...this.ports.values()]
      .filter((s) => s.ownerPluginId === pluginId)
      .map((s) => s.portName);
    for (const name of owned) {
      await this.closePort(name);
    }
  }

  // ── 发送字节（对标 Rust send_data）──

  sendData(data: Buffer | number[], portName?: string): number {
    const state = this.getPort(portName);
    if (!state.port.isOpen) {
      throw new Error('串口未打开');
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    state.port.write(buf);
    const byteCount = buf.length;
    this.callbacks?.onStats({ tx: byteCount });
    return byteCount;
  }

  // ── 发送文本（对标 Rust send_text）──

  sendText(text: string, encoding: string, portName?: string): number {
    const state = this.getPort(portName);
    if (!state.port.isOpen) {
      throw new Error('串口未打开');
    }

    const buf = encodeText(text, encoding);
    state.port.write(buf);
    const byteCount = buf.length;
    this.callbacks?.onStats({ tx: byteCount });
    return byteCount;
  }

  // ── DTR / RTS 控制信号（对标 Rust set_dtr / set_rts）──

  async setDtr(enable: boolean, portName?: string): Promise<void> {
    const state = this.getPort(portName);
    if (!state.port.isOpen) throw new Error('串口未打开');
    await new Promise<void>((resolve, reject) => {
      state.port.set({ dtr: enable }, (err) => {
        if (err) reject(new Error(`设置 DTR 失败: ${err.message}`));
        else resolve();
      });
    });
  }

  async setRts(enable: boolean, portName?: string): Promise<void> {
    const state = this.getPort(portName);
    if (!state.port.isOpen) throw new Error('串口未打开');
    await new Promise<void>((resolve, reject) => {
      state.port.set({ rts: enable }, (err) => {
        if (err) reject(new Error(`设置 RTS 失败: ${err.message}`));
        else resolve();
      });
    });
  }
}

// 导出单例
export const serialService = new SerialService();
