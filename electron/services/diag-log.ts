/**
 * diag-log——主进程诊断日志的**唯一写入口**（E6#163，2026-09-30 用户拍板）。
 *
 * 动机：`%APPDATA%/linkdesk/protocol-debug.log` 此前**七个写入点各自 appendFileSync**，且**没有任何
 * 体积上限／轮转**——诊断面越铺越多（渲染进程 console 转发 · protocol · invoke-log · lsp ·
 * keyboard-router · window-manager），文件只增不减。2026-09-30 实测：34 天 24.0 MB / 212,254 行，
 * 其中「动态加载插件失败」一族（E6#37f，已修）独占**体积 25.6%**。本模块把「格式 + 落盘 + 上限」收成一处：
 *
 *   1. **唯一写入口**：`diagLog(line)`——全进程只此一份 appendFileSync。新增诊断点一律调它，
 *      ⛔ 不许再手写 appendFileSync（绕过它 = 上限失效，日志又变「无限日志」）。
 *   2. **体积上限 ＋ 轮转**：单文件超 `DIAG_LOG_CAP_BYTES` ⇒ 轮转成 `<名>.1`（旧 `.1` 直接丢），
 *      新文件从零写起 ⇒ 磁盘天花板 = 2 × 5 MB = 10 MB。
 *   3. **行格式** `[ISO 时间戳] <调用方前缀> 正文`——时间戳由本模块统一加（调用方只管自己的前缀）。
 *   4. 落盘失败**一律吞**（诊断日志写不进去不许影响功能）——与各调用点原语义一致。
 *
 * 排障读法：`<userData>/protocol-debug.log`（现行）＋ `.1`（上一代，时间戳可 grep）。
 * protocol 的成功请求（`200 OK`）默认**不记**（此前是体积第一大噪声源 22.8%）——
 * 需要取证时置 `LINKDESK_LOG_PROTOCOL_200=1` 调回；失败面（403/404/500）恒记，不受该开关影响。
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

/** 日志文件名（userData 下）——本模块是它唯一的写入者 */
export const DIAG_LOG_NAME = "protocol-debug.log";

/** 单文件上限 5 MB；连同轮转出的 `.1`，磁盘占用天花板 10 MB */
export const DIAG_LOG_CAP_BYTES = 5 * 1024 * 1024;

export interface DiagLogOptions {
  /** 现行日志文件绝对路径（**每次写入时取**——测试可指向临时目录） */
  file: () => string;
  /** 单文件上限（默认 `DIAG_LOG_CAP_BYTES`；单测用小值构造轮转） */
  capBytes?: number;
  /** 时间源（测试注入固定时刻） */
  now?: () => Date;
}

/**
 * 构造一个写入口（工厂形式——主进程默认单例在本文件底部）。
 *
 * 每次写入先 `statSync` 现尺寸：外部删除／截断后能自动跟上（无内存缓存尺寸，故不会误判轮转）。
 * 越限则先轮转再写——`rmSync(.1)` 只留一代，`.1` 被占用（Windows 文件锁）时降级为「继续追加」，
 * 不抛错、不阻断业务。
 */
export function createDiagLog(opts: DiagLogOptions): (line: string) => void {
  const cap = opts.capBytes ?? DIAG_LOG_CAP_BYTES;
  const now = opts.now ?? (() => new Date());

  return (line: string): void => {
    try {
      const file = opts.file();
      const text = `[${now().toISOString()}] ${line}\n`;
      const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;
      if (size + Buffer.byteLength(text) > cap) {
        const rolled = `${file}.1`;
        fs.rmSync(rolled, { force: true });
        fs.renameSync(file, rolled);
      }
      fs.appendFileSync(file, text);
    } catch {
      /* 诊断日志写失败不致命 */
    }
  };
}

/** 主进程诊断日志唯一写入口——用法 `diagLog("[renderer] …")` / `diagLog("[pool] …")` */
export const diagLog = createDiagLog({ file: () => path.join(app.getPath("userData"), DIAG_LOG_NAME) });
