/**
 * 设备会话注册表单例（Block 3a）——壳内唯一一份。
 *
 * transport 在各自服务模块加载时注册（serial-service 注册 `serial`；tcp 在 3a-4 加入）。
 * 规格：`docs/04-软件更新/待抉择池/通用能力底盘/03-设备会话共享契约.md §八`。
 */

import { createDeviceSessionRegistry } from './registry.js';

export const deviceSessions = createDeviceSessionRegistry();
