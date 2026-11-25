/**
 * 设备 transport 接口（Block 3a）——**只管开/关/探在不在**，协议与帧永远在插件。
 *
 * 分层见 `docs/04-软件更新/待抉择池/通用能力底盘/03-设备会话共享契约.md §八`：
 *   · 会话生命周期（属主/幂等/僵尸/恢复）归 `DeviceSessionRegistry`；
 *   · 本接口是「怎么跟 OS/网络打交道」的那一层：serial 是第一个实现，tcp 是第二个（验收用）。
 *
 * ⛔ 实现里不许做业务：不解析帧、不算会话、不缓存 open（`handle.isOpen()` 必须每次都问真句柄）。
 */

export interface DeviceHandle {
  /** 权威态：句柄此刻真的活着吗（⛔ 读缓存字段） */
  isOpen(): boolean;
  /** 幂等关闭：调用方已先摘账，这里只负责放句柄；失败可忽略（设备可能已断电） */
  close(): Promise<void>;
}

export interface DeviceTransport {
  /** transport 标识（`serial` / `tcp` / …）——插件在 acquire 时点名 */
  readonly id: string;
  /** 开设备；失败必须抛错（注册表据此保证「先验证后提交」） */
  open(deviceKey: string, params: Record<string, unknown>): Promise<DeviceHandle>;
  /** 设备此刻在不在：`null` = 探测不了（⛔ 当 false）；缺省 = 该 transport 不支持探测 */
  probe?(deviceKey: string): Promise<boolean | null>;
}
