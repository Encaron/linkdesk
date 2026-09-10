/**
 * 首次配置——插件入口（E6#73p）。
 *
 * ═══ 本插件示范的三件事 ═══
 *
 * 1. **「配置成功」通知怎么写**——装好之后，插件自己在本机做一次性配置，做完发一条
 *    `source` 报自己的通知。壳那条「已安装：X v1.0」与它**并排共存、互不掩盖**（R5-17 的实机形态）。
 *    实现全在 `services/setup.ts`（顺带示范了并发合并与「已配置就闭嘴」两条纪律）。
 * 2. **不需要用户先点开也能跑起来**——靠 `appearsIn.statusBar` 自绘组件（装上即出现的表面），
 *    见 `components/statusBar.tsx`。插件 JS 只有惰性激活轨，没有「安装时执行代码」这回事。
 * 3. **命令 handler 放 entry 顶层**——纯命令/懒激活的可达性契约（`docs/03-插件制造/02-插件生命周期.md`
 *    §五）：命令未命中时宿主会 import 本文件再重试，handler 若藏在组件里就永远注册不上。
 */
import React from "react";
import SetupView from "./views/SetupView";
import { runFirstRunSetup } from "./services/setup";

// 命令 handler 必须在模块顶层注册（见档头第 3 条）——**不随视图 unmount 注销**：
// 本命令是插件级的，宿主停用/卸载本插件时自会连同注销，无需自己动手。
// 命令是**程序化入口**（命令面板），执行结果由 setup.ts 那条带来源的通知反馈；
// 此处不再补第二个界面动作，避免「一次操作、两处出声」。
window.linkdesk?.commands?.registerCommand(
  "first-run-setup.reconfigure",
  () => runFirstRunSetup({ force: true }),
  { title: "首次配置：重新配置本机", category: "首次配置" },
);

const FirstRunSetupPlugin: React.FC<{ isActive?: boolean }> = () => <SetupView />;

export default FirstRunSetupPlugin;
