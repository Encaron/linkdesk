/**
 * 共享测试地基（`vitest-setup`）**对账单测**。
 *
 * 为什么值得一条单测：这个模块是**壳仓 ＋ 全部插件仓共用的**运行环境——它坏掉不是「某个测试红了」，
 * 而是几十个仓的测试**同时静默走错分支**（比报错更糟：`configuration.get` 拿到 null 的分支照样绿）。
 * 所以这里钉住五件事：六个命名空间在场 · `config` 与 `configuration` 同一份 store · unsubscribe 可调用 ·
 * `path` 五个纯函数的归一化行为 · `package.json` 的 exports 与本目录源文件对账。
 *
 * 🔴 断言写的是**现状行为**，不是「理想行为」：本模块的搬迁原则是**只搬位置、不改语义**——
 *   语义一改，每个插件仓既有测试的期望值都得跟着改（那是另一件活）。**改这里的期望值前先想清楚。**
 *
 * ⚠️ SDK 的编译面没有 DOM 也没有 vitest globals（`lib: ["ES2022"]` ＋ `types: []`）⇒ 这里
 *   **显式** import vitest，`window` 走自声明的窄口（照 `eslint/checks/*.test.ts` 的先例）。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./vitest-setup.js";

/** 测试侧窄口——SDK 的编译面没有 DOM，`window` 与 vitest 全局都得自己声明 */
type TestGlobal = { window?: { linkdesk?: Record<string, unknown> } };
const lk = (globalThis as TestGlobal).window?.linkdesk ?? {};

type ConfigNs = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, v: unknown) => Promise<void>;
  onChange: (key: string, cb: (v: unknown) => void) => () => void;
};
type FilesystemNs = { watch: (dir: string, onEvent: (e: unknown) => void) => Promise<() => void> };
type PathNs = {
  normalize: (p: string) => string;
  join: (...parts: string[]) => string;
  basename: (p: string) => string;
  dirname: (p: string) => string;
  extname: (p: string) => string;
};

describe("共享测试地基——window.linkdesk 最小 mock", () => {
  it("① 六个命名空间 ＋ events 都在场", () => {
    for (const ns of ["path", "configuration", "config", "workspace", "filesystem", "tabs"] as const) {
      expect(lk[ns], `缺命名空间 ${ns}——凡碰它的测试都会在别仓以「undefined 不是对象」的形式炸`).toBeTruthy();
    }
    expect(lk.events, "缺 events（on/emit 两个 no-op）").toBeTruthy();
  });

  it("② config 与 configuration 是同一个对象、同一份 store", async () => {
    expect(lk.config).toBe(lk.configuration); // 两个键指同一个替身——只改一边会让另一半测试静默变味

    const configuration = lk.configuration as ConfigNs;
    expect(await configuration.get("never-set-key")).toBeNull(); // 默认 null（不是 undefined）

    await configuration.set("probe-key", 42);
    expect(await configuration.get("probe-key")).toBe(42);
    // 经 **config** 那条路读同一份 store（同一对象 ⇒ 必然读得到）
    expect(await (lk.config as ConfigNs).get("probe-key")).toBe(42);

    // onChange 是 no-op 订阅：返回的 unsubscribe 必须可调用
    const off = configuration.onChange("probe-key", () => {});
    expect(() => off()).not.toThrow();
  });

  it("③ filesystem.watch 返回的 unsubscribe 可调用且不抛", async () => {
    const filesystem = lk.filesystem as FilesystemNs;
    const off = await filesystem.watch("/tmp/probe", () => {});
    expect(typeof off).toBe("function");
    expect(() => off()).not.toThrow();
  });

  it("④ path 五个纯函数的归一化行为与搬迁前逐条一致（\u005c ⇒ /，不折叠、不解析 ..）", () => {
    const path = lk.path as PathNs;
    // normalize 只把反斜杠换成斜杠——**不**做 realpath 语义（别把它当 node:path）
    expect(path.normalize("a\\b\\c")).toBe("a/b/c");
    expect(path.normalize("a//b")).toBe("a//b");
    expect(path.join("a", "b", "c.txt")).toBe("a/b/c.txt");
    expect(path.join("a\\b", "c")).toBe("a/b/c");
    expect(path.join("a/", "/b")).toBe("a/b"); // 重复斜杠被折叠（join 折叠、normalize 不折叠）
    expect(path.basename("a\\b\\c.txt")).toBe("c.txt");
    expect(path.basename("a/b/")).toBe("");
    expect(path.dirname("a\\b\\c.txt")).toBe("a/b");
    expect(path.dirname("c.txt")).toBe("."); // 无目录段 ⇒ "."（照搬现状）
    expect(path.extname("a\\b\\c.txt")).toBe(".txt");
    expect(path.extname("no-ext")).toBe("");
    expect(path.extname("a/.hidden")).toBe(""); // 点文件不算扩展名（i > 0 判据）
  });

  it("⑤ package.json 的 exports 与本目录源文件对账（含 ./vitest-setup）", () => {
    const sdkDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(readFileSync(join(sdkDir, "package.json"), "utf8")) as {
      exports: Record<string, string | { types?: string; default?: string }>;
    };
    expect(Object.keys(pkg.exports), "少了 ./vitest-setup——插件仓的一行指针会解析不到").toContain(
      "./vitest-setup",
    );

    /** `./dist/x.js` ⇒ `src/x.ts`（判据对着**源文件**，不看 dist：dist 是 gitignore 的派生物） */
    const toSrc = (p: string) => p.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts");
    const problems: string[] = [];
    for (const [sub, target] of Object.entries(pkg.exports)) {
      if (sub === "./package.json") continue; // 直指文件、没有 dist 形态
      const def = typeof target === "string" ? target : (target.default ?? "");
      const types = typeof target === "string" ? target : (target.types ?? "");
      const src = toSrc(def);
      if (def !== `./dist/${def.replace(/^\.\/dist\//, "")}`) problems.push(`${sub}: default 不在 dist/ 下（${def}）`);
      else if (!existsSync(join(sdkDir, src))) problems.push(`${sub}: 声明的入口没有对应源文件 ${src}`);
      if (types !== def.replace(/\.js$/, ".d.ts")) problems.push(`${sub}: types（${types}）与 default（${def}）不同源`);
    }
    expect(problems).toEqual([]);
  });
});
