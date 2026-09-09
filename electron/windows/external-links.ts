/**
 * E6#70c：外链 window-open 路由——说明区/详情页外链一律交系统默认浏览器（对标 VS Code「在浏览器打开」）。
 *
 * 背景（15-详情页说明展示任务档案 §五.4）：GitLens 式 `<a href="外链视频"><img src="封面"></a>` 等外链
 * 在 pool 渲染进程里以 target=_blank 触发 window.open——Electron 默认会弹一个**无壳的裸 BrowserWindow**
 * 在应用内加载外部网页（2026-09-09 实测：点 example.com 探针 → 进程 5→6、9222 多一个裸 page target）。
 * 裸窗不受壳生命周期/协议面管辖，也不是用户要的「在外部播放」。
 *
 * 定案：凡 http/https/mailto 外链 → shell.openExternal（系统默认浏览器/邮件客户端），并 deny 掉 window.open
 * ——永不落裸 Electron 新窗；非 web 协议一律 deny（不给裸窗机会）。
 *
 * 挂法 = 全局 web-contents-created（与 crash-recovery.ts 的 will-navigate 同型）：池崩溃重建每次产新 wc，
 * 每次新 wc 都吃到本 handler（比挂在某个 view 的 wc 上稳——不随重建丢绑定，覆盖池/壳/未来任何 wc）。
 *
 * 现状全 app 无 window.open 正当消费（src/plugins 零调用，仅 markdown/详情页 target=_blank 外链）——
 * deny-all + 外链转交系统浏览器 = 安全收口，无回归面。
 */

import { app, shell } from 'electron';

/** 交系统处理的协议——其余（file:/javascript:/data:/任意）一律 deny */
const EXTERNAL_PROTOCOLS = /^(https?|mailto):/i;

export function setupExternalLinkRouting(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (EXTERNAL_PROTOCOLS.test(url)) {
        // 外链 → 系统默认浏览器/邮件客户端。失败仅记日志不打断（fire-and-forget）。
        shell.openExternal(url).catch((err: unknown) => {
          console.error(`[external] openExternal 失败: ${url}`, err);
        });
      }
      // 一律不产生窗口——web 已交系统，非 web 不给裸窗机会
      return { action: 'deny' };
    });
  });
}
