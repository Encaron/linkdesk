/**
 * electron-mock——主进程 `electron` 测试桩，**唯一一份**（E6#57.6 归一化去重，jscpd 门禁 60 tokens）。
 *
 * 两条网络腿（`update-source` #57.5 检查腿 / `update-download` #57.6 下载腿）需要同一组 electron 面：
 *   - `net.fetch` 转调 **hoist 时抓下的原始 fetch** —— 本地 http 服务真发包；「出口锁定」那几条把它
 *     打断时断言才有意义（转调是**真的转调**，不是假响应）。
 *   - `app` 的路径 / 版本面（`getAppPath` / `getVersion` / `getPath('userData')`）。
 *   - `app` 的**退出编排面**（`relaunch` / `quit` / `exit`，#57.7 安装腿）——桩**不真退出**，
 *     只把调用记进 `relaunchCalls` / `lifecycleCalls` 供断言（真退出 = 测试进程消失）。
 * 此前两份逐字符相同的 hoisted 桩 —— 两处各写一份 = 将来只改一处。
 *
 * 🔴 **纪律（同 src/App/viewContainerMocks.ts 约定）**：
 *   1. 测试文件**必须把它 import 在 SUT 之前** —— vitest 模块依赖序保证 helper 先求值注册 `vi.mock`，
 *      否则 SUT 拿到的是真 electron。
 *   2. 本文件只被测试 import（knip 门禁：导出的 `electronMock` 有消费方）。
 *   3. `version: "0.1.49"` 是**用例 fixture**（各用例的 `CURRENT` 常量同值），不是版本号第二份真值——
 *      生产版本唯一来源仍是 `package.json`（02 §2.3）。
 */

import { vi } from "vitest";

const electronMock = vi.hoisted(() => {
  // hoist 时抓下原始 fetch——否则「出口锁定」把它打断时替身一起断，断言失效
  const nodeFetch = globalThis.fetch;
  const netFetchCalls: string[] = [];
  /** 退出/重启编排的观测点（#57.7 安装腿）——桩**不真退出**，只记账（真退出 = 测试进程消失） */
  const relaunchCalls: { execPath?: string; args?: string[] }[] = [];
  const lifecycleCalls: string[] = [];
  const app = {
    appPath: "",
    userData: "",
    version: "0.1.49",
    getAppPath: () => app.appPath,
    // 版本唯一运行时来源（product.ts 头注：product.json 的 version 只是产物自证，被它覆盖）
    getVersion: () => app.version,
    getPath: (name: string) => {
      // 只认 userData——别处要路径就该显式加进桩，不能悄悄返回错目录（那正是「测替身不测真值」）
      if (name !== "userData") throw new Error(`用例未预期的 app.getPath(${name})`);
      return app.userData;
    },
    relaunch: (opts?: { execPath?: string; args?: string[] }) => {
      relaunchCalls.push(opts ?? {});
    },
    quit: () => {
      lifecycleCalls.push("quit");
    },
    exit: () => {
      lifecycleCalls.push("exit");
    },
  };
  const net = {
    fetch: (url: string, init?: RequestInit) => {
      netFetchCalls.push(url);
      return nodeFetch(url, init);
    },
  };
  return { app, net, netFetchCalls, relaunchCalls, lifecycleCalls };
});

vi.mock("electron", () => electronMock);

export { electronMock };
