/**
 * E6#70c：外链 window-open 路由——说明区/详情页外链一律交系统默认浏览器（对标 VS Code「在浏览器打开」）。
 *
 * 背景（15-详情页说明展示任务档案 §五.4）：GitLens 式 `<a href="外链视频"><img src="封面"></a>` 等外链
 * 在 pool 渲染进程里以 target=_blank 触发 window.open——Electron 默认会弹一个**无壳的裸 BrowserWindow**
 * 在应用内加载外部网页（2026-09-09 实测：点 example.com 探针 → 进程 5→6、9222 多一个裸 page target）。
 * 裸窗不受壳生命周期/协议面管辖，也不是用户要的「在外部播放」。
 *
 * 定案：凡白名单协议外链 → shell.openExternal（系统默认浏览器/邮件客户端/已注册协议处理器），
 * 并 deny 掉 window.open——永不落裸 Electron 新窗；表外协议一律 deny（不给裸窗机会）。
 *
 * 挂法 = 全局 web-contents-created（与 crash-recovery.ts 的 will-navigate 同型）：池崩溃重建每次产新 wc，
 * 每次新 wc 都吃到本 handler（比挂在某个 view 的 wc 上稳——不随重建丢绑定，覆盖池/壳/未来任何 wc）。
 *
 * 现状全 app 无 window.open 正当消费（src/plugins 零调用，仅 markdown/详情页 target=_blank 外链）——
 * deny-all + 外链转交系统浏览器 = 安全收口，无回归面。
 *
 * 🆕 T4（2026-10-05，本案「文件打开方式与贡献点」）：本模块的协议白名单**升为单一真相源**——插件面
 * `window.linkdesk.shell.openExternal(url)` 的入参闸门（`electron/main.ts` 的 `IPC.shell.openExternal`）
 * 复用同一个 `sanitizeExternalUrl`。⛔ 不许在 handler 处再写一份名单/正则：两份迟早漂，而漂的那天
 * 一条协议从这里放行、从那里拒绝，两边都看不出来。
 */

import { app, shell } from 'electron';

/**
 * 「交系统处理」的协议白名单（小写、不带冒号）——**单一真相源**，两个消费点：
 *   ① `setupExternalLinkRouting`：池/壳页面里 `window.open(<外链>)` 的路由；
 *   ② `IPC.shell.openExternal`：插件面主动请求宿主打开 URL 的入参闸门（T4／D5）。
 *
 * 为什么是这几个：
 *   · `http` / `https` —— 通用网页，交系统默认浏览器；
 *   · `mailto` —— 邮件撰写，交系统邮件客户端；
 *   · `vscode` —— **常量登记的已注册协议**样例（D5）。它由 VS Code 安装时写进注册表，宿主只做
 *     「转交系统」这一件事——**不感知**对方装没装；装没装是 OS 的答复。第三方编辑器同理（`cursor` 等）
 *     要开就在本表加一行（一次公共面决策）。
 * ⛔ **不许加** `file:`（把外部输入指向本地任意路径）、`javascript:` / `data:`（把外部输入当脚本执行）——
 *   这三条正是「受控 openExternal」要防的经典面（D5 明确拒绝）。
 *
 * 🔴 本表的清单内容进宿主保留面账（`scripts/host-reserved.json` 家族 `externalProtocols`，生成式）——
 *   生成器 `scripts/gen-host-reserved.mjs` **直接读本常量**，改本数组必须跑 `npm run audit:plugin-scope:regen`。
 */
export const OPEN_EXTERNAL_PROTOCOLS = ['http', 'https', 'mailto', 'vscode'] as const;

/**
 * 外链闸门——**唯一**的「这个 URL 能不能交系统处理」判据。返回归一化后的 URL；不合法/不在白名单 → `null`。
 *
 * 归一化两件意义：① 白名单比对用小写协议名（`HTTPS://` 同样算 https）；② 交出去的串回炉 `URL` 解析器
 * （控制字符被剥掉、未转义字符被转义）——⛔ 不把插件给的原串直接喂 `shell.openExternal`。
 *
 * 判据只有「解析成功 ＋ 协议在白名单」两条（同 VS Code `openExternal` 的收口形态）：宿主对目标网站
 * 没有管辖权，域名/路径级校验是另一个层面的事，不在本闸门里做。
 */
export function sanitizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // 相对路径 / 空串 / 拼错的 URL——没有协议可判，一律拒（不猜、不补前缀）
    return null;
  }
  const protocol = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (!(OPEN_EXTERNAL_PROTOCOLS as readonly string[]).includes(protocol)) return null;
  return parsed.href;
}

export function setupExternalLinkRouting(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      const safe = sanitizeExternalUrl(url);
      if (safe) {
        // 外链 → 系统默认浏览器/邮件客户端。失败仅记日志不打断（fire-and-forget）。
        shell.openExternal(safe).catch((err: unknown) => {
          console.error(`[external] openExternal 失败: ${safe}`, err);
        });
      }
      // 一律不产生窗口——web 已交系统，非 web 不给裸窗机会
      return { action: 'deny' };
    });
  });
}
