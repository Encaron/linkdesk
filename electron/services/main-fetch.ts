/**
 * main-fetch——主进程出网唯一出口（E6#76）。
 *
 * **为什么不是全局 `fetch`**：主进程的 Node 全局 fetch（undici）**不读 Windows 系统代理**；渲染进程的
 * Chromium 网络栈**读**。用户开着代理时两条腿各走各的路 ⇒ 商店列表（渲染进程）出得来、插件下载
 * （主进程）`fetch failed`，表象是「能看见、装不上」。实机实证（0.1.43 安装版，同一 URL 同一台机器）：
 * 渲染进程 200 / 1.08s，主进程 fetch failed；命令行对照：带代理 200、不带代理连不上。
 *
 * `net.fetch` 走 Chromium 网络栈，与渲染进程同源——自动读系统代理、跳转语义一致。语义与 WHATWG fetch
 * 等价（含 `signal`），故既有调用点的 AbortController / 空闲超时 / 重试预算 / 进度节流全部原样保留。
 *
 * **所有主进程出网腿一律走本模块**——不要在 `electron/` 内直接 `fetch(`，防下一条腿再踩同一个坑。
 * 诚实边界：本模块修的是「软件没用上系统代理」，不是「替用户翻墙」——代理本身连不通时照旧失败。
 *
 * 铁律 19/20：纯函数转调，无模块级 IPC 监听器。
 */

import { net } from "electron";

/** 主进程出网——转调 Chromium 网络栈（`net.fetch`），签名与全局 fetch 同形。 */
export function mainFetch(url: string, init?: RequestInit): Promise<Response> {
  return net.fetch(url, init);
}
