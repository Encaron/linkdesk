/**
 * vitest setup——mock window.linkdesk API。
 * 测试跑在 Node.js/jsdom，没有 Electron preload 注入的 window.linkdesk。
 * 迁移到 linkdesk.* API 后，插件代码直接依赖它——测试环境需提供最小 mock。
 *
 * 🔴 **本文件是壳仓 `vitest.setup.ts` 的逐字副本**（除本头注五条）。
 *   它不是「配置」，是插件测试的**运行时地基**——下半部的六个命名空间与 `__ldkConfigStore`
 *   少了任何一个，凡碰 `window.linkdesk` 的测试都会报错、或更糟：静默走错分支。
 *   改壳仓那份时把这里一起改（两处同源）。「由 @linkdesk/plugin-sdk 提供共享版本、
 *   本文件改成一行 re-export」是可预见的收敛方向——那时这五条注记一并删掉。
 */

// path 纯函数——直接实现，不走 IPC
const pathMock = {
  normalize: (p: string) => p.replace(/\\/g, "/"),
  join: (...parts: string[]) =>
    parts.map((p) => String(p).replace(/\\/g, "/")).join("/").replace(/\/+/g, "/"),
  basename: (p: string) => {
    const s = p.replace(/\\/g, "/").split("/");
    return s[s.length - 1] || "";
  },
  dirname: (p: string) => {
    const s = p.replace(/\\/g, "/").split("/");
    s.pop();
    return s.join("/") || ".";
  },
  extname: (p: string) => {
    const b = p.replace(/\\/g, "/").split("/").pop() || "";
    const i = b.lastIndexOf(".");
    return i > 0 ? b.slice(i) : "";
  },
};

// 测试全局窄类型 cast——替代 (globalThis as any)（__ldkConfigStore 由本文件声明、测试文件消费）
type TestGlobal = { window?: Window; __ldkConfigStore?: Map<string, unknown> };
const _g = globalThis as TestGlobal;

// configuration——默认返回 null，测试中按需 mock。
// __ldkConfigStore 暴露给测试——测试可直接设置值控制 get() 返回。
const _configStore = (_g.__ldkConfigStore = new Map<string, unknown>());
const configurationMock = {
  get: async (key: string) => _configStore.get(key) ?? null,
  set: async (key: string, v: unknown) => { _configStore.set(key, v); },
  onChange: (_key: string, _cb: (v: unknown) => void) => {
    return () => {}; // no-op unsubscribe
  },
};

// workspace——默认返回空工作区
const workspaceMock = {
  getFolders: async () => [] as { uri: string; name: string }[],
  getActive: async () => undefined as string | undefined,
};

// filesystem——可替换的最小 stub。测试可覆盖 lk.filesystem.xxx = vi.fn() 按需定制
const filesystemMock = {
  readTextFile: async (_p: string) => "",
  writeTextFile: async (_p: string, _d: string) => {},
  readBinaryFile: async (_p: string) => new Uint8Array(),
  writeBinaryFile: async (_p: string, _d: Uint8Array) => {},
  listDir: async (_p: string) => [] as { path: string; name: string; isDirectory: boolean; isFile: boolean }[],
  exists: async (_p: string) => false,
  mkdir: async (_p: string) => {},
  copy: async (_src: string, _dest: string) => {},
  remove: async (_p: string) => {},
  watch: async (_dirPath: string, _onEvent: (e: unknown) => void) => {
    return () => {}; // unsubscribe
  },
};

// tabs——最小 stub
const tabsMock = {
  create: async (_type: string, _opts?: Record<string, unknown>) => "tab-1",
  openOrFocus: async (_type: string, _opts?: Record<string, unknown>) => "tab-1",
  focus: async (_tabId: string) => {},
  close: async (_tabId: string) => {},
  focusBySourceId: async (_sourceId: string) => {},
  updateLabelBySourceId: async (_sourceId: string, _label: string) => {},
  closeBySourceId: async (_sourceId: string) => {},
};

// 最小 mock——故意不满足 LinkDeskAPI 全契约（测试按需覆盖），经 linkdesk?: object 窄口赋值
_g.window = _g.window ?? ({} as Window);
(_g.window as Window & { linkdesk?: object }).linkdesk = {
  path: pathMock,
  configuration: configurationMock,
  config: configurationMock,
  workspace: workspaceMock,
  filesystem: filesystemMock,
  tabs: tabsMock,
  // event stubs
  events: {
    on: () => () => {},
    emit: () => {},
  },
};
