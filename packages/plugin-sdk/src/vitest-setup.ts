/**
 * 共享测试地基——mock `window.linkdesk` 的最小面。
 *
 * 测试跑在 Node.js / jsdom，没有 Electron preload 注入的 `window.linkdesk`；而插件代码直接依赖它
 * ⇒ 测试环境必须提供最小 mock。**本模块是壳仓与全部插件仓共用的唯一真源**：
 *
 * - **插件仓**：`vitest.setup.ts` 是一行指针 ⇒ `import "@linkdesk/plugin-sdk/vitest-setup";`
 * - **壳仓**：走同仓相对路径引**本文件的源码**（壳没有 `@linkdesk/plugin-sdk` 依赖，
 *   也不该有）——两处形态**有意不同**，真源只有这一份。
 *
 * 🔴 **插件专属的桩不许加进来**（如 `window.linkdesk.serial`）：那些住各仓自己的测试文件里，
 *   用 `vi.fn()` 按需覆盖。这里只放「凡碰 `window.linkdesk` 的测试都用得到」的那六个命名空间。
 *   加专属桩 = 让共享地基替某一只插件说话，下一只插件就要为它付代价。
 *
 * ⚠️ 改这个文件 = 改**全部插件仓 ＋ 壳仓**几十个测试文件的运行环境：语义只许**向后兼容地加**，
 *   不许删键、不许改既有替身的行为（改了会让别仓既有测试的期望值静默错位）。
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

// 测试全局窄类型 cast——替代 (globalThis as any)（__ldkConfigStore 由本文件声明、测试文件消费）。
// 🔴 这里**刻意不引 DOM 类型**（`Window`）：SDK 的编译面是 `lib: ["ES2022"]` ＋ `types: []`，
//    本模块要在无 DOM 的 tsconfig 里成立；而它真正需要的面只有 `.linkdesk` 这一个。
type TestGlobal = { window?: { linkdesk?: object }; __ldkConfigStore?: Map<string, unknown> };
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
_g.window = _g.window ?? {};
_g.window.linkdesk = {
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
