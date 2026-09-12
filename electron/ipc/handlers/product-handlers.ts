/**
 * 产品身份 IPC 处理器——E6#57.3b（06-主软件更新/07-数据流通格式.md §四.1）。
 *
 * main 直答（env-handlers 先例——E2c #13b env:get 同形：主进程持有数据的只读查询由 ipcMain.handle
 * 直接回传，壳/池 preload 各自 ipcRenderer.invoke 直达）。**app:getVersion / app:getProductInfo
 * 不进 PROXY_CHANNELS**——PROXY 那套会给每个通道**再挂一层** `ipcMain.handle` 转发到壳渲染进程；
 * 双登记（本 handler + IpcBridge proxy 同通道）⇒ 二次注册，Electron 启动即抛
 * "Attempted to register a second handler"。main 直答的域一律不进 PROXY（同款：`update.*`
 * 四条命令也在 update-handlers.ts 直答，见 update-handlers.ts 文件头）。
 *
 * 数据源 = electron/product.ts（product.json 三件套 + process.versions 动态增强，02 §2.2）。
 * 永不抛：dev 无 product.json / 字段占位空 → commit/date 降级 '—'（07 §四.1）。
 */

import { ipcMain, app } from 'electron';
import { productInfo } from '../../product.js';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerProductHandlers(): void {
  if (_registered) return;
  _registered = true;

  // 只读：版本号唯一运行时来源 = app.getVersion()（package.json 单点，02 §2.3）——产品身份真相源头
  ipcMain.handle(IPC.app.getVersion, () => app.getVersion());

  // 只读：{ product, runtime } 全量身份——关于标签页 8 字段唯一来源（07 §四.1）
  ipcMain.handle(IPC.app.getProductInfo, () => productInfo());
}
