# 壳工具链小修二连——dev-real 端口统一 9333 ＋ Button 基类居中根修

> 立案：2026-11-07（串口监视器收编试验两连暴露，见壳仓 [05-插件更新/串口监视器-右键菜单与底栏修缮/](../../../05-插件更新/串口监视器-右键菜单与底栏修缮/00-README.md)）。状态：🟢 **两件均已落码**——① 已发 **@linkdesk/plugin-sdk 0.1.90**（npm 轴即达作者）；② 已落仓随 **壳 0.2.53 攒批**（集中供给轴）。⏳ 待 0.2.53 出货后本夹归档已落地。
> 归属辨析：**04**——① 是 SDK（壳仓 `packages/plugin-sdk`，作者工具链，npm 轴送达、非任何单只插件更新）；② 是壳共享件 `@linkdesk/ui`（E6#123 集中供给，运行时代码住壳池 vendor ⇒ 修它＝必须软件更新）。按 2026-11-05 分档判据（memory `docs-04-05-filing-rule` 共享件消费方式条）双归 04。

## ① dev --real 端口统一 9222 → 9333（SDK 0.1.90）

- **现象**：作者真机环 `dev --real` 的 CDP 热刷新够不着作者的应用——SDK 默认端口 9222，而作者的 LinkDesk 常年以 **9333** 启动（壳 driver/隔离实例/作者安装版三处惯例全是 9333）；结果「每次都要重启软件才能看到改动」。
- **根因**：`dev-real.ts:39` 写死默认 9222，注释自称「与壳 dev electron:dev 对齐」——对齐的是壳仓里**另一套** dev 环（electron:dev），而 driver/隔离实例/作者实际习惯全在 9333 ⇒ 仓内两套端口惯例分叉，SDK 默认站在了少数侧。
- **修**：默认 9222 → **9333**（dev-real.ts 默认＋头注×3＋bin.ts 帮助文本；`scripts/dev-plugin.mjs` 同笔对齐；根 `package.json` 的 `electron:dev` 尾部端口同笔改齐）⇒ 仓内全生态同源。`LINKDESK_CDP_PORT` 覆盖保留。
- **送达**：**@linkdesk/plugin-sdk 0.1.90**（npm 轴——SDK 是构建期依赖，作者 `npm update` 即得，零壳发版）。实机验证：serial-monitor 收编迭代环 `LINKDESK_CDP_PORT=9333 npm run dev:real` → 「✓ LinkDesk Pool 已刷新（CDP 9333）」两轮全过。
- **残句**：`scripts/dev/README.md:36`「用户的软件常年占着 9222/9333」仍成立（隔离实例别撞用户端口，口径不变）。

## ② Button 基类居中根修（@linkdesk/ui，随 0.2.53 攒批）

- **现象**：收编后非 sm 档的「图标＋文字」按钮（暂停接收等）图标与文字不居中——插件侧只能内层 span 自救（`serial-monitor-btn-inner`）。
- **根因**：`Button.css` 的 `display: inline-flex; align-items: center` **只写在 `--sm` 档**，基类没有——非 sm 档回退到 button 默认 inline-block 排布 ⇒ 图标基线对齐文字＝不居中。
- **修（已落仓）**：基类补 `display: inline-flex; align-items: center;`；--sm 档的重复声明随笔上移删除；原「加在基类会波及三消费者」的告诫注同步改写（文字钮单行文本在两种 display 下渲染相同 ⇒ 视觉零变，实证＝serial-monitor dev:real 全量钮切缺省档后无异常）。
- **送达**：**壳池 vendor 轴**（E6#123 集中供给——Button 运行时代码住壳）⇒ 随 **0.2.53 攒批**；`@linkdesk/ui` npm bump 随批发（惯例）。验收点：settings 动作钮／marketplace 详情动作条／FilePathInput「…」三处既有消费者回归（预期零变化）＋ serial-monitor 工具栏图标文字居中。
- 插件侧 `serial-monitor-btn-inner` 内层包裹**保留**（对旧壳无害，等 0.2.53 普及后可拆）。

## 待办

1. ~~① 发 npm~~ ✅ **0.1.90 已发**（2026-11-07）；~~② 落码~~ ✅ 已落仓。
2. 0.2.53 攒批带上 ②→ 出货后三消费者回归 → 本夹 `git mv` 已落地＋池表划销。
